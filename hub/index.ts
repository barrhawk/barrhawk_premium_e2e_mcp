#!/usr/bin/env bun
/**
 * Hub API Server - Test Orchestration Platform
 *
 * Endpoints:
 *   Projects: GET/POST /projects, GET/PUT/DELETE /projects/:id
 *   Targets:  GET/POST /targets, GET/PUT/DELETE /targets/:id
 *   Runs:     GET /runs, POST /targets/:id/run, GET /runs/:id
 *   Stats:    GET /projects/:id/stats, GET /targets/:id/stats
 *   Execute:  POST /execute/:targetId - Run a target with multi-Igor coordination
 */

import * as storage from './storage.js';
import type { Project, Target, TestRun, TriggerDef, WatcherDef } from './schema.js';

const PORT = parseInt(process.env.HUB_PORT || '7010');
const BRIDGE_URL = process.env.BRIDGE_URL || 'http://localhost:7000';
const DOCTOR_URL = process.env.DOCTOR_URL || 'http://localhost:7001';

// =============================================================================
// Logger
// =============================================================================

function log(level: 'info' | 'warn' | 'error', msg: string, data?: object) {
  const time = new Date().toISOString();
  const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '📋';
  console.log(`${time} ${prefix} [Hub] ${msg}`, data ? JSON.stringify(data) : '');
}

// =============================================================================
// Request Helpers
// =============================================================================

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

async function parseBody<T>(req: Request): Promise<T | null> {
  try {
    return await req.json() as T;
  } catch {
    return null;
  }
}

// =============================================================================
// Route Matching
// =============================================================================

type Handler = (req: Request, params: Record<string, string>) => Promise<Response> | Response;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: Handler;
}

const routes: Route[] = [];

function addRoute(method: string, path: string, handler: Handler) {
  // Convert path pattern to regex
  const paramNames: string[] = [];
  const pattern = path.replace(/:(\w+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  routes.push({
    method,
    pattern: new RegExp(`^${pattern}$`),
    paramNames,
    handler,
  });
}

function matchRoute(method: string, path: string): { handler: Handler; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = path.match(route.pattern);
    if (match) {
      const params: Record<string, string> = {};
      route.paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });
      return { handler: route.handler, params };
    }
  }
  return null;
}

// =============================================================================
// Project Routes
// =============================================================================

// List projects
addRoute('GET', '/projects', async () => {
  const projects = storage.listProjects();
  return json({ projects });
});

// Create project
addRoute('POST', '/projects', async (req) => {
  const body = await parseBody<{ name: string; baseUrl: string; description?: string }>(req);
  if (!body?.name || !body?.baseUrl) {
    return error('name and baseUrl are required');
  }

  const project = storage.createProject({
    name: body.name,
    baseUrl: body.baseUrl,
    description: body.description,
    connections: {},
  });

  log('info', `Created project: ${project.name}`, { id: project.id });
  return json({ project }, 201);
});

// Get project
addRoute('GET', '/projects/:id', async (_, params) => {
  const project = storage.getProject(params.id);
  if (!project) return error('Project not found', 404);
  return json({ project });
});

// Update project
addRoute('PUT', '/projects/:id', async (req, params) => {
  const body = await parseBody<Partial<Project>>(req);
  if (!body) return error('Invalid body');

  const project = storage.updateProject(params.id, body);
  if (!project) return error('Project not found', 404);

  log('info', `Updated project: ${project.name}`, { id: project.id });
  return json({ project });
});

// Delete project
addRoute('DELETE', '/projects/:id', async (_, params) => {
  const deleted = storage.deleteProject(params.id);
  if (!deleted) return error('Project not found', 404);

  log('info', `Deleted project`, { id: params.id });
  return json({ deleted: true });
});

// Project stats
addRoute('GET', '/projects/:id/stats', async (_, params) => {
  const project = storage.getProject(params.id);
  if (!project) return error('Project not found', 404);

  const stats = storage.getProjectStats(params.id);
  return json({ stats });
});

// =============================================================================
// Target Routes
// =============================================================================

// List targets (optionally filtered by project)
addRoute('GET', '/targets', async (req) => {
  const url = new URL(req.url);
  const projectId = url.searchParams.get('projectId') || undefined;
  const targets = storage.listTargets(projectId);
  return json({ targets });
});

