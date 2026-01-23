#!/usr/bin/env bun
/**
 * Secondary Worker Server - The Mutable One
 *
 * This server:
 * - Runs with `bun --hot` for live reloading
 * - Hosts dynamic tools that can be created at runtime
 * - Can be restarted/rolled back by the primary
 * - Handles all actual test execution
 */

import { serve } from 'bun';
import { watch } from 'fs/promises';
import { join, resolve } from 'path';
import type { HealthStatus, ToolDefinition } from '../shared/types.js';
import { ToolLoader } from './tool-loader.js';

// Configuration
const PORT = parseInt(process.env.PORT || '3001');
const TOOLS_DIR = resolve(import.meta.dir, './tools');

// Global state
const startTime = Date.now();
let lastError: string | undefined;

// Initialize tool loader
const loader = new ToolLoader(TOOLS_DIR);

// Load all tools on startup
await loader.loadAll();

// Watch for file changes
async function watchTools() {
  try {
    const watcher = watch(TOOLS_DIR, { recursive: true });

    for await (const event of watcher) {
      if (event.filename?.endsWith('.ts')) {
        console.log(`[Secondary] File changed: ${event.filename}`);
        loader.scheduleReload(event.filename);
      }
    }
  } catch (err) {
    console.error('[Secondary] Watch error:', err);
  }
}

// Start watching (non-blocking)
watchTools();

// HTTP Server for IPC with primary
const server = serve({
  port: PORT,

  async fetch(req) {
    const url = new URL(req.url);

    try {
      // Health check
      if (url.pathname === '/health') {
        const status: HealthStatus = {
          status: 'healthy',
          uptime: Date.now() - startTime,
          toolCount: loader.getAllTools().length,
          lastError,
          memoryUsage: {
            heapUsed: process.memoryUsage().heapUsed,
            heapTotal: process.memoryUsage().heapTotal,
          },
        };
        return Response.json(status);
      }

      // List tools
      if (url.pathname === '/tools' && req.method === 'GET') {
        const tools = loader.getAllTools();
        const definitions: ToolDefinition[] = tools.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.schema,
        }));
        return Response.json(definitions);
      }

      // Create tool
      if (url.pathname === '/tools/create' && req.method === 'POST') {
        const body = await req.json();
        const { name, description, schema, code, permissions } = body;

        try {
          await loader.createTool(name, description, schema, code, permissions);
          return Response.json({ success: true });
        } catch (err) {
          return Response.json(
            { success: false, error: (err as Error).message },
            { status: 400 }
          );
        }
      }

      // Delete tool
      if (url.pathname.startsWith('/tools/') && req.method === 'DELETE') {
        const name = url.pathname.split('/').pop();
        if (!name) {
          return Response.json({ success: false, error: 'Tool name required' }, { status: 400 });
        }

        try {
          await loader.deleteTool(name);
          return Response.json({ success: true });
        } catch (err) {
          return Response.json(
            { success: false, error: (err as Error).message },
            { status: 404 }
          );
        }
      }

      // Call tool
      if (url.pathname === '/call' && req.method === 'POST') {
        const { tool: toolName, args } = await req.json();

        if (!loader.hasTool(toolName)) {
          return Response.json(
            { error: `Tool not found: ${toolName}` },
            { status: 404 }
          );
        }

        try {
          // Execute with timeout
          const timeoutMs = 60000;
          const result = await Promise.race([
            loader.execute(toolName, args),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Execution timeout')), timeoutMs)
            ),
          ]);

          // Format as MCP result
          return Response.json({
            content: [{
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            }],
          });
        } catch (err) {
          lastError = (err as Error).message;
          return Response.json({
            content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
            isError: true,
          });
        }
      }

      // Reload tools
      if (url.pathname === '/reload' && req.method === 'POST') {
        const loaded = await loader.loadAll();
        return Response.json({ success: true, loaded });
      }

      // Graceful shutdown
      if (url.pathname === '/shutdown' && req.method === 'POST') {
        console.log('[Secondary] Shutdown requested');
        setTimeout(() => process.exit(0), 100);
        return Response.json({ success: true });
      }

      return new Response('Not found', { status: 404 });

    } catch (err) {
      lastError = (err as Error).message;
      console.error('[Secondary] Request error:', err);
      return Response.json(
        { error: (err as Error).message },
        { status: 500 }
      );
    }
  },
});

console.log(`[Secondary] Server running on port ${PORT}`);
console.log(`[Secondary] Tools directory: ${TOOLS_DIR}`);
console.log(`[Secondary] Loaded ${loader.getAllTools().length} tools`);

// Handle shutdown signals
process.on('SIGINT', () => {
  console.log('[Secondary] SIGINT received, shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Secondary] SIGTERM received, shutting down...');
  process.exit(0);
});
