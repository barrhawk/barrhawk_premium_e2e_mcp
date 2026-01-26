/**
 * ConnectionManager - Manages WebSocket connections with health tracking
 *
 * Features:
 * - Per-connection health scoring
 * - Send queues with backpressure
 * - Auto-kick unhealthy connections
 * - Graceful drain support
 */

import WebSocket from 'ws';
import { CircularBuffer } from './circular-buffer.js';

export interface ConnectionConfig {
  /** Maximum send queue size per connection (default: 100) */
  maxQueueSize?: number;
  /** Error threshold before auto-kick (default: 5) */
  errorThreshold?: number;
  /** Health score decay per interval (default: 1) */
  healthDecay?: number;
  /** Health score recovery per successful send (default: 2) */
  healthRecovery?: number;
  /** Minimum health score before kick (default: 0) */
  minHealthScore?: number;
  /** Initial health score (default: 100) */
  initialHealthScore?: number;
}

export interface ConnectionState {
  id: string;
  ws: WebSocket;
  healthScore: number;
  errorCount: number;
  messagesSent: number;
  messagesDropped: number;
  lastActivity: Date;
  connectedAt: Date;
  sendQueue: CircularBuffer<QueuedMessage>;
  draining: boolean;
  metadata: Record<string, unknown>;
}

interface QueuedMessage {
  data: string;
  enqueuedAt: number;
  priority: number;
}

export class ConnectionManager {
  private connections = new Map<string, ConnectionState>();
  private config: Required<ConnectionConfig>;
  private isDraining = false;
  private drainResolve?: () => void;

  // Callbacks
  public onConnectionKicked?: (id: string, reason: string) => void;
  public onMessageDropped?: (id: string, message: string, reason: string) => void;
  public onHealthChanged?: (id: string, oldScore: number, newScore: number) => void;

  constructor(config: ConnectionConfig = {}) {
    this.config = {
      maxQueueSize: config.maxQueueSize ?? 100,
      errorThreshold: config.errorThreshold ?? 5,
      healthDecay: config.healthDecay ?? 1,
      healthRecovery: config.healthRecovery ?? 2,
      minHealthScore: config.minHealthScore ?? 0,
      initialHealthScore: config.initialHealthScore ?? 100,
    };
  }

  /**
   * Register a new connection
   */
  register(id: string, ws: WebSocket, metadata: Record<string, unknown> = {}): ConnectionState {
    // Close existing connection with same ID
    const existing = this.connections.get(id);
    if (existing) {
      existing.ws.close(1000, 'Replaced by new connection');
    }

    const state: ConnectionState = {
      id,
      ws,
      healthScore: this.config.initialHealthScore,
      errorCount: 0,
      messagesSent: 0,
      messagesDropped: 0,
      lastActivity: new Date(),
      connectedAt: new Date(),
      sendQueue: new CircularBuffer<QueuedMessage>(this.config.maxQueueSize),
      draining: false,
      metadata,
    };

    this.connections.set(id, state);

    // Set up close handler
    ws.on('close', () => {
      this.connections.delete(id);
      this.checkDrainComplete();
    });

    return state;
  }

  /**
   * Unregister a connection
   */
  unregister(id: string): void {
    const state = this.connections.get(id);
    if (state) {
      this.connections.delete(id);
    }
  }

  /**
   * Get connection by ID
   */
  get(id: string): ConnectionState | undefined {
    return this.connections.get(id);
  }

  /**
   * Get all connections
   */
  getAll(): ConnectionState[] {
    return Array.from(this.connections.values());
  }

  /**
   * Send message to connection with backpressure handling
   */
  send(id: string, data: string, priority = 0): boolean {
    const state = this.connections.get(id);
    if (!state) return false;

    // Reject if draining
    if (this.isDraining && !state.draining) {
      return false;
    }

    // Check WebSocket state
    if (state.ws.readyState !== WebSocket.OPEN) {
      this.recordError(id, 'Connection not open');
      return false;
    }

    // Check backpressure
    if (state.ws.bufferedAmount > 1024 * 1024) { // 1MB buffer
      // Queue the message
      if (state.sendQueue.isFull()) {
        state.messagesDropped++;
        if (this.onMessageDropped) {
          this.onMessageDropped(id, data, 'Queue full');
        }
        return false;
      }
      state.sendQueue.push({ data, enqueuedAt: Date.now(), priority });
      return true;
    }

    // Send directly
    try {
      state.ws.send(data);
      state.messagesSent++;
      state.lastActivity = new Date();
      this.recordSuccess(id);
      return true;
    } catch (err) {
      this.recordError(id, String(err));
      return false;
    }
  }

