/**
 * FRANK MANAGER - Igor's control over Frankenstein instances
 *
 * Responsibilities:
 * 1. Spawn new Frank instances on demand
 * 2. Monitor Frank health
 * 3. Route work to available Franks
 * 4. Restart crashed Franks
 * 5. Scale up/down based on load
 */

import { Subprocess } from 'bun';
import { createLogger } from '../shared/logger.js';

const logger = createLogger({
  component: 'frank-manager',
  version: '1.0.0',
  minLevel: 'INFO',
  pretty: true,
});

// =============================================================================
// Types
// =============================================================================

export interface FrankInstance {
  id: string;
  port: number;
  process: Subprocess | null;
  status: 'starting' | 'healthy' | 'unhealthy' | 'dead';
  capabilities: string[];  // What this Frank can do
  currentTask: string | null;
  startedAt: Date;
  lastHealthCheck: Date | null;
  healthCheckFailures: number;
  tasksCompleted: number;
  tasksFailed: number;
}

export interface TaskRequest {
  id: string;
  type: 'browser' | 'tool' | 'desktop';
  payload: unknown;
  timeout: number;
  correlationId?: string;
  createdAt: Date;
  assignedTo?: string;
}

// =============================================================================
// Frank Manager
// =============================================================================

class FrankManager {
  private franks = new Map<string, FrankInstance>();
  private taskQueue: TaskRequest[] = [];
  private nextPort = 7010;  // Start Frank instances on 7010+
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private queueProcessInterval: ReturnType<typeof setInterval> | null = null;

  // Configuration
  private readonly MAX_FRANKS = parseInt(process.env.MAX_FRANKS || '5');
  private readonly HEALTH_CHECK_INTERVAL = 10000;  // 10 seconds
  private readonly MAX_HEALTH_FAILURES = 3;
  private readonly FRANK_SCRIPT = process.env.FRANK_SCRIPT || './frankenstein/index.ts';

  constructor() {
    // Start health check loop
    this.healthCheckInterval = setInterval(() => this.checkAllHealth(), this.HEALTH_CHECK_INTERVAL);

    // Start queue processing loop
    this.queueProcessInterval = setInterval(() => this.processQueue(), 1000);

    logger.info('Frank Manager initialized', { maxFranks: this.MAX_FRANKS });
  }

  /**
   * Spawn a new Frank instance
   */
  async spawn(capabilities: string[] = ['browser', 'tool', 'desktop']): Promise<FrankInstance> {
    if (this.franks.size >= this.MAX_FRANKS) {
      throw new Error(`Max Franks reached (${this.MAX_FRANKS})`);
    }

    const id = `frank_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const port = this.nextPort++;

    const frank: FrankInstance = {
      id,
      port,
      process: null,
      status: 'starting',
      capabilities,
      currentTask: null,
      startedAt: new Date(),
      lastHealthCheck: null,
      healthCheckFailures: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
    };

    this.franks.set(id, frank);

    try {
      // Spawn Frank process
      const proc = Bun.spawn(['bun', 'run', this.FRANK_SCRIPT], {
        env: {
          ...process.env,
          FRANKENSTEIN_PORT: port.toString(),
          FRANK_ID: id,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });

      frank.process = proc;

      // Wait for Frank to be healthy
      await this.waitForHealthy(frank, 10000);

      logger.info(`Frank spawned: ${id}`, { port, capabilities });
      return frank;
    } catch (err) {
      frank.status = 'dead';
      this.franks.delete(id);
      throw err;
    }
  }

  /**
   * Wait for a Frank to become healthy
   */
  private async waitForHealthy(frank: FrankInstance, timeout: number): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`http://localhost:${frank.port}/health`);
        if (response.ok) {
          frank.status = 'healthy';
          frank.lastHealthCheck = new Date();
          return;
        }
      } catch {
        // Frank not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error(`Frank ${frank.id} failed to become healthy within ${timeout}ms`);
  }

