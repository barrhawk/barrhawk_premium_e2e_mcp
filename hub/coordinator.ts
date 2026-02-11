#!/usr/bin/env bun
/**
 * Coordinator - Multi-Igor Synchronization
 *
 * Orchestrates multiple Igors for complex test scenarios:
 * - UI Igor watches the browser
 * - DB Igor watches database changes
 * - API Igor monitors endpoints
 * - Logs Igor tails log files
 *
 * Handles:
 * - Barrier synchronization (all Igors ready before trigger)
 * - Event correlation (matching UI events to DB changes)
 * - Timeout management
 * - Result aggregation
 */

import { WebSocket } from 'ws';

const PORT = parseInt(process.env.COORDINATOR_PORT || '7011');
const BRIDGE_URL = process.env.BRIDGE_URL || 'ws://localhost:7000';
const COORDINATOR_ID = `coordinator-${Date.now().toString(36)}`;

// =============================================================================
// Types
// =============================================================================

interface TestExecution {
  id: string;
  targetId: string;
  projectId: string;
  status: 'initializing' | 'capturing-before' | 'triggering' | 'settling' | 'capturing-after' | 'asserting' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;

  // Igor assignments
  igors: IgorAssignment[];

  // Synchronization
  barriers: Map<string, Set<string>>; // barrier name -> ready igor ids

  // Collected states
  watcherStates: Record<string, {
    before: unknown;
    after: unknown;
    events: unknown[];
  }>;

  // Settings
  settleTimeMs: number;
  timeoutMs: number;

  // Results
  assertionResults: AssertionResult[];
  error?: { message: string; phase: string };
}

interface IgorAssignment {
  igorId: string;
  type: 'ui' | 'db' | 'api' | 'logs';
  watcherId: string;
  status: 'pending' | 'ready' | 'capturing' | 'done' | 'error';
  config: object;
}

interface AssertionResult {
  assertionId: string;
  passed: boolean;
  leftValue: unknown;
  rightValue: unknown;
  message?: string;
}

// =============================================================================
// Logger
// =============================================================================

function log(level: 'info' | 'warn' | 'error' | 'debug', msg: string, data?: object) {
  const time = new Date().toISOString();
  const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : level === 'debug' ? '🔍' : '🎯';
  console.log(`${time} ${prefix} [Coordinator] ${msg}`, data ? JSON.stringify(data) : '');
}

// =============================================================================
// Active Executions
// =============================================================================

const executions: Map<string, TestExecution> = new Map();
const igorRegistry: Map<string, { type: string; connectionId: string; status: string }> = new Map();

// =============================================================================
// Bridge Connection
// =============================================================================

let bridge: WebSocket | null = null;

function connectToBridge() {
  log('info', `Connecting to Bridge at ${BRIDGE_URL}`);

  bridge = new WebSocket(BRIDGE_URL);

  bridge.on('open', () => {
    log('info', 'Connected to Bridge');

    bridge?.send(JSON.stringify({
      type: 'register',
      payload: {
        id: COORDINATOR_ID,
        component: 'coordinator',
        capabilities: ['orchestrate', 'barrier', 'correlate'],
      },
    }));
  });

  bridge.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      await handleBridgeMessage(message);
    } catch (err) {
      log('error', `Failed to handle message: ${err}`);
    }
  });

  bridge.on('close', () => {
    log('warn', 'Bridge connection closed, reconnecting...');
    setTimeout(connectToBridge, 2000);
  });

  bridge.on('error', (err) => {
    log('error', `Bridge error: ${err.message}`);
  });
}