  /**
   * Flush queued messages for a connection
   */
  flushQueue(id: string): number {
    const state = this.connections.get(id);
    if (!state) return 0;

    let sent = 0;
    const queue = state.sendQueue;

    while (queue.getSize() > 0 && state.ws.readyState === WebSocket.OPEN) {
      const msg = queue.get(0);
      if (!msg) break;

      if (state.ws.bufferedAmount > 512 * 1024) { // Back off at 512KB
        break;
      }

      try {
        state.ws.send(msg.data);
        sent++;
        state.messagesSent++;
      } catch {
        break;
      }
    }

    return sent;
  }

  /**
   * Record successful operation
   */
  recordSuccess(id: string): void {
    const state = this.connections.get(id);
    if (!state) return;

    const oldScore = state.healthScore;
    state.healthScore = Math.min(
      this.config.initialHealthScore,
      state.healthScore + this.config.healthRecovery
    );

    if (oldScore !== state.healthScore && this.onHealthChanged) {
      this.onHealthChanged(id, oldScore, state.healthScore);
    }
  }

  /**
   * Record error and potentially kick connection
   */
  recordError(id: string, reason: string): void {
    const state = this.connections.get(id);
    if (!state) return;

    state.errorCount++;
    const oldScore = state.healthScore;
    state.healthScore = Math.max(0, state.healthScore - 10);

    if (this.onHealthChanged && oldScore !== state.healthScore) {
      this.onHealthChanged(id, oldScore, state.healthScore);
    }

    // Check if should kick
    if (state.errorCount >= this.config.errorThreshold ||
        state.healthScore <= this.config.minHealthScore) {
      this.kick(id, `Health degraded: ${reason} (errors: ${state.errorCount}, score: ${state.healthScore})`);
    }
  }

  /**
   * Update activity timestamp
   */
  recordActivity(id: string): void {
    const state = this.connections.get(id);
    if (state) {
      state.lastActivity = new Date();
    }
  }

  /**
   * Kick a connection
   */
  kick(id: string, reason: string): void {
    const state = this.connections.get(id);
    if (!state) return;

    if (this.onConnectionKicked) {
      this.onConnectionKicked(id, reason);
    }

    state.ws.close(1008, reason.slice(0, 123)); // WebSocket close reason max 123 bytes
    this.connections.delete(id);
    this.checkDrainComplete();
  }

  /**
   * Get stale connections (no activity for given duration)
   */
  getStale(maxAgeMs: number): ConnectionState[] {
    const now = Date.now();
    return this.getAll().filter(
      state => now - state.lastActivity.getTime() > maxAgeMs
    );
  }

  /**
   * Kick all stale connections
   */
  kickStale(maxAgeMs: number): number {
    const stale = this.getStale(maxAgeMs);
    for (const state of stale) {
      this.kick(state.id, `Stale connection (${maxAgeMs}ms without activity)`);
    }
    return stale.length;
  }

  /**
   * Start graceful drain (stop accepting new messages, wait for queues to empty)
   */
  async drain(timeoutMs = 5000): Promise<void> {
    this.isDraining = true;

    // Mark all connections as draining
    for (const state of this.connections.values()) {
      state.draining = true;
    }

    // Flush all queues
    for (const state of this.connections.values()) {
      this.flushQueue(state.id);
    }

    // Wait for connections to close or timeout
    return new Promise((resolve) => {
      this.drainResolve = resolve;

      // Timeout
      setTimeout(() => {
        // Force close remaining
        for (const state of this.connections.values()) {
          state.ws.close(1001, 'Server shutting down');
        }
        this.connections.clear();
        resolve();
      }, timeoutMs);

      // Check if already empty
      this.checkDrainComplete();
    });
  }

  private checkDrainComplete(): void {
    if (this.isDraining && this.connections.size === 0 && this.drainResolve) {
      this.drainResolve();
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalConnections: number;
    healthyConnections: number;
    drainingConnections: number;
    totalMessagesSent: number;
    totalMessagesDropped: number;
    totalQueuedMessages: number;
    avgHealthScore: number;
  } {
    const all = this.getAll();
    let totalSent = 0;
    let totalDropped = 0;
    let totalQueued = 0;
    let totalHealth = 0;
    let healthy = 0;
    let draining = 0;

    for (const state of all) {
      totalSent += state.messagesSent;
      totalDropped += state.messagesDropped;
      totalQueued += state.sendQueue.getSize();
      totalHealth += state.healthScore;
      if (state.healthScore > 50) healthy++;
      if (state.draining) draining++;
    }

    return {
      totalConnections: all.length,
      healthyConnections: healthy,
      drainingConnections: draining,
      totalMessagesSent: totalSent,
      totalMessagesDropped: totalDropped,
      totalQueuedMessages: totalQueued,
      avgHealthScore: all.length > 0 ? totalHealth / all.length : 0,
    };
  }

  /**
   * Check if in drain mode
   */
  isDrainingMode(): boolean {
    return this.isDraining;
  }

  /**
   * Get number of connections
   */
  size(): number {
    return this.connections.size;
  }
}
