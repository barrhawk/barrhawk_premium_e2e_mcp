#!/usr/bin/env bun
/**
 * Primary Supervisor Server - The Immortal One
 *
 * This server:
 * - Spawns and manages the secondary (worker) server
 * - Handles MCP protocol and routes calls to secondary
 * - Monitors health and auto-recovers from crashes
 * - Manages snapshots for rollback capability
 * - NEVER modifies its own code
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { spawn, type Subprocess } from 'bun';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, resolve } from 'path';

import type {
  PrimaryConfig,
  WorkerState,
  ToolDefinition,
  SupervisorEvent,
} from '../shared/types.js';
import { IPCClient, EventEmitter } from '../shared/ipc.js';
import { HealthMonitor } from './health-monitor.js';
import { SnapshotManager } from './snapshot-manager.js';

// Default configuration
const DEFAULT_CONFIG: PrimaryConfig = {
  secondaryPath: resolve(import.meta.dir, '../secondary'),
  snapshotDir: resolve(import.meta.dir, '../../snapshots'),
  healthInterval: 1000,
  maxRestarts: 5,
  restartDelay: 1000,
  snapshotRetention: 10,
};

class Supervisor {
  private config: PrimaryConfig;
  private process: Subprocess | null = null;
  private state: WorkerState;
  private ipc: IPCClient;
  private health: HealthMonitor;
  private snapshots: SnapshotManager;
  private events: EventEmitter<SupervisorEvent>;
  private secondaryPort = 3001;

  constructor(config: Partial<PrimaryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.state = {
      pid: null,
      status: 'stopped',
      startedAt: null,
      restartCount: 0,
      lastHealthCheck: null,
      healthy: false,
    };

    this.events = new EventEmitter();
    this.ipc = new IPCClient('localhost', this.secondaryPort, 'igor');
    this.health = new HealthMonitor(this.ipc, this.events, {
      checkInterval: this.config.healthInterval,
    });
    this.snapshots = new SnapshotManager(
      this.config.snapshotDir,
      this.config.secondaryPath,
      this.config.snapshotRetention
    );

    // Handle crash events
    this.events.on('worker:crashed', async () => {
      await this.handleCrash();
    });
  }

  /**
   * Initialize the supervisor
   */
  async init(): Promise<void> {
    await this.snapshots.init();

    // Create initial snapshot if none exists
    const existing = await this.snapshots.list();
    if (existing.length === 0) {
      console.error('[Primary] Creating initial snapshot...');
      await this.snapshots.create('initial', 'auto');
    }
  }

  /**
   * Start the secondary server
   */
  async start(): Promise<void> {
    if (this.state.status === 'running') {
      console.error('[Primary] Secondary already running');
      return;
    }

    this.state.status = 'starting';
    this.events.emit({ type: 'worker:starting' });

    console.error('[Primary] Starting secondary server...');

    this.process = spawn({
      cmd: [process.execPath, '--hot', 'index.ts'],
      cwd: this.config.secondaryPath,
      env: {
        ...process.env,
        PORT: String(this.secondaryPort),
        PRIMARY_URL: 'http://localhost:3000',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    // Stream stdout
    this.streamOutput(this.process.stdout, 'stdout');
    this.streamOutput(this.process.stderr, 'stderr');

    // Wait for process to be ready
    const ready = await this.health.waitForHealthy(10000);

    if (!ready) {
      this.state.status = 'crashed';
      throw new Error('Secondary failed to start within timeout');
    }

    this.state.pid = this.process.pid;
    this.state.status = 'running';
    this.state.startedAt = new Date();
    this.state.healthy = true;

    this.events.emit({ type: 'worker:ready', pid: this.process.pid });

    // Start health monitoring
    this.health.start();

    // Handle process exit
    this.process.exited.then((code) => {
      console.error(`[Primary] Secondary exited with code ${code}`);
      if (this.state.status === 'running') {
        this.state.status = 'crashed';
        this.events.emit({ type: 'worker:crashed', error: `Exit code: ${code}` });
      }
    });

    console.error(`[Primary] Secondary ready (PID: ${this.process.pid})`);
  }

  /**
   * Stream output from subprocess
   */
  private async streamOutput(
    stream: ReadableStream<Uint8Array>,
    type: 'stdout' | 'stderr'
  ): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value).trim();
        if (text) {
          const prefix = type === 'stderr' ? '[Secondary ERR]' : '[Secondary]';
          console.error(`${prefix} ${text}`);
        }
      }
    } catch {
      // Stream closed
    }
  }

  /**
   * Stop the secondary server
   */
  async stop(): Promise<void> {
    this.health.stop();

    if (this.process) {
      console.error('[Primary] Stopping secondary...');

      // Try graceful shutdown first
      try {
        await this.ipc.shutdown();
        await Bun.sleep(500);
      } catch {
        // Ignore
      }

      // Force kill if still running
      if (this.process.exitCode === null) {
        this.process.kill();
        await this.process.exited;
      }

      this.process = null;
    }

    this.state.status = 'stopped';
    this.state.pid = null;
    this.state.healthy = false;
  }

  /**
   * Restart the secondary server
   */
  async restart(): Promise<void> {
    this.state.restartCount++;
    this.events.emit({ type: 'worker:restarting', attempt: this.state.restartCount });

    console.error(`[Primary] Restarting secondary (attempt ${this.state.restartCount})...`);

    await this.stop();
    await Bun.sleep(this.config.restartDelay);
    await this.start();
  }

  /**
   * Handle a crash - restart or rollback
   */
  private async handleCrash(): Promise<void> {
    if (this.state.restartCount >= this.config.maxRestarts) {
      console.error('[Primary] Max restarts exceeded, rolling back...');

      try {
        const snapshot = await this.snapshots.restore();
        this.events.emit({ type: 'worker:rollback', snapshot: snapshot.id });
        this.state.restartCount = 0;
        await this.start();
      } catch (err) {
        console.error('[Primary] Rollback failed:', err);
        throw err;
      }
    } else {
      await this.restart();
    }
  }

  /**
   * Create a snapshot
   */
  async createSnapshot(name: string): Promise<string> {
    const meta = await this.snapshots.create(name, 'manual');
    this.events.emit({ type: 'snapshot:created', id: meta.id });
    return meta.id;
  }

  /**
   * Rollback to a snapshot
   */
  async rollback(snapshotId?: string): Promise<string> {
    await this.stop();

    const meta = await this.snapshots.restore(snapshotId);
    this.events.emit({ type: 'snapshot:restored', id: meta.id });
    this.state.restartCount = 0;

    await this.start();
    return meta.id;
  }

  /**
   * Get worker state
   */
  getState(): WorkerState {
    return { ...this.state };
  }

  /**
   * Get available tools from secondary
   */
  async getTools(): Promise<ToolDefinition[]> {
    if (this.state.status !== 'running') {
      return [];
    }
    return this.ipc.getTools();
  }

  /**
   * Call a tool on secondary
   */
  async callTool(name: string, args: unknown) {
    if (this.state.status !== 'running') {
      throw new Error('Secondary server not running');
    }
    return this.ipc.callTool(name, args);
  }

  /**
   * List snapshots
   */
  async listSnapshots() {
    return this.snapshots.list();
  }
}