async function handleBridgeMessage(message: any) {
  const { type, payload, source, correlationId } = message;

  switch (type) {
    // Igor lifecycle events
    case 'igor.registered':
      handleIgorRegistered(payload);
      break;

    case 'igor.disconnected':
      handleIgorDisconnected(payload);
      break;

    // Execution commands from Hub
    case 'execution.start':
      await handleExecutionStart(payload, correlationId);
      break;

    case 'execution.cancel':
      await handleExecutionCancel(payload, correlationId);
      break;

    // Igor status updates
    case 'igor.ready':
      handleIgorReady(payload, source);
      break;

    case 'igor.captured':
      handleIgorCaptured(payload, source);
      break;

    case 'igor.error':
      handleIgorError(payload, source);
      break;

    // Event notifications from watchers
    case 'watcher.event':
      handleWatcherEvent(payload, source);
      break;

    default:
      log('debug', `Unknown message type: ${type}`, { source });
  }
}

// =============================================================================
// Igor Registry
// =============================================================================

function handleIgorRegistered(payload: any) {
  const { id, type, connectionId } = payload;
  igorRegistry.set(id, { type, connectionId, status: 'available' });
  log('info', `Igor registered: ${id}`, { type });
}

function handleIgorDisconnected(payload: any) {
  const { id } = payload;
  igorRegistry.delete(id);
  log('info', `Igor disconnected: ${id}`);

  // Check if any executions are affected
  for (const [execId, exec] of executions) {
    const affected = exec.igors.find(i => i.igorId === id);
    if (affected && exec.status !== 'completed' && exec.status !== 'failed') {
      failExecution(execId, `Igor ${id} disconnected`);
    }
  }
}

// =============================================================================
// Execution Management
// =============================================================================

async function handleExecutionStart(payload: any, correlationId: string) {
  const { executionId, targetId, projectId, igors, trigger, settleTimeMs, timeoutMs, assertions } = payload;

  log('info', `Starting execution`, { executionId, targetId, igorsCount: igors.length });

  const execution: TestExecution = {
    id: executionId,
    targetId,
    projectId,
    status: 'initializing',
    startedAt: new Date(),
    igors: igors.map((igor: any) => ({
      igorId: igor.id || `igor-${igor.type}-${Date.now()}`,
      type: igor.type,
      watcherId: igor.watcherId,
      status: 'pending',
      config: igor.config,
    })),
    barriers: new Map(),
    watcherStates: {},
    settleTimeMs: settleTimeMs || 1000,
    timeoutMs: timeoutMs || 30000,
    assertionResults: [],
  };

  // Initialize watcher states
  for (const igor of execution.igors) {
    execution.watcherStates[igor.watcherId] = { before: null, after: null, events: [] };
  }

  executions.set(executionId, execution);

  // Set timeout
  setTimeout(() => {
    const exec = executions.get(executionId);
    if (exec && exec.status !== 'completed' && exec.status !== 'failed') {
      failExecution(executionId, 'Execution timeout');
    }
  }, timeoutMs);

  // Assign Igors and wait for them to be ready
  await assignIgors(execution);

  // Create barrier for "before capture"
  execution.barriers.set('before-ready', new Set());
  execution.status = 'capturing-before';

  // Command all Igors to capture before state
  for (const igor of execution.igors) {
    sendToIgor(igor.igorId, 'capture', {
      executionId,
      watcherId: igor.watcherId,
      phase: 'before',
      config: igor.config,
    });
  }

  sendToBridge('execution.started', { executionId }, correlationId);
}

async function assignIgors(execution: TestExecution) {
  for (const assignment of execution.igors) {
    // Find available Igor of the right type
    let assignedIgorId: string | null = null;

    for (const [id, igor] of igorRegistry) {
      if (igor.type === assignment.type && igor.status === 'available') {
        assignedIgorId = id;
        igor.status = 'busy';
        break;
      }
    }

    if (!assignedIgorId) {
      // Spawn a new Igor of this type
      log('info', `Spawning new Igor for ${assignment.type}`);
      assignedIgorId = await spawnIgor(assignment.type);
    }

    assignment.igorId = assignedIgorId;
    log('info', `Assigned Igor ${assignedIgorId} to watcher ${assignment.watcherId}`);
  }
}

