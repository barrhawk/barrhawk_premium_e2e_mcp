/**
 * Igor - Performance-Focused Executor
 *
 * Philosophy: Speed through caching, pooling, and optimization
 * Igor executes tasks with maximum efficiency while maintaining quality.
 *
 * Features:
 * - Connection pooling for Frankenstein instances
 * - Result caching with TTL
 * - Concurrent execution management
 * - Performance metrics tracking
 *
 * Fallback: If Igor can't handle it → Frankenstein
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import type {
  ServerRole,
  IgorHealth,
  FrankensteinInfo,
  Task,
  TaskResult,
  ToolDefinition,
  ExecutionContext,
  DynamicTool,
} from '../shared/types.js';
import {
  IPCClient,
  TaskQueue,
  EventEmitter,
  generateId,
} from '../shared/ipc.js';

// ============================================
// Configuration
// ============================================

const PORT = parseInt(process.env.IGOR_PORT || '3001');
const HOST = process.env.IGOR_HOST || 'localhost';
const FRANKENSTEIN_BASE_PORT = parseInt(process.env.FRANKENSTEIN_BASE_PORT || '3100');
const POOL_SIZE = parseInt(process.env.IGOR_POOL_SIZE || '3');
const MAX_CONCURRENT = parseInt(process.env.IGOR_MAX_CONCURRENT || '10');
const CACHE_TTL = parseInt(process.env.IGOR_CACHE_TTL || '300000'); // 5 minutes
const PERFORMANCE_MODE = process.env.IGOR_PERFORMANCE_MODE !== 'false';

// ============================================
// LRU Cache Implementation
// ============================================

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  hits: number;
}

class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private ttl: number;

  constructor(maxSize = 1000, ttl = CACHE_TTL) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Update hits and move to end (most recently used)
    entry.hits++;
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  set(key: string, value: T): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      hits: 0,
    });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  get hitRate(): number {
    let totalHits = 0;
    let totalEntries = 0;
    for (const entry of this.cache.values()) {
      totalHits += entry.hits;
      totalEntries++;
    }
    return totalEntries > 0 ? totalHits / totalEntries : 0;
  }

  // Generate cache key for tool calls
  static toolKey(toolName: string, args: Record<string, unknown>): string {
    return `tool:${toolName}:${JSON.stringify(args)}`;
  }
}

// ============================================
// Frankenstein Pool
// ============================================

interface PooledFrankenstein {
  id: string;
  client: IPCClient;
  status: FrankensteinInfo['status'];
  currentTask?: string;
  lastActivity: Date;
  toolsLoaded: number;
  executionCount: number;
}

class FrankensteinPool {
  private pool: PooledFrankenstein[] = [];
  private events = new EventEmitter();

  constructor(private basePort: number, private size: number) {}

  async initialize(): Promise<void> {
    console.log(`[Igor] Initializing Frankenstein pool with ${this.size} instances...`);

    for (let i = 0; i < this.size; i++) {
      const port = this.basePort + i;
      const id = `frank_${i}`;
      const client = new IPCClient(HOST, port, 'frankenstein');

      const frank: PooledFrankenstein = {
        id,
        client,
        status: 'warming',
        lastActivity: new Date(),
        toolsLoaded: 0,
        executionCount: 0,
      };

      this.pool.push(frank);

      // Check if already running
      const health = await client.health();
      if (health) {
        frank.status = 'idle';
        frank.toolsLoaded = health.toolsLoaded?.length || 0;
        console.log(`[Igor] Frankenstein ${id} already running on port ${port}`);
      } else {
        frank.status = 'warming';
        console.log(`[Igor] Frankenstein ${id} not yet available on port ${port}`);
      }
    }
  }

  async acquire(taskId: string): Promise<PooledFrankenstein | null> {
    // Find an idle Frankenstein
    for (const frank of this.pool) {
      if (frank.status === 'idle') {
        // Verify it's still healthy
        const health = await frank.client.health();
        if (health && health.status !== 'unhealthy') {
          frank.status = 'busy';
          frank.currentTask = taskId;
          frank.lastActivity = new Date();
          return frank;
        } else {
          frank.status = 'crashed';
        }
      }
    }

    // No idle Frankenstein available
    return null;
  }

  release(id: string): void {
    const frank = this.pool.find(f => f.id === id);
    if (frank) {
      frank.status = 'idle';
      frank.currentTask = undefined;
      frank.executionCount++;
      frank.lastActivity = new Date();
    }
  }

  markCrashed(id: string): void {
    const frank = this.pool.find(f => f.id === id);
    if (frank) {
      frank.status = 'crashed';
      frank.currentTask = undefined;
    }
  }

  getInfo(): FrankensteinInfo[] {
    return this.pool.map(f => ({
      id: f.id,
      status: f.status,
      currentTask: f.currentTask,
      toolsLoaded: f.toolsLoaded,
      lastActivity: f.lastActivity,
      uptime: Date.now() - f.lastActivity.getTime(),
    }));
  }

  get availableCount(): number {
    return this.pool.filter(f => f.status === 'idle').length;
  }

  get busyCount(): number {
    return this.pool.filter(f => f.status === 'busy').length;
  }

  async healthCheck(): Promise<void> {
    for (const frank of this.pool) {
      if (frank.status === 'crashed' || frank.status === 'warming') {
        const health = await frank.client.health();
        if (health && health.status !== 'unhealthy') {
          frank.status = 'idle';
          frank.toolsLoaded = health.toolsLoaded?.length || 0;
          console.log(`[Igor] Frankenstein ${frank.id} recovered`);
        }
      }
    }
  }
}

// ============================================
// Igor Server
// ============================================

class IgorServer {
  private server: ReturnType<typeof createServer> | null = null;
  private pool: FrankensteinPool;
  private cache = new LRUCache<TaskResult>(1000, CACHE_TTL);
  private taskQueue = new TaskQueue();
  private events = new EventEmitter();
  private tools: ToolDefinition[] = [];
  private startTime = Date.now();
  private tasksProcessed = 0;
  private tasksFailed = 0;
  private activeExecutions = 0;
  private lastError?: string;

  constructor() {
    this.pool = new FrankensteinPool(FRANKENSTEIN_BASE_PORT, POOL_SIZE);
  }

  async start(): Promise<void> {
    console.log('[Igor] Starting performance executor...');

    // Initialize Frankenstein pool
    await this.pool.initialize();

    // Load tools from available Frankensteins
    await this.loadTools();

    // Start HTTP server
    this.server = createServer((req, res) => this.handleRequest(req, res));

    this.server.listen(PORT, HOST, () => {
      console.log(`[Igor] Performance executor running on http://${HOST}:${PORT}`);
      console.log(`[Igor] Pool size: ${POOL_SIZE}, Max concurrent: ${MAX_CONCURRENT}`);
      console.log(`[Igor] Cache TTL: ${CACHE_TTL}ms, Performance mode: ${PERFORMANCE_MODE}`);
    });

    // Periodic health check
    setInterval(() => this.pool.healthCheck(), 10000);

    // Process queue
    setInterval(() => this.processQueue(), 100);
  }

  private async loadTools(): Promise<void> {
    // Aggregate tools from all Frankensteins
    const toolSet = new Map<string, ToolDefinition>();

    for (const frankInfo of this.pool.getInfo()) {
      if (frankInfo.status === 'idle') {
        const frank = this.pool['pool'].find((f: PooledFrankenstein) => f.id === frankInfo.id);
        if (frank) {
          const tools = await frank.client.getTools();
          for (const tool of tools) {
            toolSet.set(tool.name, tool);
          }
        }
      }
    }

    this.tools = Array.from(toolSet.values());
    console.log(`[Igor] Loaded ${this.tools.length} tools from pool`);
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
        case '/cache/clear':
          this.handleCacheClear(res);
          break;
        case '/cache/stats':
          this.handleCacheStats(res);
          break;
        case '/pool/status':
          this.handlePoolStatus(res);
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
    const health: IgorHealth = {
      role: 'igor',
      status: this.activeExecutions < MAX_CONCURRENT ? 'healthy' : 'degraded',
      uptime: Date.now() - this.startTime,
      load: this.activeExecutions / MAX_CONCURRENT,
      tasksProcessed: this.tasksProcessed,
      tasksQueued: this.taskQueue.size,
      tasksFailed: this.tasksFailed,
      lastError: this.lastError,
      memory: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      },
      frankensteins: this.pool.getInfo(),
      poolSize: POOL_SIZE,
      activeExecutions: this.activeExecutions,
      cacheHitRate: this.cache.hitRate,
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
  }

  private handleTools(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(this.tools));
  }

  private async handleExecute(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const task: Task = JSON.parse(body);

    // Check cache first (if cacheable)
    if (PERFORMANCE_MODE && task.tool) {
      const cacheKey = LRUCache.toolKey(task.tool, task.args || {});
      const cached = this.cache.get(cacheKey);
      if (cached) {
        console.log(`[Igor] Cache hit for ${task.tool}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...cached, fromCache: true }));
        return;
      }
    }

    // Check if we can handle it
    if (this.activeExecutions >= MAX_CONCURRENT) {
      // Queue it
      this.taskQueue.enqueue(task);
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ queued: true, position: this.taskQueue.size }));
      return;
    }

    // Execute directly
    const result = await this.executeTask(task);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  }

  private async handleCall(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { tool, args } = JSON.parse(body);

    // Check cache
    if (PERFORMANCE_MODE) {
      const cacheKey = LRUCache.toolKey(tool, args || {});
      const cached = this.cache.get(cacheKey);
      if (cached && cached.data) {
        console.log(`[Igor] Cache hit for tool ${tool}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(cached.data));
        return;
      }
    }

    // Create task and execute
    const task: Task = {
      id: generateId('call'),
      type: 'tool_call',
      tool,
      args,
      priority: 'normal',
      timeout: 30000,
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

  private handleCacheClear(res: ServerResponse): void {
    this.cache.clear();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ cleared: true }));
  }

  private handleCacheStats(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      size: this.cache.size,
      hitRate: this.cache.hitRate,
      ttl: CACHE_TTL,
    }));
  }

  private handlePoolStatus(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      total: POOL_SIZE,
      available: this.pool.availableCount,
      busy: this.pool.busyCount,
      instances: this.pool.getInfo(),
    }));
  }

  private async handleReload(res: ServerResponse): Promise<void> {
    console.log('[Igor] Reloading tools...');
    await this.loadTools();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ reloaded: true, toolCount: this.tools.length }));
  }

  private async handleShutdown(res: ServerResponse): Promise<void> {
    console.log('[Igor] Graceful shutdown requested...');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ shuttingDown: true }));

    // Allow response to be sent
    setTimeout(() => {
      this.server?.close();
      process.exit(0);
    }, 100);
  }

  private async executeTask(task: Task): Promise<TaskResult> {
    const startTime = Date.now();
    this.activeExecutions++;

    try {
      // Acquire a Frankenstein from the pool
      const frank = await this.pool.acquire(task.id);

      if (!frank) {
        // No Frankenstein available - execute locally or fail
        this.activeExecutions--;
        return {
          taskId: task.id,
          success: false,
          error: 'No Frankenstein instance available',
          executedBy: 'igor',
          executionTime: Date.now() - startTime,
          fallbackUsed: false,
        };
      }

      try {
        // Execute via Frankenstein
        const result = await frank.client.execute(task);

        // Cache successful results
        if (PERFORMANCE_MODE && result.success && task.tool) {
          const cacheKey = LRUCache.toolKey(task.tool, task.args || {});
          this.cache.set(cacheKey, result);
        }

        this.tasksProcessed++;
        return {
          ...result,
          executedBy: 'igor',
          executionTime: Date.now() - startTime,
        };
      } catch (err: any) {
        this.pool.markCrashed(frank.id);
        throw err;
      } finally {
        this.pool.release(frank.id);
      }
    } catch (err: any) {
      this.tasksFailed++;
      this.lastError = err.message;
      return {
        taskId: task.id,
        success: false,
        error: err.message,
        executedBy: 'igor',
        executionTime: Date.now() - startTime,
        fallbackUsed: false,
      };
    } finally {
      this.activeExecutions--;
    }
  }

  private async processQueue(): Promise<void> {
    while (this.activeExecutions < MAX_CONCURRENT && this.taskQueue.size > 0) {
      const task = this.taskQueue.dequeue();
      if (task) {
        // Fire and forget - result goes to event emitter
        this.executeTask(task).then(result => {
          this.taskQueue.complete(task.id);
          this.events.emit('task:completed', result);
        }).catch(err => {
          this.taskQueue.fail(task.id);
          this.events.emit('task:failed', { taskId: task.id, error: err.message });
        });
      }
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
  console.log('║              IGOR - Performance Executor                 ║');
  console.log('║    "Maximum efficiency. Minimum waste. Pure speed."      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  const igor = new IgorServer();
  await igor.start();

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[Igor] Shutting down...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n[Igor] Terminated');
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[Igor] Fatal error:', err);
  process.exit(1);
});

export { IgorServer, FrankensteinPool, LRUCache };