// ============================================================================
// MCP Server Setup
// ============================================================================

async function main() {
  const supervisor = new Supervisor();

  // Create MCP server FIRST - Claude Code connects immediately
  const server = new Server(
    {
      name: 'barrhawk-supervisor',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Track if secondary is ready
  let secondaryReady = false;
  let secondaryError: Error | null = null;
  let lastToolHash = '';

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Wait for secondary to be ready (with timeout)
    if (!secondaryReady && !secondaryError) {
      const maxWait = 15000;
      const start = Date.now();
      while (!secondaryReady && !secondaryError && Date.now() - start < maxWait) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    // Get secondary tools (empty if not ready)
    const secondaryTools = await supervisor.getTools();

    // Primary-only tools (immutable)
    const primaryTools: Tool[] = [
      {
        name: 'worker_status',
        description: 'Get the current status of the secondary worker server',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'worker_restart',
        description: 'Restart the secondary worker server',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'worker_snapshot',
        description: 'Create a snapshot of the current secondary server state for rollback',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name for the snapshot',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'worker_rollback',
        description: 'Rollback the secondary server to a previous snapshot',
        inputSchema: {
          type: 'object',
          properties: {
            snapshot: {
              type: 'string',
              description: 'Snapshot ID to rollback to (optional, uses latest if not specified)',
            },
          },
        },
      },
      {
        name: 'worker_snapshots',
        description: 'List all available snapshots',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'plan_read',
        description: 'Read a plan or configuration markdown file (read-only)',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the .md file to read',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'dynamic_tool_delete',
        description: 'Delete a dynamic tool by name',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the tool to delete',
            },
          },
          required: ['name'],
        },
      },
    ];

    return {
      tools: [...primaryTools, ...secondaryTools],
    };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Handle primary-only tools
    switch (name) {
      case 'worker_status': {
        const state = supervisor.getState();
        const health = await supervisor['health'].check();

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ...state,
              health,
            }, null, 2),
          }],
        };
      }

      case 'worker_restart': {
        await supervisor.restart();
        return {
          content: [{ type: 'text', text: 'Secondary server restarted successfully' }],
        };
      }

      case 'worker_snapshot': {
        const snapshotName = (args as { name: string }).name;
        const id = await supervisor.createSnapshot(snapshotName);
        return {
          content: [{ type: 'text', text: `Snapshot created: ${id}` }],
        };
      }

      case 'worker_rollback': {
        const snapshotId = (args as { snapshot?: string }).snapshot;
        const id = await supervisor.rollback(snapshotId);
        return {
          content: [{ type: 'text', text: `Rolled back to snapshot: ${id}` }],
        };
      }

      case 'worker_snapshots': {
        const snapshots = await supervisor.listSnapshots();
        return {
          content: [{
            type: 'text',
            text: snapshots.length > 0
              ? snapshots.map(s =>
                  `${s.id} (${s.toolCount} tools, ${new Date(s.createdAt).toISOString()})`
                ).join('\n')
              : 'No snapshots available',
          }],
        };
      }

      case 'plan_read': {
        const path = (args as { path: string }).path;

        // Security: only allow .md files and prevent path traversal
        if (!path.endsWith('.md')) {
          return {
            content: [{ type: 'text', text: 'Error: Only .md files can be read' }],
            isError: true,
          };
        }

        if (path.includes('..')) {
          return {
            content: [{ type: 'text', text: 'Error: Path traversal not allowed' }],
            isError: true,
          };
        }

        try {
          const content = await readFile(path, 'utf-8');
          return {
            content: [{ type: 'text', text: content }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error reading file: ${(err as Error).message}` }],
            isError: true,
          };
        }
      }

      case 'dynamic_tool_delete': {
        const toolName = (args as { name: string }).name;

        // Protected tools that cannot be deleted
        const protected_tools = ['dynamic_tool_create', 'hello_world'];
        if (protected_tools.includes(toolName)) {
          return {
            content: [{ type: 'text', text: `Error: Cannot delete protected tool '${toolName}'` }],
            isError: true,
          };
        }

        try {
          const response = await fetch(`http://localhost:${supervisor['secondaryPort']}/tools/${toolName}`, {
            method: 'DELETE',
          });
          const result = await response.json();

          if (!result.success) {
            return {
              content: [{ type: 'text', text: `Error: ${result.error}` }],
              isError: true,
            };
          }

          return {
            content: [{ type: 'text', text: `Tool '${toolName}' deleted successfully` }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error deleting tool: ${(err as Error).message}` }],
            isError: true,
          };
        }
      }

      default: {
        // Delegate to secondary
        try {
          const result = await supervisor.callTool(name, args);

          // Check if secondary returned an error with stack trace
          if (result.isError && result.content?.[0]?.text) {
            const errorText = result.content[0].text;
            // Format error for better readability
            return {
              content: [{
                type: 'text',
                text: errorText,
              }],
              isError: true,
            };
          }

          return result;
        } catch (err) {
          const error = err as Error;
          // Include stack trace for better debugging
          const errorMsg = error.stack || error.message;
          return {
            content: [{
              type: 'text',
              text: `Error calling tool ${name}:\n${errorMsg}`,
            }],
            isError: true,
          };
        }
      }
    }
  });

  // Connect to stdio transport IMMEDIATELY - don't block on secondary
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[Primary] MCP server connected, starting secondary in background...');

  // Start secondary in background (non-blocking)
  (async () => {
    try {
      await supervisor.init();
      await supervisor.start();
      secondaryReady = true;
      console.error('[Primary] Secondary ready, tools available');

      // Hash tool definitions to detect any changes (not just count)
      const hashTools = (tools: ToolDefinition[]) => {
        const data = tools.map(t => `${t.name}:${t.description}:${JSON.stringify(t.inputSchema)}`).sort().join('|');
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
          hash = ((hash << 5) - hash) + data.charCodeAt(i);
          hash |= 0;
        }
        return hash.toString(16);
      };

      // Get initial tool hash
      const initialTools = await supervisor.getTools();
      lastToolHash = hashTools(initialTools);

      // Poll for tool changes and notify client
      setInterval(async () => {
        try {
          const tools = await supervisor.getTools();
          const currentHash = hashTools(tools);
          if (currentHash !== lastToolHash) {
            console.error(`[Primary] Tools changed (hash ${lastToolHash} -> ${currentHash}), notifying client`);
            lastToolHash = currentHash;

            // Send MCP notification to trigger client tool list refresh
            await server.notification({
              method: 'notifications/tools/list_changed',
            });
          }
        } catch {
          // Secondary might be restarting, ignore
        }
      }, 1000);

    } catch (err) {
      secondaryError = err as Error;
      console.error('[Primary] Secondary failed to start:', err);
    }
  })();

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.error('[Primary] Shutting down...');
    await supervisor.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('[Primary] Shutting down...');
    await supervisor.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[Primary] Fatal error:', err);
  process.exit(1);
});
