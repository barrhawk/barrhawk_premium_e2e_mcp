#!/usr/bin/env bun
/**
 * THE DOCTOR - Port 7001
 *
 * The mind of the tripartite architecture.
 * Plans tests, orchestrates execution, adapts to failures.
 *
 * Responsibilities:
 * - Interpret test intent
 * - Generate execution plans
 * - Send plans to Igor(s)
 * - Receive results and adapt
 * - Learn from experiencegained/
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { spawn } from 'child_process';
import path from 'path';
import { BridgeClient } from '../shared/client.js';
import { BridgeMessage, ComponentHealth, generateId } from '../shared/types.js';
import { validateIntent, validatePlan, validateUrl, PlanStep as ValidatedPlanStep } from '../shared/validation.js';
import { createLogger } from '../shared/logger.js';
import { getExperienceManager, ExperienceManager } from '../shared/experience.js';
import { selectToolsForIntent, ToolDefinition, ToolSelection } from '../shared/tool-registry.js';

// =============================================================================
// VERSION CANARY - CHANGE THIS ON EVERY DEPLOY
// =============================================================================
const DOCTOR_VERSION = '2026-01-30-v17-frank-restart-sync';

// =============================================================================
// Configuration
// =============================================================================
const PORT = parseInt(process.env.DOCTOR_PORT || '7001');
const BRIDGE_URL = process.env.BRIDGE_URL || 'ws://localhost:7000';
const BRIDGE_AUTH_TOKEN = process.env.BRIDGE_AUTH_TOKEN || '';

// CORS Configuration
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
const CORS_ENABLED = ALLOWED_ORIGINS.length > 0;

// Plan Limits
const MAX_ACTIVE_PLANS = parseInt(process.env.MAX_ACTIVE_PLANS || '100');

// Bridge Reconnection
const BRIDGE_RECONNECT_MAX_ATTEMPTS = parseInt(process.env.BRIDGE_RECONNECT_MAX_ATTEMPTS || '10');
const BRIDGE_RECONNECT_BASE_MS = parseInt(process.env.BRIDGE_RECONNECT_BASE_MS || '1000');
const BRIDGE_RECONNECT_MAX_MS = parseInt(process.env.BRIDGE_RECONNECT_MAX_MS || '30000');

// Rate Limiting Configuration
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000');  // 1 minute
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '60');  // 60 requests per window
const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED !== 'false';  // Enabled by default

// =============================================================================
// Rate Limiter
// =============================================================================
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old rate limit entries periodically
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 60000;  // 1 minute
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, entry] of rateLimitStore) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitStore.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[Doctor] Cleaned up ${cleaned} old rate limit entries. Active: ${rateLimitStore.size}`);
  }
}, RATE_LIMIT_CLEANUP_INTERVAL_MS);

function getClientIdentifier(req: IncomingMessage): string {
  // Use X-Forwarded-For if behind proxy, otherwise use socket address
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim();
    return ip;
  }
  return req.socket.remoteAddress || 'unknown';
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

function checkRateLimit(clientId: string): RateLimitResult {
  if (!RATE_LIMIT_ENABLED) {
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS, resetAt: Date.now() + RATE_LIMIT_WINDOW_MS };
  }

  const now = Date.now();
  let entry = rateLimitStore.get(clientId);

  // Start new window if none exists or window expired
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry = { count: 0, windowStart: now };
  }

  entry.count++;
  rateLimitStore.set(clientId, entry);

  const remaining = Math.max(0, RATE_LIMIT_MAX_REQUESTS - entry.count);
  const resetAt = entry.windowStart + RATE_LIMIT_WINDOW_MS;

  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((resetAt - now) / 1000);
    return { allowed: false, remaining: 0, resetAt, retryAfter };
  }

  return { allowed: true, remaining, resetAt };
}

function addRateLimitHeaders(res: ServerResponse, result: RateLimitResult): void {
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));
  if (result.retryAfter !== undefined) {
    res.setHeader('Retry-After', result.retryAfter);
  }
}

// =============================================================================
// Backoff Helpers
// =============================================================================
function calculateBackoff(attempt: number): number {
  const exponential = BRIDGE_RECONNECT_BASE_MS * Math.pow(2, attempt);
  const capped = Math.min(exponential, BRIDGE_RECONNECT_MAX_MS);
  // Add 20% jitter to prevent thundering herd
  const jitter = capped * 0.2 * (Math.random() * 2 - 1);
  return Math.max(BRIDGE_RECONNECT_BASE_MS / 2, Math.round(capped + jitter));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// State
// =============================================================================
const startTime = Date.now();
const activePlans = new Map<string, PlanState>();
let plansRejectedDueToLimit = 0;

// Branching plan tracking
interface BranchingPlanState {
  id: string;
  intent: string;
  branchDescription: string;
  routePlanIds: string[];
  routeResults: Map<string, { success: boolean; result?: unknown; error?: string }>;
  status: 'pending' | 'executing' | 'completed' | 'partial';
  createdAt: Date;
  completedAt?: Date;
}

const branchingPlans = new Map<string, BranchingPlanState>();

// TTL for completed/failed plans (1 hour)
const PLAN_TTL_MS = parseInt(process.env.PLAN_TTL_MS || '3600000');
// Cleanup interval (5 minutes)
const PLAN_CLEANUP_INTERVAL_MS = parseInt(process.env.PLAN_CLEANUP_INTERVAL_MS || '300000');

interface PlanStep {
  action: string;
  params: Record<string, unknown>;
  timeout?: number;
  retries?: number;
}

interface Plan {
  id: string;
  intent: string;
  steps: PlanStep[];
  createdAt: Date;
  expectedOutcome?: string | null;  // For verification
}

interface PlanState {
  plan: Plan;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  currentStep: number;
  results: unknown[];
  errors: string[];
  completedAt?: Date;
}

// =============================================================================
// Plan Cleanup (Memory Leak Prevention)
// =============================================================================
function cleanupOldPlans(): void {
  const now = Date.now();
  let cleaned = 0;

  for (const [planId, state] of activePlans) {
    // Only cleanup completed or failed plans
    if (state.status === 'completed' || state.status === 'failed') {
      const completedTime = state.completedAt?.getTime() || state.plan.createdAt.getTime();
      if (now - completedTime > PLAN_TTL_MS) {
        activePlans.delete(planId);
        cleaned++;
      }
    }
  }

  if (cleaned > 0) {
    // Logger not available yet at module load, will be configured after
    console.log(`[Doctor] Cleaned up ${cleaned} old plans. Active: ${activePlans.size}`);
  }
}

// Start cleanup interval
setInterval(cleanupOldPlans, PLAN_CLEANUP_INTERVAL_MS);

// =============================================================================
// Bridge Client
// =============================================================================
const bridge = new BridgeClient({
  componentId: 'doctor',
  version: DOCTOR_VERSION,
  bridgeUrl: BRIDGE_URL,
  authToken: BRIDGE_AUTH_TOKEN,
});

// =============================================================================
// Logger
// =============================================================================
const logger = createLogger({
  component: 'doctor',
  version: DOCTOR_VERSION,
  minLevel: (process.env.LOG_LEVEL as any) || 'INFO',
  pretty: process.env.LOG_FORMAT !== 'json',
});

// =============================================================================
// Experience Manager (Learning from past runs)
// =============================================================================
const EXPERIENCE_DIR = process.env.EXPERIENCE_DIR || '/home/raptor/federal/barrhawk_e2e_premium_mcp/experiencegained';
const experience = getExperienceManager(EXPERIENCE_DIR);

// =============================================================================
// Failure→Create Flow: Ask Frank to create tools when Igor fails
// =============================================================================

// Configuration
const FRANK_TOOL_CREATION_ENABLED = process.env.FRANK_TOOL_CREATION_ENABLED !== 'false';
const FAILURE_THRESHOLD_FOR_TOOL = parseInt(process.env.FAILURE_THRESHOLD_FOR_TOOL || '2');

// Metrics for observability
interface FrankMetrics {
  toolCreationRequests: number;
  toolCreationSuccesses: number;
  toolCreationFailures: number;
  failurePatternsTracked: number;
  toolsCreatedTotal: number;
  avgCreationLatencyMs: number;
  lastRequestAt?: Date;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  creationLatencies: number[];  // Last 100 latencies for avg calculation
}

const frankMetrics: FrankMetrics = {
  toolCreationRequests: 0,
  toolCreationSuccesses: 0,
  toolCreationFailures: 0,
  failurePatternsTracked: 0,
  toolsCreatedTotal: 0,
  avgCreationLatencyMs: 0,
  creationLatencies: [],
};

function updateMetricsLatency(latencyMs: number): void {
  frankMetrics.creationLatencies.push(latencyMs);
  // Keep only last 100
  if (frankMetrics.creationLatencies.length > 100) {
    frankMetrics.creationLatencies.shift();
  }
  // Recalculate average
  frankMetrics.avgCreationLatencyMs = Math.round(
    frankMetrics.creationLatencies.reduce((a, b) => a + b, 0) / frankMetrics.creationLatencies.length
  );
}

// Track failure patterns that might benefit from a new tool
interface FailurePattern {
  action: string;
  errorPattern: string;
  selector?: string;
  url?: string;
  occurrences: number;
  firstSeen: Date;
  lastSeen: Date;
  planIds: string[];
  toolRequested: boolean;
  toolCreated?: string;  // Tool name if created
}

const failurePatterns = new Map<string, FailurePattern>();

// Track pending tool creation requests
interface PendingToolRequest {
  requestId: string;
  planId: string;
  stepIndex: number;
  failurePatternKey: string;
  toolName: string;
  createdAt: Date;
}

const pendingToolRequests = new Map<string, PendingToolRequest>();

// Error patterns that suggest a tool could help
const TOOL_WORTHY_ERROR_PATTERNS = [
  { pattern: /element not found|selector.*not found|no element/i, toolType: 'smart_selector' },
  { pattern: /timeout|timed out|waiting for/i, toolType: 'wait_helper' },
  { pattern: /navigation|page.*load|network/i, toolType: 'network_helper' },
  { pattern: /scroll|viewport|visible/i, toolType: 'visibility_helper' },
  { pattern: /iframe|frame|shadow/i, toolType: 'frame_handler' },
  { pattern: /popup|modal|dialog|overlay/i, toolType: 'popup_handler' },
  { pattern: /captcha|recaptcha|challenge/i, toolType: 'captcha_handler' },
  { pattern: /date|calendar|picker/i, toolType: 'date_picker' },
  { pattern: /dropdown|select|combobox/i, toolType: 'dropdown_handler' },
  { pattern: /upload|file.*input/i, toolType: 'file_upload' },
];

/**
 * Generate a unique key for a failure pattern
 */
