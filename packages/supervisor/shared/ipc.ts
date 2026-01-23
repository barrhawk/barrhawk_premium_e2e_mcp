/**
 * IPC Layer - Communication between Doctor, Igor, and Frankenstein servers
 *
 * Uses HTTP for simplicity and reliability with fallback support
 */

import type {
  ServerRole,
  ServerHealth,
  Task,
  TaskResult,
  ToolDefinition,
  IPCMessage,
  FallbackMessage,
} from './types.js';

// ============================================
// IPC Client - Generic client for server communication
// ============================================

export class IPCClient {
  private baseUrl: string;
  private timeout: number;
  private role: ServerRole;

  constructor(host: string, port: number, role: ServerRole, timeout = 30000) {
    this.baseUrl = `http://${host}:${port}`;
    this.timeout = timeout;
    this.role = role;
  }

  get url(): string {
    return this.baseUrl;
  }

  /**
   * Check if server is healthy
   */
  async health(): Promise<ServerHealth | null> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /**
   * Check if server is reachable
   */
  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/ping`, {
        signal: AbortSignal.timeout(1000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get list of available tools
   */
  async getTools(): Promise<ToolDefinition[]> {
    try {
      const res = await fetch(`${this.baseUrl}/tools`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }

  /**
   * Execute a task
   */
  async execute(task: Task): Promise<TaskResult> {
    const startTime = Date.now();

    try {
      const res = await fetch(`${this.baseUrl}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
        signal: AbortSignal.timeout(task.timeout || this.timeout),
      });

      if (!res.ok) {
        const error = await res.text();
        return {
          taskId: task.id,
          success: false,
          error: `HTTP ${res.status}: ${error}`,
          executedBy: this.role,
          executionTime: Date.now() - startTime,
          fallbackUsed: false,
        };
      }

      const result = await res.json();
      return {
        ...result,
        executedBy: this.role,
        executionTime: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        taskId: task.id,
        success: false,
        error: err.message || String(err),
        executedBy: this.role,
        executionTime: Date.now() - startTime,
        fallbackUsed: false,
      };
    }
  }

  /**
   * Call a specific tool
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: toolName, args }),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`HTTP ${res.status}: ${error}`);
      }

      return await res.json();
    } catch (err: any) {
      throw new Error(`Tool call failed: ${err.message}`);
    }
  }

  /**
   * Request fallback to next server in chain
   */
  async fallback(task: Task, reason: string, nextRole: ServerRole): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/fallback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task,
          reason,
          attemptedBy: this.role,
          nextInChain: nextRole,
        }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Fallback notification is best-effort
    }
  }

  /**
   * Request server reload
   */
  async reload(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/reload`, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Request graceful shutdown
   */
  async shutdown(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/shutdown`, {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// ============================================
// Event Emitter - For internal events
// ============================================

type EventHandler = (...args: any[]) => void;

export class EventEmitter {
  private handlers = new Map<string, Set<EventHandler>>();

  on(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit(event: string, ...args: any[]): void {
    this.handlers.get(event)?.forEach(handler => {
      try {
        handler(...args);
      } catch (err) {
        console.error(`Event handler error for ${event}:`, err);
      }
    });
  }

  once(event: string, handler: EventHandler): void {
    const wrapper = (...args: any[]) => {
      this.off(event, wrapper);
      handler(...args);
    };
    this.on(event, wrapper);
  }
}

// ============================================
// Fallback Chain Manager
// ============================================

export class FallbackChain {
  private chain: Array<{ role: ServerRole; client: IPCClient }> = [];

  constructor() {}

  addServer(role: ServerRole, client: IPCClient): void {
    this.chain.push({ role, client });
  }

  removeServer(role: ServerRole): void {
    const index = this.chain.findIndex(s => s.role === role);
    if (index !== -1) {
      this.chain.splice(index, 1);
    }
  }

  getNextInChain(currentRole: ServerRole): { role: ServerRole; client: IPCClient } | null {
    const currentIndex = this.chain.findIndex(s => s.role === currentRole);
    if (currentIndex === -1 || currentIndex >= this.chain.length - 1) {
      return null;
    }
    return this.chain[currentIndex + 1];
  }

  async executeWithFallback(task: Task): Promise<TaskResult> {
    const fallbackChain: ServerRole[] = [];

    for (const { role, client } of this.chain) {
      fallbackChain.push(role);

      const health = await client.health();
      if (!health || health.status === 'unhealthy') {
        console.log(`[Fallback] ${role} unhealthy, skipping...`);
        continue;
      }

      try {
        const result = await client.execute(task);
        if (result.success) {
          return {
            ...result,
            fallbackUsed: fallbackChain.length > 1,
            fallbackChain,
          };
        }

        // Task failed, try next in chain
        console.log(`[Fallback] ${role} failed: ${result.error}, trying next...`);
      } catch (err: any) {
        console.log(`[Fallback] ${role} error: ${err.message}, trying next...`);
      }
    }

    // All servers failed
    return {
      taskId: task.id,
      success: false,
      error: 'All servers in fallback chain failed',
      executedBy: this.chain[this.chain.length - 1]?.role || 'doctor',
      executionTime: 0,
      fallbackUsed: true,
      fallbackChain,
    };
  }
}

// ============================================
// Task Queue - Priority-based task management
// ============================================

export class TaskQueue {
  private queues = {
    critical: [] as Task[],
    high: [] as Task[],
    normal: [] as Task[],
    low: [] as Task[],
  };

  private processing = new Set<string>();

  enqueue(task: Task): void {
    this.queues[task.priority].push(task);
  }

  dequeue(): Task | null {
    // Process in priority order
    for (const priority of ['critical', 'high', 'normal', 'low'] as const) {
      if (this.queues[priority].length > 0) {
        const task = this.queues[priority].shift()!;
        this.processing.add(task.id);
        return task;
      }
    }
    return null;
  }

  complete(taskId: string): void {
    this.processing.delete(taskId);
  }

  fail(taskId: string): void {
    this.processing.delete(taskId);
  }

  get size(): number {
    return (
      this.queues.critical.length +
      this.queues.high.length +
      this.queues.normal.length +
      this.queues.low.length
    );
  }

  get processingCount(): number {
    return this.processing.size;
  }

  isProcessing(taskId: string): boolean {
    return this.processing.has(taskId);
  }
}

// ============================================
// Unique ID Generator
// ============================================

export function generateId(prefix = ''): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

export function generateTaskId(): string {
  return generateId('task');
}

export function generateRunId(): string {
  return generateId('run');
}

export function generateSessionId(): string {
  return generateId('session');
}
