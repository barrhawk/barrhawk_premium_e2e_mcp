/**
 * Bridge Client - Shared component for connecting to the Bridge
 *
 * Used by Doctor, Igor, and Frankenstein to communicate through the Bridge.
 */

import WebSocket from 'ws';
import {
  BridgeMessage,
  ComponentId,
  MessageType,
  generateId,
  signMessage
} from './types.js';

export interface BridgeClientConfig {
  componentId: ComponentId;
  version: string;
  bridgeUrl?: string;
  reconnectInterval?: number;
  authToken?: string;  // Required for authenticated connections
}

export type MessageHandler = (message: BridgeMessage) => void;

export class BridgeClient {
  private ws: WebSocket | null = null;
  private config: BridgeClientConfig;
  private handlers: Map<MessageType, MessageHandler[]> = new Map();
  private connected = false;
  private reconnecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;  // Flag to prevent reconnect after intentional disconnect

  constructor(config: BridgeClientConfig) {
    this.config = {
      bridgeUrl: 'ws://localhost:7000',
      reconnectInterval: 5000,
      ...config,
    };
  }

  async connect(): Promise<boolean> {
    // Enable reconnection (may have been disabled by disconnect())
    this.shouldReconnect = true;

    // Close existing connection to prevent duplicate registrations
    if (this.ws) {
      try {
        this.ws.removeAllListeners();  // Prevent close handler from triggering reconnect
        this.ws.close();
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }

    return new Promise((resolve) => {
      try {
        // Build URL with auth token if provided
        let url = this.config.bridgeUrl!;
        if (this.config.authToken) {
          const separator = url.includes('?') ? '&' : '?';
          url = `${url}${separator}token=${encodeURIComponent(this.config.authToken)}`;
        }
        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
          this.connected = true;
          this.log('INFO', 'Connected to Bridge');

          // Register with Bridge
          this.send({
            id: generateId(),
            timestamp: new Date(),
            source: this.config.componentId,
            target: 'bridge',
            type: 'component.register',
            payload: {
              id: this.config.componentId,
              version: this.config.version,
            },
            version: this.config.version,
          });

          resolve(true);
        });

        this.ws.on('message', (data: Buffer) => {
          try {
            const message: BridgeMessage = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (err) {
            this.log('ERROR', 'Failed to parse message:', err);
          }
        });

        this.ws.on('close', () => {
          this.connected = false;
          this.log('WARN', 'Disconnected from Bridge');
          this.scheduleReconnect();
        });

        this.ws.on('error', (err) => {
          this.log('ERROR', 'WebSocket error:', err);
          resolve(false);
        });
      } catch (err) {
        this.log('ERROR', 'Failed to connect:', err);
        resolve(false);
      }
    });
  }

  private scheduleReconnect(): void {
    // Don't reconnect if we intentionally disconnected
    if (!this.shouldReconnect) return;
    // Don't reconnect if already connected
    if (this.connected) return;
    if (this.reconnecting) return;
    this.reconnecting = true;

    // Clear any existing timer to prevent duplicates
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.reconnecting = false;

      // Double-check we should still reconnect
      if (!this.shouldReconnect) {
        this.log('INFO', 'Skipping reconnect - client disconnected');
        return;
      }

      // Double-check not already connected
      if (this.connected) {
        this.log('INFO', 'Skipping reconnect - already connected');
        return;
      }

      this.log('INFO', 'Attempting to reconnect...');
      await this.connect();
    }, this.config.reconnectInterval);
  }

  private handleMessage(message: BridgeMessage): void {
    const handlers = this.handlers.get(message.type) || [];
    handlers.forEach(handler => {
      try {
        handler(message);
      } catch (err) {
        this.log('ERROR', `Handler error for ${message.type}:`, err);
      }
    });

    // Also call wildcard handlers
    const wildcardHandlers = this.handlers.get('*' as MessageType) || [];
    wildcardHandlers.forEach(handler => {
      try {
        handler(message);
      } catch (err) {
        this.log('ERROR', 'Wildcard handler error:', err);
      }
    });
  }

  on(type: MessageType | '*', handler: MessageHandler): void {
    const existing = this.handlers.get(type as MessageType) || [];
    existing.push(handler);
    this.handlers.set(type as MessageType, existing);
  }

  send(message: BridgeMessage): void {
    if (!this.ws || !this.connected) {
      this.log('WARN', 'Cannot send, not connected');
      return;
    }
    // Sign message if auth token is configured
    if (this.config.authToken) {
      message.signature = signMessage(message, this.config.authToken);
    }
    this.ws.send(JSON.stringify(message));
  }

  sendTo(target: ComponentId | 'broadcast', type: MessageType, payload: unknown, correlationId?: string): string {
    const id = generateId();
    this.send({
      id,
      timestamp: new Date(),
      source: this.config.componentId,
      target,
      type,
      payload,
      correlationId,
      version: this.config.version,
    });
    return id;
  }

  sendHeartbeat(): void {
    this.sendTo('bridge', 'heartbeat', { time: Date.now() });
  }

  isConnected(): boolean {
    return this.connected;
  }

  disconnect(): void {
    // Prevent automatic reconnection after intentional disconnect
    this.shouldReconnect = false;

    // Clear any pending reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.reconnecting = false;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  private log(level: 'INFO' | 'WARN' | 'ERROR', ...args: unknown[]) {
    const timestamp = new Date().toISOString();
    const id = this.config.componentId.charAt(0).toUpperCase() + this.config.componentId.slice(1);
    console.log(`[${timestamp}] [${id}:${level}]`, ...args);
  }
}