function getFailurePatternKey(action: string, error: string, selector?: string): string {
  // Normalize error message (remove specific values)
  const normalizedError = error
    .replace(/["'].*?["']/g, '""')  // Remove quoted strings
    .replace(/\d+/g, 'N')           // Replace numbers
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .slice(0, 100);                 // Limit length

  return `${action}:${selector || ''}:${normalizedError}`;
}

/**
 * Analyze if a failure could benefit from a new tool
 */
function analyzeFailureForToolCreation(
  action: string,
  error: string,
  selector?: string,
  url?: string
): { worthy: boolean; toolType?: string; reason?: string } {
  // Check against known patterns
  for (const { pattern, toolType } of TOOL_WORTHY_ERROR_PATTERNS) {
    if (pattern.test(error)) {
      return { worthy: true, toolType, reason: `Error matches ${toolType} pattern` };
    }
  }

  // Check if it's a selector-related failure
  if (action === 'click' || action === 'type') {
    if (error.includes('selector') || error.includes('element')) {
      return { worthy: true, toolType: 'smart_selector', reason: 'Selector failure' };
    }
  }

  return { worthy: false };
}

/**
 * Generate tool code based on failure type
 */
function generateToolCode(
  toolType: string,
  context: { action: string; selector?: string; url?: string; error: string }
): { code: string; description: string; inputSchema: object } {
  switch (toolType) {
    case 'smart_selector':
      return {
        description: `Smart selector finder that tries multiple strategies to locate elements similar to: ${context.selector}`,
        code: `
          const strategies = [
            // Try original selector
            params.selector,
            // Try data-testid
            \`[data-testid*="\${params.hint}"]\`,
            // Try aria-label
            \`[aria-label*="\${params.hint}"]\`,
            // Try text content
            \`text=\${params.hint}\`,
            // Try partial ID match
            \`[id*="\${params.hint}"]\`,
            // Try class name
            \`[class*="\${params.hint}"]\`,
          ];

          for (const sel of strategies) {
            try {
              const { stdout, exitCode } = await exec(\`echo "Trying: \${sel}"\`);
              // In real implementation, this would query the page
              if (sel && sel.length > 0) {
                return { foundSelector: sel, strategy: 'heuristic' };
              }
            } catch (e) {
              continue;
            }
          }
          return { error: 'No selector found', triedStrategies: strategies.length };
        `,
        inputSchema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'Original selector that failed' },
            hint: { type: 'string', description: 'Text hint about what element to find' },
          },
          required: ['selector', 'hint'],
        },
      };

    case 'wait_helper':
      return {
        description: 'Enhanced waiting helper with multiple conditions and polling',
        code: `
          const maxWait = params.timeout || 10000;
          const interval = params.interval || 500;
          const start = Date.now();

          while (Date.now() - start < maxWait) {
            await sleep(interval);
            // Check condition (in real impl, would check page state)
            if (params.condition === 'ready') {
              return { waited: Date.now() - start, status: 'ready' };
            }
          }
          return { waited: maxWait, status: 'timeout' };
        `,
        inputSchema: {
          type: 'object',
          properties: {
            condition: { type: 'string', description: 'Condition to wait for' },
            timeout: { type: 'number', description: 'Max wait time in ms' },
            interval: { type: 'number', description: 'Polling interval in ms' },
          },
          required: ['condition'],
        },
      };

    case 'popup_handler':
      return {
        description: 'Handle popups, modals, and overlays that block interaction',
        code: `
          // Common popup dismissal patterns
          const dismissSelectors = [
            '[aria-label="Close"]',
            '.close-button',
            '.modal-close',
            'button[class*="close"]',
            '[data-dismiss="modal"]',
            '.popup-close',
            '#cookie-accept',
            '[class*="consent"] button',
          ];

          for (const sel of dismissSelectors) {
            log(\`Trying to dismiss with: \${sel}\`);
            // In real impl, would try clicking
          }

          return { dismissed: true, strategy: 'heuristic' };
        `,
        inputSchema: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['modal', 'cookie', 'overlay', 'any'], description: 'Type of popup' },
          },
        },
      };

    case 'dropdown_handler':
      return {
        description: 'Handle various dropdown/select implementations',
        code: `
          const selector = params.selector;
          const value = params.value;

          // Try native select first
          log('Trying native select...');

          // Try custom dropdown patterns
          const patterns = [
            \`\${selector} option[value="\${value}"]\`,
            \`\${selector} [data-value="\${value}"]\`,
            \`\${selector} [role="option"]:has-text("\${value}")\`,
          ];

          return { selected: value, method: 'heuristic' };
        `,
        inputSchema: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'Dropdown selector' },
            value: { type: 'string', description: 'Value to select' },
          },
          required: ['selector', 'value'],
        },
      };

    default:
      return {
        description: `Helper tool created for: ${context.error.slice(0, 50)}`,
        code: `
          log('Executing generic helper for: ${context.action}');
          return { action: '${context.action}', status: 'attempted' };
        `,
        inputSchema: {
          type: 'object',
          properties: {
            params: { type: 'object', description: 'Parameters for the action' },
          },
        },
      };
  }
}

// =============================================================================
// PHASE 2: Frank Tool Sync - Merge dynamic tools into Igor's tool bag
// =============================================================================

interface FrankDynamicTool {
  id: string;
  name: string;
  description: string;
  status: string;
  invocations: number;
  successRate: number;
}

let frankDynamicTools: FrankDynamicTool[] = [];
let frankToolsSyncedAt = 0;
const FRANK_TOOLS_SYNC_INTERVAL = 30000; // Sync every 30 seconds

/**
 * Sync tools from Frankenstein
 */
async function syncToolsFromFrank(): Promise<void> {
  try {
    const response = await fetch('http://localhost:7003/tools');
    if (!response.ok) {
      logger.warn('Failed to fetch Frank tools', { status: response.status });
      return;
    }

    const data = await response.json() as { tools: FrankDynamicTool[] };
    frankDynamicTools = data.tools || [];
    frankToolsSyncedAt = Date.now();

    logger.info(`Synced ${frankDynamicTools.length} tools from Frank`, {
      tools: frankDynamicTools.map(t => t.name),
    });
  } catch (err) {
    logger.warn('Could not sync Frank tools', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Get Frank dynamic tools as ToolDefinitions for Igor
 */
function getFrankToolsForIgor(): Array<{ name: string; description: string; inputSchema: object }> {
  return frankDynamicTools.map(t => ({
    name: `frank_${t.name}`,
    description: `[Frank Dynamic] ${t.description}`,
    inputSchema: { type: 'object', properties: {} },
  }));
}

// =============================================================================
// PHASE 4: Frank Restart - Restart Frankenstein after tool creation
// =============================================================================

const FRANK_PATH = path.join(import.meta.dir, '../frankenstein/index.ts');
const BUN_PATH = process.env.BUN_PATH || `${process.env.HOME}/.bun/bin/bun`;

let isRestartingFrank = false;

/**
 * Wait for Frank to disconnect from Bridge
 */
async function waitForFrankDisconnect(timeout: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch('http://localhost:7003/health');
      if (!response.ok) {
        return true; // Frank is down
      }
      const health = await response.json() as { bridgeConnected?: boolean };
      if (!health.bridgeConnected) {
        return true;
      }
    } catch {
      return true; // Connection error = Frank is down
    }
    await sleep(100);
  }
  logger.warn('Frank did not disconnect in time');
  return false;
}

/**
 * Wait for Frank to reconnect
 */
async function waitForFrankConnect(timeout: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch('http://localhost:7003/health');
      if (response.ok) {
        const health = await response.json() as { bridgeConnected?: boolean };
        if (health.bridgeConnected) {
          return true;
        }
      }
    } catch {
      // Not ready yet
    }
    await sleep(200);
  }
  return false;
}

/**
 * Restart Frankenstein to load new tools
 */
