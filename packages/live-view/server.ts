#!/usr/bin/env node
/**
 * BarrHawk E2E Live View Server
 *
 * Standalone WebSocket server for real-time test observation.
 * Run this alongside the MCP server to enable live view in the dashboard.
 *
 * Usage:
 *   npx tsx packages/live-view/server.ts
 *   # or
 *   npm run start -w @barrhawk/live-view
 */

import { InMemoryEventTransport } from '../events/index.js';
import { LiveViewService } from './service.js';
import { LiveViewWebSocketGateway } from './websocket.js';

const PORT = parseInt(process.env.LIVE_VIEW_PORT || '8080', 10);

async function main() {
  console.log('Starting BarrHawk Live View Server...');

  // Create event transport (in-memory for local, Redis for production)
  const transport = new InMemoryEventTransport();

  // Create live view service
  const service = new LiveViewService(transport, {
    consoleBufferSize: 100,
    sessionTimeoutMs: 300000, // 5 minutes
  });

  // Start service
  service.start();

  // Create WebSocket gateway
  const gateway = new LiveViewWebSocketGateway(service, PORT);

  console.log(`\nLive View Server running on ws://localhost:${PORT}`);
  console.log('\nTo connect from a client:');
  console.log(`  const ws = new WebSocket('ws://localhost:${PORT}?tenant=local');`);
  console.log('  ws.send(JSON.stringify({ type: "subscribe", runId: "your-run-id" }));');

  // Status endpoint
  setInterval(() => {
    const stats = gateway.getStats();
    if (stats.totalClients > 0 || stats.activeSessions > 0) {
      console.log(`[Stats] Clients: ${stats.totalClients}, Subscriptions: ${stats.totalSubscriptions}, Sessions: ${stats.activeSessions}`);
    }
  }, 30000);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    gateway.close();
    service.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\nShutting down...');
    gateway.close();
    service.stop();
    process.exit(0);
  });
}

main().catch(console.error);
