/**
 * BarrHawk E2E Live View WebSocket Server
 *
 * WebSocket gateway for real-time test observation.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { LiveViewService, type LiveViewObserver, type LiveViewMessage } from './service.js';

// =============================================================================
// Types
// =============================================================================

interface AuthContext {
  tenantId: string;
  userId?: string;
  apiKeyId?: string;
}

interface ClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping';
  runId?: string;
}

// =============================================================================
// WebSocket Gateway
// =============================================================================

export class LiveViewWebSocketGateway {
  private wss: WebSocketServer;
  private service: LiveViewService;
  private clients: Map<WebSocket, {
    id: string;
    auth: AuthContext;
    subscriptions: Set<string>;
  }> = new Map();

  constructor(service: LiveViewService, port: number = 8080) {
    this.service = service;

    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (err) => {
      console.error('[WebSocket] Server error:', err);
    });

    console.log(`[WebSocket] Live View gateway listening on port ${port}`);
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    // Extract auth from URL or headers
    const auth = this.extractAuth(req);
    if (!auth) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const clientId = uuidv4();
    this.clients.set(ws, {
      id: clientId,
      auth,
      subscriptions: new Set(),
    });

    console.log(`[WebSocket] Client connected: ${clientId} (tenant: ${auth.tenantId})`);

    // Handle messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as ClientMessage;
        this.handleMessage(ws, message);
      } catch (err) {
        ws.send(JSON.stringify({
          type: 'error',
          data: { message: 'Invalid message format' },
          timestamp: new Date(),
        }));
      }
    });

    // Handle close
    ws.on('close', () => {
      this.handleDisconnect(ws);
    });

    // Handle errors
    ws.on('error', (err) => {
      console.error(`[WebSocket] Client error (${clientId}):`, err);
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'init',
      data: {
        clientId,
        message: 'Connected to BarrHawk Live View',
        availableCommands: ['subscribe', 'unsubscribe', 'ping'],
      },
      timestamp: new Date(),
    }));
  }

  private handleMessage(ws: WebSocket, message: ClientMessage): void {
    const client = this.clients.get(ws);
    if (!client) return;

    switch (message.type) {
      case 'subscribe':
        if (message.runId) {
          this.subscribeClient(ws, message.runId);
        }
        break;

      case 'unsubscribe':
        if (message.runId) {
          this.unsubscribeClient(ws, message.runId);
        }
        break;

      case 'ping':
        ws.send(JSON.stringify({
          type: 'ping',
          data: { pong: true },
          timestamp: new Date(),
        }));
        break;
    }
  }

  private subscribeClient(ws: WebSocket, runId: string): void {
    const client = this.clients.get(ws);
    if (!client) return;

    // Create observer adapter
    const observer: LiveViewObserver = {
      id: client.id,
      send: (message: LiveViewMessage) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(message));
        }
      },
      close: () => {
        ws.close();
      },
    };

    // Add to service
    this.service.addObserver(runId, client.auth.tenantId, observer);
    client.subscriptions.add(runId);

    console.log(`[WebSocket] Client ${client.id} subscribed to run: ${runId}`);
  }

  private unsubscribeClient(ws: WebSocket, runId: string): void {
    const client = this.clients.get(ws);
    if (!client) return;

    // Create observer adapter to match
    const observer: LiveViewObserver = {
      id: client.id,
      send: () => {},
      close: () => {},
    };

    this.service.removeObserver(runId, observer);
    client.subscriptions.delete(runId);

    console.log(`[WebSocket] Client ${client.id} unsubscribed from run: ${runId}`);
  }

  private handleDisconnect(ws: WebSocket): void {
    const client = this.clients.get(ws);
    if (!client) return;

    // Unsubscribe from all
    for (const runId of client.subscriptions) {
      const observer: LiveViewObserver = {
        id: client.id,
        send: () => {},
        close: () => {},
      };
      this.service.removeObserver(runId, observer);
    }

    this.clients.delete(ws);
    console.log(`[WebSocket] Client disconnected: ${client.id}`);
  }

  private extractAuth(req: IncomingMessage): AuthContext | null {
    // For local testing, accept any connection with default tenant
    // In production, validate JWT or API key

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const tenantId = url.searchParams.get('tenant') || 'local';
    const apiKey = req.headers['authorization']?.replace('Bearer ', '');

    return {
      tenantId,
      apiKeyId: apiKey,
    };
  }

  /**
   * Broadcast a message to all clients subscribed to a run.
   */
  broadcastToRun(runId: string, message: LiveViewMessage): void {
    for (const [ws, client] of this.clients) {
      if (client.subscriptions.has(runId) && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    }
  }

  /**
   * Close the gateway.
   */
  close(): void {
    for (const [ws] of this.clients) {
      ws.close(1000, 'Server shutting down');
    }
    this.wss.close();
    console.log('[WebSocket] Gateway closed');
  }

  /**
   * Get connection stats.
   */
  getStats(): {
    totalClients: number;
    totalSubscriptions: number;
    activeSessions: number;
  } {
    let totalSubscriptions = 0;
    for (const client of this.clients.values()) {
      totalSubscriptions += client.subscriptions.size;
    }

    return {
      totalClients: this.clients.size,
      totalSubscriptions,
      activeSessions: this.service.getActiveSessions().length,
    };
  }
}
