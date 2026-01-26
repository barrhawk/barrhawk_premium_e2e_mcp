/**
 * BarrHawk E2E Observability Store
 *
 * Persistent storage for test logs, screenshots, network requests,
 * and console output. Uses file-based JSON storage for simplicity
 * (no external database dependencies).
 */

import { writeFile, readFile, mkdir, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type {
  BarrHawkEvent,
  ConsoleCapturedPayload,
  ScreenshotCapturedPayload,
  ApiRequestSentPayload,
  ApiResponseReceivedPayload,
  TestRunStartedPayload,
  TestRunCompletedPayload,
} from '../events/index.js';

// =============================================================================
// Types
// =============================================================================

export interface TestRunRecord {
  runId: string;
  projectId: string;
  tenantId: string;
  origin: string;
  status: 'running' | 'passed' | 'failed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  summary?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  metadata?: Record<string, unknown>;
}

export interface LogEntry {
  id: string;
  runId: string;
  timestamp: Date;
  type: 'console' | 'network_request' | 'network_response' | 'screenshot' | 'navigation' | 'click' | 'error' | 'step';
  level?: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: unknown;
  source?: {
    url?: string;
    line?: number;
    column?: number;
  };
}

export interface ScreenshotRecord {
  id: string;
  runId: string;
  timestamp: Date;
  url: string;
  thumbnailUrl?: string;
  width: number;
  height: number;
  sizeBytes: number;
  type: 'viewport' | 'full_page' | 'element';
  pageUrl?: string;
  stepIndex?: number;
}

export interface NetworkRecord {
  id: string;
  runId: string;
  timestamp: Date;
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  duration?: number;
  requestSize?: number;
  responseSize?: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  error?: string;
}

export interface RunSummary {
  run: TestRunRecord;
  logCount: number;
  screenshotCount: number;
  networkRequestCount: number;
  errorCount: number;
  consoleLogCount: number;
}

// =============================================================================
// Swarm Types (Multi-Agent Orchestration)
// =============================================================================

export interface SwarmRun {
  swarmId: string;
  masterIntent: string;
  status: 'planning' | 'running' | 'completed' | 'partial' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  routes: SwarmRoute[];
  config: {
    maxIgors: number;
    toolBagSize: number;
  };
}

export interface SwarmRoute {
  routeId: string;
  routeName: string;
  igorId?: string;           // Claude CLI Task ID
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  toolBag: string[];         // Tool names assigned
  progress: SwarmProgress[];
  result?: {
    success: boolean;
    summary?: string;
    error?: string;
    screenshots?: string[];
  };
}

export interface SwarmProgress {
  timestamp: Date;
  action: string;
  status: 'started' | 'completed' | 'failed';
  details?: string;
  tool?: string;
}

// =============================================================================
// Observability Store
// =============================================================================

export class ObservabilityStore {
  private baseDir: string;
  private runs: Map<string, TestRunRecord> = new Map();
  private logs: Map<string, LogEntry[]> = new Map();
  private screenshots: Map<string, ScreenshotRecord[]> = new Map();
  private network: Map<string, NetworkRecord[]> = new Map();
  private swarms: Map<string, SwarmRun> = new Map();

  // Event emitter for real-time updates
  private swarmListeners: ((event: { type: string; swarmId: string; data: any }) => void)[] = [];

  constructor(baseDir: string = './observability-data') {
    this.baseDir = baseDir;
  }

  onSwarmEvent(listener: (event: { type: string; swarmId: string; data: any }) => void): () => void {
    this.swarmListeners.push(listener);
    return () => {
      this.swarmListeners = this.swarmListeners.filter(l => l !== listener);
    };
  }

  private emitSwarmEvent(type: string, swarmId: string, data: any): void {
    for (const listener of this.swarmListeners) {
      try {
        listener({ type, swarmId, data });
      } catch (e) {
        console.error('Swarm listener error:', e);
      }
    }
  }

  async initialize(): Promise<void> {
    // Create directories
    await mkdir(this.baseDir, { recursive: true });
    await mkdir(path.join(this.baseDir, 'runs'), { recursive: true });
    await mkdir(path.join(this.baseDir, 'logs'), { recursive: true });
    await mkdir(path.join(this.baseDir, 'screenshots'), { recursive: true });
    await mkdir(path.join(this.baseDir, 'network'), { recursive: true });
    await mkdir(path.join(this.baseDir, 'swarms'), { recursive: true });

    // Load existing data
    await this.loadExistingData();
    await this.loadExistingSwarms();
  }

  private async loadExistingSwarms(): Promise<void> {
    const swarmsDir = path.join(this.baseDir, 'swarms');
    if (!existsSync(swarmsDir)) return;

    try {
      const files = await readdir(swarmsDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const data = await readFile(path.join(swarmsDir, file), 'utf-8');
          const swarm = JSON.parse(data) as SwarmRun;
          swarm.startedAt = new Date(swarm.startedAt);
          if (swarm.completedAt) swarm.completedAt = new Date(swarm.completedAt);
          for (const route of swarm.routes) {
            if (route.startedAt) route.startedAt = new Date(route.startedAt);
            if (route.completedAt) route.completedAt = new Date(route.completedAt);
            for (const p of route.progress) {
              p.timestamp = new Date(p.timestamp);
            }
          }
          this.swarms.set(swarm.swarmId, swarm);
        } catch {
          // Skip corrupted files
        }
      }
    } catch {
      // Directory might not exist yet
    }
  }

  private async loadExistingData(): Promise<void> {
    const runsDir = path.join(this.baseDir, 'runs');
    if (!existsSync(runsDir)) return;

    try {
      const files = await readdir(runsDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const data = await readFile(path.join(runsDir, file), 'utf-8');
          const run = JSON.parse(data) as TestRunRecord;
          run.startedAt = new Date(run.startedAt);
          if (run.completedAt) run.completedAt = new Date(run.completedAt);
          this.runs.set(run.runId, run);
        } catch {
          // Skip corrupted files
        }
      }
    } catch {
      // Directory might not exist yet
    }
  }

  // ---------------------------------------------------------------------------
  // Event Processing
  // ---------------------------------------------------------------------------

  async processEvent(event: BarrHawkEvent): Promise<void> {
    const runId = event.correlationId;

    switch (event.type) {
      case 'test.run.started': {
        const payload = event.payload as TestRunStartedPayload;
        await this.createRun({
          runId: payload.runId,
          projectId: payload.projectId,
          tenantId: event.tenantId,
          origin: payload.origin,
          status: 'running',
          startedAt: event.timestamp,
        });
        break;
      }

      case 'test.run.completed': {
        const payload = event.payload as TestRunCompletedPayload;
        await this.updateRun(runId, {
          status: payload.status as TestRunRecord['status'],
          completedAt: event.timestamp,
          duration: payload.summary.duration,
          summary: payload.summary,
        });
        // Flush all data for this run to disk
        await this.flushAll(runId);
        break;
      }

      case 'console.captured': {
        const payload = event.payload as ConsoleCapturedPayload;
        await this.addLog({
          id: event.id,
          runId,
          timestamp: event.timestamp,
          type: 'console',
          level: payload.level,
          message: payload.message,
          data: payload.args,
          source: payload.source ? {
            url: payload.source.url,
            line: payload.source.lineNumber,
            column: payload.source.columnNumber,
          } : undefined,
        });
        break;
      }

      case 'screenshot.captured': {
        const payload = event.payload as ScreenshotCapturedPayload;
        await this.addScreenshot({
          id: payload.screenshotId,
          runId,
          timestamp: event.timestamp,
          url: payload.url,
          thumbnailUrl: payload.thumbnailUrl,
          width: payload.width,
          height: payload.height,
          sizeBytes: payload.sizeBytes,
          type: payload.type,
          stepIndex: payload.stepIndex,
        });
        break;
      }

      case 'api.request.sent': {
        const payload = event.payload as ApiRequestSentPayload;
        await this.addNetworkRequest({
          id: payload.requestId,
          runId,
          timestamp: event.timestamp,
          method: payload.method,
          url: payload.url,
          requestSize: payload.bodySize,
          requestHeaders: payload.headers,
        });
        break;
      }

      case 'api.response.received': {
        const payload = event.payload as ApiResponseReceivedPayload;
        await this.updateNetworkRequest(payload.requestId, runId, {
          status: payload.status,
          statusText: payload.statusText,
          duration: payload.duration,
          responseSize: payload.bodySize,
          responseHeaders: payload.headers,
        });
        break;
      }

      case 'browser.navigated': {
        const payload = event.payload as any;
        await this.addLog({
          id: event.id,
          runId,
          timestamp: event.timestamp,
          type: 'navigation',
          message: `Navigated to: ${payload.url}`,
          data: { url: payload.url, title: payload.title, loadTime: payload.loadTime },
        });
        break;
      }

      case 'browser.click': {
        const payload = event.payload as any;
        await this.addLog({
          id: event.id,
          runId,
          timestamp: event.timestamp,
          type: 'click',
          level: payload.success ? 'info' : 'error',
          message: payload.success
            ? `Clicked: ${payload.selector || payload.text || `(${payload.coordinates?.x}, ${payload.coordinates?.y})`}`
            : `Click failed: ${payload.selector || payload.text}`,
          data: payload,
        });
        break;
      }

      case 'browser.launched': {
        const payload = event.payload as any;
        await this.addLog({
          id: event.id,
          runId,
          timestamp: event.timestamp,
          type: 'step',
          level: 'info',
          message: `Browser launched (headless: ${payload.headless}, viewport: ${payload.viewport?.width}x${payload.viewport?.height})`,
          data: payload,
        });
        break;
      }

      case 'browser.type': {
        const payload = event.payload as any;
        await this.addLog({
          id: event.id,
          runId,
          timestamp: event.timestamp,
          type: 'step',
          level: payload.success !== false ? 'info' : 'error',
          message: payload.success !== false
            ? `Typed ${payload.textLength} chars into ${payload.selector}`
            : `Type failed: ${payload.selector}`,
          data: payload,
        });
        break;
      }

      case 'browser.scroll': {
        const payload = event.payload as any;
        await this.addLog({
          id: event.id,
          runId,
          timestamp: event.timestamp,
          type: 'step',
          level: 'info',
          message: `Scrolled ${payload.direction} by ${payload.amount}px`,
          data: payload,
        });
        break;
      }

      case 'browser.closed': {
        const payload = event.payload as any;
        await this.addLog({
          id: event.id,
          runId,
          timestamp: event.timestamp,
          type: 'step',
          level: 'info',
          message: 'Browser closed',
          data: payload,
        });
        break;
      }

      case 'test.step.started':
      case 'test.step.completed': {
        const payload = event.payload as any;
        await this.addLog({
          id: event.id,
          runId,
          timestamp: event.timestamp,
          type: 'step',
          level: payload.status === 'failed' ? 'error' : 'info',
          message: event.type === 'test.step.started'
            ? `Step ${payload.stepIndex}: ${payload.stepName} (${payload.stepType})`
            : `Step ${payload.stepIndex} ${payload.status} (${payload.duration}ms)`,
          data: payload,
        });
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Run Management
  // ---------------------------------------------------------------------------

  async createRun(run: TestRunRecord): Promise<void> {
    this.runs.set(run.runId, run);
    this.logs.set(run.runId, []);
    this.screenshots.set(run.runId, []);
    this.network.set(run.runId, []);
    await this.saveRun(run);
  }

  async updateRun(runId: string, updates: Partial<TestRunRecord>): Promise<void> {
    const run = this.runs.get(runId);
    if (run) {
      Object.assign(run, updates);
      await this.saveRun(run);
    }
  }

  private async saveRun(run: TestRunRecord): Promise<void> {
    const filePath = path.join(this.baseDir, 'runs', `${run.runId}.json`);
    await writeFile(filePath, JSON.stringify(run, null, 2));
  }

  // ---------------------------------------------------------------------------
  // Log Management
  // ---------------------------------------------------------------------------

  async addLog(log: LogEntry): Promise<void> {
    let logs = this.logs.get(log.runId);
    if (!logs) {
      logs = [];
      this.logs.set(log.runId, logs);
    }
    logs.push(log);

    // Persist periodically (every 50 logs)
    if (logs.length % 50 === 0) {
      await this.saveLogs(log.runId);
    }
  }

  private async saveLogs(runId: string): Promise<void> {
    const logs = this.logs.get(runId);
    if (!logs) return;

    const filePath = path.join(this.baseDir, 'logs', `${runId}.json`);
    await writeFile(filePath, JSON.stringify(logs, null, 2));
  }

  async flushLogs(runId: string): Promise<void> {
    await this.saveLogs(runId);
  }

  // ---------------------------------------------------------------------------
  // Screenshot Management
  // ---------------------------------------------------------------------------

  async addScreenshot(screenshot: ScreenshotRecord): Promise<void> {
    let screenshots = this.screenshots.get(screenshot.runId);
    if (!screenshots) {
      screenshots = [];
      this.screenshots.set(screenshot.runId, screenshots);
    }
    screenshots.push(screenshot);
    await this.saveScreenshots(screenshot.runId);
  }

  private async saveScreenshots(runId: string): Promise<void> {
    const screenshots = this.screenshots.get(runId);
    if (!screenshots) return;

    const filePath = path.join(this.baseDir, 'screenshots', `${runId}.json`);
    await writeFile(filePath, JSON.stringify(screenshots, null, 2));
  }

  // ---------------------------------------------------------------------------
  // Network Management
  // ---------------------------------------------------------------------------

  async addNetworkRequest(record: NetworkRecord): Promise<void> {
    let network = this.network.get(record.runId);
    if (!network) {
      network = [];
      this.network.set(record.runId, network);
    }
    network.push(record);
  }

  async updateNetworkRequest(requestId: string, runId: string, updates: Partial<NetworkRecord>): Promise<void> {
    const network = this.network.get(runId);
    if (!network) return;

    // Find by ID or create new entry with the updates
    let record = network.find(r => r.id === requestId);
    if (!record) {
      // Response came before request was logged, create entry
      record = {
        id: requestId,
        runId,
        timestamp: new Date(),
        method: 'UNKNOWN',
        url: 'unknown',
        ...updates,
      };
      network.push(record);
    } else {
      Object.assign(record, updates);
    }

    // Save periodically
    if (network.length % 20 === 0) {
      await this.saveNetwork(runId);
    }
  }

  private async saveNetwork(runId: string): Promise<void> {
    const network = this.network.get(runId);
    if (!network) return;

    const filePath = path.join(this.baseDir, 'network', `${runId}.json`);
    await writeFile(filePath, JSON.stringify(network, null, 2));
  }

  async flushNetwork(runId: string): Promise<void> {
    await this.saveNetwork(runId);
  }

  // ---------------------------------------------------------------------------
  // Query API
  // ---------------------------------------------------------------------------

  async getRuns(options: {
    limit?: number;
    offset?: number;
    status?: string;
    origin?: string;
    since?: Date;
  } = {}): Promise<TestRunRecord[]> {
    let runs = Array.from(this.runs.values());

    // Filter
    if (options.status) {
      runs = runs.filter(r => r.status === options.status);
    }
    if (options.origin) {
      runs = runs.filter(r => r.origin === options.origin);
    }
    if (options.since) {
      runs = runs.filter(r => r.startedAt >= options.since!);
    }

    // Sort by date (newest first)
    runs.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    // Paginate
    const offset = options.offset || 0;
    const limit = options.limit || 50;
    return runs.slice(offset, offset + limit);
  }

  async getRun(runId: string): Promise<TestRunRecord | undefined> {
    return this.runs.get(runId);
  }

  async getRunSummary(runId: string): Promise<RunSummary | undefined> {
    const run = this.runs.get(runId);
    if (!run) return undefined;

    const logs = this.logs.get(runId) || [];
    const screenshots = this.screenshots.get(runId) || [];
    const network = this.network.get(runId) || [];

    return {
      run,
      logCount: logs.length,
      screenshotCount: screenshots.length,
      networkRequestCount: network.length,
      errorCount: logs.filter(l => l.level === 'error').length,
      consoleLogCount: logs.filter(l => l.type === 'console').length,
    };
  }

  async getLogs(runId: string, options: {
    type?: string;
    level?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<LogEntry[]> {
    // Try loading from file if not in memory
    if (!this.logs.has(runId)) {
      try {
        const filePath = path.join(this.baseDir, 'logs', `${runId}.json`);
        const data = await readFile(filePath, 'utf-8');
        const logs = JSON.parse(data) as LogEntry[];
        logs.forEach(l => l.timestamp = new Date(l.timestamp));
        this.logs.set(runId, logs);
      } catch {
        return [];
      }
    }

    let logs = this.logs.get(runId) || [];

    // Filter
    if (options.type) {
      logs = logs.filter(l => l.type === options.type);
    }
    if (options.level) {
      logs = logs.filter(l => l.level === options.level);
    }
    if (options.search) {
      const search = options.search.toLowerCase();
      logs = logs.filter(l => l.message.toLowerCase().includes(search));
    }

    // Paginate
    const offset = options.offset || 0;
    const limit = options.limit || 100;
    return logs.slice(offset, offset + limit);
  }

  async getScreenshots(runId: string): Promise<ScreenshotRecord[]> {
    // Try loading from file if not in memory
    if (!this.screenshots.has(runId)) {
      try {
        const filePath = path.join(this.baseDir, 'screenshots', `${runId}.json`);
        const data = await readFile(filePath, 'utf-8');
        const screenshots = JSON.parse(data) as ScreenshotRecord[];
        screenshots.forEach(s => s.timestamp = new Date(s.timestamp));
        this.screenshots.set(runId, screenshots);
      } catch {
        return [];
      }
    }

    return this.screenshots.get(runId) || [];
  }

  async getNetworkRequests(runId: string, options: {
    status?: number;
    method?: string;
    urlPattern?: string;
    minDuration?: number;
  } = {}): Promise<NetworkRecord[]> {
    // Try loading from file if not in memory
    if (!this.network.has(runId)) {
      try {
        const filePath = path.join(this.baseDir, 'network', `${runId}.json`);
        const data = await readFile(filePath, 'utf-8');
        const network = JSON.parse(data) as NetworkRecord[];
        network.forEach(n => n.timestamp = new Date(n.timestamp));
        this.network.set(runId, network);
      } catch {
        return [];
      }
    }

    let network = this.network.get(runId) || [];

    // Filter
    if (options.status) {
      network = network.filter(n => n.status === options.status);
    }
    if (options.method) {
      network = network.filter(n => n.method === options.method);
    }
    if (options.urlPattern) {
      const pattern = new RegExp(options.urlPattern, 'i');
      network = network.filter(n => pattern.test(n.url));
    }
    if (options.minDuration) {
      network = network.filter(n => (n.duration || 0) >= options.minDuration!);
    }

    return network;
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  async flushAll(runId: string): Promise<void> {
    await this.saveLogs(runId);
    await this.saveScreenshots(runId);
    await this.saveNetwork(runId);
  }

  async deleteRun(runId: string): Promise<void> {
    this.runs.delete(runId);
    this.logs.delete(runId);
    this.screenshots.delete(runId);
    this.network.delete(runId);

    // Delete files
    const files = [
      path.join(this.baseDir, 'runs', `${runId}.json`),
      path.join(this.baseDir, 'logs', `${runId}.json`),
      path.join(this.baseDir, 'screenshots', `${runId}.json`),
      path.join(this.baseDir, 'network', `${runId}.json`),
    ];

    for (const file of files) {
      try {
        const { unlink } = await import('fs/promises');
        await unlink(file);
      } catch {
        // File might not exist
      }
    }
  }

  async getStats(): Promise<{
    totalRuns: number;
    runsByStatus: Record<string, number>;
    runsByOrigin: Record<string, number>;
    totalLogs: number;
    totalScreenshots: number;
    totalNetworkRequests: number;
  }> {
    const runs = Array.from(this.runs.values());

    const runsByStatus: Record<string, number> = {};
    const runsByOrigin: Record<string, number> = {};

    for (const run of runs) {
      runsByStatus[run.status] = (runsByStatus[run.status] || 0) + 1;
      runsByOrigin[run.origin] = (runsByOrigin[run.origin] || 0) + 1;
    }

    let totalLogs = 0;
    let totalScreenshots = 0;
    let totalNetworkRequests = 0;

    for (const logs of this.logs.values()) {
      totalLogs += logs.length;
    }
    for (const screenshots of this.screenshots.values()) {
      totalScreenshots += screenshots.length;
    }
    for (const network of this.network.values()) {
      totalNetworkRequests += network.length;
    }

    return {
      totalRuns: runs.length,
      runsByStatus,
      runsByOrigin,
      totalLogs,
      totalScreenshots,
      totalNetworkRequests,
    };
  }

  // ---------------------------------------------------------------------------
  // Swarm Management (Multi-Agent Orchestration)
  // ---------------------------------------------------------------------------

  async createSwarm(swarm: SwarmRun): Promise<void> {
    this.swarms.set(swarm.swarmId, swarm);
    await this.saveSwarm(swarm);
    this.emitSwarmEvent('swarm_created', swarm.swarmId, swarm);
  }

  async getSwarm(swarmId: string): Promise<SwarmRun | undefined> {
    return this.swarms.get(swarmId);
  }

  async getSwarms(options: { limit?: number; status?: string } = {}): Promise<SwarmRun[]> {
    let swarms = Array.from(this.swarms.values());

    if (options.status) {
      swarms = swarms.filter(s => s.status === options.status);
    }

    // Sort by date (newest first)
    swarms.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    const limit = options.limit || 50;
    return swarms.slice(0, limit);
  }

  async updateSwarmStatus(swarmId: string, status: SwarmRun['status']): Promise<void> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return;

    swarm.status = status;
    if (status === 'completed' || status === 'failed' || status === 'partial') {
      swarm.completedAt = new Date();
    }
    await this.saveSwarm(swarm);
    this.emitSwarmEvent('swarm_status', swarmId, { status });
  }

  async updateRouteStatus(
    swarmId: string,
    routeId: string,
    update: {
      status?: SwarmRoute['status'];
      igorId?: string;
      result?: SwarmRoute['result'];
    }
  ): Promise<void> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return;

    const route = swarm.routes.find(r => r.routeId === routeId);
    if (!route) return;

    if (update.status) {
      route.status = update.status;
      if (update.status === 'running') route.startedAt = new Date();
      if (update.status === 'completed' || update.status === 'failed') route.completedAt = new Date();
    }
    if (update.igorId) route.igorId = update.igorId;
    if (update.result) route.result = update.result;

    // Check if all routes are done
    const allDone = swarm.routes.every(r => r.status === 'completed' || r.status === 'failed');
    if (allDone) {
      const anyFailed = swarm.routes.some(r => r.status === 'failed');
      const allFailed = swarm.routes.every(r => r.status === 'failed');
      swarm.status = allFailed ? 'failed' : anyFailed ? 'partial' : 'completed';
      swarm.completedAt = new Date();
    }

    await this.saveSwarm(swarm);
    this.emitSwarmEvent('route_update', swarmId, { routeId, ...update });
  }

  async addRouteProgress(
    swarmId: string,
    routeId: string,
    progress: Omit<SwarmProgress, 'timestamp'>
  ): Promise<void> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return;

    const route = swarm.routes.find(r => r.routeId === routeId);
    if (!route) return;

    const entry: SwarmProgress = {
      ...progress,
      timestamp: new Date(),
    };
    route.progress.push(entry);

    // Emit immediately for live updates
    this.emitSwarmEvent('route_progress', swarmId, { routeId, progress: entry });

    // Save periodically (every 5 progress entries)
    if (route.progress.length % 5 === 0) {
      await this.saveSwarm(swarm);
    }
  }

  private async saveSwarm(swarm: SwarmRun): Promise<void> {
    const filePath = path.join(this.baseDir, 'swarms', `${swarm.swarmId}.json`);
    await writeFile(filePath, JSON.stringify(swarm, null, 2));
  }

  async deleteSwarm(swarmId: string): Promise<void> {
    this.swarms.delete(swarmId);
    try {
      const { unlink } = await import('fs/promises');
      await unlink(path.join(this.baseDir, 'swarms', `${swarmId}.json`));
    } catch {
      // File might not exist
    }
  }

  async getSwarmStats(): Promise<{
    totalSwarms: number;
    running: number;
    completed: number;
    failed: number;
    avgRoutesPerSwarm: number;
    totalRoutes: number;
  }> {
    const swarms = Array.from(this.swarms.values());
    const running = swarms.filter(s => s.status === 'running').length;
    const completed = swarms.filter(s => s.status === 'completed').length;
    const failed = swarms.filter(s => s.status === 'failed' || s.status === 'partial').length;
    const totalRoutes = swarms.reduce((sum, s) => sum + s.routes.length, 0);

    return {
      totalSwarms: swarms.length,
      running,
      completed,
      failed,
      avgRoutesPerSwarm: swarms.length > 0 ? totalRoutes / swarms.length : 0,
      totalRoutes,
    };
  }
}

// =============================================================================
// Singleton
// =============================================================================

let globalStore: ObservabilityStore | null = null;

export async function getObservabilityStore(baseDir?: string): Promise<ObservabilityStore> {
  if (!globalStore) {
    globalStore = new ObservabilityStore(baseDir);
    await globalStore.initialize();
  }
  return globalStore;
}