async function restartFrank(reason: string): Promise<boolean> {
  if (isRestartingFrank) {
    logger.warn('Frank restart already in progress');
    return false;
  }

  isRestartingFrank = true;
  logger.info(`Restarting Frankenstein: ${reason}`);

  try {
    // Tell Frank to shutdown gracefully
    bridge.sendTo('frankenstein', 'shutdown' as any, { reason });

    // Wait for disconnect
    await waitForFrankDisconnect(5000);

    // Start new Frank process
    logger.info(`Spawning new Frankenstein: ${BUN_PATH} run ${FRANK_PATH}`);

    const frank = spawn(BUN_PATH, ['run', FRANK_PATH], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH}`,
      },
    });

    frank.unref();

    logger.info(`Frankenstein spawned with PID ${frank.pid}`);

    // Wait for reconnect
    const reconnected = await waitForFrankConnect(15000);

    if (reconnected) {
      logger.info('Frankenstein reconnected successfully');

      // Resync tools from new instance
      await syncToolsFromFrank();

      return true;
    } else {
      logger.error('Frankenstein did not reconnect after restart');
      return false;
    }
  } catch (err) {
    logger.error('Failed to restart Frank', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  } finally {
    isRestartingFrank = false;
  }
}

/**
 * Request Frank to create a tool for a failure pattern
 */
function requestToolCreation(
  failureKey: string,
  pattern: FailurePattern,
  planId: string,
  stepIndex: number
): void {
  if (!FRANK_TOOL_CREATION_ENABLED) {
    logger.debug('Tool creation disabled, skipping Frank request');
    return;
  }

  const analysis = analyzeFailureForToolCreation(
    pattern.action,
    pattern.errorPattern,
    pattern.selector,
    pattern.url
  );

  if (!analysis.worthy) {
    logger.debug('Failure not worthy of tool creation', { failureKey, reason: 'no matching pattern' });
    return;
  }

  const toolName = `auto_${analysis.toolType}_${Date.now().toString(36)}`;
  const toolSpec = generateToolCode(analysis.toolType!, {
    action: pattern.action,
    selector: pattern.selector,
    url: pattern.url,
    error: pattern.errorPattern,
  });

  const requestId = generateId();

  // Track the pending request
  pendingToolRequests.set(requestId, {
    requestId,
    planId,
    stepIndex,
    failurePatternKey: failureKey,
    toolName,
    createdAt: new Date(),
  });

  // Mark pattern as having a tool requested
  pattern.toolRequested = true;

  // Update metrics
  frankMetrics.toolCreationRequests++;
  frankMetrics.lastRequestAt = new Date();
  frankMetrics.failurePatternsTracked = failurePatterns.size;

  logger.info(`🔧 Requesting Frank to create tool: ${toolName}`, {
    toolType: analysis.toolType,
    reason: analysis.reason,
    failureKey,
    planId,
    stepIndex,
    metricsRequests: frankMetrics.toolCreationRequests,
  });

  // Send tool creation request to Frankenstein
  bridge.sendTo('frankenstein', 'tool.create', {
    name: toolName,
    description: toolSpec.description,
    code: toolSpec.code,
    inputSchema: toolSpec.inputSchema,
    author: 'doctor-auto',
  }, requestId);
}

// =============================================================================
// Route Detection & Branching
// =============================================================================

interface RouteDefinition {
  id: string;           // e.g., 'boy', 'girl', 'admin', 'user'
  name: string;         // Human-readable: 'Male Flow', 'Female Flow'
  selector?: string;    // What to click to take this route
  value?: string;       // What to type/select
  conditions?: Record<string, unknown>;  // Route-specific params
}

interface BranchPoint {
  description: string;  // e.g., 'gender selection', 'user type'
  routes: RouteDefinition[];
  parallel: boolean;    // Should we run all routes in parallel?
}

// Known branching patterns (will be enhanced by experience)
const KNOWN_BRANCH_PATTERNS: Array<{
  pattern: RegExp;
  branches: BranchPoint;
}> = [
  {
    pattern: /\b(boy|girl|male|female|gender)\b/i,
    branches: {
      description: 'gender selection',
      routes: [
        { id: 'boy', name: 'Male Flow', selector: '[value="male"], [value="boy"], #male, #boy', value: 'male' },
        { id: 'girl', name: 'Female Flow', selector: '[value="female"], [value="girl"], #female, #girl', value: 'female' },
      ],
      parallel: true,
    },
  },
  {
    pattern: /\b(admin|user|guest)\b.*\b(admin|user|guest)\b/i,
    branches: {
      description: 'user type selection',
      routes: [
        { id: 'admin', name: 'Admin Flow', value: 'admin' },
        { id: 'user', name: 'User Flow', value: 'user' },
        { id: 'guest', name: 'Guest Flow', value: 'guest' },
      ],
      parallel: true,
    },
  },
  {
    pattern: /\b(a\/b|variant|split)\s*(test)?\b/i,
    branches: {
      description: 'A/B variant testing',
      routes: [
        { id: 'variant-a', name: 'Variant A' },
        { id: 'variant-b', name: 'Variant B' },
      ],
      parallel: true,
    },
  },
];

function detectBranchPoints(intent: string): BranchPoint[] {
  const detected: BranchPoint[] = [];

  for (const { pattern, branches } of KNOWN_BRANCH_PATTERNS) {
    if (pattern.test(intent)) {
      detected.push(branches);
      logger.info(`Detected branch point: ${branches.description}`, {
        routes: branches.routes.map(r => r.id),
      });
    }
  }

  return detected;
}

// =============================================================================
// Multi-Igor Support
// =============================================================================

interface IgorInstance {
  id: string;              // e.g., 'igor', 'igor-boy', 'igor-girl'
  version: string;
  status: 'idle' | 'busy' | 'unknown';
  currentPlanId: string | null;
  plansCompleted: number;
  plansFailed: number;
  lastSeen: Date;
  registeredAt: Date;
  route?: string;          // Which route this Igor is assigned to
  routeName?: string;      // Human-readable route name
}

const igorInstances = new Map<string, IgorInstance>();
let nextIgorRobin = 0;  // For round-robin load balancing

// Default Igor (always assumed to exist for backwards compatibility)
igorInstances.set('igor', {
  id: 'igor',
  version: 'unknown',
  status: 'unknown',
  currentPlanId: null,
  plansCompleted: 0,
  plansFailed: 0,
  lastSeen: new Date(),
  registeredAt: new Date(),
});

function registerIgor(id: string, version: string): void {
  const existing = igorInstances.get(id);
  if (existing) {
    existing.version = version;
    existing.lastSeen = new Date();
    existing.status = 'idle';
    logger.info(`Igor updated: ${id} (v${version})`);
  } else {
    igorInstances.set(id, {
      id,
      version,
      status: 'idle',
      currentPlanId: null,
      plansCompleted: 0,
      plansFailed: 0,
      lastSeen: new Date(),
      registeredAt: new Date(),
    });
    logger.info(`Igor registered: ${id} (v${version})`);
  }
}

function unregisterIgor(id: string): void {
  if (id !== 'igor') {  // Never remove default Igor
    igorInstances.delete(id);
    logger.info(`Igor unregistered: ${id}`);
  }
}

function getAvailableIgor(): IgorInstance | null {
  // Get all idle Igors
  const idleIgors = Array.from(igorInstances.values()).filter(
    igor => igor.status === 'idle' || igor.status === 'unknown'
  );

  if (idleIgors.length === 0) {
    return null;
  }

  // Round-robin selection among idle Igors
  nextIgorRobin = (nextIgorRobin + 1) % idleIgors.length;
  return idleIgors[nextIgorRobin];
}

function markIgorBusy(id: string, planId: string): void {
  const igor = igorInstances.get(id);
  if (igor) {
    igor.status = 'busy';
    igor.currentPlanId = planId;
    igor.lastSeen = new Date();
  }
}

function markIgorIdle(id: string, success: boolean): void {
  const igor = igorInstances.get(id);
  if (igor) {
    igor.status = 'idle';
    igor.currentPlanId = null;
    igor.lastSeen = new Date();
    if (success) {
      igor.plansCompleted++;
    } else {
      igor.plansFailed++;
    }
  }
}

function getIgorStats(): {
  total: number;
  idle: number;
  busy: number;
  totalPlansCompleted: number;
  totalPlansFailed: number;
  instances: Array<{
    id: string;
    status: string;
    currentPlanId: string | null;
    plansCompleted: number;
    uptime: number;
    route?: string;
  }>;
} {
  const instances = Array.from(igorInstances.values());
  let totalCompleted = 0;
  let totalFailed = 0;

  for (const igor of instances) {
    totalCompleted += igor.plansCompleted;
    totalFailed += igor.plansFailed;
  }

  return {
    total: instances.length,
    idle: instances.filter(i => i.status === 'idle').length,
    busy: instances.filter(i => i.status === 'busy').length,
    totalPlansCompleted: totalCompleted,
    totalPlansFailed: totalFailed,
    instances: instances.map(i => ({
      id: i.id,
      status: i.status,
      currentPlanId: i.currentPlanId,
      plansCompleted: i.plansCompleted,
      uptime: Date.now() - i.registeredAt.getTime(),
      route: i.route,
    })),
  };
}

// =============================================================================
// Route-Specific Igor Spawning
// =============================================================================

/**
 * Request Igor to spawn a route-specific worker
 * Returns the expected Igor ID for this route
 */
function requestRouteIgor(route: RouteDefinition): string {
  const igorId = `igor-${route.id}`;

  // Check if we already have this route Igor
  if (igorInstances.has(igorId)) {
    const existing = igorInstances.get(igorId)!;
    existing.route = route.id;
    existing.routeName = route.name;
    logger.info(`Route Igor already exists: ${igorId} (${route.name})`);
    return igorId;
  }

  // Create a placeholder - Igor will register itself when spawned
  igorInstances.set(igorId, {
    id: igorId,
    version: 'pending',
    status: 'unknown',
    currentPlanId: null,
    plansCompleted: 0,
    plansFailed: 0,
    lastSeen: new Date(),
    registeredAt: new Date(),
    route: route.id,
    routeName: route.name,
  });

  // Request Igor pool to spawn a new instance via Bridge
  bridge.sendTo('igor', 'igor.spawn' as any, {
    id: igorId,
    route: route.id,
    routeName: route.name,
    conditions: route.conditions,
  });

  logger.info(`Requested route Igor: ${igorId} (${route.name})`);
  return igorId;
}

/**
 * Get or spawn Igors for all routes in a branch point
 */
function ensureRouteIgors(branchPoint: BranchPoint): string[] {
  const igorIds: string[] = [];

  for (const route of branchPoint.routes) {
    const igorId = requestRouteIgor(route);
    igorIds.push(igorId);
  }

  logger.info(`Ensured ${igorIds.length} route Igors for: ${branchPoint.description}`, {
    igors: igorIds,
  });

  return igorIds;
}

/**
 * Find an Igor specifically for a route, or any available if route not specified
 */
function getIgorForRoute(routeId?: string): IgorInstance | null {
  if (routeId) {
    const routeIgor = igorInstances.get(`igor-${routeId}`);
    if (routeIgor && (routeIgor.status === 'idle' || routeIgor.status === 'unknown')) {
      return routeIgor;
    }
  }

  // Fall back to any available Igor
  return getAvailableIgor();
}

// =============================================================================
// Plan Generation
// =============================================================================

interface RoutePlan extends Plan {
  route?: RouteDefinition;
  parentPlanId?: string;  // If this is part of a branching plan
}

interface BranchingPlanResult {
  parentId: string;
  intent: string;
  branchPoints: BranchPoint[];
  routePlans: RoutePlan[];
  parallel: boolean;
}

/**
 * Generate a plan for a specific route variation
 */
function generateRoutePlan(intent: string, route: RouteDefinition, parentPlanId: string): RoutePlan {
  const id = generateId();
  logger.info(`Generating route plan: ${route.name} (${route.id})`, { parentPlanId });

  const steps: PlanStep[] = [];

  // Always start with launching browser
  steps.push({ action: 'launch', params: { headless: true } });

  // Parse URL from intent
  const urlMatch = intent.match(/navigate to (\S+)/i) || intent.match(/go to (\S+)/i);
  let targetUrl: string | undefined;

  if (urlMatch) {
    targetUrl = urlMatch[1];
    const timeout = experience.getRecommendedTimeout('navigate', targetUrl);
    steps.push({
      action: 'navigate',
      params: { url: targetUrl },
      timeout,
      retries: 2,
    });
  }

  // Add route-specific selection step
  if (route.selector) {
    steps.push({
      action: 'click',
      params: { selector: route.selector },
      timeout: experience.getRecommendedTimeout('click', targetUrl),
    });
  } else if (route.value) {
    // Try to find and select the route value
    steps.push({
      action: 'click',
      params: { text: route.value },
      timeout: experience.getRecommendedTimeout('click', targetUrl),
    });
  }

  // Continue with remaining intent steps (after branch selection)
  // ... additional parsing would go here

  // Screenshot at the end
  steps.push({ action: 'screenshot', params: { routeId: route.id } });
  steps.push({ action: 'close', params: {} });

  return {
    id,
    intent: `${intent} [ROUTE: ${route.name}]`,
    steps,
    createdAt: new Date(),
    route,
    parentPlanId,
  };
}

/**
 * Detect branches and generate all route plans
 */
function generateBranchingPlan(intent: string): BranchingPlanResult | null {
  const branchPoints = detectBranchPoints(intent);

  if (branchPoints.length === 0) {
    return null;  // No branching detected
  }

  const parentId = generateId();
  const routePlans: RoutePlan[] = [];

  // For now, handle the first branch point
  // (multi-level branching can be added later)
  const mainBranch = branchPoints[0];

  logger.info(`🔀 Branching detected: ${mainBranch.description}`, {
    routes: mainBranch.routes.map(r => r.id),
    parallel: mainBranch.parallel,
  });

  // Generate a plan for each route
  for (const route of mainBranch.routes) {
    const routePlan = generateRoutePlan(intent, route, parentId);
    routePlans.push(routePlan);
  }

  // Ensure we have Igors for each route
  if (mainBranch.parallel) {
    ensureRouteIgors(mainBranch);
  }

  return {
    parentId,
    intent,
    branchPoints,
    routePlans,
    parallel: mainBranch.parallel,
  };
}

function generatePlan(intent: string, explicitUrl?: string): Plan {
  const id = generateId();
  logger.info( `Generating plan for intent: "${intent}"${explicitUrl ? ` with URL: ${explicitUrl}` : ''}`);

  // Simple intent parsing - this will be enhanced with Claude later
  const steps: PlanStep[] = [];

  // Always start with launching browser (headless: false for debugging cookies)
  steps.push({ action: 'launch', params: { headless: false } });

  // Parse URL from intent or use explicit URL
  const urlMatch = intent.match(/navigate to (\S+)/i) || intent.match(/go to (\S+)/i);
  let targetUrl: string | undefined = explicitUrl;

  if (urlMatch) {
    targetUrl = urlMatch[1];
  }

  // Add navigate step if we have a URL
  if (targetUrl) {

    // Get recommended timeout from experience
    const timeout = experience.getRecommendedTimeout('navigate', targetUrl);
    steps.push({
      action: 'navigate',
      params: { url: targetUrl },
      timeout,
      retries: 2,  // Navigation often needs retries
    });

    // Check if we know this site
    const sitePattern = experience.findSitePattern(targetUrl);
    if (sitePattern) {
      logger.info(`Found site pattern for ${sitePattern.name}`, { selectors: Object.keys(sitePattern.knownSelectors) });
    }
  }

  // ==========================================================================
  // FORM-AWARE PATTERNS (Item #2: More explicit action parsing)
  // ==========================================================================

  // LOGIN PATTERN: "login as X with password Y" or "login with email X password Y"
  // Note: password capture excludes comma to handle "password X, then..." patterns
  const loginMatch = intent.match(/login (?:as |with email )?["']?([^\s"']+)["']? (?:with )?password ["']?([^\s"',]+)["']?/i);
  if (loginMatch) {
    const email = loginMatch[1];
    const password = loginMatch[2];
    logger.info(`Detected login pattern: ${email}`);

    // Wait for page to fully load before interacting with form
    steps.push({ action: 'wait', params: { ms: 1000 } });

    // Simplified selectors for login form
    steps.push({
      action: 'type',
      params: {
        selector: 'input[name="email"]',
        text: email,
        clear: true,
      },
      timeout: 5000,
    });
    steps.push({
      action: 'type',
      params: {
        selector: 'input[name="password"]',
        text: password,
        clear: true,
      },
      timeout: 5000,
    });
    // Debug screenshot before clicking login
    steps.push({ action: 'screenshot', params: {} });

    steps.push({
      action: 'click',
      params: {
        selector: 'button[type="submit"]',
        waitForNavigation: true,  // Wait for form submission redirect
      },
      timeout: 10000,
    });
    // Brief wait for page to settle after login redirect
    steps.push({ action: 'wait', params: { ms: 500 } });
  }

  // POST SUBMISSION PATTERN: "submit/create/post titled X with content Y to subreddit Z"
  const postMatch = intent.match(/(?:submit|create|post).*?(?:titled?|title) ["'](.+?)["'].*?(?:content|body|text) ["'](.+?)["'](?:.*?(?:to|in) (?:the )?(?:r\/)?(\w+))?/i);
  if (postMatch) {
    const title = postMatch[1];
    const content = postMatch[2];
    const subreddit = postMatch[3];
    logger.info(`Detected post submission pattern: "${title}" to ${subreddit || 'default'}`);

    // Wait for login redirect to complete
    steps.push({ action: 'wait', params: { ms: 3000 } });

    // Take screenshot to verify login success
    steps.push({ action: 'screenshot', params: {} });

    // Click Submit Post link from home page (preserves session)
    steps.push({
      action: 'click',
      params: { text: 'Submit Post', waitForNavigation: true },
      timeout: 10000,
    });
    steps.push({ action: 'wait', params: { ms: 500 } });

    // Fill title
    steps.push({
      action: 'type',
      params: {
        selector: 'input[name="title"], input[id="title"], input[placeholder*="title" i]',
        text: title,
      },
      timeout: 5000,
    });

    // Fill content
    steps.push({
      action: 'type',
      params: {
        selector: 'textarea[name="content"], textarea[id="content"], textarea[placeholder*="content" i], textarea',
        text: content,
      },
      timeout: 5000,
    });

    // Select subreddit if specified (uses select dropdown)
    if (subreddit) {
      steps.push({
        action: 'select',
        params: {
          selector: 'select[name="subreddit"]',
          value: subreddit,
        },
        timeout: 5000,
      });
    }

    // Click submit button
    steps.push({
      action: 'click',
      params: {
        selector: 'button[type="submit"], input[type="submit"]',
        text: 'Submit',
        waitForNavigation: true,
      },
      timeout: 10000,
    });
    steps.push({ action: 'wait', params: { ms: 1000 } });
  }

  // APPROVAL PATTERN: "approve post/the post titled X"
  const approveMatch = intent.match(/approve (?:the )?(?:post )?(?:titled )?["']?(.+?)["']?$/i);
  if (approveMatch && !postMatch) {  // Don't match if it's a post submission
    const postTitle = approveMatch[1];
    logger.info(`Detected approval pattern: "${postTitle}"`);

    // Go to mod queue
    steps.push({
      action: 'click',
      params: { text: 'Mod Queue' },
      timeout: 5000,
    });
    steps.push({ action: 'wait', params: { ms: 500 } });

    // Click approve on the specific post
    steps.push({
      action: 'click',
      params: { text: 'Approve' },  // Will click first Approve button - could be improved
      timeout: 5000,
    });
    steps.push({ action: 'wait', params: { ms: 500 } });
  }

  // ==========================================================================
  // END FORM-AWARE PATTERNS
  // ==========================================================================

  // Parse click actions
  const clickMatch = intent.match(/click (?:on )?["'](.+?)["']/i) || intent.match(/click (?:on )?(\S+)/i);
  if (clickMatch) {
    const target = clickMatch[1];
    let selector: string | undefined;

    // Check if it's already a selector
    if (target.startsWith('#') || target.startsWith('.') || target.startsWith('[')) {
      selector = target;
    } else if (targetUrl) {
      // Try to find a known selector for this element description
      selector = experience.getSiteSelector(targetUrl, target.toLowerCase());

      if (!selector) {
        // Try experience-based selector lookup
        selector = experience.findBestSelector(target, targetUrl) || undefined;
      }
    }

    if (selector) {
      // Warn if this is a known bad selector
      if (targetUrl && experience.isKnownBadSelector(selector, targetUrl)) {
        logger.warn(`Using selector that has failed before: ${selector}`);
      }
      steps.push({
        action: 'click',
        params: { selector },
        timeout: experience.getRecommendedTimeout('click', targetUrl),
      });
    } else {
      // Fall back to text-based click
      steps.push({
        action: 'click',
        params: { text: target },
        timeout: experience.getRecommendedTimeout('click', targetUrl),
      });
    }
  }

  // Parse type actions
  const typeMatch = intent.match(/type ["'](.+?)["'] into (.+)/i);
  if (typeMatch) {
    const text = typeMatch[1];
    let selector = typeMatch[2];

    // Try to find a known selector
    if (targetUrl && !selector.startsWith('#') && !selector.startsWith('.')) {
      const knownSelector = experience.getSiteSelector(targetUrl, selector.toLowerCase());
      if (knownSelector) {
        selector = knownSelector;
      }
    }

    steps.push({
      action: 'type',
      params: { selector, text },
      timeout: experience.getRecommendedTimeout('type', targetUrl),
    });
  }

  // ==========================================================================
  // VERIFICATION STEPS (Item #1 & #3: Plan verification & screenshot assertions)
  // ==========================================================================

  // Build expected outcome based on detected patterns
  let expectedOutcome: string | null = null;

  if (loginMatch) {
    expectedOutcome = 'User should be logged in. Page should show dashboard, profile, or logged-in state. Should NOT show login form.';
  } else if (postMatch) {
    expectedOutcome = `Post titled "${postMatch[1]}" should be created. Page should show success message, confirmation, or redirect to the new post. Should NOT show form errors.`;
  } else if (approveMatch) {
    expectedOutcome = `Post should be approved. Status should change from pending to approved. Should show success indication.`;
  }

  // Add verification step if we have an expected outcome
  if (expectedOutcome) {
    steps.push({
      action: 'verify',
      params: {
        type: 'smart_assert',
        expected: expectedOutcome,
        intent: intent,
        captureScreenshot: true,
      },
      timeout: 10000,
    });
  }

  // Always take a screenshot at the end
  steps.push({ action: 'screenshot', params: {} });

  // Close browser
  steps.push({ action: 'close', params: {} });

  const plan: Plan = {
    id,
    intent,
    steps,
    createdAt: new Date(),
    expectedOutcome,  // Store for later reference
  };

  logger.info(`Generated plan ${id} with ${steps.length} steps (experience-enhanced)`);
  return plan;
}

// =============================================================================
// Plan Execution
// =============================================================================
interface PlanSubmitResult {
  id: string;
  assignedTo?: string;
}

/**
 * Submit a branching plan - spawns multiple route-specific Igors
 */
async function submitBranchingPlan(branchingResult: BranchingPlanResult): Promise<{
  parentId: string;
  routes: Array<{ routeId: string; planId: string; assignedTo: string }>;
} | { error: string; status: number }> {
  const routeSubmissions: Array<{ routeId: string; planId: string; assignedTo: string }> = [];

  // Create branching plan state
  const branchState: BranchingPlanState = {
    id: branchingResult.parentId,
    intent: branchingResult.intent,
    branchDescription: branchingResult.branchPoints[0]?.description || 'unknown',
    routePlanIds: branchingResult.routePlans.map(p => p.id),
    routeResults: new Map(),
    status: 'pending',
    createdAt: new Date(),
  };
  branchingPlans.set(branchingResult.parentId, branchState);

  logger.info(`🔀 Submitting branching plan: ${branchingResult.parentId}`, {
    routes: branchingResult.routePlans.map(p => p.route?.id),
    parallel: branchingResult.parallel,
  });

  // Submit each route plan to its designated Igor
  for (const routePlan of branchingResult.routePlans) {
    const routeId = routePlan.route?.id || 'unknown';
    const targetIgor = getIgorForRoute(routeId);

    if (!targetIgor) {
      logger.warn(`No Igor available for route: ${routeId}, queuing...`);
      // Could implement queuing here
      continue;
    }

    // Create plan state
    const state: PlanState = {
      plan: routePlan,
      status: 'pending',
      currentStep: 0,
      results: [],
      errors: [],
    };
    activePlans.set(routePlan.id, state);

    // Mark Igor as busy and send plan
    markIgorBusy(targetIgor.id, routePlan.id);

    // === TOOL BAG: Select relevant tools based on route intent ===
    // PHASE 2: Include both static tools and Frank dynamic tools
    const routeToolSelection = selectToolsForIntent(routePlan.intent, 12);
    const routeFrankTools = getFrankToolsForIgor();

    const routeToolBag = [
      ...routeToolSelection.tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
      ...routeFrankTools,  // Include Frank's dynamic tools
    ];

    bridge.sendTo(targetIgor.id as any, 'plan.submit', {
      id: routePlan.id,
      steps: routePlan.steps,
      route: routePlan.route,
      parentPlanId: routePlan.parentPlanId,
      toolBag: routeToolBag,
      toolSelectionReasoning: `${routeToolSelection.reasoning} + ${routeFrankTools.length} Frank tools`,
    });

    routeSubmissions.push({
      routeId,
      planId: routePlan.id,
      assignedTo: targetIgor.id,
    });

    logger.info(`📤 Route plan ${routePlan.id} submitted to ${targetIgor.id}`, {
      route: routeId,
      routeName: routePlan.route?.name,
      toolBagSize: routeToolBag.length,
    });
  }

  branchState.status = 'executing';

  return {
    parentId: branchingResult.parentId,
    routes: routeSubmissions,
  };
}

async function submitPlan(plan: Plan): Promise<PlanSubmitResult | { error: string; status: number }> {
  // Check max plans limit
  const executingPlans = Array.from(activePlans.values()).filter(
    p => p.status === 'pending' || p.status === 'executing'
  ).length;

  if (executingPlans >= MAX_ACTIVE_PLANS) {
    plansRejectedDueToLimit++;
    logger.warn('Plan rejected: too many active plans', {
      active: executingPlans,
      max: MAX_ACTIVE_PLANS,
      planId: plan.id,
    });
    return {
      error: `Too many active plans (${executingPlans}/${MAX_ACTIVE_PLANS}). Try again later.`,
      status: 503,
    };
  }

  // Find an available Igor (multi-Igor load balancing)
  const targetIgor = getAvailableIgor();

  if (!targetIgor) {
    logger.warn('Plan rejected: no available Igor instances', { planId: plan.id });
    return {
      error: 'No available Igor instances. All are busy.',
      status: 503,
    };
  }

  const state: PlanState = {
    plan,
    status: 'pending',
    currentStep: 0,
    results: [],
    errors: [],
  };

  activePlans.set(plan.id, state);

  // Mark Igor as busy and send plan
  markIgorBusy(targetIgor.id, plan.id);

  // === TOOL BAG: Select relevant tools based on intent ===
  // This keeps Igor's context window lighter by only giving it the tools it needs
  // PHASE 2: Include both static tools and Frank dynamic tools
  const toolSelection = selectToolsForIntent(plan.intent, 12);  // Leave room for Frank tools
  const frankTools = getFrankToolsForIgor();

  const toolBag = [
    ...toolSelection.tools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
    ...frankTools,  // Include Frank's dynamic tools
  ];

  logger.info(`🧰 Tool bag for plan ${plan.id}: ${toolBag.length} tools (${toolSelection.tools.length} static + ${frankTools.length} Frank)`, {
    intent: plan.intent.substring(0, 50),
    toolCount: toolBag.length,
    categories: toolSelection.categories,
    staticTools: toolSelection.tools.map(t => t.name),
    frankTools: frankTools.map(t => t.name),
  });

  bridge.sendTo(targetIgor.id as any, 'plan.submit', {
    id: plan.id,
    steps: plan.steps,
    toolBag,  // Static tools + Frank dynamic tools
    toolSelectionReasoning: `${toolSelection.reasoning} + ${frankTools.length} Frank dynamic tools`,
  });

  logger.info(`Plan ${plan.id} submitted to ${targetIgor.id}`, {
    activePlans: activePlans.size,
    igorStats: getIgorStats(),
    toolBagSize: toolBag.length,
  });

  return { id: plan.id, assignedTo: targetIgor.id };
}

// =============================================================================
// Message Handlers
// =============================================================================

// Track pending plan.execute requests waiting for completion
const pendingExecuteRequests = new Map<string, {
  resolve: (result: unknown) => void;
  reject: (error: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
  sourceId: string;
  messageId: string;
}>();

// Handle plan.execute from mcp-frank (frank_execute tool)
bridge.on('plan.execute' as any, async (message: BridgeMessage) => {
  const { intent, url, timeout: requestTimeout } = message.payload as {
    intent: string;
    url?: string;
    timeout?: number;
  };
  const sourceId = message.source;
  const messageId = message.id;

  logger.info(`📥 plan.execute received from ${sourceId}`, { intent, url, messageId });

  try {
    // Validate intent
    const intentValidation = validateIntent(intent);
    if (!intentValidation.valid) {
      bridge.sendTo(sourceId as any, 'plan.execute.error' as any, {
        error: intentValidation.error,
      }, messageId);
      return;
    }

    const sanitizedIntent = intentValidation.sanitized!;

    // Prepend URL context if provided
    const fullIntent = url ? `Navigate to ${url} and then: ${sanitizedIntent}` : sanitizedIntent;

    // Generate plan
    const plan = generatePlan(fullIntent);

    // Validate plan
    const planValidation = validatePlan(plan.steps);
    if (!planValidation.valid) {
      bridge.sendTo(sourceId as any, 'plan.execute.error' as any, {
        error: 'Generated plan failed validation',
        validationErrors: planValidation.errors,
      }, messageId);
      return;
    }

    // Submit plan to Igor
    const submitResult = await submitPlan(plan);

    if ('error' in submitResult) {
      bridge.sendTo(sourceId as any, 'plan.execute.error' as any, {
        error: submitResult.error,
      }, messageId);
      return;
    }

    logger.info(`📤 plan.execute: plan ${plan.id} submitted, waiting for completion`, {
      planId: plan.id,
      assignedTo: submitResult.assignedTo,
    });

    // Wait for the plan to complete
    const effectiveTimeout = requestTimeout || 120000;

    const completionResult = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingExecuteRequests.delete(plan.id);
        reject(new Error(`Plan execution timeout after ${effectiveTimeout}ms`));
      }, effectiveTimeout);

      pendingExecuteRequests.set(plan.id, {
        resolve,
        reject,
        timeout: timer,
        sourceId,
        messageId,
      });
    });

    // Send success response back to mcp-frank
    bridge.sendTo(sourceId as any, 'plan.execute.result' as any, completionResult, messageId);

  } catch (err: any) {
    logger.error(`plan.execute failed: ${err.message}`, { intent, error: err.message });
    bridge.sendTo(sourceId as any, 'plan.execute.error' as any, {
      error: err.message || 'Plan execution failed',
    }, messageId);
  }
});

bridge.on('plan.accepted', (message: BridgeMessage) => {
  const { planId } = message.payload as { planId: string };
  const correlationId = message.correlationId;
  const state = activePlans.get(planId);
  if (state) {
    state.status = 'executing';
    logger.info(`Plan ${planId} accepted by Igor`, { planId, correlationId });
  }
});

bridge.on('plan.rejected', (message: BridgeMessage) => {
  const { planId, reason } = message.payload as { planId?: string; reason: string };
  const correlationId = message.correlationId;
  logger.warn(`Plan rejected: ${reason}`, { planId, reason, correlationId });
});

bridge.on('step.started', (message: BridgeMessage) => {
  const { planId, stepIndex, action } = message.payload as { planId: string; stepIndex: number; action: string };
  const correlationId = message.correlationId;
  const state = activePlans.get(planId);
  if (state) {
    state.currentStep = stepIndex;
    logger.info(`Plan ${planId} step ${stepIndex + 1}: ${action} started`, { planId, stepIndex, action, correlationId });
  }
});

bridge.on('step.completed', (message: BridgeMessage) => {
  const { planId, stepIndex, result, duration } = message.payload as {
    planId: string;
    stepIndex: number;
    result: unknown;
    duration?: number;
  };
  const correlationId = message.correlationId;
  const state = activePlans.get(planId);
  if (state) {
    state.results[stepIndex] = result;
    logger.info(`Plan ${planId} step ${stepIndex + 1} completed`, { planId, stepIndex, correlationId });

    // Record experience from successful step
    const step = state.plan.steps[stepIndex];
    if (step && duration) {
      // Record timing
      const url = step.params.url as string | undefined;
      experience.recordTiming(step.action, duration, url);

      // Record selector success
      if (step.action === 'click' || step.action === 'type') {
        const selector = step.params.selector as string | undefined;
        const text = step.params.text as string | undefined;
        const navStep = state.plan.steps.find(s => s.action === 'navigate');
        const pageUrl = navStep?.params.url as string | undefined;

        if (selector && pageUrl) {
          experience.recordSelectorSuccess(selector, text || step.action, pageUrl);
        }
      }
    }
  }
});

// Helper to serialize errors properly (handles objects, Error instances, etc.)
function serializeErrorForStorage(error: unknown): string {
  if (error === null || error === undefined) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'object') {
    // Try to extract useful info from error objects
    const obj = error as Record<string, unknown>;
    if (obj.message) return String(obj.message);
    if (obj.error) return String(obj.error);
    if (obj.code && obj.details) return `[${obj.code}] ${obj.details}`;
    try {
      return JSON.stringify(error, null, 0);
    } catch {
      return '[Complex error object]';
    }
  }
  return String(error);
}

bridge.on('step.failed', (message: BridgeMessage) => {
  const { planId, stepIndex, error } = message.payload as { planId: string; stepIndex: number; error: unknown };
  const correlationId = message.correlationId;
  const state = activePlans.get(planId);
  const errorStr = serializeErrorForStorage(error);
  if (state) {
    state.errors.push(`Step ${stepIndex + 1}: ${errorStr}`);
    logger.error(`Plan ${planId} step ${stepIndex + 1} failed: ${error}`, { planId, stepIndex, error, correlationId });

    // Record experience from failed step
    const step = state.plan.steps[stepIndex];
    if (step) {
      // Record selector failure
      if (step.action === 'click' || step.action === 'type') {
        const selector = step.params.selector as string | undefined;
        const text = step.params.text as string | undefined;
        const navStep = state.plan.steps.find(s => s.action === 'navigate');
        const pageUrl = navStep?.params.url as string | undefined;

        if (selector && pageUrl) {
          experience.recordSelectorFailure(selector, text || step.action, pageUrl);
        }
      }

      // Record error pattern
      experience.recordError(
        errorStr,
        `Step ${step.action} failed`,
        'Check selector or element availability'
      );

      // =================================================================
      // Failure→Create Flow: Track failure and potentially ask Frank
      // =================================================================
      const selector = step.params.selector as string | undefined;
      const navStep = state.plan.steps.find(s => s.action === 'navigate');
      const pageUrl = navStep?.params.url as string | undefined;

      // Generate failure pattern key
      const failureKey = getFailurePatternKey(step.action, errorStr, selector);

      // Get or create failure pattern entry
      let pattern = failurePatterns.get(failureKey);
      if (!pattern) {
        pattern = {
          action: step.action,
          errorPattern: errorStr,
          selector,
          url: pageUrl,
          occurrences: 0,
          firstSeen: new Date(),
          lastSeen: new Date(),
          planIds: [],
          toolRequested: false,
        };
        failurePatterns.set(failureKey, pattern);
      }

      // Update pattern
      pattern.occurrences++;
      pattern.lastSeen = new Date();
      if (!pattern.planIds.includes(planId)) {
        pattern.planIds.push(planId);
      }

      logger.debug(`Failure pattern tracked: ${failureKey}`, {
        occurrences: pattern.occurrences,
        threshold: FAILURE_THRESHOLD_FOR_TOOL,
        toolRequested: pattern.toolRequested,
      });

      // Check if we should request a tool from Frank
      if (pattern.occurrences >= FAILURE_THRESHOLD_FOR_TOOL && !pattern.toolRequested) {
        logger.info(`🔧 Failure threshold reached, requesting tool from Frank`, {
          failureKey,
          occurrences: pattern.occurrences,
          action: step.action,
          selector,
        });

        requestToolCreation(failureKey, pattern, planId, stepIndex);
      }
    }
  }
});

// Handle tool creation responses from Frankenstein
bridge.on('tool.created' as any, async (message: BridgeMessage) => {
  const { id, name, status } = message.payload as { id: string; name: string; status: string };
  const requestId = message.correlationId;

  // Find the pending request
  const pending = requestId ? pendingToolRequests.get(requestId) : undefined;

  // Calculate latency if we have the request
  if (pending) {
    const latencyMs = Date.now() - pending.createdAt.getTime();
    updateMetricsLatency(latencyMs);

    // Update success metrics
    frankMetrics.toolCreationSuccesses++;
    frankMetrics.toolsCreatedTotal++;
    frankMetrics.lastSuccessAt = new Date();

    logger.info(`🔧 Frank created tool: ${name}`, {
      toolId: id,
      status,
      requestId,
      latencyMs,
      metricsSuccesses: frankMetrics.toolCreationSuccesses,
    });

    // Update failure pattern with created tool
    const pattern = failurePatterns.get(pending.failurePatternKey);
    if (pattern) {
      pattern.toolCreated = name;
      logger.info(`Tool ${name} linked to failure pattern`, {
        failureKey: pending.failurePatternKey,
        planId: pending.planId,
        stepIndex: pending.stepIndex,
      });
    }

    // Clean up pending request
    pendingToolRequests.delete(requestId);

    // Notify that a tool is now available for this failure type
    bridge.sendTo('broadcast', 'event.console' as any, {
      level: 'info',
      text: `[Doctor] New tool available: ${name} - created to help with ${pattern?.action} failures`,
    });

    // PHASE 4: Restart Frank to load new tool, then retry the plan
    logger.info(`🔄 Restarting Frank to load new tool: ${name}`);
    const restarted = await restartFrank(`tool-created: ${name}`);

    if (restarted) {
      // Check if the original plan is still active and can be retried
      const planState = activePlans.get(pending.planId);
      if (planState && planState.status === 'failed') {
        logger.info(`📤 Retrying plan ${pending.planId} with new tool: ${name}`);

        // Reset plan state for retry
        planState.status = 'pending';
        planState.currentStep = pending.stepIndex;
        planState.errors = [];

        // Get tool selection including new Frank tools
        const toolSelection = selectToolsForIntent(planState.plan.intent, 15);
        const frankTools = getFrankToolsForIgor();
        const toolBag = [
          ...toolSelection.tools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
          ...frankTools,
        ];

        // Resubmit to Igor with new tool
        const targetIgor = getAvailableIgor();
        if (targetIgor) {
          markIgorBusy(targetIgor.id, pending.planId);
          bridge.sendTo(targetIgor.id as any, 'plan.submit', {
            id: pending.planId,
            steps: planState.plan.steps,
            toolBag,
            toolSelectionReasoning: `Retry with new Frank tool: ${name}`,
          });
          logger.info(`📤 Plan ${pending.planId} resubmitted to ${targetIgor.id}`);
        }
      }
    }
  } else {
    logger.info(`🔧 Frank created tool (no pending request): ${name}`, { toolId: id, status });
  }
});

// Handle tool creation errors
bridge.on('tool.error' as any, (message: BridgeMessage) => {
  const { error, operation, name } = message.payload as { error: string; operation: string; name?: string };
  const requestId = message.correlationId;

  // Update failure metrics
  frankMetrics.toolCreationFailures++;
  frankMetrics.lastFailureAt = new Date();

  logger.error(`Frank tool operation failed: ${operation}`, {
    error,
    name,
    requestId,
    metricsFailures: frankMetrics.toolCreationFailures,
  });

  // Clean up pending request on error
  if (requestId && pendingToolRequests.has(requestId)) {
    const pending = pendingToolRequests.get(requestId)!;

    // Reset the toolRequested flag so we can try again later
    const pattern = failurePatterns.get(pending.failurePatternKey);
    if (pattern) {
      pattern.toolRequested = false;
    }

    pendingToolRequests.delete(requestId);
  }
});

bridge.on('step.retrying', (message: BridgeMessage) => {
  const { planId, stepIndex, retriesLeft, backoffMs, attemptNumber, frankToolUsed } = message.payload as {
    planId: string;
    stepIndex: number;
    retriesLeft: number;
    backoffMs: number;
    attemptNumber: number;
    frankToolUsed?: string;
  };
  const correlationId = message.correlationId;
  logger.info(`Plan ${planId} step ${stepIndex + 1} retrying`, {
    planId, stepIndex, attemptNumber, backoffMs, retriesLeft, correlationId, frankToolUsed,
  });
});

// Handle Frank tool usage reports from Igor
bridge.on('frank.tool.used' as any, (message: BridgeMessage) => {
  const { planId, stepIndex, toolId, toolName, result } = message.payload as {
    planId: string;
    stepIndex: number;
    toolId: string;
    toolName: string;
    result: unknown;
  };
  const correlationId = message.correlationId;

  logger.info(`🔧 Igor used Frank tool: ${toolName}`, {
    planId,
    stepIndex,
    toolId,
    result,
    correlationId,
  });

  // Track tool usage in experience
  experience.recordError(
    `Tool used: ${toolName}`,
    'Frank tool assisted with step failure',
    `Tool ${toolName} provided result: ${JSON.stringify(result).slice(0, 100)}`
  );
});

bridge.on('plan.completed', (message: BridgeMessage) => {
  const { planId, success } = message.payload as { planId: string; success: boolean };
  const correlationId = message.correlationId;
  const igorSource = message.source;  // Which Igor sent this
  const state = activePlans.get(planId);

  if (state) {
    state.status = success ? 'completed' : 'failed';
    state.completedAt = new Date();

    const routePlan = state.plan as RoutePlan;
    const routeId = routePlan.route?.id;
    const parentPlanId = routePlan.parentPlanId;

    logger.info(`Plan ${planId} ${success ? 'completed successfully' : 'failed'}`, {
      planId, success, correlationId, igor: igorSource, route: routeId,
    });

    // Resolve any pending plan.execute request waiting on this plan
    if (pendingExecuteRequests.has(planId)) {
      const pending = pendingExecuteRequests.get(planId)!;
      clearTimeout(pending.timeout);
      pendingExecuteRequests.delete(planId);

      const result = {
        planId,
        success,
        intent: state.plan.intent,
        steps: state.plan.steps.length,
        results: state.results,
        errors: state.errors,
        executedBy: igorSource,
      };

      logger.info(`📤 plan.execute: resolving request for plan ${planId}`, { success });
      pending.resolve(result);
    }

    // Mark the Igor as idle
    markIgorIdle(igorSource, success);

    // Record plan completion in experience
    experience.recordPlanCompletion(success);

    // 🔀 Aggregate route results if this is part of a branching plan
    if (parentPlanId && branchingPlans.has(parentPlanId)) {
      const branchState = branchingPlans.get(parentPlanId)!;

      // Record this route's result
      branchState.routeResults.set(routeId || planId, {
        success,
        result: state.results,
        error: state.errors.length > 0 ? state.errors.join('; ') : undefined,
      });

      // Check if all routes are complete
      const allComplete = branchState.routePlanIds.every(id => {
        const plan = activePlans.get(id);
        return plan?.status === 'completed' || plan?.status === 'failed';
      });

      if (allComplete) {
        const allSuccess = branchState.routePlanIds.every(id => {
          const plan = activePlans.get(id);
          return plan?.status === 'completed';
        });

        branchState.status = allSuccess ? 'completed' : 'partial';
        branchState.completedAt = new Date();

        logger.info(`🔀 Branching plan ${parentPlanId} completed`, {
          status: branchState.status,
          routes: Object.fromEntries(branchState.routeResults),
        });

        // Submit aggregated report to Bridge
        bridge.sendTo('bridge', 'report.submit' as any, {
          type: 'branching_plan_completed',
          planId: parentPlanId,
          correlationId,
          success: allSuccess,
          data: {
            intent: branchState.intent,
            branchDescription: branchState.branchDescription,
            routes: Object.fromEntries(branchState.routeResults),
            status: branchState.status,
          },
        });
      }
    }

    // Submit individual route report to Bridge
    const reportData = {
      type: success ? 'plan_completed' : 'plan_failed',
      planId,
      correlationId,
      success,
      data: {
        intent: state.plan.intent,
        steps: state.plan.steps.length,
        errors: state.errors,
        results: state.results,
        executedBy: igorSource,
        route: routeId,
        parentPlanId,
      },
    };

    bridge.sendTo('bridge', 'report.submit' as any, reportData);
  }
});

// Handle Igor registration announcements
bridge.on('version.announce' as any, (message: BridgeMessage) => {
  const { component, version } = message.payload as { component: string; version: string };
  if (component.startsWith('igor')) {
    registerIgor(component, version);
  }
});

// Handle Igor spawned confirmation
bridge.on('igor.spawned' as any, (message: BridgeMessage) => {
  const { id, route, port, pid, status } = message.payload as {
    id: string;
    route: string;
    port: number;
    pid: number;
    status: string;
  };

  logger.info(`✅ Route Igor spawned: ${id}`, { route, port, pid, status });

  // Update Igor instance with spawned details
  const igor = igorInstances.get(id);
  if (igor) {
    igor.status = 'idle';
    igor.version = `spawned-${route}`;
    igor.lastSeen = new Date();
    logger.info(`Igor ${id} ready for route: ${route}`);
  } else {
    // Register if not already tracked
    registerIgor(id, `spawned-${route}`);
    const newIgor = igorInstances.get(id);
    if (newIgor) {
      newIgor.route = route;
      newIgor.routeName = route;
    }
  }
});

// Handle Igor spawn failure
bridge.on('igor.spawn.failed' as any, (message: BridgeMessage) => {
  const { id, route, error } = message.payload as {
    id: string;
    route: string;
    error: string;
  };

  logger.error(`❌ Failed to spawn route Igor: ${id}`, { route, error });

  // Mark the placeholder as dead/unavailable
  const igor = igorInstances.get(id);
  if (igor) {
    igor.status = 'unknown';
  }

  // TODO: Could implement retry logic or fallback to default Igor
});

// Handle Igor exited (spawned Igor died)
bridge.on('igor.exited' as any, (message: BridgeMessage) => {
  const { id, route, exitCode } = message.payload as {
    id: string;
    route: string;
    exitCode: number;
  };

  logger.warn(`💀 Route Igor exited: ${id} (code: ${exitCode})`, { route });

  // Check if this Igor had an active plan
  const igor = igorInstances.get(id);
  if (igor && igor.currentPlanId) {
    const planState = activePlans.get(igor.currentPlanId);
    if (planState && planState.status === 'executing') {
      // Mark plan as failed due to Igor crash
      planState.status = 'failed';
      planState.errors.push(`Igor ${id} crashed with exit code ${exitCode}`);
      planState.completedAt = new Date();

      logger.error(`Plan ${igor.currentPlanId} failed due to Igor crash`, {
        planId: igor.currentPlanId,
        igor: id,
        exitCode,
      });

      // Check if this was part of a branching plan
      const routePlan = planState.plan as RoutePlan;
      if (routePlan.parentPlanId) {
        const branchState = branchingPlans.get(routePlan.parentPlanId);
        if (branchState) {
          branchState.routeResults.set(route || id, {
            success: false,
            error: `Igor crashed with exit code ${exitCode}`,
          });
        }
      }
    }
  }

  // Remove from instances or mark as dead
  if (id !== 'igor') {  // Don't remove default Igor
    igorInstances.delete(id);
    logger.info(`Removed dead Igor from pool: ${id}`);
  }
});

// =============================================================================
// Lightning Strike Feedback - Learn from Igor's thinking
// =============================================================================
bridge.on('igor.thought' as any, (message: BridgeMessage) => {
  const { planId, prompt, thought, context } = message.payload as {
    id?: string;
    planId?: string;
    prompt: string;
    thought: string;
    context?: { action?: string; error?: string };
  };

  logger.info(`🧠 Igor thought received`, {
    planId,
    promptLength: prompt.length,
    thoughtLength: thought.length,
    hasError: !!context?.error,
  });

  // If there was an error and Claude figured out a fix, record it in experience system
  if (context?.error && thought) {
    experience.recordError(
      context.error,
      `Igor was stuck on ${context.action || 'unknown action'}`,
      thought.substring(0, 500) // Store Claude's reasoning as the fix hint
    );

    logger.info(`📚 Recorded error pattern from Igor thought`, {
      action: context.action,
      errorPrefix: context.error.substring(0, 50),
    });
  }
});

// =============================================================================
// Health Check
// =============================================================================
function getHealth(): ComponentHealth & { planLimits: object; reconnection: object; experience: object; igors: object } {
  const executingPlans = Array.from(activePlans.values()).filter(
    p => p.status === 'pending' || p.status === 'executing'
  ).length;

  const expStats = experience.getStats();
  const igorStats = getIgorStats();

  return {
    status: 'healthy',
    version: DOCTOR_VERSION,
    uptime: Date.now() - startTime,
    pid: process.pid,
    bridgeConnected: bridge.isConnected(),
    planLimits: {
      active: executingPlans,
      max: MAX_ACTIVE_PLANS,
      rejectedDueToLimit: plansRejectedDueToLimit,
    },
    reconnection: {
      isReconnecting,
      currentAttempt: bridgeReconnectAttempts,
      maxAttempts: BRIDGE_RECONNECT_MAX_ATTEMPTS,
    },
    experience: {
      totalPlans: expStats.totalPlans,
      successRate: (expStats.successRate * 100).toFixed(1) + '%',
      knownSelectors: expStats.knownSelectors,
      knownSites: expStats.knownSites,
      knownErrors: expStats.knownErrors,
      experienceDir: EXPERIENCE_DIR,
    },
    igors: {
      total: igorStats.total,
      idle: igorStats.idle,
      busy: igorStats.busy,
      totalPlansCompleted: igorStats.totalPlansCompleted,
      totalPlansFailed: igorStats.totalPlansFailed,
    },
  };
}

// =============================================================================
// CORS Helpers
// =============================================================================
function getCorsHeaders(origin: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {};

  if (!CORS_ENABLED) {
    // No CORS restrictions - allow all (development mode)
    headers['Access-Control-Allow-Origin'] = '*';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    return headers;
  }

  // Check if origin is in allowed list
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    headers['Vary'] = 'Origin';
  }

  return headers;
}

function isOriginAllowed(origin: string | undefined): boolean {
  if (!CORS_ENABLED) return true;  // All origins allowed in dev mode
  if (!origin) return false;        // Block requests without Origin when CORS enabled
  return ALLOWED_ORIGINS.includes(origin);
}

// =============================================================================
// HTTP Server
// =============================================================================
const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = req.url || '/';
  const origin = req.headers.origin;
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  // Add CORS headers to all responses
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // Health check endpoint - exempt from rate limiting
  if (url === '/health' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'X-Version': DOCTOR_VERSION,
    });
    res.end(JSON.stringify({
      ...getHealth(),
      activePlans: activePlans.size,
      rateLimiting: RATE_LIMIT_ENABLED,
    }));
    return;
  }

  // Apply rate limiting to all non-health endpoints
  const clientId = getClientIdentifier(req);
  const rateLimitResult = checkRateLimit(clientId);
  addRateLimitHeaders(res, rateLimitResult);

  if (!rateLimitResult.allowed) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Too Many Requests',
      retryAfter: rateLimitResult.retryAfter,
      message: `Rate limit exceeded. Try again in ${rateLimitResult.retryAfter} seconds.`,
    }));
    logger.warn(`Rate limit exceeded for ${clientId}`);
    return;
  }

  if (url === '/plans' && req.method === 'GET') {
    const plans = Array.from(activePlans.values()).map(state => ({
      id: state.plan.id,
      intent: state.plan.intent,
      status: state.status,
      currentStep: state.currentStep,
      totalSteps: state.plan.steps.length,
      errors: state.errors,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(plans));
    return;
  }

  // Igor instances endpoint
  if (url === '/igors' && req.method === 'GET') {
    const stats = getIgorStats();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      summary: {
        total: stats.total,
        idle: stats.idle,
        busy: stats.busy,
        totalPlansCompleted: stats.totalPlansCompleted,
        totalPlansFailed: stats.totalPlansFailed,
      },
      instances: stats.instances,
    }));
    return;
  }

  // Branching plans endpoint
  if (url === '/branches' && req.method === 'GET') {
    const branches = Array.from(branchingPlans.values()).map(b => ({
      id: b.id,
      intent: b.intent,
      branchDescription: b.branchDescription,
      status: b.status,
      routePlanIds: b.routePlanIds,
      routeResults: Object.fromEntries(b.routeResults),
      createdAt: b.createdAt,
      completedAt: b.completedAt,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      total: branches.length,
      branches,
    }));
    return;
  }

  // Single branching plan details
  if (url.startsWith('/branches/') && req.method === 'GET') {
    const branchId = url.split('/')[2];
    const branch = branchingPlans.get(branchId);
    if (branch) {
      // Get status of each route plan
      const routeDetails = branch.routePlanIds.map(planId => {
        const planState = activePlans.get(planId);
        return {
          planId,
          status: planState?.status || 'unknown',
          currentStep: planState?.currentStep,
          totalSteps: planState?.plan.steps.length,
          errors: planState?.errors,
        };
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ...branch,
        routeResults: Object.fromEntries(branch.routeResults),
        routeDetails,
      }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Branching plan not found' }));
    }
    return;
  }

  // Frank failure patterns and tool creation status
  if (url === '/frank' && req.method === 'GET') {
    const patterns = Array.from(failurePatterns.entries()).map(([key, p]) => ({
      key,
      action: p.action,
      errorPattern: p.errorPattern.slice(0, 100),
      selector: p.selector,
      url: p.url,
      occurrences: p.occurrences,
      firstSeen: p.firstSeen,
      lastSeen: p.lastSeen,
      planIds: p.planIds,
      toolRequested: p.toolRequested,
      toolCreated: p.toolCreated,
    }));

    const pending = Array.from(pendingToolRequests.values()).map(p => ({
      requestId: p.requestId,
      planId: p.planId,
      stepIndex: p.stepIndex,
      toolName: p.toolName,
      createdAt: p.createdAt,
      failurePatternKey: p.failurePatternKey,
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      config: {
        enabled: FRANK_TOOL_CREATION_ENABLED,
        failureThreshold: FAILURE_THRESHOLD_FOR_TOOL,
      },
      metrics: {
        toolCreationRequests: frankMetrics.toolCreationRequests,
        toolCreationSuccesses: frankMetrics.toolCreationSuccesses,
        toolCreationFailures: frankMetrics.toolCreationFailures,
        successRate: frankMetrics.toolCreationRequests > 0
          ? `${((frankMetrics.toolCreationSuccesses / frankMetrics.toolCreationRequests) * 100).toFixed(1)}%`
          : 'N/A',
        toolsCreatedTotal: frankMetrics.toolsCreatedTotal,
        avgCreationLatencyMs: frankMetrics.avgCreationLatencyMs,
        failurePatternsTracked: frankMetrics.failurePatternsTracked,
        lastRequestAt: frankMetrics.lastRequestAt,
        lastSuccessAt: frankMetrics.lastSuccessAt,
        lastFailureAt: frankMetrics.lastFailureAt,
      },
      failurePatterns: {
        total: patterns.length,
        withTools: patterns.filter(p => p.toolCreated).length,
        pending: patterns.filter(p => p.toolRequested && !p.toolCreated).length,
        patterns,
      },
      pendingRequests: {
        total: pending.length,
        requests: pending,
      },
    }));
    return;
  }

  if (url === '/plan' && req.method === 'POST') {
    // Validate origin for mutation requests when CORS is enabled
    if (CORS_ENABLED && !isOriginAllowed(origin)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Cross-origin request blocked' }));
      logger.warn(`Blocked cross-origin POST from: ${origin || 'no-origin'}`);
      return;
    }

    const MAX_BODY_SIZE = 1024 * 1024; // 1MB

    // Check Content-Length header BEFORE reading body (DOS prevention)
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > MAX_BODY_SIZE) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Request body too large (max ${MAX_BODY_SIZE} bytes, got ${contentLength})` }));
      return;
    }

    let body = '';
    let bytesRead = 0;

    // Handle request errors (connection abort, etc.)
    req.on('error', (err) => {
      logger.error('Request stream error', err);
      if (!res.headersSent) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request stream error' }));
      }
    });

    req.on('data', (chunk: Buffer | string) => {
      bytesRead += chunk.length;
      // Double-check during streaming (in case Content-Length was wrong)
      if (bytesRead > MAX_BODY_SIZE) {
        req.destroy();
        if (!res.headersSent) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Request body too large' }));
        }
        return;
      }
      body += chunk;
    });

    req.on('end', async () => {
      try {
        const { intent, forceBranching, url: explicitUrl } = JSON.parse(body);

        // Validate intent
        const intentValidation = validateIntent(intent);
        if (!intentValidation.valid) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: intentValidation.error }));
          logger.warn( `Invalid intent rejected: ${intentValidation.error}`);
          return;
        }

        const sanitizedIntent = intentValidation.sanitized!;

        // 🔀 Check for branching scenarios (boy/girl, admin/user, etc.)
        const branchingResult = generateBranchingPlan(sanitizedIntent);

        if (branchingResult && (forceBranching !== false)) {
          // This is a branching scenario - spawn multiple Igors
          logger.info(`🔀 Branching plan detected: ${branchingResult.branchPoints[0]?.description}`, {
            routes: branchingResult.routePlans.map(p => p.route?.id),
          });

          const result = await submitBranchingPlan(branchingResult);

          if ('error' in result) {
            res.writeHead(result.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: result.error }));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            type: 'branching',
            parentPlanId: result.parentId,
            branchDescription: branchingResult.branchPoints[0]?.description,
            routes: result.routes,
            message: `🔀 Spawned ${result.routes.length} route-specific Igors`,
          }));
          return;
        }

        // Standard single-plan flow
        const plan = generatePlan(sanitizedIntent, explicitUrl);

        // Validate generated plan before submission
        const planValidation = validatePlan(plan.steps);
        if (!planValidation.valid) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Generated plan failed validation',
            validationErrors: planValidation.errors,
          }));
          logger.error( `Plan validation failed: ${planValidation.errors.join(', ')}`);
          return;
        }

        // Log warnings if any
        if (planValidation.warnings.length > 0) {
          logger.warn(`Plan warnings: ${planValidation.warnings.join(', ')}`);
        }

        const result = await submitPlan(plan);

        // Check if submission was rejected due to limits
        if ('error' in result) {
          res.writeHead(result.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result.error }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          type: 'standard',
          planId: result.id,
          steps: plan.steps.length,
          message: 'Plan submitted to Igor',
          warnings: planValidation.warnings.length > 0 ? planValidation.warnings : undefined,
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      }
    });
    return;
  }

  if (url.startsWith('/plan/') && req.method === 'GET') {
    const planId = url.split('/')[2];
    const state = activePlans.get(planId);
    if (state) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: state.plan.id,
        intent: state.plan.intent,
        status: state.status,
        currentStep: state.currentStep,
        totalSteps: state.plan.steps.length,
        steps: state.plan.steps,
        results: state.results,
        errors: state.errors,
      }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Plan not found' }));
    }
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

