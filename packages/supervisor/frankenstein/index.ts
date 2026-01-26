/**
 * Frankenstein - Adaptive Sandbox Executor
 *
 * Philosophy: Adaptability through hot-reload, isolation, and experimentation
 * Frankenstein is where new tools are born, tested, and evolved.
 *
 * Features:
 * - Hot-reload of tool definitions
 * - Sandboxed execution environment
 * - Security scanning of tool code
 * - Dynamic tool creation/deletion
 * - Watchdog for runaway processes
 *
 * Fallback: Frankenstein is the last resort - if it fails, the task fails
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { watch, type FSWatcher } from 'fs';
import { readdir, readFile, stat, writeFile, unlink } from 'fs/promises';
import { join, basename, extname } from 'path';
import { createHash } from 'crypto';
import type {
  ServerRole,
  FrankensteinHealth,
  Task,
  TaskResult,
  ToolDefinition,
  DynamicTool,
  ToolFile,
  SecurityScanResult,
  SecurityIssue,
} from '../shared/types.js';
import { EventEmitter, generateId } from '../shared/ipc.js';

// ============================================
// Configuration
// ============================================

const PORT = parseInt(process.env.FRANKENSTEIN_PORT || '3100');
const HOST = process.env.FRANKENSTEIN_HOST || 'localhost';
const TOOLS_DIR = process.env.FRANKENSTEIN_TOOLS_DIR || './tools';
const HOT_RELOAD = process.env.FRANKENSTEIN_HOT_RELOAD !== 'false';
const SANDBOXED = process.env.FRANKENSTEIN_SANDBOXED !== 'false';
const MAX_EXECUTION_TIME = parseInt(process.env.FRANKENSTEIN_MAX_EXEC_TIME || '60000');
const MAX_MEMORY_MB = parseInt(process.env.FRANKENSTEIN_MAX_MEMORY || '512');

// Security patterns to block
const BLOCKED_PATTERNS = [
  'process.exit',
  'require\\s*\\(',
  'eval\\s*\\(',
  'new\\s+Function\\s*\\(',
  '__proto__',
  'child_process',
  'execSync',
  'spawnSync',
  'fs\\.unlinkSync',
  'fs\\.rmdirSync',
  'fs\\.writeFileSync.*\\/',
];

// ============================================
// Security Scanner
// ============================================

function scanForSecurity(code: string): SecurityScanResult {
  const issues: SecurityIssue[] = [];

  for (const pattern of BLOCKED_PATTERNS) {
    const regex = new RegExp(pattern, 'gi');
    let match;
    while ((match = regex.exec(code)) !== null) {
      // Find line number
      const beforeMatch = code.substring(0, match.index);
      const lineNumber = (beforeMatch.match(/\n/g) || []).length + 1;

      issues.push({
        severity: 'error',
        message: `Blocked pattern detected: ${pattern}`,
        pattern,
        line: lineNumber,
      });
    }
  }

  // Check for suspicious patterns (warnings)
  const warningPatterns = [
    { pattern: 'fetch\\s*\\(', message: 'Network access detected' },
    { pattern: 'XMLHttpRequest', message: 'Legacy network access detected' },
    { pattern: 'WebSocket', message: 'WebSocket connection detected' },
    { pattern: 'localStorage', message: 'Browser storage access detected' },
    { pattern: 'document\\.cookie', message: 'Cookie access detected' },
  ];

  for (const { pattern, message } of warningPatterns) {
    const regex = new RegExp(pattern, 'gi');
    if (regex.test(code)) {
      issues.push({
        severity: 'warning',
        message,
        pattern,
      });
    }
  }

  return {
    safe: issues.filter(i => i.severity === 'error').length === 0,
    issues,
  };
}

// ============================================
// Tool Manager
// ============================================

interface LoadedTool {
  definition: ToolDefinition;
  file: ToolFile;
  handler?: (args: Record<string, unknown>) => Promise<unknown>;
}

class ToolManager {
  private tools = new Map<string, LoadedTool>();
  private watcher: FSWatcher | null = null;
  private events = new EventEmitter();
  private toolsDir: string;

  constructor(toolsDir: string) {
    this.toolsDir = toolsDir;
  }

  async initialize(): Promise<void> {
    console.log(`[Frankenstein] Loading tools from ${this.toolsDir}...`);

    try {
      const files = await readdir(this.toolsDir);
      const toolFiles = files.filter(f =>
        f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.json')
      );

      for (const file of toolFiles) {
        await this.loadToolFile(join(this.toolsDir, file));
      }

      console.log(`[Frankenstein] Loaded ${this.tools.size} tools`);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        console.log(`[Frankenstein] Tools directory not found: ${this.toolsDir}`);
      } else {
        console.error(`[Frankenstein] Error loading tools: ${err.message}`);
      }
    }

    // Start watching for changes
    if (HOT_RELOAD) {
      this.startWatching();
    }
  }

  private async loadToolFile(path: string): Promise<void> {
    try {
      const content = await readFile(path, 'utf-8');
      const hash = createHash('md5').update(content).digest('hex');
      const name = basename(path, extname(path));

      // Security scan
      const scan = scanForSecurity(content);
      if (!scan.safe) {
        console.error(`[Frankenstein] Tool ${name} failed security scan:`);
        for (const issue of scan.issues) {
          console.error(`  - ${issue.severity}: ${issue.message} (line ${issue.line})`);
        }
        return;
      }

      // Parse tool definition
      let definition: ToolDefinition;

      if (path.endsWith('.json')) {
        // JSON tool definition
        definition = JSON.parse(content);
      } else {
        // TypeScript/JavaScript - look for exported definition
        // For now, create a placeholder definition
        definition = {
          name,
          description: `Dynamic tool loaded from ${basename(path)}`,
          inputSchema: {
            type: 'object',
            properties: {},
          },
        };
      }

      const toolFile: ToolFile = {
        name,
        path,
        loadedAt: new Date(),
        hash,
      };

      this.tools.set(name, { definition, file: toolFile });
      this.events.emit('tool:loaded', { name, path });
      console.log(`[Frankenstein] Loaded tool: ${name}`);
    } catch (err: any) {
      console.error(`[Frankenstein] Failed to load ${path}: ${err.message}`);
    }
  }

  private startWatching(): void {
    try {
      this.watcher = watch(this.toolsDir, { recursive: true }, async (event, filename) => {
        if (!filename) return;

        const path = join(this.toolsDir, filename);

        if (event === 'rename') {
          // File added or removed
          try {
            await stat(path);
            // File exists - load it
            await this.loadToolFile(path);
            this.events.emit('tool:created', { path });
          } catch {
            // File removed
            const name = basename(filename, extname(filename));
            this.tools.delete(name);
            this.events.emit('tool:deleted', { name, path });
            console.log(`[Frankenstein] Tool removed: ${name}`);
          }
        } else if (event === 'change') {
          // File modified - reload
          await this.loadToolFile(path);
        }
      });

      console.log('[Frankenstein] Hot-reload watching enabled');
    } catch (err: any) {
      console.error(`[Frankenstein] Failed to start watcher: ${err.message}`);
    }
  }

  getTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  async createTool(name: string, definition: ToolDefinition, code?: string): Promise<boolean> {
    if (code) {
      const scan = scanForSecurity(code);
      if (!scan.safe) {
        console.error(`[Frankenstein] New tool ${name} failed security scan`);
        return false;
      }
    }

    const path = join(this.toolsDir, `${name}.json`);
    await writeFile(path, JSON.stringify(definition, null, 2));

    const hash = createHash('md5').update(JSON.stringify(definition)).digest('hex');
    const toolFile: ToolFile = {
      name,
      path,
      loadedAt: new Date(),
      hash,
    };

    this.tools.set(name, { definition, file: toolFile });
    this.events.emit('tool:created', { name, path });

    return true;
  }

  async deleteTool(name: string): Promise<boolean> {
    const tool = this.tools.get(name);
    if (!tool) return false;

    try {
      await unlink(tool.file.path);
    } catch {
      // File may already be deleted
    }

    this.tools.delete(name);
    this.events.emit('tool:deleted', { name });
    return true;
  }

  stop(): void {
    this.watcher?.close();
  }
}

// ============================================
// Execution Sandbox
// ============================================

interface ExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  executionTime: number;
}

class ExecutionSandbox {
  private activeExecutions = new Set<string>();

  async execute(
    taskId: string,
    toolName: string,
    args: Record<string, unknown>,
    timeout: number = MAX_EXECUTION_TIME
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Track active execution
    this.activeExecutions.add(taskId);

    try {
      // In a real implementation, this would run in an isolated context
      // For now, we'll simulate execution

      // Timeout handling
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Execution timeout')), timeout);
      });

      // Simulated execution
      const executionPromise = this.runTool(toolName, args);

      const result = await Promise.race([executionPromise, timeoutPromise]);

      return {
        success: true,
        data: result,
        executionTime: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
        executionTime: Date.now() - startTime,
      };
    } finally {
      this.activeExecutions.delete(taskId);
    }
  }

  private async runTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    // Placeholder - in real implementation, this would:
    // 1. Load the tool handler
    // 2. Execute in isolated context (vm2, isolated-vm, or worker_threads)
    // 3. Return the result

    // For now, return a simple acknowledgment
    return {
      tool: toolName,
      args,
      executed: true,
      timestamp: new Date().toISOString(),
    };
  }

  get activeCount(): number {
    return this.activeExecutions.size;
  }

  isExecuting(taskId: string): boolean {
    return this.activeExecutions.has(taskId);
  }
}

// ============================================
// Frankenstein Server
// ============================================

class FrankensteinServer {
  private server: ReturnType<typeof createServer> | null = null;
  private toolManager: ToolManager;
  private sandbox: ExecutionSandbox;
  private events = new EventEmitter();
  private startTime = Date.now();
  private tasksProcessed = 0;
  private tasksFailed = 0;
  private lastReload?: Date;
  private lastError?: string;

  constructor() {
    this.toolManager = new ToolManager(TOOLS_DIR);
    this.sandbox = new ExecutionSandbox();
  }

  async start(): Promise<void> {
    console.log('[Frankenstein] Starting adaptive sandbox...');

    // Initialize tool manager
    await this.toolManager.initialize();

    // Start HTTP server
    this.server = createServer((req, res) => this.handleRequest(req, res));

    this.server.listen(PORT, HOST, () => {
      console.log(`[Frankenstein] Adaptive sandbox running on http://${HOST}:${PORT}`);
      console.log(`[Frankenstein] Tools directory: ${TOOLS_DIR}`);
      console.log(`[Frankenstein] Hot-reload: ${HOT_RELOAD}, Sandboxed: ${SANDBOXED}`);
    });

    // Memory watchdog
    setInterval(() => this.checkMemory(), 10000);
  }

  private checkMemory(): void {
    const memUsage = process.memoryUsage();
    const usedMB = memUsage.heapUsed / 1024 / 1024;

    if (usedMB > MAX_MEMORY_MB) {
      console.warn(`[Frankenstein] Memory warning: ${usedMB.toFixed(2)}MB / ${MAX_MEMORY_MB}MB`);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        console.log('[Frankenstein] Forced garbage collection');
      }
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      switch (url.pathname) {
        case '/ping':
          this.handlePing(res);
          break;
        case '/health':
          this.handleHealth(res);
          break;
        case '/tools':
          this.handleTools(res);
          break;
        case '/execute':
          await this.handleExecute(req, res);
          break;
        case '/call':
          await this.handleCall(req, res);
          break;
        case '/tools/create':
          await this.handleCreateTool(req, res);
          break;
        case '/tools/delete':
          await this.handleDeleteTool(req, res);
          break;
        case '/tools/scan':
          await this.handleScanTool(req, res);
          break;
        case '/reload':
          await this.handleReload(res);
          break;
        case '/shutdown':
          await this.handleShutdown(res);
          break;
        default:
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (err: any) {
      this.lastError = err.message;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  private handlePing(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('pong');
  }

  private handleHealth(res: ServerResponse): void {
    const memUsage = process.memoryUsage();
    const health: FrankensteinHealth = {
      role: 'frankenstein',
      status: this.sandbox.activeCount < 10 ? 'healthy' : 'degraded',
      uptime: Date.now() - this.startTime,
      load: this.sandbox.activeCount / 10,
      tasksProcessed: this.tasksProcessed,
      tasksQueued: 0,
      tasksFailed: this.tasksFailed,
      lastError: this.lastError,
      memory: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      },
      toolsLoaded: this.toolManager.getToolNames(),
      hotReloadEnabled: HOT_RELOAD,
      lastReload: this.lastReload,
      sandboxed: SANDBOXED,
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
  }

  private handleTools(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(this.toolManager.getTools()));
  }

  private async handleExecute(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const task: Task = JSON.parse(body);

    const result = await this.executeTask(task);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  }

  private async handleCall(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { tool, args } = JSON.parse(body);

    const task: Task = {
      id: generateId('call'),
      type: 'tool_call',
      tool,
      args,
      priority: 'normal',
      timeout: MAX_EXECUTION_TIME,
      retries: 1,
      retriesLeft: 1,
      createdAt: new Date(),
      source: 'rest-api',
    };

    const result = await this.executeTask(task);

    if (result.success) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.data));
    } else {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: result.error }));
    }
  }

  private async handleCreateTool(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { name, definition, code } = JSON.parse(body);

    const success = await this.toolManager.createTool(name, definition, code);

    res.writeHead(success ? 201 : 400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success, name }));
  }

  private async handleDeleteTool(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { name } = JSON.parse(body);

    const success = await this.toolManager.deleteTool(name);

    res.writeHead(success ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success, name }));
  }

  private async handleScanTool(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { code } = JSON.parse(body);

    const result = scanForSecurity(code);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  }

  private async handleReload(res: ServerResponse): Promise<void> {
    console.log('[Frankenstein] Reloading tools...');
    this.toolManager.stop();
    this.toolManager = new ToolManager(TOOLS_DIR);
    await this.toolManager.initialize();
    this.lastReload = new Date();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      reloaded: true,
      toolCount: this.toolManager.getToolNames().length,
    }));
  }

  private async handleShutdown(res: ServerResponse): Promise<void> {
    console.log('[Frankenstein] Graceful shutdown requested...');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ shuttingDown: true }));

    // Allow response to be sent
    setTimeout(() => {
      this.toolManager.stop();
      this.server?.close();
      process.exit(0);
    }, 100);
  }

  private async executeTask(task: Task): Promise<TaskResult> {
    const startTime = Date.now();

    try {
      if (!task.tool) {
        return {
          taskId: task.id,
          success: false,
          error: 'No tool specified',
          executedBy: 'frankenstein',
          executionTime: Date.now() - startTime,
          fallbackUsed: false,
        };
      }

      // Execute in sandbox
      const result = await this.sandbox.execute(
        task.id,
        task.tool,
        task.args || {},
        task.timeout
      );

      if (result.success) {
        this.tasksProcessed++;
      } else {
        this.tasksFailed++;
        this.lastError = result.error;
      }

      return {
        taskId: task.id,
        success: result.success,
        data: result.data,
        error: result.error,
        executedBy: 'frankenstein',
        executionTime: result.executionTime,
        fallbackUsed: false,
      };
    } catch (err: any) {
      this.tasksFailed++;
      this.lastError = err.message;
      return {
        taskId: task.id,
        success: false,
        error: err.message,
        executedBy: 'frankenstein',
        executionTime: Date.now() - startTime,
        fallbackUsed: false,
      };
    }
  }

  private async readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }
}

// ============================================
// Main Entry Point
// ============================================

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║          FRANKENSTEIN - Adaptive Sandbox                 ║');
  console.log('║   "It\'s alive! Born from code, evolved by fire."         ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  const frankenstein = new FrankensteinServer();
  await frankenstein.start();

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[Frankenstein] Shutting down...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n[Frankenstein] Terminated');
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[Frankenstein] Fatal error:', err);
  process.exit(1);
});

export { FrankensteinServer, ToolManager, ExecutionSandbox, scanForSecurity };