// Create target
addRoute('POST', '/targets', async (req) => {
  const body = await parseBody<{
    projectId: string;
    name: string;
    description?: string;
    trigger: TriggerDef;
    watchers?: WatcherDef[];
    assertions?: any[];
    settleTimeMs?: number;
    timeoutMs?: number;
    tags?: string[];
  }>(req);

  if (!body?.projectId || !body?.name || !body?.trigger) {
    return error('projectId, name, and trigger are required');
  }

  // Verify project exists
  const project = storage.getProject(body.projectId);
  if (!project) return error('Project not found', 404);

  const target = storage.createTarget({
    projectId: body.projectId,
    name: body.name,
    description: body.description,
    source: 'user',
    enabled: true,
    trigger: body.trigger,
    watchers: body.watchers || [],
    assertions: body.assertions || [],
    settleTimeMs: body.settleTimeMs || 1000,
    timeoutMs: body.timeoutMs || 30000,
    tags: body.tags || [],
  });

  log('info', `Created target: ${target.name}`, { id: target.id, projectId: body.projectId });
  return json({ target }, 201);
});

// Get target
addRoute('GET', '/targets/:id', async (_, params) => {
  const target = storage.getTarget(params.id);
  if (!target) return error('Target not found', 404);
  return json({ target });
});

// Update target
addRoute('PUT', '/targets/:id', async (req, params) => {
  const body = await parseBody<Partial<Target>>(req);
  if (!body) return error('Invalid body');

  const target = storage.updateTarget(params.id, body);
  if (!target) return error('Target not found', 404);

  log('info', `Updated target: ${target.name}`, { id: target.id });
  return json({ target });
});

// Delete target
addRoute('DELETE', '/targets/:id', async (_, params) => {
  const deleted = storage.deleteTarget(params.id);
  if (!deleted) return error('Target not found', 404);

  log('info', `Deleted target`, { id: params.id });
  return json({ deleted: true });
});

// Target stats
addRoute('GET', '/targets/:id/stats', async (_, params) => {
  const target = storage.getTarget(params.id);
  if (!target) return error('Target not found', 404);

  const stats = storage.getTargetStats(params.id);
  return json({ stats });
});

// =============================================================================
// Test Run Routes
// =============================================================================

// List runs
addRoute('GET', '/runs', async (req) => {
  const url = new URL(req.url);
  const runs = storage.listTestRuns({
    targetId: url.searchParams.get('targetId') || undefined,
    projectId: url.searchParams.get('projectId') || undefined,
    status: url.searchParams.get('status') || undefined,
    limit: parseInt(url.searchParams.get('limit') || '50'),
    offset: parseInt(url.searchParams.get('offset') || '0'),
  });
  return json({ runs });
});

// Get run
addRoute('GET', '/runs/:id', async (_, params) => {
  const run = storage.getTestRun(params.id);
  if (!run) return error('Run not found', 404);
  return json({ run });
});

// =============================================================================
// Execution - Multi-Igor Coordination
// =============================================================================

interface ExecutionPlan {
  targetId: string;
  projectId: string;
  runId: string;
  igors: IgorTask[];
}

interface IgorTask {
  id: string;
  type: 'ui' | 'db' | 'api' | 'logs';
  watcher: WatcherDef;
  config: object;
}

// Execute target with multi-Igor coordination
addRoute('POST', '/execute/:targetId', async (req, params) => {
  const target = storage.getTarget(params.targetId);
  if (!target) return error('Target not found', 404);

  const project = storage.getProject(target.projectId);
  if (!project) return error('Project not found', 404);

  // Create test run record
  const run = storage.createTestRun({
    targetId: target.id,
    projectId: target.projectId,
    status: 'pending',
    startedAt: new Date(),
    triggeredBy: 'manual',
    watcherStates: {},
    assertionResults: [],
    artifacts: [],
  });

  log('info', `Starting execution of target: ${target.name}`, { runId: run.id, targetId: target.id });

  // Build Igor tasks from watchers
  const igors: IgorTask[] = target.watchers.map((watcher, i) => ({
    id: `igor-${run.id}-${i}`,
    type: watcher.type,
    watcher,
    config: buildIgorConfig(watcher, project, target),
  }));

  // Update run to running
  storage.updateTestRun(run.id, { status: 'running' });

  // Dispatch to coordinator (async - don't wait)
  executeWithCoordination(run, target, project, igors).catch(err => {
    log('error', `Execution failed: ${err.message}`, { runId: run.id });
    storage.updateTestRun(run.id, {
      status: 'error',
      completedAt: new Date(),
      error: {
        message: err.message,
        stack: err.stack,
        phase: 'execution',
      },
    });
  });

  return json({
    runId: run.id,
    status: 'started',
    igors: igors.length,
    message: `Executing target "${target.name}" with ${igors.length} Igor(s)`,
  }, 202);
});

