/**
 * Health Monitor - Watches secondary server health and triggers recovery
 */

import type { HealthStatus, SupervisorEvent } from '../shared/types.js';
import { IPCClient, EventEmitter } from '../shared/ipc.js';

export interface HealthMonitorConfig {
  checkInterval: number;      // How often to check (ms)
  unhealthyThreshold: number; // Consecutive failures before unhealthy
  timeout: number;            // Health check timeout (ms)
}

export class HealthMonitor {
  private ipc: IPCClient;
  private config: HealthMonitorConfig;
  private events: EventEmitter<SupervisorEvent>;

  private intervalId: Timer | null = null;
  private consecutiveFailures = 0;
  private lastStatus: HealthStatus | null = null;
  private isRunning = false;

  constructor(
    ipc: IPCClient,
    events: EventEmitter<SupervisorEvent>,
    config: Partial<HealthMonitorConfig> = {}
  ) {
    this.ipc = ipc;
    this.events = events;
    this.config = {
      checkInterval: config.checkInterval ?? 1000,
      unhealthyThreshold: config.unhealthyThreshold ?? 3,
      timeout: config.timeout ?? 500,
    };
  }

  /**
   * Start monitoring
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.consecutiveFailures = 0;

    console.error('[Health] Starting health monitor');

    this.intervalId = setInterval(async () => {
      await this.check();
    }, this.config.checkInterval);

    // Initial check
    this.check();
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.error('[Health] Stopped health monitor');
  }

  /**
   * Perform a health check
   */
  async check(): Promise<HealthStatus | null> {
    try {
      const status = await this.ipc.health();

      if (status && status.status === 'healthy') {
        this.consecutiveFailures = 0;
        this.lastStatus = status;
        return status;
      }

      // Unhealthy response
      this.consecutiveFailures++;
      this.handleFailure('Unhealthy response');
      return null;

    } catch (err) {
      this.consecutiveFailures++;
      this.handleFailure((err as Error).message);
      return null;
    }
  }

  /**
   * Handle a health check failure
   */
  private handleFailure(reason: string): void {
    console.error(
      `[Health] Check failed (${this.consecutiveFailures}/${this.config.unhealthyThreshold}): ${reason}`
    );

    if (this.consecutiveFailures >= this.config.unhealthyThreshold) {
      console.error('[Health] Secondary is unhealthy, triggering recovery');

      this.events.emit({
        type: 'worker:crashed',
        error: `Health check failed: ${reason}`,
      });

      // Reset counter - let supervisor handle restart
      this.consecutiveFailures = 0;
    }
  }

  /**
   * Wait for secondary to become healthy
   */
  async waitForHealthy(timeout = 30000): Promise<boolean> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const status = await this.ipc.health();

      if (status && status.status === 'healthy') {
        return true;
      }

      await Bun.sleep(100);
    }

    return false;
  }

  /**
   * Get last known status
   */
  getLastStatus(): HealthStatus | null {
    return this.lastStatus;
  }

  /**
   * Get current health state
   */
  isHealthy(): boolean {
    return this.consecutiveFailures === 0 && this.lastStatus !== null;
  }

  /**
   * Reset failure counter (e.g., after restart)
   */
  reset(): void {
    this.consecutiveFailures = 0;
    this.lastStatus = null;
  }
}
