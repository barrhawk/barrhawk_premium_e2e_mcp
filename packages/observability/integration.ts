/**
 * BarrHawk E2E Observability Integration
 *
 * Wires the event emitter to the observability store for automatic
 * capture and persistence of all test events.
 */

import { BarrHawkEventEmitter, type IEventTransport, InMemoryEventTransport, type BarrHawkEvent, type EventSubscription, type TestOrigin } from '../events/index.js';
import { ObservabilityStore, getObservabilityStore } from './store.js';

// =============================================================================
// Types
// =============================================================================

export interface ObservabilityConfig {
  /** Directory for storing observability data */
  dataDir?: string;
  /** Event transport (defaults to in-memory) */
  transport?: IEventTransport;
  /** Tenant ID for filtering events */
  tenantId?: string;
  /** Whether to auto-flush on run completion */
  autoFlush?: boolean;
  /** Console log passthrough to stdout */
  logToConsole?: boolean;
}

export interface ObservabilitySession {
  emitter: BarrHawkEventEmitter;
  store: ObservabilityStore;
  runId: string;
  stop: () => Promise<void>;
}

// =============================================================================
// Integration Manager
// =============================================================================

export class ObservabilityIntegration {
  private config: ObservabilityConfig;
  private store: ObservabilityStore | null = null;
  private transport: IEventTransport;
  private emitter: BarrHawkEventEmitter | null = null;
  private subscription: EventSubscription | null = null;
  private activeRunIds: Set<string> = new Set();

  constructor(config: ObservabilityConfig = {}) {
    this.config = {
      dataDir: './observability-data',
      autoFlush: true,
      logToConsole: false,
      ...config,
    };
    this.transport = config.transport || new InMemoryEventTransport();
  }

  async initialize(): Promise<void> {
    this.store = await getObservabilityStore(this.config.dataDir);
    this.emitter = new BarrHawkEventEmitter(this.transport);
    this.emitter.setTenantContext(this.config.tenantId || 'default');

    // Subscribe to all events
    this.subscription = this.transport.subscribe('*', async (event) => {
      await this.handleEvent(event);
    });

    console.log(`[Observability] Initialized with data dir: ${this.config.dataDir}`);
  }

  private async handleEvent(event: BarrHawkEvent): Promise<void> {
    if (!this.store) return;

    // Track active runs
    if (event.type === 'test.run.started') {
      const payload = event.payload as { runId: string };
      this.activeRunIds.add(payload.runId);
    }

    // Process event into store
    try {
      await this.store.processEvent(event);
    } catch (error) {
      console.error('[Observability] Error processing event:', error);
    }

    // Optional console logging
    if (this.config.logToConsole) {
      this.logEventToConsole(event);
    }

    // Auto-flush on run completion
    if (event.type === 'test.run.completed' && this.config.autoFlush) {
      const runId = event.correlationId;
      if (runId) {
        await this.store.flushAll(runId);
        this.activeRunIds.delete(runId);
        console.log(`[Observability] Run ${runId} completed and flushed`);
      }
    }
  }

  private logEventToConsole(event: BarrHawkEvent): void {
    const timestamp = event.timestamp.toISOString().substring(11, 23);
    const prefix = `[${timestamp}] [${event.type}]`;

    switch (event.type) {
      case 'console.captured': {
        const payload = event.payload as { level: string; message: string };
        const levelColors: Record<string, string> = {
          error: '\x1b[31m',
          warn: '\x1b[33m',
          info: '\x1b[34m',
          log: '\x1b[37m',
          debug: '\x1b[90m',
        };
        const color = levelColors[payload.level] || '\x1b[37m';
        console.log(`${prefix} ${color}[${payload.level}]\x1b[0m ${payload.message}`);
        break;
      }
      case 'screenshot.captured': {
        const payload = event.payload as { screenshotId: string; url: string };
        console.log(`${prefix} Screenshot saved: ${payload.url}`);
        break;
      }
      case 'browser.navigated': {
        const payload = event.payload as { url: string };
        console.log(`${prefix} Navigated to: ${payload.url}`);
        break;
      }
      case 'api.request.sent': {
        const payload = event.payload as { method: string; url: string };
        console.log(`${prefix} ${payload.method} ${payload.url}`);
        break;
      }
      case 'api.response.received': {
        const payload = event.payload as { status: number; duration: number };
        console.log(`${prefix} Response: ${payload.status} (${payload.duration}ms)`);
        break;
      }
      default:
        // Skip verbose logging for other events
        break;
    }
  }

  getEmitter(): BarrHawkEventEmitter {
    if (!this.emitter) {
      throw new Error('ObservabilityIntegration not initialized. Call initialize() first.');
    }
    return this.emitter;
  }

  getStore(): ObservabilityStore {
    if (!this.store) {
      throw new Error('ObservabilityIntegration not initialized. Call initialize() first.');
    }
    return this.store;
  }

  getTransport(): IEventTransport {
    return this.transport;
  }

  async flushActiveRuns(): Promise<void> {
    if (!this.store) return;

    for (const runId of this.activeRunIds) {
      await this.store.flushAll(runId);
    }
  }

  async shutdown(): Promise<void> {
    // Flush all active runs
    await this.flushActiveRuns();

    // Unsubscribe from events
    if (this.subscription) {
      this.subscription.unsubscribe();
    }

    console.log('[Observability] Shutdown complete');
  }
}

// =============================================================================
// Quick Session Helper
// =============================================================================

/**
 * Create a quick observability session for a single test run.
 * Returns an emitter pre-configured to capture all events.
 */
export async function createObservabilitySession(
  runId: string,
  config: ObservabilityConfig = {}
): Promise<ObservabilitySession> {
  const integration = new ObservabilityIntegration(config);
  await integration.initialize();

  const emitter = integration.getEmitter();
  const store = integration.getStore();

  // Start the run
  const origin: TestOrigin = config.tenantId?.includes('ai') ? 'ai_agent' : 'human_api';
  await emitter.emitTestRunStarted(
    runId,
    'default-project',
    origin
  );

  return {
    emitter,
    store,
    runId,
    stop: async () => {
      await emitter.emitTestRunCompleted('passed', {
        total: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        duration: Date.now(),
      });
      await integration.shutdown();
    },
  };
}

// =============================================================================
// Singleton for MCP Server Integration
// =============================================================================

let globalIntegration: ObservabilityIntegration | null = null;

export async function getObservabilityIntegration(config?: ObservabilityConfig): Promise<ObservabilityIntegration> {
  if (!globalIntegration) {
    globalIntegration = new ObservabilityIntegration(config);
    await globalIntegration.initialize();
  }
  return globalIntegration;
}

export async function shutdownObservability(): Promise<void> {
  if (globalIntegration) {
    await globalIntegration.shutdown();
    globalIntegration = null;
  }
}