  /**
   * Check health of all Franks
   */
  private async checkAllHealth(): Promise<void> {
    for (const frank of this.franks.values()) {
      if (frank.status === 'dead') continue;

      try {
        const response = await fetch(`http://localhost:${frank.port}/health`, {
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          frank.status = 'healthy';
          frank.lastHealthCheck = new Date();
          frank.healthCheckFailures = 0;
        } else {
          throw new Error(`Health check returned ${response.status}`);
        }
      } catch (err) {
        frank.healthCheckFailures++;
        logger.warn(`Frank ${frank.id} health check failed`, {
          failures: frank.healthCheckFailures,
          error: err instanceof Error ? err.message : String(err),
        });

        if (frank.healthCheckFailures >= this.MAX_HEALTH_FAILURES) {
          frank.status = 'dead';
          logger.error(`Frank ${frank.id} marked as dead after ${this.MAX_HEALTH_FAILURES} failures`);

          // Kill the process if it's still running
          if (frank.process) {
            frank.process.kill();
          }
        } else {
          frank.status = 'unhealthy';
        }
      }
    }
  }

  /**
   * Get an available Frank for a task
   */
  getAvailable(requiredCapability?: string): FrankInstance | null {
    for (const frank of this.franks.values()) {
      if (frank.status !== 'healthy') continue;
      if (frank.currentTask !== null) continue;
      if (requiredCapability && !frank.capabilities.includes(requiredCapability)) continue;
      return frank;
    }
    return null;
  }

  /**
   * Queue a task for execution
   */
  queueTask(task: Omit<TaskRequest, 'id' | 'createdAt'>): string {
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const request: TaskRequest = {
      ...task,
      id,
      createdAt: new Date(),
    };
    this.taskQueue.push(request);
    logger.debug(`Task queued: ${id}`, { type: task.type, queueLength: this.taskQueue.length });
    return id;
  }

  /**
   * Process the task queue
   */
  private async processQueue(): Promise<void> {
    if (this.taskQueue.length === 0) return;

    const task = this.taskQueue[0];
    const frank = this.getAvailable(task.type);

    if (!frank) {
      // No available Frank - try to spawn one if under limit
      if (this.franks.size < this.MAX_FRANKS) {
        try {
          await this.spawn([task.type]);
        } catch (err) {
          logger.error('Failed to spawn Frank for queued task', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return;
    }

    // Assign task to Frank
    this.taskQueue.shift();
    frank.currentTask = task.id;
    task.assignedTo = frank.id;

    logger.debug(`Task assigned: ${task.id} -> ${frank.id}`);
  }

  /**
   * Mark a task as completed
   */
  taskCompleted(frankId: string, success: boolean): void {
    const frank = this.franks.get(frankId);
    if (frank) {
      frank.currentTask = null;
      if (success) {
        frank.tasksCompleted++;
      } else {
        frank.tasksFailed++;
      }
    }
  }

  /**
   * Execute a task on a specific Frank
   */
  async executeOnFrank(
    frankId: string,
    endpoint: string,
    payload: unknown
  ): Promise<unknown> {
    const frank = this.franks.get(frankId);
    if (!frank || frank.status !== 'healthy') {
      throw new Error(`Frank ${frankId} not available`);
    }

    const response = await fetch(`http://localhost:${frank.port}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return response.json();
  }

  /**
   * Kill a Frank instance
   */
  async kill(frankId: string): Promise<boolean> {
    const frank = this.franks.get(frankId);
    if (!frank) return false;

    if (frank.process) {
      frank.process.kill();
    }

    frank.status = 'dead';
    this.franks.delete(frankId);

    logger.info(`Frank killed: ${frankId}`);
    return true;
  }

  /**
   * Kill all Franks
   */
  async killAll(): Promise<void> {
    for (const frank of this.franks.values()) {
      if (frank.process) {
        frank.process.kill();
      }
    }
    this.franks.clear();
    logger.info('All Franks killed');
  }

  /**
   * Get stats
   */
  getStats(): {
    totalFranks: number;
    healthy: number;
    unhealthy: number;
    dead: number;
    busy: number;
    queueLength: number;
    totalTasksCompleted: number;
    totalTasksFailed: number;
  } {
    const franks = Array.from(this.franks.values());
    let totalTasksCompleted = 0;
    let totalTasksFailed = 0;

    for (const frank of franks) {
      totalTasksCompleted += frank.tasksCompleted;
      totalTasksFailed += frank.tasksFailed;
    }

    return {
      totalFranks: franks.length,
      healthy: franks.filter(f => f.status === 'healthy').length,
      unhealthy: franks.filter(f => f.status === 'unhealthy').length,
      dead: franks.filter(f => f.status === 'dead').length,
      busy: franks.filter(f => f.currentTask !== null).length,
      queueLength: this.taskQueue.length,
      totalTasksCompleted,
      totalTasksFailed,
    };
  }

  /**
   * List all Franks
   */
  list(): Array<{
    id: string;
    port: number;
    status: string;
    capabilities: string[];
    currentTask: string | null;
    tasksCompleted: number;
    uptime: number;
  }> {
    return Array.from(this.franks.values()).map(f => ({
      id: f.id,
      port: f.port,
      status: f.status,
      capabilities: f.capabilities,
      currentTask: f.currentTask,
      tasksCompleted: f.tasksCompleted,
      uptime: Date.now() - f.startedAt.getTime(),
    }));
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.queueProcessInterval) {
      clearInterval(this.queueProcessInterval);
    }
    this.killAll();
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const frankManager = new FrankManager();