function buildIgorConfig(watcher: WatcherDef, project: Project, target: Target): object {
  switch (watcher.type) {
    case 'ui':
      return {
        baseUrl: project.baseUrl,
        capture: watcher.capture,
        trigger: target.trigger,
      };

    case 'db':
      return {
        connection: project.connections.db,
        query: watcher.query,
        params: watcher.params,
        subscribe: watcher.subscribe,
      };

    case 'api':
      return {
        connection: project.connections.api,
        endpoint: watcher.endpoint,
        method: watcher.method,
        captureFields: watcher.captureFields,
      };

    case 'logs':
      return {
        connection: project.connections.logs,
        pattern: watcher.pattern,
        source: watcher.source,
      };

    default:
      return {};
  }
}

async function executeWithCoordination(
  run: TestRun,
  target: Target,
  project: Project,
  igors: IgorTask[]
): Promise<void> {
  const startTime = Date.now();
  const watcherStates: Record<string, { before: unknown; after: unknown; events?: unknown[] }> = {};

  try {
    // Phase 1: Capture "before" state from all watchers
    log('info', 'Phase 1: Capturing before state', { runId: run.id });
    for (const igor of igors) {
      const beforeState = await captureWatcherState(igor, 'before');
      watcherStates[igor.watcher.id] = { before: beforeState, after: null };
    }

    // Phase 2: Execute trigger
    log('info', 'Phase 2: Executing trigger', { runId: run.id, triggerType: target.trigger.type });
    await executeTrigger(target.trigger, project);

    // Phase 3: Wait for settle time
    log('info', `Phase 3: Settling for ${target.settleTimeMs}ms`, { runId: run.id });
    await new Promise(r => setTimeout(r, target.settleTimeMs));

    // Phase 4: Capture "after" state from all watchers
    log('info', 'Phase 4: Capturing after state', { runId: run.id });
    for (const igor of igors) {
      const afterState = await captureWatcherState(igor, 'after');
      watcherStates[igor.watcher.id].after = afterState;
    }

    // Phase 5: Evaluate assertions
    log('info', 'Phase 5: Evaluating assertions', { runId: run.id });
    const assertionResults = evaluateAssertions(target.assertions, watcherStates);

    // Determine final status
    const allPassed = assertionResults.every(r => r.passed);
    const hasErrors = assertionResults.some(r => r.message?.includes('Error'));
    const status = hasErrors ? 'error' : allPassed ? 'passed' : 'failed';

    // Update run with results
    const durationMs = Date.now() - startTime;
    storage.updateTestRun(run.id, {
      status,
      completedAt: new Date(),
      durationMs,
      watcherStates,
      assertionResults,
    });

    log('info', `Execution completed: ${status}`, { runId: run.id, durationMs });

  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    storage.updateTestRun(run.id, {
      status: 'error',
      completedAt: new Date(),
      durationMs,
      watcherStates,
      error: {
        message: err.message,
        stack: err.stack,
        phase: 'execution',
      },
    });
    throw err;
  }
}

async function captureWatcherState(igor: IgorTask, phase: 'before' | 'after'): Promise<unknown> {
  const watcher = igor.watcher;

  switch (watcher.type) {
    case 'ui':
      // Use Frank for UI capture
      return captureUiState(watcher, igor.config);

    case 'db':
      // Execute query for DB capture
      return captureDbState(watcher, igor.config);

    case 'api':
      // Fetch endpoint for API capture
      return captureApiState(watcher, igor.config);

    case 'logs':
      // Read logs for logs capture
      return captureLogsState(watcher, igor.config);

    default:
      return null;
  }
}