async function spawnIgor(type: string): Promise<string> {
  const igorId = `igor-${type}-${Date.now().toString(36)}`;

  // Request Bridge to spawn Igor
  sendToBridge('spawn.igor', { type, id: igorId });

  // Wait for registration (with timeout)
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Igor spawn timeout')), 10000);
    const check = setInterval(() => {
      if (igorRegistry.has(igorId)) {
        clearInterval(check);
        clearTimeout(timeout);
        resolve();
      }
    }, 100);
  });

  return igorId;
}

// =============================================================================
// Barrier Synchronization
// =============================================================================

function handleIgorReady(payload: any, igorId: string) {
  const { executionId, phase } = payload;
  const execution = executions.get(executionId);
  if (!execution) return;

  const barrierName = `${phase}-ready`;
  let barrier = execution.barriers.get(barrierName);
  if (!barrier) {
    barrier = new Set();
    execution.barriers.set(barrierName, barrier);
  }

  barrier.add(igorId);
  log('debug', `Igor ${igorId} ready for ${phase}`, { count: barrier.size, total: execution.igors.length });

  // Check if all Igors are ready
  if (barrier.size >= execution.igors.length) {
    log('info', `All Igors ready for ${phase}`, { executionId });
    advanceExecution(execution, phase);
  }
}

function handleIgorCaptured(payload: any, igorId: string) {
  const { executionId, watcherId, phase, state } = payload;
  const execution = executions.get(executionId);
  if (!execution) return;

  // Store the captured state
  const watcherState = execution.watcherStates[watcherId];
  if (watcherState) {
    if (phase === 'before') {
      watcherState.before = state;
    } else {
      watcherState.after = state;
    }
  }

  // Update Igor status
  const igor = execution.igors.find(i => i.igorId === igorId);
  if (igor) igor.status = 'done';

  // Check if all Igors have captured
  const allCaptured = execution.igors.every(i => i.status === 'done');
  if (allCaptured) {
    log('info', `All Igors captured ${phase} state`, { executionId });

    // Reset status for next phase
    execution.igors.forEach(i => i.status = 'ready');

    if (phase === 'before') {
      triggerExecution(execution);
    } else {
      completeExecution(execution);
    }
  }
}

function handleIgorError(payload: any, igorId: string) {
  const { executionId, error } = payload;
  log('error', `Igor ${igorId} error`, { executionId, error });

  failExecution(executionId, `Igor error: ${error}`);
}

function handleWatcherEvent(payload: any, igorId: string) {
  const { executionId, watcherId, event } = payload;
  const execution = executions.get(executionId);
  if (!execution) return;

  const watcherState = execution.watcherStates[watcherId];
  if (watcherState) {
    watcherState.events.push(event);
    log('debug', `Watcher event`, { executionId, watcherId, eventType: event.type });
  }
}

// =============================================================================
// Execution Flow
// =============================================================================

function advanceExecution(execution: TestExecution, completedPhase: string) {
  switch (completedPhase) {
    case 'before':
      execution.status = 'triggering';
      triggerExecution(execution);
      break;

    case 'after':
      completeExecution(execution);
      break;
  }
}

async function triggerExecution(execution: TestExecution) {
  log('info', `Triggering execution`, { executionId: execution.id });
  execution.status = 'triggering';

  // Tell the UI Igor to execute the trigger
  const uiIgor = execution.igors.find(i => i.type === 'ui');
  if (uiIgor) {
    sendToIgor(uiIgor.igorId, 'trigger', {
      executionId: execution.id,
      config: uiIgor.config,
    });
  }

  // Wait for settle time
  execution.status = 'settling';
  log('info', `Settling for ${execution.settleTimeMs}ms`, { executionId: execution.id });

  await new Promise(r => setTimeout(r, execution.settleTimeMs));

  // Capture after state
  execution.status = 'capturing-after';
  execution.barriers.set('after-ready', new Set());

  for (const igor of execution.igors) {
    igor.status = 'capturing';
    sendToIgor(igor.igorId, 'capture', {
      executionId: execution.id,
      watcherId: igor.watcherId,
      phase: 'after',
      config: igor.config,
    });
  }
}