// =============================================================================
// Heartbeat
// =============================================================================
setInterval(() => {
  if (bridge.isConnected()) {
    bridge.sendHeartbeat();
  }
}, 5000);

// =============================================================================
// Bridge Reconnection
// =============================================================================
let bridgeReconnectAttempts = 0;
let isReconnecting = false;

async function connectWithRetry(): Promise<boolean> {
  for (let attempt = 0; attempt < BRIDGE_RECONNECT_MAX_ATTEMPTS; attempt++) {
    bridgeReconnectAttempts = attempt;
    const backoffMs = attempt > 0 ? calculateBackoff(attempt - 1) : 0;

    if (attempt > 0) {
      logger.info(`Bridge reconnection attempt ${attempt + 1}/${BRIDGE_RECONNECT_MAX_ATTEMPTS} in ${backoffMs}ms`);
      await sleep(backoffMs);
    }

    const connected = await bridge.connect();
    if (connected) {
      if (attempt > 0) {
        logger.info(`Bridge reconnected after ${attempt + 1} attempts`);
      }
      bridgeReconnectAttempts = 0;
      return true;
    }
  }

  logger.error(`Failed to connect to Bridge after ${BRIDGE_RECONNECT_MAX_ATTEMPTS} attempts`);
  return false;
}

// Monitor Bridge connection and reconnect if dropped
setInterval(async () => {
  if (!bridge.isConnected() && !isReconnecting) {
    isReconnecting = true;
    logger.warn('Bridge connection lost, attempting to reconnect...');
    await connectWithRetry();
    isReconnecting = false;
  }
}, 10000); // Check every 10 seconds

