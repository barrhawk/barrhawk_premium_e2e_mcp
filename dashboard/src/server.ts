/**
 * BarrHawk Dashboard Server
 *
 * Serves the dashboard UI and provides REST fallback endpoints.
 * Live data comes via WebSocket from Bridge:3334
 */

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const app = new Hono();

// Configuration
const DASHBOARD_PORT = Number(process.env.DASHBOARD_PORT) || 3333;
const BRIDGE_WS_URL = process.env.BRIDGE_WS_URL || 'ws://localhost:3334';

// Serve static files
app.use('/assets/*', serveStatic({ root: publicDir }));
app.use('/favicon.svg', serveStatic({ path: join(publicDir, 'favicon.svg') }));

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

// Config endpoint (tells client where Bridge WebSocket is)
app.get('/api/config', (c) => c.json({
  bridgeWsUrl: BRIDGE_WS_URL,
  version: '0.1.0',
}));

// REST fallback - fetch current state from Bridge
app.get('/api/snapshot', async (c) => {
  try {
    // In production, this would fetch from Bridge's REST endpoint
    // For now, return empty state
    return c.json({
      bridge: { status: 'unknown', uptime: 0 },
      doctor: { status: 'unknown', activeTasks: 0, queuedTasks: 0 },
      igors: {},
      stream: [],
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch state' }, 500);
  }
});

// Main dashboard HTML
app.get('/', async (c) => {
  try {
    const html = await readFile(join(publicDir, 'index.html'), 'utf-8');
    return c.html(html);
  } catch (error) {
    return c.text('Failed to load dashboard', 500);
  }
});

// Start server
console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   BarrHawk Dashboard                                      ║
║   ═══════════════════                                     ║
║                                                           ║
║   Dashboard:  http://localhost:${DASHBOARD_PORT}                     ║
║   Bridge WS:  ${BRIDGE_WS_URL}                        ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);

serve({
  fetch: app.fetch,
  port: DASHBOARD_PORT,
});
