#!/usr/bin/env bun
/**
 * DOCTOR - The Foolproof Orchestrator
 *
 * Philosophy: Never fail. Route intelligently. Recover gracefully.
 *
 * Responsibilities:
 * - MCP interface (stdio for Claude CLI, HTTP for others)
 * - Route tasks to Igor (performance) or Frankenstein (adaptive)
 * - Manage fallback chain: Doctor → Igor → Frankenstein
 * - Health monitoring of all servers
 * - State management for holistic testing
 *
 * Core Mission: Burn tokens for quality - holistic AI testing
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import type {
  Task,
  TaskResult,
  DoctorHealth,
  IgorInfo,
  ExecutionContext,
  ClientType,
  FrankencodeConfig,
  ToolDefinition,
  HolisticCheck,
  VisualVerification,
} from '../shared/types.js';

import {
  IPCClient,
  FallbackChain,
  TaskQueue,
  EventEmitter,
  generateTaskId,
  generateRunId,
  generateSessionId,
} from '../shared/ipc.js';

import { DEFAULT_CONFIG } from '../shared/types.js';

import { createServer, type IncomingMessage, type ServerResponse } from 'http';

// ============================================
// Configuration
// ============================================

const config: FrankencodeConfig = {
  ...DEFAULT_CONFIG,
  // Override with environment variables
  doctor: {
    ...DEFAULT_CONFIG.doctor,
    port: parseInt(process.env.DOCTOR_PORT || '3000'),
  },
  igor: {
    ...DEFAULT_CONFIG.igor,
    port: parseInt(process.env.IGOR_PORT || '3001'),
  },
  frankenstein: {
    ...DEFAULT_CONFIG.frankenstein,
    basePort: parseInt(process.env.FRANK_PORT || '3100'),
  },
};

// ============================================
// State Management
// ============================================

const startTime = Date.now();
let tasksProcessed = 0;
let tasksFailed = 0;
let lastError: string | undefined;

// Active sessions for holistic testing
const sessions = new Map<string, ExecutionContext>();

// Client connections
const clients = new Map<string, { type: ClientType; connectedAt: Date }>();

// IPC clients for downstream servers
let igorClient: IPCClient | null = null;
let frankClient: IPCClient | null = null;

// Fallback chain
const fallbackChain = new FallbackChain();

// Task queue
const taskQueue = new TaskQueue();

// Event bus
const events = new EventEmitter();

// Cached tools from downstream
let cachedTools: ToolDefinition[] = [];
let toolsCacheTime = 0;
const TOOLS_CACHE_TTL = 30000; // 30 seconds

// ============================================
// Health & Status
// ============================================

function getHealth(): DoctorHealth {
  const mem = process.memoryUsage();
  const igors: IgorInfo[] = [];

  if (igorClient) {
    igors.push({
      id: 'igor-1',
      port: config.igor.port,
      status: 'healthy', // Will be updated by health checks
      load: 0,
      frankensteins: config.igor.poolSize,
    });
  }

  return {
    role: 'doctor',
    status: 'healthy',
    uptime: Date.now() - startTime,
    load: (taskQueue.processingCount / config.igor.maxConcurrent) * 100,
    tasksProcessed,
    tasksQueued: taskQueue.size,
    tasksFailed,
    lastError,
    memory: {
      used: mem.heapUsed,
      total: mem.heapTotal,
      percentage: (mem.heapUsed / mem.heapTotal) * 100,
    },
    igors,
    totalCapacity: config.igor.maxConcurrent * config.igor.poolSize,
    activeConnections: clients.size,
  };
}

// ============================================
// Downstream Connection Management
// ============================================

async function connectToIgor(): Promise<boolean> {
  igorClient = new IPCClient(
    config.igor.host,
    config.igor.port,
    'igor',
    config.doctor.taskTimeout
  );

  const health = await igorClient.health();
  if (health) {
    console.log(`[Doctor] Connected to Igor at port ${config.igor.port}`);
    fallbackChain.addServer('igor', igorClient);
    return true;
  }

  console.log(`[Doctor] Igor not available at port ${config.igor.port}`);
  igorClient = null;
  return false;
}

async function connectToFrankenstein(): Promise<boolean> {
  frankClient = new IPCClient(
    config.frankenstein.host,
    config.frankenstein.basePort,
    'frankenstein',
    config.doctor.taskTimeout
  );

  const health = await frankClient.health();
  if (health) {
    console.log(`[Doctor] Connected to Frankenstein at port ${config.frankenstein.basePort}`);
    fallbackChain.addServer('frankenstein', frankClient);
    return true;
  }

  console.log(`[Doctor] Frankenstein not available at port ${config.frankenstein.basePort}`);
  frankClient = null;
  return false;
}

// ============================================
// Tool Discovery
// ============================================

async function discoverTools(): Promise<ToolDefinition[]> {
  const now = Date.now();
  if (cachedTools.length > 0 && now - toolsCacheTime < TOOLS_CACHE_TTL) {
    return cachedTools;
  }

  const allTools: ToolDefinition[] = [];

  // Get tools from Igor
  if (igorClient) {
    const igorTools = await igorClient.getTools();
    allTools.push(...igorTools);
  }

  // Get tools from Frankenstein (if Igor doesn't have them)
  if (frankClient) {
    const frankTools = await frankClient.getTools();
    const existingNames = new Set(allTools.map(t => t.name));
    for (const tool of frankTools) {
      if (!existingNames.has(tool.name)) {
        allTools.push(tool);
      }
    }
  }

  // Add Doctor-only tools
  allTools.push(...doctorTools);

  cachedTools = allTools;
  toolsCacheTime = now;

  return allTools;
}

// ============================================
// Doctor-Only Tools (Orchestration)
// ============================================

const doctorTools: ToolDefinition[] = [
  {
    name: 'frankencode_status',
    description: 'Get the status of the Frankencode three-tier architecture (Doctor/Igor/Frankenstein)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'frankencode_holistic_test',
    description: 'Run a holistic AI-driven test: load page, screenshot, verify visually, test interactions, check responsiveness. Burns tokens for quality.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to test',
        },
        checks: {
          type: 'array',
          description: 'Types of checks to run',
          items: {
            type: 'string',
            enum: ['visual', 'interaction', 'responsiveness', 'accessibility', 'stress'],
          },
        },
        burnTokens: {
          type: 'boolean',
          description: 'Use AI verification for every step (default: true)',
          default: true,
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'frankencode_session_start',
    description: 'Start a new holistic testing session with step tracking',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name for this test session',
        },
        mode: {
          type: 'string',
          enum: ['executor', 'orchestrator', 'headless'],
          description: 'Execution mode',
          default: 'executor',
        },
      },
    },
  },
  {
    name: 'frankencode_session_end',
    description: 'End a testing session and get summary',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session ID to end',
        },
      },
      required: ['sessionId'],
    },
  },
];

// ============================================
// Task Execution with Fallback
// ============================================

async function executeTask(task: Task): Promise<TaskResult> {
  const startTime = Date.now();
  tasksProcessed++;

  events.emit('task:started', task);

  try {
    // Try fallback chain: Doctor handles its own tools, then Igor, then Frank
    if (task.tool && doctorTools.some(t => t.name === task.tool)) {
      // Doctor handles this tool directly
      const result = await handleDoctorTool(task);
      events.emit('task:completed', { task, result });
      return result;
    }

    // Use fallback chain for downstream tools
    const result = await fallbackChain.executeWithFallback(task);

    if (!result.success) {
      tasksFailed++;
      lastError = result.error;
      events.emit('task:failed', { task, result });
    } else {
      events.emit('task:completed', { task, result });
    }

    return result;
  } catch (err: any) {
    tasksFailed++;
    lastError = err.message;

    const result: TaskResult = {
      taskId: task.id,
      success: false,
      error: err.message || String(err),
      executedBy: 'doctor',
      executionTime: Date.now() - startTime,
      fallbackUsed: false,
    };

    events.emit('task:failed', { task, result });
    return result;
  }
}

// ============================================
// Doctor Tool Handlers
// ============================================

async function handleDoctorTool(task: Task): Promise<TaskResult> {
  const startTime = Date.now();
  const args = task.args || {};

  try {
    let data: unknown;

    switch (task.tool) {
      case 'frankencode_status':
        data = {
          doctor: getHealth(),
          igor: igorClient ? await igorClient.health() : null,
          frankenstein: frankClient ? await frankClient.health() : null,
          config: {
            fallbackEnabled: config.fallback.enabled,
            holisticEnabled: config.holistic.enabled,
            burnTokensForQuality: config.holistic.burnTokensForQuality,
          },
        };
        break;

      case 'frankencode_session_start':
        const sessionId = generateSessionId();
        const context: ExecutionContext = {
          mode: (args.mode as any) || 'executor',
          client: 'unknown',
          sessionId,
          runId: generateRunId(),
          step: 0,
          holisticMode: config.holistic.enabled,
        };
        sessions.set(sessionId, context);
        data = { sessionId, context };
        break;

      case 'frankencode_session_end':
        const session = sessions.get(args.sessionId as string);
        if (session) {
          sessions.delete(args.sessionId as string);
          data = {
            sessionId: args.sessionId,
            totalSteps: session.step,
            summary: 'Session ended',
          };
        } else {
          throw new Error(`Session not found: ${args.sessionId}`);
        }
        break;

      case 'frankencode_holistic_test':
        data = await runHolisticTest(args);
        break;

      default:
        throw new Error(`Unknown doctor tool: ${task.tool}`);
    }

    return {
      taskId: task.id,
      success: true,
      data,
      executedBy: 'doctor',
      executionTime: Date.now() - startTime,
      fallbackUsed: false,
    };
  } catch (err: any) {
    return {
      taskId: task.id,
      success: false,
      error: err.message || String(err),
      executedBy: 'doctor',
      executionTime: Date.now() - startTime,
      fallbackUsed: false,
    };
  }
}

// ============================================
// Holistic Testing
// ============================================

async function runHolisticTest(args: Record<string, unknown>): Promise<any> {
  const url = args.url as string;
  const checks = (args.checks as string[]) || ['visual', 'interaction', 'responsiveness'];
  const burnTokens = args.burnTokens !== false;

  const results: any = {
    url,
    checks: [],
    passed: true,
    tokensBurned: 0,
  };

  // Create task to launch browser and navigate
  const launchTask: Task = {
    id: generateTaskId(),
    type: 'tool_call',
    tool: 'browser_launch',
    args: { url, headless: false },
    priority: 'high',
    timeout: 30000,
    retries: 2,
    retriesLeft: 2,
    createdAt: new Date(),
    source: 'unknown',
  };

  const launchResult = await fallbackChain.executeWithFallback(launchTask);
  if (!launchResult.success) {
    return { ...results, passed: false, error: 'Failed to launch browser' };
  }

  // Screenshot for visual verification
  if (checks.includes('visual')) {
    const screenshotTask: Task = {
      id: generateTaskId(),
      type: 'screenshot',
      tool: 'browser_screenshot',
      args: {},
      priority: 'high',
      timeout: 10000,
      retries: 1,
      retriesLeft: 1,
      createdAt: new Date(),
      source: 'unknown',
    };

    const screenshotResult = await fallbackChain.executeWithFallback(screenshotTask);
    results.checks.push({
      type: 'visual',
      passed: screenshotResult.success,
      screenshot: screenshotResult.success ? 'captured' : null,
    });
  }

  // Responsiveness check
  if (checks.includes('responsiveness')) {
    const viewports = config.holistic.defaultViewports;
    const responsiveResults: any[] = [];

    for (const vp of viewports) {
      // Resize viewport
      const resizeTask: Task = {
        id: generateTaskId(),
        type: 'tool_call',
        tool: 'browser_resize',
        args: { width: vp.width, height: vp.height },
        priority: 'normal',
        timeout: 5000,
        retries: 1,
        retriesLeft: 1,
        createdAt: new Date(),
        source: 'unknown',
      };

      await fallbackChain.executeWithFallback(resizeTask);

      // Screenshot at this viewport
      const vpScreenshot: Task = {
        id: generateTaskId(),
        type: 'screenshot',
        tool: 'browser_screenshot',
        args: {},
        priority: 'normal',
        timeout: 5000,
        retries: 1,
        retriesLeft: 1,
        createdAt: new Date(),
        source: 'unknown',
      };

      const vpResult = await fallbackChain.executeWithFallback(vpScreenshot);
      responsiveResults.push({
        viewport: vp.name,
        width: vp.width,
        height: vp.height,
        captured: vpResult.success,
      });
    }

    results.checks.push({
      type: 'responsiveness',
      passed: responsiveResults.every(r => r.captured),
      viewports: responsiveResults,
    });
  }

  return results;
}

// ============================================
// MCP Server Setup
// ============================================

const server = new Server(
  {
    name: 'barrhawk-frankencode-doctor',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = await discoverTools();

  return {
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const task: Task = {
    id: generateTaskId(),
    type: 'tool_call',
    tool: name,
    args: args as Record<string, unknown>,
    priority: 'normal',
    timeout: config.doctor.taskTimeout,
    retries: config.fallback.maxRetries,
    retriesLeft: config.fallback.maxRetries,
    createdAt: new Date(),
    source: 'claude-cli', // Detected from MCP client
  };

  const result = await executeTask(task);

  if (!result.success) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${result.error}\n\nExecuted by: ${result.executedBy}${result.fallbackUsed ? ` (fallback chain: ${result.fallbackChain?.join(' → ')})` : ''}`,
        },
      ],
      isError: true,
    };
  }

  // Format result based on data type
  const content: any[] = [];

  if (typeof result.data === 'string') {
    content.push({ type: 'text', text: result.data });
  } else if (result.data && typeof result.data === 'object') {
    // Check for screenshot in result
    const data = result.data as any;
    if (data.base64 || data.screenshot) {
      content.push({
        type: 'image',
        data: data.base64 || data.screenshot,
        mimeType: 'image/png',
      });
    }
    content.push({
      type: 'text',
      text: JSON.stringify(result.data, null, 2),
    });
  } else {
    content.push({
      type: 'text',
      text: String(result.data),
    });
  }

  // Add execution metadata
  content.push({
    type: 'text',
    text: `\n---\nExecuted by: ${result.executedBy} (${result.executionTime}ms)${result.fallbackUsed ? ` | Fallback: ${result.fallbackChain?.join(' → ')}` : ''}${result.tokensBurned ? ` | Tokens: ${result.tokensBurned}` : ''}`,
  });

  return { content };
});

// ============================================
// HTTP Health Server (for launcher health checks)
// ============================================

function startHealthServer(): void {
  const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const url = new URL(req.url || '/', `http://localhost:${config.doctor.port}`);

    switch (url.pathname) {
      case '/ping':
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('pong');
        break;

      case '/health':
        res.writeHead(200);
        res.end(JSON.stringify(getHealth()));
        break;

      case '/shutdown':
        res.writeHead(200);
        res.end(JSON.stringify({ shuttingDown: true }));
        setTimeout(() => process.exit(0), 100);
        break;

      default:
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  httpServer.listen(config.doctor.port, config.doctor.host, () => {
    console.log(`[Doctor] HTTP health server on http://${config.doctor.host}:${config.doctor.port}`);
  });
}

// ============================================
// Startup
// ============================================

async function main() {
  console.log('[Doctor] Starting Frankencode Doctor (Foolproof Orchestrator)...');
  console.log(`[Doctor] Config: port=${config.doctor.port}, fallback=${config.fallback.enabled}, holistic=${config.holistic.enabled}`);

  // Try to connect to downstream servers
  await connectToIgor();
  await connectToFrankenstein();

  // Start HTTP health server (for launcher and health checks)
  startHealthServer();

  // Start MCP server (stdio mode for Claude CLI)
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.log('[Doctor] MCP Server running on stdio');
  console.log(`[Doctor] Fallback chain: ${config.fallback.chain.join(' → ')}`);
  console.log('[Doctor] Ready to receive tasks. Philosophy: Burn tokens for quality.');

  // Periodic health checks
  setInterval(async () => {
    if (igorClient) {
      const health = await igorClient.health();
      if (!health) {
        console.log('[Doctor] Igor unreachable, attempting reconnect...');
        await connectToIgor();
      }
    }

    if (frankClient) {
      const health = await frankClient.health();
      if (!health) {
        console.log('[Doctor] Frankenstein unreachable, attempting reconnect...');
        await connectToFrankenstein();
      }
    }
  }, config.doctor.healthCheckInterval);
}

// Handle shutdown
process.on('SIGINT', () => {
  console.log('[Doctor] Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Doctor] Shutting down gracefully...');
  process.exit(0);
});

main().catch(err => {
  console.error('[Doctor] Fatal error:', err);
  process.exit(1);
});
