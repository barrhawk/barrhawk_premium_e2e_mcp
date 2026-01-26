#!/usr/bin/env bun
/**
 * BarrHawk Frank MCP Server
 *
 * MCP interface to the Tripartite architecture (Bridge → Doctor → Igor → Frankenstein).
 * Exposes high-level automation tools that leverage the full stack.
 *
 * Usage:
 *   1. Start the tripartite stack first (bridge, doctor, igor, frankenstein)
 *   2. Add this MCP to your Claude Code settings
 *   3. Use frank_* tools for intelligent browser automation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import WebSocket from 'ws';
import { generateId } from './shared/types.js';
import {
  analyzeSwarmNeed,
  createSwarmPlan,
  createTaskCalls,
  detectSwarmRoutes,
  SwarmPlan,
} from './doctor/swarm.js';

const VERSION = '2026-01-24-v2-dashboard-integration';
const BRIDGE_URL = process.env.BRIDGE_URL || 'ws://localhost:7000';
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3333';

// =============================================================================
// Dashboard Reporting
// =============================================================================

async function reportSwarmToDashboard(swarm: {
  swarmId: string;
  masterIntent: string;
  routes: Array<{ routeId: string; routeName: string; toolBag: Array<{ name: string }> }>;
  config: { maxIgors: number; toolBagSize: number };
}): Promise<boolean> {
  try {
    const res = await fetch(`${DASHBOARD_URL}/api/swarms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(swarm),
    });
    return res.ok;
  } catch (err) {
    console.error('[MCP-Frank] Failed to report swarm to dashboard:', err);
    return false;
  }
}

async function reportRouteProgress(
  swarmId: string,
  routeId: string,
  progress: { action: string; status: string; details?: string; tool?: string }
): Promise<boolean> {
  try {
    const res = await fetch(`${DASHBOARD_URL}/api/swarms/${swarmId}/routes/${routeId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(progress),
    });
    return res.ok;
  } catch (err) {
    console.error('[MCP-Frank] Failed to report progress:', err);
    return false;
  }
}

async function reportRouteStatus(
  swarmId: string,
  routeId: string,
  update: { status?: string; igorId?: string; result?: object }
): Promise<boolean> {
  try {
    const res = await fetch(`${DASHBOARD_URL}/api/swarms/${swarmId}/routes/${routeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
    return res.ok;
  } catch (err) {
    console.error('[MCP-Frank] Failed to report route status:', err);
    return false;
  }
}

// =============================================================================
// Bridge Connection
// =============================================================================

interface BridgeMessage {
  id: string;
  timestamp: Date;
  source: string;
  target: string;
  type: string;
  payload: unknown;
  correlationId?: string;
  version: string;
}

class BridgeConnection {
  private ws: WebSocket | null = null;
  private connected = false;
  private pendingRequests: Map<string, {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = new Map();
  private requestTimeout = 60000; // 60s for complex operations
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  async connect(): Promise<boolean> {
    // Clear any existing heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Close existing connection if any
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(BRIDGE_URL);

        this.ws.on('open', () => {
          this.connected = true;
          // Register as MCP client
          this.send({
            id: generateId(),
            timestamp: new Date(),
            source: 'mcp-frank',
            target: 'bridge',
            type: 'component.register',
            payload: { id: 'mcp-frank', version: VERSION },
            version: VERSION,
          });

          // Start heartbeat (every 10s, stale threshold is 15s)
          this.heartbeatInterval = setInterval(() => {
            if (this.connected && this.ws) {
              try {
                this.send({
                  id: generateId(),
                  timestamp: new Date(),
                  source: 'mcp-frank',
                  target: 'bridge',
                  type: 'heartbeat',
                  payload: { time: Date.now() },
                  version: VERSION,
                });
              } catch {
                // Ignore heartbeat errors
              }
            }
          }, 10000);

          resolve(true);
        });

        this.ws.on('message', (data: Buffer) => {
          try {
            const message: BridgeMessage = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (err) {
            console.error('[MCP-Frank] Failed to parse message:', err);
          }
        });

        this.ws.on('close', () => {
          this.connected = false;
          // Clear heartbeat
          if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
          }
          // Reject all pending requests
          for (const [id, pending] of this.pendingRequests) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('Bridge connection closed'));
          }
          this.pendingRequests.clear();
          // Schedule reconnect
          this.scheduleReconnect();
        });

        this.ws.on('error', (err) => {
          console.error('[MCP-Frank] WebSocket error:', err);
          resolve(false);
        });
      } catch (err) {
        console.error('[MCP-Frank] Failed to connect:', err);
        resolve(false);
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return;
    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      console.error('[MCP-Frank] Attempting to reconnect...');
      await this.connect();
    }, 5000);
  }

  private handleMessage(message: BridgeMessage): void {
    // Check if this is a response to a pending request
    if (message.correlationId && this.pendingRequests.has(message.correlationId)) {
      const pending = this.pendingRequests.get(message.correlationId)!;
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(message.correlationId);

      if (message.type.endsWith('.error')) {
        pending.reject(message.payload);
      } else {
        pending.resolve(message.payload);
      }
    }
  }

  private send(message: BridgeMessage): void {
    if (!this.ws || !this.connected) {
      throw new Error('Not connected to Bridge');
    }
    this.ws.send(JSON.stringify(message));
  }

  async request(target: string, type: string, payload: unknown): Promise<unknown> {
    if (!this.connected) {
      throw new Error('Not connected to Bridge');
    }

    const id = generateId();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${type}`));
      }, this.requestTimeout);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      this.send({
        id,
        timestamp: new Date(),
        source: 'mcp-frank',
        target,
        type,
        payload,
        correlationId: id,
        version: VERSION,
      });
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

// =============================================================================
// Tool Definitions
// =============================================================================

const TOOLS: Tool[] = [
  // High-level automation
  {
    name: 'frank_execute',
    description: 'Execute a natural language automation task. The Doctor will parse your intent, create a plan, and Igor+Frankenstein will execute it. Example: "Log into github.com with user test@example.com"',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'Natural language description of the task to execute',
        },
        url: {
          type: 'string',
          description: 'Optional starting URL for the task',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 60000)',
          default: 60000,
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'frank_screenshot',
    description: 'Take a screenshot of the current browser state',
    inputSchema: {
      type: 'object',
      properties: {
        fullPage: {
          type: 'boolean',
          description: 'Capture full scrollable page (default: false)',
          default: false,
        },
      },
    },
  },
  {
    name: 'frank_status',
    description: 'Get the status of all tripartite components (Bridge, Doctor, Igor, Frankenstein)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'frank_health',
    description: 'Check if the tripartite stack is healthy and ready',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  // Direct browser control (passthrough to Frankenstein)
  {
    name: 'frank_browser_launch',
    description: 'Launch a browser instance',
    inputSchema: {
      type: 'object',
      properties: {
        headless: {
          type: 'boolean',
          description: 'Run in headless mode (default: false)',
          default: false,
        },
        url: {
          type: 'string',
          description: 'Optional URL to navigate to after launch',
        },
      },
    },
  },
  {
    name: 'frank_browser_navigate',
    description: 'Navigate to a URL',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to navigate to',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'frank_browser_click',
    description: 'Click on an element',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector to click',
        },
        text: {
          type: 'string',
          description: 'Click element containing this text',
        },
      },
    },
  },
  {
    name: 'frank_browser_type',
    description: 'Type text into an input',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector of input element',
        },
        text: {
          type: 'string',
          description: 'Text to type',
        },
        clear: {
          type: 'boolean',
          description: 'Clear existing text first (default: true)',
          default: true,
        },
      },
      required: ['selector', 'text'],
    },
  },
  {
    name: 'frank_browser_close',
    description: 'Close the browser instance',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  // Lightning Strike control
  {
    name: 'frank_lightning_status',
    description: 'Get the current Lightning Strike status (dumb vs claude mode)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'frank_lightning_strike',
    description: 'Manually trigger Lightning Strike to escalate Igor to Claude mode',
    inputSchema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Reason for manual strike',
        },
      },
      required: ['reason'],
    },
  },
  // Dynamic tools
  {
    name: 'frank_tools_list',
    description: 'List all dynamic tools created by Frankenstein',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'frank_tools_create',
    description: 'Create a new dynamic tool in Frankenstein',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Tool name',
        },
        description: {
          type: 'string',
          description: 'What the tool does',
        },
        code: {
          type: 'string',
          description: 'JavaScript code for the tool',
        },
      },
      required: ['name', 'description', 'code'],
    },
  },
  // ─────────────────────────────────────────────────────────────────────────────
  // SWARM MODE - Multi-Igor Parallel Execution
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'frank_swarm_analyze',
    description: 'Analyze if a task needs swarm mode (multiple parallel Igors). Returns recommended routes and tool bags.',
    inputSchema: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          description: 'The task to analyze (e.g., "Test the full e-commerce flow")',
        },
      },
      required: ['intent'],
    },
  },
  {
    name: 'frank_swarm_plan',
    description: 'Create a swarm execution plan with multiple Igor agents. Returns task configurations for parallel execution.',
    inputSchema: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          description: 'The master intent for the swarm',
        },
        maxIgors: {
          type: 'number',
          description: 'Maximum parallel Igors (default: 4)',
          default: 4,
        },
        toolBagSize: {
          type: 'number',
          description: 'Max tools per Igor (default: 15)',
          default: 15,
        },
      },
      required: ['intent'],
    },
  },
  {
    name: 'frank_swarm_execute',
    description: 'Execute a task using swarm mode. Spawns multiple Claude CLI Tasks as parallel Igors, each with their own tool bag. Use for comprehensive testing of multiple routes.',
    inputSchema: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          description: 'What to test (e.g., "Test full e-commerce: login, cart, checkout, profile")',
        },
        maxIgors: {
          type: 'number',
          description: 'Maximum parallel Igors (default: 4)',
          default: 4,
        },
        model: {
          type: 'string',
          description: 'Model for Igor subagents (default: haiku for speed)',
          enum: ['haiku', 'sonnet', 'opus'],
          default: 'haiku',
        },
      },
      required: ['intent'],
    },
  },
  {
    name: 'frank_swarm_status',
    description: 'Get status of running swarm execution from dashboard',
    inputSchema: {
      type: 'object',
      properties: {
        swarmId: {
          type: 'string',
          description: 'Swarm ID to check (optional, shows all if omitted)',
        },
      },
    },
  },
  {
    name: 'frank_swarm_report_progress',
    description: 'Report progress from an Igor agent to the dashboard. Use this during swarm execution to update the live dashboard.',
    inputSchema: {
      type: 'object',
      properties: {
        swarmId: {
          type: 'string',
          description: 'The swarm ID (provided in your prompt)',
        },
        routeId: {
          type: 'string',
          description: 'The route ID you are executing (provided in your prompt)',
        },
        action: {
          type: 'string',
          description: 'Description of the action being performed (e.g., "Clicking login button", "Verifying cart contents")',
        },
        status: {
          type: 'string',
          enum: ['started', 'completed', 'failed'],
          description: 'Status of this action',
        },
        details: {
          type: 'string',
          description: 'Optional additional details',
        },
        tool: {
          type: 'string',
          description: 'Optional tool name being used',
        },
      },
      required: ['swarmId', 'routeId', 'action', 'status'],
    },
  },
  {
    name: 'frank_swarm_complete_route',
    description: 'Mark a route as completed or failed. Call this when you finish your assigned route in a swarm.',
    inputSchema: {
      type: 'object',
      properties: {
        swarmId: {
          type: 'string',
          description: 'The swarm ID',
        },
        routeId: {
          type: 'string',
          description: 'The route ID you completed',
        },
        success: {
          type: 'boolean',
          description: 'Whether the route completed successfully',
        },
        summary: {
          type: 'string',
          description: 'Summary of what was accomplished or why it failed',
        },
        error: {
          type: 'string',
          description: 'Error message if failed',
        },
      },
      required: ['swarmId', 'routeId', 'success'],
    },
  },
];

// =============================================================================
// Tool Handlers
// =============================================================================

const bridge = new BridgeConnection();

async function handleTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  // Ensure connected
  if (!bridge.isConnected()) {
    const connected = await bridge.connect();
    if (!connected) {
      return { error: 'Failed to connect to Bridge. Is the tripartite stack running?' };
    }
  }

  switch (name) {
    case 'frank_execute':
      return bridge.request('doctor', 'plan.execute', {
        intent: args.task,
        url: args.url,
        timeout: args.timeout || 60000,
      });

    case 'frank_screenshot':
      return bridge.request('frankenstein', 'browser.screenshot', {
        fullPage: args.fullPage || false,
      });

    case 'frank_status':
      // Fetch status from all components
      const [bridgeHealth, doctorHealth, igorHealth, frankHealth] = await Promise.all([
        fetch('http://localhost:7000/health').then(r => r.json()).catch(() => ({ error: 'unreachable' })),
        fetch('http://localhost:7001/health').then(r => r.json()).catch(() => ({ error: 'unreachable' })),
        fetch('http://localhost:7002/health').then(r => r.json()).catch(() => ({ error: 'unreachable' })),
        fetch('http://localhost:7003/health').then(r => r.json()).catch(() => ({ error: 'unreachable' })),
      ]);
      return {
        bridge: bridgeHealth,
        doctor: doctorHealth,
        igor: igorHealth,
        frankenstein: frankHealth,
      };

    case 'frank_health':
      try {
        const health = await fetch('http://localhost:7000/health').then(r => r.json());
        const allConnected = health.connectedComponents?.doctor &&
                            health.connectedComponents?.igor &&
                            health.connectedComponents?.frankenstein;
        return {
          healthy: health.status === 'healthy' && allConnected,
          status: health.status,
          components: health.connectedComponents,
          version: health.version,
        };
      } catch {
        return { healthy: false, error: 'Bridge not responding' };
      }

    case 'frank_browser_launch':
      return bridge.request('frankenstein', 'browser.launch', {
        headless: args.headless || false,
        url: args.url,
      });

    case 'frank_browser_navigate':
      return bridge.request('frankenstein', 'browser.navigate', { url: args.url });

    case 'frank_browser_click':
      return bridge.request('frankenstein', 'browser.click', {
        selector: args.selector,
        text: args.text,
      });

    case 'frank_browser_type':
      return bridge.request('frankenstein', 'browser.type', {
        selector: args.selector,
        text: args.text,
        clear: args.clear !== false,
      });

    case 'frank_browser_close':
      return bridge.request('frankenstein', 'browser.close', {});

    case 'frank_lightning_status':
      const igorStatus = await fetch('http://localhost:7002/health').then(r => r.json());
      return igorStatus.lightning || { error: 'Could not get lightning status' };

    case 'frank_lightning_strike':
      return bridge.request('igor', 'lightning.strike', { reason: args.reason });

    case 'frank_tools_list':
      const frankStatus = await fetch('http://localhost:7003/health').then(r => r.json());
      return bridge.request('frankenstein', 'tools.list', {});

    case 'frank_tools_create':
      return bridge.request('frankenstein', 'tools.create', {
        name: args.name,
        description: args.description,
        code: args.code,
      });

    // ─────────────────────────────────────────────────────────────────────────
    // SWARM MODE HANDLERS
    // ─────────────────────────────────────────────────────────────────────────

    case 'frank_swarm_analyze': {
      const intent = args.intent as string;
      const analysis = analyzeSwarmNeed(intent);
      const routes = detectSwarmRoutes(intent);

      return {
        ...analysis,
        detectedRoutes: routes.map(r => ({
          id: r.id,
          name: r.name,
          keywords: r.keywords,
        })),
        recommendation: analysis.useSwarm
          ? `Use frank_swarm_execute to run ${analysis.routeCount} parallel Igors`
          : 'Use frank_execute for single-route execution',
      };
    }

    case 'frank_swarm_plan': {
      const plan = createSwarmPlan(args.intent as string, {
        maxIgors: args.maxIgors as number,
        toolBagSize: args.toolBagSize as number,
      });

      return {
        planId: plan.id,
        masterIntent: plan.masterIntent,
        igorCount: plan.routes.length,
        routes: plan.routes.map(r => ({
          routeId: r.routeId,
          routeName: r.routeName,
          intent: r.intent,
          toolCount: r.toolBag.length,
          tools: r.toolBag.map(t => t.name),
        })),
        config: plan.config,
      };
    }

    case 'frank_swarm_execute': {
      const plan = createSwarmPlan(args.intent as string, {
        maxIgors: args.maxIgors as number || 4,
      });

      const taskCalls = createTaskCalls(plan);

      // Report swarm to dashboard for observability
      const dashboardReported = await reportSwarmToDashboard({
        swarmId: plan.id,
        masterIntent: plan.masterIntent,
        routes: plan.routes.map(r => ({
          routeId: r.routeId,
          routeName: r.routeName,
          toolBag: r.toolBag,
        })),
        config: plan.config,
      });

      // Return the task configurations for Claude CLI to spawn
      // The actual spawning is done by Claude CLI using the Task tool
      return {
        swarmId: plan.id,
        message: `Swarm plan created with ${taskCalls.length} Igor agents. Use Claude CLI Task tool to spawn these:`,
        dashboardUrl: dashboardReported ? `${DASHBOARD_URL}` : null,
        dashboardStatus: dashboardReported ? 'Swarm visible in dashboard' : 'Dashboard unavailable - swarm not tracked',
        igorCount: taskCalls.length,
        routes: plan.routes.map(r => ({
          routeId: r.routeId,
          routeName: r.routeName,
          toolCount: r.toolBag.length,
        })),
        // These are the Task tool configurations to spawn
        taskConfigurations: taskCalls.map((task, i) => ({
          igorId: `igor-${plan.routes[i].routeId}`,
          routeId: plan.routes[i].routeId,
          routeName: plan.routes[i].routeName,
          swarmId: plan.id, // Include swarmId so Igor can report back
          subagent_type: task.subagent_type,
          description: task.description,
          model: args.model || task.model,
          run_in_background: task.run_in_background,
          // Full prompt for this Igor - includes swarmId for reporting
          prompt: task.prompt + `\n\n## Observability\nSwarm ID: ${plan.id}\nRoute ID: ${plan.routes[i].routeId}\nDashboard: ${DASHBOARD_URL}\n\nReport progress using frank_swarm_report_progress tool.`,
          toolBag: plan.routes[i].toolBag.map(t => t.name),
        })),
        instructions: `
To execute this swarm, spawn each Igor using Claude CLI's Task tool:

${taskCalls.map((t, i) => `
Task ${i + 1}: ${plan.routes[i].routeName}
- Route: ${plan.routes[i].routeId}
- Tools: ${plan.routes[i].toolBag.length}
- Model: ${args.model || t.model}
`).join('')}

Each Igor will run in its own context with a curated tool bag.
They can request new tools from Frank if needed.

${dashboardReported ? `View live progress: ${DASHBOARD_URL}` : 'Dashboard not available for live tracking.'}
        `.trim(),
      };
    }

    case 'frank_swarm_status': {
      try {
        const swarmId = args.swarmId as string | undefined;
        const url = swarmId
          ? `${DASHBOARD_URL}/api/swarms/${swarmId}`
          : `${DASHBOARD_URL}/api/swarms`;
        const res = await fetch(url);
        if (!res.ok) {
          return { error: 'Failed to fetch swarm status from dashboard' };
        }
        const data = await res.json();
        return {
          dashboardUrl: DASHBOARD_URL,
          ...(swarmId ? { swarm: data } : { swarms: data }),
        };
      } catch (err) {
        return {
          error: 'Dashboard not available',
          note: 'Use Claude CLI /tasks command to see running background tasks',
        };
      }
    }

    case 'frank_swarm_report_progress': {
      const swarmId = args.swarmId as string;
      const routeId = args.routeId as string;
      const progress = {
        action: args.action as string,
        status: args.status as string,
        details: args.details as string | undefined,
        tool: args.tool as string | undefined,
      };

      const reported = await reportRouteProgress(swarmId, routeId, progress);
      return {
        success: reported,
        message: reported
          ? `Progress reported: ${progress.action}`
          : 'Failed to report progress (dashboard may be unavailable)',
      };
    }

    case 'frank_swarm_complete_route': {
      const swarmId = args.swarmId as string;
      const routeId = args.routeId as string;
      const success = args.success as boolean;

      const update = {
        status: success ? 'completed' : 'failed',
        result: {
          success,
          summary: args.summary as string | undefined,
          error: args.error as string | undefined,
        },
      };

      const reported = await reportRouteStatus(swarmId, routeId, update);
      return {
        success: reported,
        message: reported
          ? `Route ${routeId} marked as ${update.status}`
          : 'Failed to update route status (dashboard may be unavailable)',
        dashboardUrl: reported ? DASHBOARD_URL : undefined,
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// =============================================================================
// MCP Server Setup
// =============================================================================

const server = new Server(
  { name: 'barrhawk-frank', version: VERSION },
  { capabilities: { tools: {} } }
);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await handleTool(name, args as Record<string, unknown>);
    return {
      content: [
        {
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// =============================================================================
// Startup
// =============================================================================

async function main() {
  console.error(`[MCP-Frank] Starting v${VERSION}`);
  console.error(`[MCP-Frank] Bridge URL: ${BRIDGE_URL}`);

  // Try to connect to Bridge
  const connected = await bridge.connect();
  if (connected) {
    console.error('[MCP-Frank] Connected to Bridge');
  } else {
    console.error('[MCP-Frank] Warning: Could not connect to Bridge. Will retry on first tool call.');
  }

  // Start MCP server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP-Frank] MCP server running');
}

main().catch((err) => {
  console.error('[MCP-Frank] Fatal error:', err);
  process.exit(1);
});