function completeExecution(execution: TestExecution) {
  log('info', `Completing execution`, { executionId: execution.id });
  execution.status = 'asserting';

  // Run assertions (delegated to Hub for now)
  execution.status = 'completed';
  execution.completedAt = new Date();

  // Release Igors
  for (const assignment of execution.igors) {
    const igor = igorRegistry.get(assignment.igorId);
    if (igor) igor.status = 'available';
  }

  // Notify Hub
  sendToBridge('execution.completed', {
    executionId: execution.id,
    watcherStates: execution.watcherStates,
    duration: Date.now() - execution.startedAt.getTime(),
  });

  log('info', `Execution completed`, {
    executionId: execution.id,
    duration: Date.now() - execution.startedAt.getTime(),
  });
}

function failExecution(executionId: string, reason: string) {
  const execution = executions.get(executionId);
  if (!execution || execution.status === 'failed' || execution.status === 'completed') return;

  log('error', `Execution failed: ${reason}`, { executionId });

  execution.status = 'failed';
  execution.completedAt = new Date();
  execution.error = { message: reason, phase: execution.status };

  // Release Igors
  for (const assignment of execution.igors) {
    const igor = igorRegistry.get(assignment.igorId);
    if (igor) igor.status = 'available';
  }

  sendToBridge('execution.failed', {
    executionId,
    error: execution.error,
    watcherStates: execution.watcherStates,
  });
}

async function handleExecutionCancel(payload: any, correlationId: string) {
  const { executionId } = payload;
  failExecution(executionId, 'Cancelled by user');
  sendToBridge('execution.cancelled', { executionId }, correlationId);
}

// =============================================================================
// Communication
// =============================================================================

function sendToIgor(igorId: string, action: string, payload: object) {
  sendToBridge(`igor.${action}`, { ...payload, targetIgor: igorId });
}

function sendToBridge(type: string, payload: object, correlationId?: string) {
  if (!bridge || bridge.readyState !== WebSocket.OPEN) {
    log('warn', 'Bridge not connected');
    return;
  }

  bridge.send(JSON.stringify({
    type,
    payload,
    correlationId,
    source: COORDINATOR_ID,
    timestamp: new Date().toISOString(),
  }));
}

// =============================================================================
// HTTP API
// =============================================================================

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === '/health') {
    return Response.json({
      status: 'healthy',
      service: 'coordinator',
      id: COORDINATOR_ID,
      activeExecutions: executions.size,
      registeredIgors: igorRegistry.size,
      bridgeConnected: bridge?.readyState === WebSocket.OPEN,
    });
  }

  if (path === '/executions' && req.method === 'GET') {
    const list = Array.from(executions.values()).map(e => ({
      id: e.id,
      targetId: e.targetId,
      status: e.status,
      igors: e.igors.length,
      startedAt: e.startedAt,
    }));
    return Response.json({ executions: list });
  }

  if (path === '/igors' && req.method === 'GET') {
    const list = Array.from(igorRegistry.entries()).map(([id, igor]) => ({
      id,
      type: igor.type,
      status: igor.status,
    }));
    return Response.json({ igors: list });
  }

  if (path.startsWith('/executions/') && req.method === 'GET') {
    const id = path.split('/')[2];
    const execution = executions.get(id);
    if (!execution) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    return Response.json({ execution });
  }

  return Response.json({ error: 'Not found' }, { status: 404 });
}

// =============================================================================
// Main
// =============================================================================

log('info', `Coordinator starting on port ${PORT}`);
connectToBridge();

const server = Bun.serve({
  port: PORT,
  fetch: handleRequest,
});

log('info', `Coordinator listening on http://localhost:${PORT}`);

process.on('SIGINT', () => {
  log('info', 'Shutting down...');
  bridge?.close();
  process.exit(0);
});