// =============================================================================
// Startup
// =============================================================================
async function start() {
  logger.info('='.repeat(60));
  logger.info(`THE DOCTOR - Starting version ${DOCTOR_VERSION}`);
  logger.info(`PID: ${process.pid}`);
  logger.info(`Port: ${PORT}`);
  logger.info(`Bridge: ${BRIDGE_URL}`);
  logger.info('='.repeat(60));

  // Log experience stats
  const expStats = experience.getStats();
  logger.info(`Experience loaded:`);
  logger.info(`  - Total plans: ${expStats.totalPlans}`);
  logger.info(`  - Success rate: ${(expStats.successRate * 100).toFixed(1)}%`);
  logger.info(`  - Known selectors: ${expStats.knownSelectors}`);
  logger.info(`  - Known sites: ${expStats.knownSites}`);
  logger.info(`  - Known errors: ${expStats.knownErrors}`);
  logger.info(`  - Data dir: ${EXPERIENCE_DIR}`);

  // Log Igor pool stats
  const igorStats = getIgorStats();
  logger.info(`Igor pool initialized:`);
  logger.info(`  - Instances: ${igorStats.total} (${igorStats.idle} idle, ${igorStats.busy} busy)`);
  logger.info(`  - Load balancing: round-robin`);

  // Log branching patterns
  logger.info(`Branch detection patterns:`);
  for (const { pattern, branches } of KNOWN_BRANCH_PATTERNS) {
    logger.info(`  - ${branches.description}: ${branches.routes.map(r => r.id).join(', ')}`);
  }

  // Start HTTP server
  httpServer.listen(PORT, () => {
    logger.info(`Endpoints:`);
    logger.info(`  - GET  /health     - Health status`);
    logger.info(`  - GET  /igors      - Igor instances`);
    logger.info(`  - GET  /plans      - Active plans`);
    logger.info(`  - GET  /branches   - Branching plans`);
    logger.info(`  - GET  /frank      - Frank tool creation status`);
    logger.info(`  - POST /plan       - Submit intent (auto-detects branches)`);
    logger.info(`  - GET  /plan/:id   - Get plan status`);
    logger.info(`  - GET  /branches/:id - Get branching plan details`);
  });

  // Log Frank tool creation config
  logger.info(`Frank tool creation: ${FRANK_TOOL_CREATION_ENABLED ? 'ENABLED' : 'DISABLED'}`);
  if (FRANK_TOOL_CREATION_ENABLED) {
    logger.info(`  - Failure threshold: ${FAILURE_THRESHOLD_FOR_TOOL} occurrences`);
    logger.info(`  - Patterns tracked: ${TOOL_WORTHY_ERROR_PATTERNS.length}`);
  }

  // Connect to Bridge with retry
  await connectWithRetry();

  // Initial Frank tool sync
  logger.info('Syncing tools from Frankenstein...');
  await syncToolsFromFrank();

  // Periodic Frank tool sync
  setInterval(async () => {
    if (Date.now() - frankToolsSyncedAt > FRANK_TOOLS_SYNC_INTERVAL) {
      await syncToolsFromFrank();
    }
  }, FRANK_TOOLS_SYNC_INTERVAL);

  logger.info('Doctor ready. Awaiting intents...');
}

start();

// =============================================================================
// Graceful Shutdown
// =============================================================================
function shutdown() {
  logger.info('Shutting down...');
  experience.destroy();  // Save experience data
  bridge.disconnect();
  httpServer.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
