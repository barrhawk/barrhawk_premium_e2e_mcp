#!/usr/bin/env bun
/**
 * THE BRIDGE - Port 7000 - FORTRESS EDITION
 *
 * The nervous system of the tripartite architecture.
 * All component communication flows through here.
 *
 * Features:
 * - WebSocket server with connection health tracking
 * - Message routing with deduplication
 * - Dead letter queue for undeliverable messages
 * - Graceful shutdown with connection drain
 * - Memory-bounded circular buffers
 * - Per-component circuit breakers (Sprint 4)
 * - Memory pressure load shedding (Sprint 4)
 * - Correlation ID tracing (Sprint 5)
 * - Error rate sliding windows (Sprint 5)
 * - Token from Authorization header (Sprint 6)
 * - Per-connection rate limiting (Sprint 6)
 * - Version compatibility (Sprint 6)
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import {
  BridgeMessage,
  ComponentId,
  BridgeHealth,
  generateId,
  verifySignature
} from '../shared/types.js';
import { validateMessageSize, validateComponentId } from '../shared/validation.js';
import { createLogger } from '../shared/logger.js';
import { MetricsRegistry } from '../shared/metrics.js';
import { CircularBuffer } from '../shared/circular-buffer.js';
import { SeenMessageCache } from '../shared/seen-cache.js';
import { DeadLetterQueue } from '../shared/dead-letter.js';
import { ConnectionManager } from '../shared/connection-manager.js';
import { CircuitBreakerRegistry, CircuitState } from '../shared/circuit-breaker.js';
import { RateLimiter, SlidingWindowCounter } from '../shared/rate-limiter.js';

// =============================================================================
// VERSION CANARY - CHANGE THIS ON EVERY DEPLOY
// =============================================================================
const BRIDGE_VERSION = '2026-01-21-v11-doctor-management';
const MIN_COMPATIBLE_VERSION = '2026-01-19'; // Minimum compatible component version

// =============================================================================
// Configuration
// =============================================================================
const PORT = parseInt(process.env.BRIDGE_PORT || '7000');
const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL || '5000');
const STALE_THRESHOLD_MULTIPLIER = parseInt(process.env.STALE_THRESHOLD_MULTIPLIER || '3');
const AUTH_TOKEN = process.env.BRIDGE_AUTH_TOKEN || '';
const AUTH_ENABLED = AUTH_TOKEN.length > 0;
const SIGNING_REQUIRED = process.env.BRIDGE_REQUIRE_SIGNING === 'true';

// Limits
const MAX_MESSAGE_SIZE = parseInt(process.env.MAX_MESSAGE_SIZE || String(1024 * 1024)); // 1MB
const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS || '100');
const MESSAGE_LOG_SIZE = parseInt(process.env.MESSAGE_LOG_SIZE || '1000');
const SEEN_CACHE_SIZE = parseInt(process.env.SEEN_CACHE_SIZE || '10000');
const SEEN_CACHE_TTL_MS = parseInt(process.env.SEEN_CACHE_TTL_MS || '60000');
const DLQ_SIZE = parseInt(process.env.DLQ_SIZE || '1000');
const DRAIN_TIMEOUT_MS = parseInt(process.env.DRAIN_TIMEOUT_MS || '5000');

// Sprint 4: Load shedding thresholds - using absolute RSS values (in MB) instead of heap ratios
// Heap ratios are unreliable in Bun (JavaScriptCore vs V8)
const MEMORY_PRESSURE_MB = parseInt(process.env.MEMORY_PRESSURE_MB || '500'); // 500MB RSS
const MEMORY_CRITICAL_MB = parseInt(process.env.MEMORY_CRITICAL_MB || '800'); // 800MB RSS

// Sprint 6: Rate limiting
const RATE_LIMIT_PER_SECOND = parseInt(process.env.RATE_LIMIT_PER_SECOND || '100');
const RATE_LIMIT_BURST = parseInt(process.env.RATE_LIMIT_BURST || '200');

// =============================================================================
// State
// =============================================================================
const startTime = Date.now();
let isShuttingDown = false;
let isUnderPressure = false;
let isCriticalPressure = false;

// Message log (circular buffer - no more shift())
const messageLog = new CircularBuffer<BridgeMessage>(MESSAGE_LOG_SIZE);

// Message deduplication
const seenMessages = new SeenMessageCache({
  maxSize: SEEN_CACHE_SIZE,
  ttlMs: SEEN_CACHE_TTL_MS,
});

// Dead letter queue
const deadLetterQueue = new DeadLetterQueue<BridgeMessage>({
  maxSize: DLQ_SIZE,
  maxRetries: 3,
  onPermanentFailure: (letter) => {
    logger.error(`Message permanently failed: ${letter.id} to ${letter.targetComponent}`);
    messagesPermanentlyFailed.inc({ target: letter.targetComponent });
  },
});

// Connection manager
const connectionManager = new ConnectionManager({
  maxQueueSize: 100,
  errorThreshold: 5,
  initialHealthScore: 100,
  minHealthScore: 0,
});

// Component registry (maps component ID to connection ID)
const componentRegistry = new Map<ComponentId, string>();

// Sprint 4: Per-component circuit breakers
const circuitBreakers = new CircuitBreakerRegistry();

// Sprint 5: Error rate tracking (sliding window)
const errorRateWindow = new SlidingWindowCounter({ windowMs: 60000, bucketCount: 60 });
const successRateWindow = new SlidingWindowCounter({ windowMs: 60000, bucketCount: 60 });

// Sprint 6: Per-connection rate limiter
const rateLimiter = new RateLimiter({
  tokensPerSecond: RATE_LIMIT_PER_SECOND,
  burstCapacity: RATE_LIMIT_BURST,
});

// Sprint 6: Component version registry
const componentVersions = new Map<ComponentId, string>();

// =============================================================================
// Reports Storage (Stable Report Hub)
// =============================================================================
const REPORTS_MAX_SIZE = parseInt(process.env.REPORTS_MAX_SIZE || '1000');
const SCREENSHOTS_DIR = process.env.SCREENSHOTS_DIR || '/tmp/tripartite-screenshots';

interface TestReport {
  id: string;
  timestamp: Date;
  source: ComponentId;
  type: 'plan_completed' | 'plan_failed' | 'step_completed' | 'step_failed' | 'tool_invoked' | 'screenshot' | 'assertion' | 'custom';
  planId?: string;
  stepIndex?: number;
  correlationId: string;
  duration?: number;
  success: boolean;
  data: Record<string, unknown>;
  screenshots?: string[];  // File paths
  errors?: string[];
}

const reportsStore = new CircularBuffer<TestReport>(REPORTS_MAX_SIZE);
const reportsByPlan = new Map<string, string[]>();  // planId -> reportIds
let totalReports = 0;
let totalScreenshots = 0;

// Ensure screenshots directory exists
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { spawn, ChildProcess } from 'child_process';
if (!existsSync(SCREENSHOTS_DIR)) {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// =============================================================================
// Doctor Management (Bridge spawns and manages Doctors)
// =============================================================================
const DOCTOR_SCRIPT_PATH = process.env.DOCTOR_SCRIPT_PATH || './doctor/index.ts';
const DOCTOR_BASE_PORT = parseInt(process.env.DOCTOR_BASE_PORT || '7100');
let nextDoctorPort = DOCTOR_BASE_PORT;

interface SpawnedDoctor {
  id: string;
  port: number;
  pid: number;
  status: 'spawning' | 'idle' | 'busy' | 'dying';
  process: ChildProcess;
  specialization?: string;  // e.g., 'mcp-verification', 'ui-testing', 'api-testing'
  igors: string[];          // IDs of Igors this Doctor has spawned
  plansCompleted: number;
  plansFailed: number;
  spawnedAt: Date;
  lastActivity: Date;
}

const spawnedDoctors = new Map<string, SpawnedDoctor>();
const MAX_DOCTORS = parseInt(process.env.MAX_DOCTORS || '10');

async function spawnDoctor(
  id: string,
  specialization?: string,
  config?: Record<string, unknown>
): Promise<SpawnedDoctor> {
  const port = nextDoctorPort++;

  logger.info(`🩺 Spawning Doctor: ${id}`, { port, specialization });

  const proc = spawn('bun', ['run', DOCTOR_SCRIPT_PATH], {
    env: {
      ...process.env,
      DOCTOR_PORT: String(port),
      DOCTOR_ID: id,
      DOCTOR_SPECIALIZATION: specialization || '',
      DOCTOR_CONFIG: config ? JSON.stringify(config) : '',
      BRIDGE_URL: `ws://localhost:${PORT}`,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false,
  });

  const doctor: SpawnedDoctor = {
    id,
    port,
    pid: proc.pid!,
    status: 'spawning',
    process: proc,
    specialization,
    igors: [],
    plansCompleted: 0,
    plansFailed: 0,
    spawnedAt: new Date(),
    lastActivity: new Date(),
  };

  // Handle stdout
  proc.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      logger.debug(`[doctor:${id}] ${line}`);
    }
  });

  // Handle stderr
  proc.stderr?.on('data', (data: Buffer) => {
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      logger.warn(`[doctor:${id}] ${line}`);
    }
  });

  // Handle exit
  proc.on('exit', (code, signal) => {
    logger.warn(`🩺💀 Doctor ${id} exited (code: ${code}, signal: ${signal})`);
    const doc = spawnedDoctors.get(id);
    if (doc) {
      doc.status = 'dying';
      // Broadcast doctor death to all components
      broadcastDoctorDeath(id, code, signal);
    }
    spawnedDoctors.delete(id);
  });

  // Handle error
  proc.on('error', (err) => {
    logger.error(`🩺❌ Doctor ${id} process error:`, err);
    spawnedDoctors.delete(id);
  });

  spawnedDoctors.set(id, doctor);
  return doctor;
}

function broadcastDoctorDeath(doctorId: string, exitCode: number | null, signal: string | null): void {
  const message: BridgeMessage = {
    id: generateId(),
    timestamp: new Date(),
    source: 'bridge',
    target: 'broadcast',
    type: 'doctor.died',
    payload: {
      doctorId,
      exitCode,
      signal,
      igors: spawnedDoctors.get(doctorId)?.igors || [],
    },
    version: BRIDGE_VERSION,
    correlationId: generateId(),
  };

  for (const [compId, connId] of componentRegistry) {
    connectionManager.send(connId, JSON.stringify(message));
  }
}

function killDoctor(doctorId: string, reason: string): boolean {
  const doctor = spawnedDoctors.get(doctorId);
  if (!doctor) {
    logger.warn(`Cannot kill doctor ${doctorId}: not found`);
    return false;
  }

  logger.info(`🩺🔪 Killing Doctor ${doctorId}: ${reason}`);
  doctor.status = 'dying';
  doctor.process.kill('SIGTERM');

  // Force kill after 5 seconds
  setTimeout(() => {
    if (spawnedDoctors.has(doctorId)) {
      logger.warn(`Force killing Doctor ${doctorId}`);
      doctor.process.kill('SIGKILL');
      spawnedDoctors.delete(doctorId);
    }
  }, 5000);

  return true;
}

function getDoctorStats(): object {
  return {
    total: spawnedDoctors.size,
    maxDoctors: MAX_DOCTORS,
    doctors: Array.from(spawnedDoctors.values()).map(d => ({
      id: d.id,
      port: d.port,
      pid: d.pid,
      status: d.status,
      specialization: d.specialization,
      igorCount: d.igors.length,
      plansCompleted: d.plansCompleted,
      plansFailed: d.plansFailed,
      uptime: Date.now() - d.spawnedAt.getTime(),
      lastActivity: d.lastActivity,
    })),
  };
}

function storeReport(report: Omit<TestReport, 'id' | 'timestamp'>): TestReport {
  const fullReport: TestReport = {
    ...report,
    id: generateId(),
    timestamp: new Date(),
  };

  reportsStore.push(fullReport);
  totalReports++;

  // Index by plan
  if (report.planId) {
    const planReports = reportsByPlan.get(report.planId) || [];
    planReports.push(fullReport.id);
    reportsByPlan.set(report.planId, planReports);
  }

  return fullReport;
}

function storeScreenshot(base64: string, planId?: string, stepIndex?: number): string {
  const timestamp = Date.now();
  const filename = `${planId || 'unknown'}_step${stepIndex ?? 'x'}_${timestamp}.png`;
  const filepath = `${SCREENSHOTS_DIR}/${filename}`;

  try {
    writeFileSync(filepath, Buffer.from(base64, 'base64'));
    totalScreenshots++;
    return filepath;
  } catch (err) {
    logger.error('Failed to save screenshot:', err);
    return '';
  }
}

// =============================================================================
// Logger
// =============================================================================
const logger = createLogger({
  component: 'bridge',
  version: BRIDGE_VERSION,
  minLevel: (process.env.LOG_LEVEL as any) || 'INFO',
  pretty: process.env.LOG_FORMAT !== 'json',
});

// =============================================================================
// Metrics
// =============================================================================
const metrics = new MetricsRegistry('bridge', BRIDGE_VERSION);

// Counters
const messagesTotal = metrics.counter('bridge_messages_total', 'Total messages routed');
const messagesDropped = metrics.counter('bridge_messages_dropped_total', 'Messages dropped (target unavailable)');
const messagesDuplicate = metrics.counter('bridge_messages_duplicate_total', 'Duplicate messages rejected');
const messagesPermanentlyFailed = metrics.counter('bridge_messages_permanent_failed_total', 'Messages that permanently failed');
const messagesCircuitOpen = metrics.counter('bridge_messages_circuit_open_total', 'Messages rejected due to open circuit');
const messagesLoadShed = metrics.counter('bridge_messages_load_shed_total', 'Messages dropped due to load shedding');
const messagesRateLimited = metrics.counter('bridge_messages_rate_limited_total', 'Messages rejected due to rate limiting');
const connectionsTotal = metrics.counter('bridge_connections_total', 'Total connections accepted');
const connectionsRejected = metrics.counter('bridge_connections_rejected_total', 'Connections rejected');
const connectionsKicked = metrics.counter('bridge_connections_kicked_total', 'Connections kicked for health');

// Gauges
const connectionsActive = metrics.gauge('bridge_connections_active', 'Active connections');
const dlqSize = metrics.gauge('bridge_dlq_size', 'Dead letter queue size');
const memoryUsed = metrics.gauge('bridge_memory_used_bytes', 'Memory usage in bytes');
const memoryPressure = metrics.gauge('bridge_memory_pressure', 'Memory pressure level (0=normal, 1=pressure, 2=critical)');
const errorRate = metrics.gauge('bridge_error_rate', 'Error rate over last minute');
const circuitBreakersOpen = metrics.gauge('bridge_circuit_breakers_open', 'Number of open circuit breakers');

// Histograms
const routingDuration = metrics.histogram('bridge_routing_duration_seconds', 'Message routing duration',
  [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1]);
const messageProcessingDuration = metrics.histogram('bridge_message_processing_seconds', 'Total message processing time',
  [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5]);

// =============================================================================
// Sprint 5: Correlation ID Helper
// =============================================================================
function ensureCorrelationId(message: BridgeMessage): string {
  if (!message.correlationId) {
    message.correlationId = generateId();
  }
  return message.correlationId;
}

// =============================================================================
// Sprint 6: Version Compatibility Check
// =============================================================================
function isVersionCompatible(version: string): boolean {
  if (!version) return true; // Lenient for missing versions

  // Extract date portion (YYYY-MM-DD)
  const versionDate = version.substring(0, 10);
  return versionDate >= MIN_COMPATIBLE_VERSION;
}

// =============================================================================
// Sprint 6: Extract Auth Token
// =============================================================================
function extractAuthToken(req: IncomingMessage): string | null {
  // Check Authorization header first (preferred)
  const authHeader = req.headers.authorization;
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return authHeader;
  }

  // Fallback to query string (deprecated)
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const queryToken = url.searchParams.get('token');
  if (queryToken) {
    logger.warn('Token in query string is deprecated, use Authorization header');
  }
  return queryToken;
}

// =============================================================================
// Sprint 4: Memory Pressure Check (RSS-based for Bun compatibility)
// =============================================================================
function checkMemoryPressure(): { level: number; shouldShed: boolean; shouldReject: boolean } {
  const usage = process.memoryUsage();
  const rssMB = usage.rss / (1024 * 1024);

  let level = 0;
  let shouldShed = false;
  let shouldReject = false;

  if (rssMB >= MEMORY_CRITICAL_MB) {
    level = 2;
    shouldShed = true;
    shouldReject = true;
    if (!isCriticalPressure) {
      logger.error(`CRITICAL memory pressure: ${rssMB.toFixed(0)}MB RSS (threshold: ${MEMORY_CRITICAL_MB}MB)`);
      isCriticalPressure = true;
    }
  } else if (rssMB >= MEMORY_PRESSURE_MB) {
    level = 1;
    shouldShed = true;
    shouldReject = false;
    if (!isUnderPressure) {
      logger.warn(`Memory pressure: ${rssMB.toFixed(0)}MB RSS (threshold: ${MEMORY_PRESSURE_MB}MB)`);
      isUnderPressure = true;
    }
  } else {
    if (isUnderPressure || isCriticalPressure) {
      logger.info(`Memory pressure relieved: ${rssMB.toFixed(0)}MB RSS`);
    }
    isUnderPressure = false;
    isCriticalPressure = false;
  }

  return { level, shouldShed, shouldReject };
}

// =============================================================================
// Connection Manager Callbacks
// =============================================================================
connectionManager.onConnectionKicked = (id, reason) => {
  logger.warn(`Connection kicked: ${id} - ${reason}`);
  connectionsKicked.inc();

  // Remove from component registry
  for (const [compId, connId] of componentRegistry) {
    if (connId === id) {
      componentRegistry.delete(compId);
      componentVersions.delete(compId);
      logger.info(`Component unregistered due to kick: ${compId}`);
    }
  }
};

connectionManager.onMessageDropped = (id, message, reason) => {
  logger.warn(`Message dropped for ${id}: ${reason}`);
  messagesDropped.inc({ reason });
};

// =============================================================================
// Sprint 4: Circuit Breaker Callback
// =============================================================================
function onCircuitStateChange(from: CircuitState, to: CircuitState, name: string): void {
  logger.warn(`Circuit breaker '${name}': ${from} -> ${to}`);
  if (to === 'OPEN') {
    circuitBreakersOpen.inc();
  } else if (from === 'OPEN') {
    circuitBreakersOpen.dec();
  }
}

// =============================================================================
// Message Routing
// =============================================================================
function routeMessage(message: BridgeMessage, senderConnId: string, correlationId: string): void {
  const startRouting = process.hrtime.bigint();

  // Deduplication check
  if (seenMessages.isDuplicate(message.id)) {
    messagesDuplicate.inc({ source: message.source });
    logger.debug(`Duplicate message rejected: ${message.id}`, { correlationId });
    return;
  }

  // Log message
  messageLog.push(message);
  messagesTotal.inc({ type: message.type, source: message.source });

  logger.debug(`Routing ${message.type} from ${message.source} to ${message.target}`, { correlationId });

  if (message.target === 'broadcast') {
    // Send to all components except sender
    for (const [compId, connId] of componentRegistry) {
      if (connId !== senderConnId) {
        const success = connectionManager.send(connId, JSON.stringify(message));
        if (!success) {
          deadLetterQueue.enqueue(message, message.id, compId, 'Broadcast send failed');
        }
      }
    }
    successRateWindow.increment();
  } else {
    // Sprint 4: Check circuit breaker for target
    const circuit = circuitBreakers.get(message.target, {
      failureThreshold: 5,
      resetTimeout: 30000,
      onStateChange: onCircuitStateChange,
    });

    if (!circuit.canExecute()) {
      messagesCircuitOpen.inc({ target: message.target });
      deadLetterQueue.enqueue(message, message.id, message.target, 'Circuit breaker open');
      logger.warn(`Circuit open for ${message.target}, message queued to DLQ`, { correlationId });
      errorRateWindow.increment();
      return;
    }

    // Point-to-point delivery
    const targetConnId = componentRegistry.get(message.target as ComponentId);
    if (targetConnId) {
      const success = connectionManager.send(targetConnId, JSON.stringify(message));
      if (success) {
        circuit.onSuccess();
        successRateWindow.increment();
      } else {
        circuit.onFailure();
        errorRateWindow.increment();
        deadLetterQueue.enqueue(message, message.id, message.target, 'Send failed');
        messagesDropped.inc({ target: message.target, type: message.type });
      }
    } else {
      circuit.onFailure();
      errorRateWindow.increment();
      deadLetterQueue.enqueue(message, message.id, message.target, 'Target not connected');
      messagesDropped.inc({ target: message.target, type: message.type });
      logger.warn(`Target ${message.target} not connected, message queued to DLQ`, { correlationId });
    }
  }

  // Record routing duration
  const endRouting = process.hrtime.bigint();
  const durationSeconds = Number(endRouting - startRouting) / 1e9;
  routingDuration.observe(durationSeconds, { type: message.type });
}

// =============================================================================
// Component Registration
// =============================================================================
function registerComponent(connId: string, message: BridgeMessage): void {
  const { id, version } = message.payload as { id: ComponentId; version: string };

  // Sprint 6: Version compatibility check
  if (!isVersionCompatible(version)) {
    logger.error(`Component ${id} version ${version} is incompatible (min: ${MIN_COMPATIBLE_VERSION})`);
    connectionManager.kick(connId, `Incompatible version: ${version}`);
    return;
  }

  // Check if already registered (different connection)
  const existingConnId = componentRegistry.get(id);
  if (existingConnId && existingConnId !== connId) {
    logger.warn(`Component ${id} already registered on different connection, replacing`);
    connectionManager.kick(existingConnId, 'Replaced by new connection');
  }

  componentRegistry.set(id, connId);
  componentVersions.set(id, version);

  // Update connection metadata
  const conn = connectionManager.get(connId);
  if (conn) {
    conn.metadata = { componentId: id, version };
  }

  logger.info(`Component registered: ${id} (version: ${version})`);

  // Announce to all
  const announcement: BridgeMessage = {
    id: generateId(),
    timestamp: new Date(),
    source: 'bridge',
    target: 'broadcast',
    type: 'version.announce',
    payload: { component: id, version },
    version: BRIDGE_VERSION,
    correlationId: generateId(),
  };

  for (const [compId, cid] of componentRegistry) {
    if (cid !== connId) {
      connectionManager.send(cid, JSON.stringify(announcement));
    }
  }
}

function unregisterComponent(connId: string): void {
  for (const [compId, cid] of componentRegistry) {
    if (cid === connId) {
      componentRegistry.delete(compId);
      componentVersions.delete(compId);
      logger.info(`Component unregistered: ${compId}`);
    }
  }
}

// =============================================================================
// Health Check
// =============================================================================
function getHealth(): BridgeHealth & {
  immortal: boolean;
  dlqSize: number;
  seenCacheStats: object;
  connectionStats: object;
  memoryPressure: number;
  errorRate: number;
  circuitBreakers: object[];
  rateLimiterStats: object;
  reports: object;
} {
  const connStats = connectionManager.getStats();
  const pressure = checkMemoryPressure();
  const totalOps = successRateWindow.getCount() + errorRateWindow.getCount();
  const currentErrorRate = totalOps > 0 ? errorRateWindow.getCount() / totalOps : 0;

  return {
    status: isShuttingDown ? 'draining' : (pressure.level === 2 ? 'degraded' : 'healthy'),
    version: BRIDGE_VERSION,
    uptime: Date.now() - startTime,
    pid: process.pid,
    connectedComponents: {
      doctor: componentRegistry.has('doctor'),
      igor: componentRegistry.has('igor'),
      frankenstein: componentRegistry.has('frankenstein'),
    },
    messageCount: messageLog.getSize(),
    queueDepth: connStats.totalQueuedMessages,
    immortal: true,
    dlqSize: deadLetterQueue.size(),
    seenCacheStats: seenMessages.getStats(),
    connectionStats: connStats,
    memoryPressure: pressure.level,
    errorRate: currentErrorRate,
    circuitBreakers: circuitBreakers.getAllStats(),
    rateLimiterStats: rateLimiter.getStats(),
    reports: {
      total: totalReports,
      stored: reportsStore.getSize(),
      maxSize: REPORTS_MAX_SIZE,
      screenshots: totalScreenshots,
      screenshotsDir: SCREENSHOTS_DIR,
      planCount: reportsByPlan.size,
    },
    doctors: getDoctorStats(),
  } as any;
}

// =============================================================================
// HTTP Server
// =============================================================================
const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = req.url || '/';
  const correlationId = req.headers['x-correlation-id'] as string || generateId();

  // Health endpoint
  if (url === '/health' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'X-Version': BRIDGE_VERSION,
      'X-Correlation-Id': correlationId,
    });
    res.end(JSON.stringify(getHealth()));
    return;
  }

  // Ready endpoint (for k8s)
  if (url === '/ready' && req.method === 'GET') {
    const pressure = checkMemoryPressure();
    if (isShuttingDown || pressure.shouldReject) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ready: false,
        reason: isShuttingDown ? 'Draining' : 'Memory pressure',
      }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ready: true }));
    }
    return;
  }

  // Live endpoint (for k8s)
  if (url === '/live' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ live: true }));
    return;
  }

  // Components endpoint
  if (url === '/components' && req.method === 'GET') {
    const list = Array.from(componentRegistry.entries()).map(([compId, connId]) => {
      const conn = connectionManager.get(connId);
      return {
        id: compId,
        version: componentVersions.get(compId),
        connectionId: connId,
        healthScore: conn?.healthScore ?? 0,
        messagesSent: conn?.messagesSent ?? 0,
        lastActivity: conn?.lastActivity,
        connectedAt: conn?.connectedAt,
        metadata: conn?.metadata,
      };
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(list));
    return;
  }

  // Messages endpoint
  if (url === '/messages' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(messageLog.getRecent(100)));
    return;
  }

  // Dead letter queue endpoint
  if (url === '/dlq' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      stats: deadLetterQueue.getStats(),
      recent: deadLetterQueue.getRecent(50),
    }));
    return;
  }

  // Circuit breakers endpoint
  if (url === '/circuits' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(circuitBreakers.getAllStats()));
    return;
  }

  // Rate limiter endpoint
  if (url === '/rate-limits' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(rateLimiter.getStats()));
    return;
  }

  // Metrics endpoint
  if (url === '/metrics' && req.method === 'GET') {
    // Update dynamic metrics
    const pressure = checkMemoryPressure();
    const totalOps = successRateWindow.getCount() + errorRateWindow.getCount();
    const currentErrorRate = totalOps > 0 ? errorRateWindow.getCount() / totalOps : 0;

    connectionsActive.set(connectionManager.size());
    dlqSize.set(deadLetterQueue.size());
    memoryUsed.set(process.memoryUsage().heapUsed);
    memoryPressure.set(pressure.level);
    errorRate.set(currentErrorRate);

    res.writeHead(200, { 'Content-Type': metrics.getContentType() });
    res.end(metrics.render());
    return;
  }

  // Debug endpoints
  if (url === '/debug/state' && req.method === 'GET') {
    const pressure = checkMemoryPressure();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      isShuttingDown,
      isUnderPressure,
      isCriticalPressure,
      memoryPressure: pressure,
      componentRegistry: Object.fromEntries(componentRegistry),
      componentVersions: Object.fromEntries(componentVersions),
      connectionCount: connectionManager.size(),
      messageLogSize: messageLog.getSize(),
      seenCacheStats: seenMessages.getStats(),
      dlqStats: deadLetterQueue.getStats(),
      circuitBreakers: circuitBreakers.getAllStats(),
      rateLimiterStats: rateLimiter.getStats(),
      errorRateWindow: {
        count: errorRateWindow.getCount(),
        rate: errorRateWindow.getRate(),
      },
      successRateWindow: {
        count: successRateWindow.getCount(),
        rate: successRateWindow.getRate(),
      },
      memoryUsage: process.memoryUsage(),
    }));
    return;
  }

  // Admin: kick connection
  if (url.startsWith('/admin/kick/') && req.method === 'POST') {
    const connId = url.split('/')[3];
    if (connId) {
      connectionManager.kick(connId, 'Admin kick');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ kicked: connId }));
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Connection ID required' }));
    }
    return;
  }

  // Admin: reset circuit breaker
  if (url.startsWith('/admin/circuit/reset/') && req.method === 'POST') {
    const circuitName = url.split('/')[4];
    if (circuitName) {
      const circuit = circuitBreakers.get(circuitName);
      circuit.reset();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ reset: circuitName }));
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Circuit name required' }));
    }
    return;
  }

  // =========================================================================
  // Doctor Management API
  // =========================================================================

  // List all doctors
  if (url === '/doctors' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getDoctorStats()));
    return;
  }

  // Spawn a new doctor
  if (url === '/doctors' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { id, specialization, config } = JSON.parse(body || '{}');

        if (!id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Doctor id is required' }));
          return;
        }

        if (spawnedDoctors.size >= MAX_DOCTORS) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Max doctors (${MAX_DOCTORS}) reached` }));
          return;
        }

        if (spawnedDoctors.has(id)) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Doctor ${id} already exists` }));
          return;
        }

        const doctor = await spawnDoctor(id, specialization, config);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: doctor.id,
          port: doctor.port,
          pid: doctor.pid,
          specialization: doctor.specialization,
          status: doctor.status,
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      }
    });
    return;
  }

  // Get specific doctor
  if (url.match(/^\/doctors\/[^/]+$/) && req.method === 'GET') {
    const doctorId = url.split('/')[2];
    const doctor = spawnedDoctors.get(doctorId);

    if (!doctor) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Doctor ${doctorId} not found` }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: doctor.id,
      port: doctor.port,
      pid: doctor.pid,
      status: doctor.status,
      specialization: doctor.specialization,
      igorCount: doctor.igors.length,
      igors: doctor.igors,
      plansCompleted: doctor.plansCompleted,
      plansFailed: doctor.plansFailed,
      uptime: Date.now() - doctor.spawnedAt.getTime(),
      spawnedAt: doctor.spawnedAt,
      lastActivity: doctor.lastActivity,
    }));
    return;
  }

  // Kill a doctor
  if (url.match(/^\/doctors\/[^/]+\/kill$/) && req.method === 'POST') {
    const doctorId = url.split('/')[2];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const { reason } = JSON.parse(body || '{}');
      const killed = killDoctor(doctorId, reason || 'Killed via HTTP API');

      if (killed) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ killed: doctorId, reason }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Doctor ${doctorId} not found` }));
      }
    });
    return;
  }

  // Kill all doctors
  if (url === '/doctors/kill-all' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const { reason } = JSON.parse(body || '{}');
      const doctorIds = Array.from(spawnedDoctors.keys());
      const killed: string[] = [];

      for (const id of doctorIds) {
        if (killDoctor(id, reason || 'Kill all via HTTP API')) {
          killed.push(id);
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ killed, count: killed.length }));
    });
    return;
  }

  // =========================================================================
  // Reports API (Stable Report Hub)
  // =========================================================================

  // Get reports
  if (url === '/reports' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      reports: reportsStore.getRecent(100),
      stats: {
        total: totalReports,
        stored: reportsStore.getSize(),
        maxSize: REPORTS_MAX_SIZE,
        screenshots: totalScreenshots,
        planCount: reportsByPlan.size,
      },
    }));
    return;
  }

  // Get reports for specific plan
  if (url.startsWith('/reports/plan/') && req.method === 'GET') {
    const planId = url.split('/')[3];
    const reportIds = reportsByPlan.get(planId) || [];
    const reports = reportsStore.getAll().filter(r => r.planId === planId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      planId,
      reports,
      count: reports.length,
    }));
    return;
  }

  // Submit a report
  if (url === '/reports' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body) as Omit<TestReport, 'id' | 'timestamp'>;

        // Handle embedded screenshots
        const screenshots: string[] = [];
        if (data.data?.screenshot) {
          const path = storeScreenshot(
            data.data.screenshot as string,
            data.planId,
            data.stepIndex
          );
          if (path) screenshots.push(path);
          delete data.data.screenshot;  // Don't store base64 in report
        }

        const report = storeReport({
          ...data,
          screenshots: screenshots.length > 0 ? screenshots : undefined,
        });

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: report.id, screenshots }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      }
    });
    return;
  }

  // Submit a screenshot directly
  if (url === '/screenshots' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { base64, planId, stepIndex, correlationId } = JSON.parse(body);
        const path = storeScreenshot(base64, planId, stepIndex);

        if (path) {
          // Also create a report entry
          storeReport({
            source: 'bridge' as ComponentId,
            type: 'screenshot',
            planId,
            stepIndex,
            correlationId: correlationId || generateId(),
            success: true,
            data: {},
            screenshots: [path],
          });

          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ path }));
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to save screenshot' }));
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      }
    });
    return;
  }

  // Get summary for a plan (aggregated results)
  if (url.startsWith('/reports/summary/') && req.method === 'GET') {
    const planId = url.split('/')[3];
    const reports = reportsStore.getAll().filter(r => r.planId === planId);

    const summary = {
      planId,
      totalReports: reports.length,
      stepsCompleted: reports.filter(r => r.type === 'step_completed').length,
      stepsFailed: reports.filter(r => r.type === 'step_failed').length,
      screenshots: reports.flatMap(r => r.screenshots || []),
      errors: reports.flatMap(r => r.errors || []),
      totalDuration: reports.reduce((sum, r) => sum + (r.duration || 0), 0),
      success: reports.some(r => r.type === 'plan_completed' && r.success),
      failed: reports.some(r => r.type === 'plan_failed'),
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(summary));
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

// =============================================================================
// WebSocket Server
// =============================================================================
const wss = new WebSocketServer({
  server: httpServer,
  verifyClient: (info, callback) => {
    const correlationId = generateId();

    // Reject if shutting down
    if (isShuttingDown) {
      callback(false, 503, 'Server is shutting down');
      return;
    }

    // Sprint 4: Reject if under critical memory pressure
    const pressure = checkMemoryPressure();
    if (pressure.shouldReject) {
      logger.warn('Connection rejected: Critical memory pressure', { correlationId });
      connectionsRejected.inc({ reason: 'memory_pressure' });
      callback(false, 503, 'Server under memory pressure');
      return;
    }

    // Check max connections
    if (connectionManager.size() >= MAX_CONNECTIONS) {
      logger.warn(`Connection rejected: Max connections (${MAX_CONNECTIONS}) reached`, { correlationId });
      connectionsRejected.inc({ reason: 'max_connections' });
      callback(false, 503, 'Max connections reached');
      return;
    }

    // Auth check
    if (!AUTH_ENABLED) {
      callback(true);
      return;
    }

    // Sprint 6: Extract token from header or query string
    const token = extractAuthToken(info.req);

    if (!token) {
      logger.warn('Connection rejected: No auth token provided', { correlationId });
      connectionsRejected.inc({ reason: 'no_token' });
      callback(false, 401, 'Unauthorized: No token provided');
      return;
    }

    if (token !== AUTH_TOKEN) {
      logger.warn('Connection rejected: Invalid auth token', { correlationId });
      connectionsRejected.inc({ reason: 'invalid_token' });
      callback(false, 401, 'Unauthorized: Invalid token');
      return;
    }

    callback(true);
  },
});

wss.on('connection', (ws: WebSocket) => {
  const connId = generateId();
  connectionsTotal.inc();

  // Register with connection manager
  connectionManager.register(connId, ws);

  logger.debug(`New WebSocket connection: ${connId}`);

  ws.on('message', async (data: Buffer) => {
    const msgStart = process.hrtime.bigint();

    try {
      // Sprint 6: Rate limiting check
      if (!rateLimiter.allow(connId)) {
        messagesRateLimited.inc({ connection: connId });
        logger.warn(`Rate limited connection: ${connId}`);
        ws.send(JSON.stringify({
          id: generateId(),
          timestamp: new Date(),
          source: 'bridge',
          target: 'unknown',
          type: 'error',
          payload: { error: 'Rate limit exceeded', retryAfter: 1000 },
          version: BRIDGE_VERSION,
        }));
        return;
      }

      // Sprint 4: Load shedding check
      const pressure = checkMemoryPressure();
      if (pressure.shouldShed && data.length > 1024) { // Only shed large messages
        messagesLoadShed.inc();
        logger.warn(`Load shedding message (${data.length} bytes) due to memory pressure`);
        ws.send(JSON.stringify({
          id: generateId(),
          timestamp: new Date(),
          source: 'bridge',
          target: 'unknown',
          type: 'error',
          payload: { error: 'Server under load, message dropped', retryAfter: 5000 },
          version: BRIDGE_VERSION,
        }));
        return;
      }

      // Validate message size
      if (data.length > MAX_MESSAGE_SIZE) {
        logger.warn(`Message too large (${data.length} bytes), dropping`);
        connectionManager.recordError(connId, 'Message too large');
        ws.send(JSON.stringify({
          id: generateId(),
          timestamp: new Date(),
          source: 'bridge',
          target: 'unknown',
          type: 'error',
          payload: { error: `Message size ${data.length} exceeds maximum ${MAX_MESSAGE_SIZE}` },
          version: BRIDGE_VERSION,
        }));
        return;
      }

      const message: BridgeMessage = JSON.parse(data.toString());

      // Sprint 5: Ensure correlation ID
      const correlationId = ensureCorrelationId(message);

      // Validate required fields
      if (!message.id || !message.source || !message.target || !message.type) {
        logger.warn('Invalid message: missing required fields', { correlationId });
        connectionManager.recordError(connId, 'Invalid message structure');
        return;
      }

      // Verify signature if required
      if (SIGNING_REQUIRED && AUTH_TOKEN) {
        if (!message.signature) {
          logger.warn(`Message from ${message.source} rejected: missing signature`, { correlationId });
          connectionManager.recordError(connId, 'Missing signature');
          ws.send(JSON.stringify({
            id: generateId(),
            timestamp: new Date(),
            source: 'bridge',
            target: message.source,
            type: 'error',
            payload: { error: 'Message signature required' },
            version: BRIDGE_VERSION,
            correlationId,
          }));
          return;
        }
        if (!verifySignature(message, AUTH_TOKEN)) {
          logger.warn(`Message from ${message.source} rejected: invalid signature`, { correlationId });
          connectionManager.recordError(connId, 'Invalid signature');
          ws.send(JSON.stringify({
            id: generateId(),
            timestamp: new Date(),
            source: 'bridge',
            target: message.source,
            type: 'error',
            payload: { error: 'Invalid message signature' },
            version: BRIDGE_VERSION,
            correlationId,
          }));
          return;
        }
      }

      // Validate component IDs
      const sourceValidation = validateComponentId(message.source);
      if (!sourceValidation.valid) {
        logger.warn(`Invalid source component ID: ${message.source}`, { correlationId });
        connectionManager.recordError(connId, 'Invalid source ID');
        return;
      }

      if (message.target !== 'broadcast') {
        const targetValidation = validateComponentId(message.target);
        if (!targetValidation.valid) {
          logger.warn(`Invalid target component ID: ${message.target}`, { correlationId });
          connectionManager.recordError(connId, 'Invalid target ID');
          return;
        }
      }

      // Record activity
      connectionManager.recordActivity(connId);

      // Handle registration
      if (message.type === 'component.register') {
        registerComponent(connId, message);
        return;
      }

      // Handle heartbeat
      if (message.type === 'heartbeat') {
        // Echo heartbeat back
        ws.send(JSON.stringify({
          id: generateId(),
          timestamp: new Date(),
          source: 'bridge',
          target: message.source,
          type: 'heartbeat',
          payload: { received: message.id },
          version: BRIDGE_VERSION,
          correlationId,
        }));
        return;
      }

      // =========================================================================
      // Doctor Management Handlers
      // =========================================================================

      // Handle doctor spawn request
      if (message.type === 'doctor.spawn') {
        const { id, specialization, config } = message.payload as {
          id: string;
          specialization?: string;
          config?: Record<string, unknown>;
        };

        // Check max doctors
        if (spawnedDoctors.size >= MAX_DOCTORS) {
          ws.send(JSON.stringify({
            id: generateId(),
            timestamp: new Date(),
            source: 'bridge',
            target: message.source,
            type: 'doctor.spawn.failed',
            payload: { id, error: `Max doctors (${MAX_DOCTORS}) reached` },
            version: BRIDGE_VERSION,
            correlationId,
          }));
          return;
        }

        // Check if already exists
        if (spawnedDoctors.has(id)) {
          ws.send(JSON.stringify({
            id: generateId(),
            timestamp: new Date(),
            source: 'bridge',
            target: message.source,
            type: 'doctor.spawn.failed',
            payload: { id, error: `Doctor ${id} already exists` },
            version: BRIDGE_VERSION,
            correlationId,
          }));
          return;
        }

        try {
          const doctor = await spawnDoctor(id, specialization, config);
          ws.send(JSON.stringify({
            id: generateId(),
            timestamp: new Date(),
            source: 'bridge',
            target: message.source,
            type: 'doctor.spawned',
            payload: {
              id: doctor.id,
              port: doctor.port,
              pid: doctor.pid,
              specialization: doctor.specialization,
              status: doctor.status,
            },
            version: BRIDGE_VERSION,
            correlationId,
          }));
        } catch (err) {
          ws.send(JSON.stringify({
            id: generateId(),
            timestamp: new Date(),
            source: 'bridge',
            target: message.source,
            type: 'doctor.spawn.failed',
            payload: { id, error: err instanceof Error ? err.message : String(err) },
            version: BRIDGE_VERSION,
            correlationId,
          }));
        }
        return;
      }

      // Handle doctor ready (sent by doctor when it's connected and ready)
      if (message.type === 'doctor.ready') {
        const { id } = message.payload as { id: string };
        const doctor = spawnedDoctors.get(id);
        if (doctor) {
          doctor.status = 'idle';
          doctor.lastActivity = new Date();
          logger.info(`🩺✅ Doctor ${id} is ready`);

          // Broadcast doctor ready to all components
          const readyMsg: BridgeMessage = {
            id: generateId(),
            timestamp: new Date(),
            source: 'bridge',
            target: 'broadcast',
            type: 'doctor.ready',
            payload: {
              id: doctor.id,
              port: doctor.port,
              specialization: doctor.specialization,
            },
            version: BRIDGE_VERSION,
            correlationId,
          };
          for (const [compId, cid] of componentRegistry) {
            connectionManager.send(cid, JSON.stringify(readyMsg));
          }
        }
        return;
      }

      // Handle doctor kill request
      if (message.type === 'doctor.kill') {
        const { id, reason } = message.payload as { id: string; reason?: string };
        const killed = killDoctor(id, reason || 'Requested via WebSocket');

        ws.send(JSON.stringify({
          id: generateId(),
          timestamp: new Date(),
          source: 'bridge',
          target: message.source,
          type: killed ? 'doctor.killing' : 'doctor.kill.failed',
          payload: { id, killed, reason },
          version: BRIDGE_VERSION,
          correlationId,
        }));
        return;
      }

      // Handle doctor status update (doctor reports its status)
      if (message.type === 'doctor.status') {
        const { id, status, igors, plansCompleted, plansFailed } = message.payload as {
          id: string;
          status: 'idle' | 'busy';
          igors?: string[];
          plansCompleted?: number;
          plansFailed?: number;
        };

        const doctor = spawnedDoctors.get(id);
        if (doctor) {
          doctor.status = status;
          doctor.lastActivity = new Date();
          if (igors) doctor.igors = igors;
          if (typeof plansCompleted === 'number') doctor.plansCompleted = plansCompleted;
          if (typeof plansFailed === 'number') doctor.plansFailed = plansFailed;
        }
        return;
      }

      // Handle doctor list request
      if (message.type === 'doctor.list') {
        ws.send(JSON.stringify({
          id: generateId(),
          timestamp: new Date(),
          source: 'bridge',
          target: message.source,
          type: 'doctor.list.response',
          payload: getDoctorStats(),
          version: BRIDGE_VERSION,
          correlationId,
        }));
        return;
      }

      // Handle report submission via WebSocket
      if (message.type === 'report.submit') {
        const reportData = message.payload as Omit<TestReport, 'id' | 'timestamp' | 'source'>;

        // Handle embedded screenshots
        const screenshots: string[] = [];
        if ((reportData as any).data?.screenshot) {
          const path = storeScreenshot(
            (reportData as any).data.screenshot as string,
            reportData.planId,
            reportData.stepIndex
          );
          if (path) screenshots.push(path);
          delete (reportData as any).data.screenshot;
        }

        const report = storeReport({
          ...reportData,
          source: message.source as ComponentId,
          correlationId,
          screenshots: screenshots.length > 0 ? screenshots : undefined,
        });

        // Acknowledge receipt
        ws.send(JSON.stringify({
          id: generateId(),
          timestamp: new Date(),
          source: 'bridge',
          target: message.source,
          type: 'report.stored',
          payload: { reportId: report.id, screenshots },
          version: BRIDGE_VERSION,
          correlationId,
        }));
        return;
      }

      // Handle screenshot submission via WebSocket
      if (message.type === 'screenshot.submit') {
        const { base64, planId, stepIndex } = message.payload as {
          base64: string;
          planId?: string;
          stepIndex?: number;
        };

        const path = storeScreenshot(base64, planId, stepIndex);

        if (path) {
          storeReport({
            source: message.source as ComponentId,
            type: 'screenshot',
            planId,
            stepIndex,
            correlationId,
            success: true,
            data: {},
            screenshots: [path],
          });

          ws.send(JSON.stringify({
            id: generateId(),
            timestamp: new Date(),
            source: 'bridge',
            target: message.source,
            type: 'screenshot.stored',
            payload: { path },
            version: BRIDGE_VERSION,
            correlationId,
          }));
        }
        return;
      }

      // Route message
      routeMessage(message, connId, correlationId);
      connectionManager.recordSuccess(connId);

    } catch (err) {
      logger.error('Failed to process message', err);
      connectionManager.recordError(connId, String(err));
      errorRateWindow.increment();
    } finally {
      // Sprint 5: Record processing duration
      const msgEnd = process.hrtime.bigint();
      const durationSeconds = Number(msgEnd - msgStart) / 1e9;
      messageProcessingDuration.observe(durationSeconds);
    }
  });

  ws.on('close', () => {
    unregisterComponent(connId);
    connectionManager.unregister(connId);
    rateLimiter.reset(connId);
    logger.debug(`WebSocket connection closed: ${connId}`);
  });

  ws.on('error', (err) => {
    logger.error(`WebSocket error on ${connId}:`, err);
    connectionManager.recordError(connId, String(err));
  });
});

// =============================================================================
// Stale Connection Cleanup (ACTUALLY DISCONNECTS NOW)
// =============================================================================
setInterval(() => {
  const staleThreshold = HEARTBEAT_INTERVAL * STALE_THRESHOLD_MULTIPLIER;
  const kicked = connectionManager.kickStale(staleThreshold);
  if (kicked > 0) {
    logger.info(`Kicked ${kicked} stale connections (>${staleThreshold}ms without activity)`);
  }
}, HEARTBEAT_INTERVAL);

// =============================================================================
// Memory Monitoring
// =============================================================================
setInterval(() => {
  const pressure = checkMemoryPressure();
  memoryPressure.set(pressure.level);
  memoryUsed.set(process.memoryUsage().heapUsed);
}, 10000);

// =============================================================================
// Graceful Shutdown
// =============================================================================
async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}, starting graceful shutdown...`);

  // Stop accepting new connections
  wss.close();

  // Drain existing connections
  logger.info(`Draining ${connectionManager.size()} connections (timeout: ${DRAIN_TIMEOUT_MS}ms)...`);
  await connectionManager.drain(DRAIN_TIMEOUT_MS);

  // Cleanup
  seenMessages.destroy();
  rateLimiter.destroy();
  httpServer.close();

  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// =============================================================================
// Global Error Handlers (IMMORTALITY)
// =============================================================================
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION (continuing):', err);
  errorRateWindow.increment();
  // Don't exit - we're immortal
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('UNHANDLED REJECTION (continuing):', reason);
  errorRateWindow.increment();
  // Don't exit - we're immortal
});

// =============================================================================
// Startup
// =============================================================================
httpServer.listen(PORT, () => {
  logger.info('='.repeat(60));
  logger.info(`THE BRIDGE - FORTRESS EDITION v${BRIDGE_VERSION}`);
  logger.info('='.repeat(60));
  logger.info(`PID: ${process.pid}`);
  logger.info(`Port: ${PORT}`);
  logger.info(`Auth: ${AUTH_ENABLED ? 'ENABLED' : 'DISABLED'}`);
  logger.info(`Signing: ${SIGNING_REQUIRED ? 'REQUIRED' : 'optional'}`);
  logger.info(`Max Connections: ${MAX_CONNECTIONS}`);
  logger.info(`Rate Limit: ${RATE_LIMIT_PER_SECOND}/sec (burst: ${RATE_LIMIT_BURST})`);
  logger.info(`Memory Thresholds (RSS): pressure=${MEMORY_PRESSURE_MB}MB, critical=${MEMORY_CRITICAL_MB}MB`);
  logger.info(`Min Compatible Version: ${MIN_COMPATIBLE_VERSION}`);
  logger.info(`Message Log Size: ${MESSAGE_LOG_SIZE}`);
  logger.info(`Seen Cache Size: ${SEEN_CACHE_SIZE}`);
  logger.info(`DLQ Size: ${DLQ_SIZE}`);
  logger.info(`Stale Threshold: ${HEARTBEAT_INTERVAL * STALE_THRESHOLD_MULTIPLIER}ms`);
  logger.info('='.repeat(60));
  logger.info(`Health: http://localhost:${PORT}/health`);
  logger.info(`Ready: http://localhost:${PORT}/ready`);
  logger.info(`Live: http://localhost:${PORT}/live`);
  logger.info(`Metrics: http://localhost:${PORT}/metrics`);
  logger.info(`DLQ: http://localhost:${PORT}/dlq`);
  logger.info(`Circuits: http://localhost:${PORT}/circuits`);
  logger.info(`Rate Limits: http://localhost:${PORT}/rate-limits`);
  logger.info(`Debug: http://localhost:${PORT}/debug/state`);
  logger.info(`Reports: http://localhost:${PORT}/reports`);
  logger.info(`Doctors: http://localhost:${PORT}/doctors`);
  logger.info(`Screenshots: ${SCREENSHOTS_DIR}`);
  logger.info(`WebSocket: ws://localhost:${PORT}`);
  logger.info('='.repeat(60));
  logger.info('🏰 FORTRESS MODE ACTIVE - Bridge is unbreakable');
  logger.info('📊 Reports Hub ready - stable report storage');
  logger.info(`🩺 Doctor Management ready - max ${MAX_DOCTORS} doctors`);
  logger.info('Waiting for components...');
});