async function captureUiState(watcher: any, config: any): Promise<object> {
  // Call Frank via Doctor
  try {
    const res = await fetch(`${DOCTOR_URL}/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: `Capture UI state: ${watcher.capture?.selectors?.join(', ') || 'screenshot'}`,
        url: config.baseUrl,
      }),
    });
    return await res.json();
  } catch (err: any) {
    return { error: err.message };
  }
}

async function captureDbState(watcher: any, config: any): Promise<object> {
  // TODO: Implement DB query execution
  return { query: watcher.query, result: 'TODO: implement DB watcher' };
}

async function captureApiState(watcher: any, config: any): Promise<object> {
  try {
    const baseUrl = config.connection?.baseUrl || '';
    const res = await fetch(`${baseUrl}${watcher.endpoint}`, {
      method: watcher.method || 'GET',
      headers: config.connection?.headers,
    });
    const data = await res.json();

    // Extract specific fields if requested
    if (watcher.captureFields?.length) {
      const captured: Record<string, unknown> = {};
      for (const field of watcher.captureFields) {
        captured[field] = getByPath(data, field);
      }
      return captured;
    }
    return data;
  } catch (err: any) {
    return { error: err.message };
  }
}

async function captureLogsState(watcher: any, config: any): Promise<object> {
  // TODO: Implement log capture
  return { pattern: watcher.pattern, result: 'TODO: implement logs watcher' };
}

function getByPath(obj: any, path: string): unknown {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

async function executeTrigger(trigger: TriggerDef, project: Project): Promise<void> {
  switch (trigger.type) {
    case 'click':
      await fetch(`${DOCTOR_URL}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: `Click on "${trigger.selector || trigger.text}"`,
          url: project.baseUrl,
        }),
      });
      break;

    case 'navigate':
      await fetch(`${DOCTOR_URL}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: `Navigate to ${trigger.url}`,
          url: trigger.url,
        }),
      });
      break;

    case 'api':
      const apiUrl = project.connections.api?.baseUrl || project.baseUrl;
      await fetch(`${apiUrl}${trigger.endpoint}`, {
        method: trigger.method,
        headers: {
          'Content-Type': 'application/json',
          ...trigger.headers,
        },
        body: trigger.body ? JSON.stringify(trigger.body) : undefined,
      });
      break;

    case 'event':
      // For manual triggers, just continue
      break;

    case 'cron':
      // Cron triggers are handled by scheduler
      break;
  }
}

function evaluateAssertions(
  assertions: any[],
  watcherStates: Record<string, { before: unknown; after: unknown }>
): TestRun['assertionResults'] {
  const results: TestRun['assertionResults'] = [];

  for (const assertion of assertions) {
    try {
      const leftValue = resolveValue(assertion.left, watcherStates);
      const rightValue = resolveValue(assertion.right, watcherStates);
      const passed = evaluateOperator(leftValue, assertion.op, rightValue);

      results.push({
        assertionId: assertion.id,
        passed,
        leftValue,
        rightValue,
        message: passed ? undefined : `Expected ${assertion.op}: got ${JSON.stringify(leftValue)} vs ${JSON.stringify(rightValue)}`,
      });
    } catch (err: any) {
      results.push({
        assertionId: assertion.id,
        passed: false,
        leftValue: null,
        rightValue: null,
        message: `Error: ${err.message}`,
      });
    }
  }

  return results;
}

function resolveValue(ref: any, watcherStates: Record<string, any>): unknown {
  if (ref.type === 'literal') {
    return ref.value;
  }

  if (ref.type === 'ref') {
    const state = watcherStates[ref.watcher];
    if (!state) return undefined;

    const data = ref.timing === 'before' ? state.before : state.after;
    return getByPath(data, ref.path);
  }

  return undefined;
}

function evaluateOperator(left: unknown, op: string, right: unknown): boolean {
  switch (op) {
    case 'eq':
      return JSON.stringify(left) === JSON.stringify(right);
    case 'neq':
      return JSON.stringify(left) !== JSON.stringify(right);
    case 'contains':
      return String(left).includes(String(right));
    case 'not_contains':
      return !String(left).includes(String(right));
    case 'matches':
      return new RegExp(String(right)).test(String(left));
    case 'gt':
      return Number(left) > Number(right);
    case 'lt':
      return Number(left) < Number(right);
    case 'gte':
      return Number(left) >= Number(right);
    case 'lte':
      return Number(left) <= Number(right);
    case 'exists':
      return left !== undefined && left !== null;
    case 'not_exists':
      return left === undefined || left === null;
    case 'changed':
      return left !== right;
    case 'unchanged':
      return left === right;
    default:
      return false;
  }
}

// =============================================================================
// Health Check
// =============================================================================

addRoute('GET', '/health', async () => {
  return json({
    status: 'healthy',
    service: 'hub',
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// Server
// =============================================================================

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Match route
  const match = matchRoute(method, path);
  if (!match) {
    return json({ error: 'Not found', path }, 404);
  }

  try {
    const response = await match.handler(req, match.params);
    // Add CORS headers to response
    for (const [key, value] of Object.entries(corsHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  } catch (err: any) {
    log('error', `Handler error: ${err.message}`, { path, method });
    return error(`Internal error: ${err.message}`, 500);
  }
}

// Initialize storage
storage.initStorage();

log('info', `Hub API server starting on port ${PORT}`);

const server = Bun.serve({
  port: PORT,
  fetch: handleRequest,
});

log('info', `Hub API server listening on http://localhost:${PORT}`);
log('info', 'Endpoints: /projects, /targets, /runs, /execute/:targetId');
