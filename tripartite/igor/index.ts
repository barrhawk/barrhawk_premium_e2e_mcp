#!/usr/bin/env bun
/**
 * IGOR - Port 7002
 *
 * The FACE of automated processes in the tripartite architecture.
 *
 * Igor is the stable, reliable interface that:
 * - Receives work from Doctor (via Bridge) or external systems (via HTTP)
 * - Has a stable toolkit of proven tools
 * - Spawns and manages Frankenstein workers for dynamic/experimental work
 * - Queues work when all Franks are busy
 * - Exports successful Frank tools into the stable toolkit (igorification)
 *
 * Hierarchy: Igor (standard) -> Frankenstein (expendable, live-coded)
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { BridgeClient } from '../shared/client.js';
import { BridgeMessage, ComponentHealth, generateId } from '../shared/types.js';
import { Errors, serializeError, isRetryable, SerializedError } from '../shared/errors.js';
import { createLogger, startTimer } from '../shared/logger.js';
import { validatePlan } from '../shared/validation.js';
import { CircuitBreaker, CircuitOpenError } from '../shared/circuit-breaker.js';
import { stableToolkit, createToolContext } from './stable-toolkit.js';
import { frankManager } from './frank-manager.js';

// =============================================================================
// VERSION CANARY - CHANGE THIS ON EVERY DEPLOY
// =============================================================================
const IGOR_VERSION = '2026-01-25-v15-frank-integration';

// =============================================================================
// Configuration
// =============================================================================
const PORT = parseInt(process.env.IGOR_PORT || '7002');
const BRIDGE_URL = process.env.BRIDGE_URL || 'ws://localhost:7000';
const BRIDGE_AUTH_TOKEN = process.env.BRIDGE_AUTH_TOKEN || '';

// Route-specific configuration (for spawned Igors)
const IGOR_ID = process.env.IGOR_ID || 'igor';
const IGOR_ROUTE = process.env.IGOR_ROUTE || '';
const IGOR_ROUTE_NAME = process.env.IGOR_ROUTE_NAME || '';
const IGOR_ROUTE_CONDITIONS = process.env.IGOR_ROUTE_CONDITIONS
  ? JSON.parse(process.env.IGOR_ROUTE_CONDITIONS)
  : null;

// Circuit Breaker Configuration
const CIRCUIT_FAILURE_THRESHOLD = parseInt(process.env.CIRCUIT_FAILURE_THRESHOLD || '5');
const CIRCUIT_RESET_TIMEOUT = parseInt(process.env.CIRCUIT_RESET_TIMEOUT || '30000');

// Lightning Strike Configuration (dual-mode: dumb -> claude)
const LIGHTNING_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const LIGHTNING_MODEL = process.env.LIGHTNING_MODEL || 'claude-sonnet-4-20250514';
const LIGHTNING_AUTO_THRESHOLD = parseInt(process.env.LIGHTNING_AUTO_THRESHOLD || '3'); // failures before auto-strike
const LIGHTNING_ENABLED = process.env.LIGHTNING_ENABLED !== 'false';

// =============================================================================
// Lightning Strike System - Dual Mode Igor
// =============================================================================
type IgorMode = 'dumb' | 'claude';

interface LightningState {
  mode: IgorMode;
  struckAt?: Date;
  reason?: string;
  consecutiveFailures: number;
  totalStrikes: number;
  lastThought?: string;
  thinkingHistory: Array<{
    prompt: string;
    response: string;
    timestamp: Date;
  }>;
}

const lightningState: LightningState = {
  mode: 'dumb',
  consecutiveFailures: 0,
  totalStrikes: 0,
  thinkingHistory: [],
};

/**
 * Strike Igor with lightning - elevate from dumb to claude mode
 */
function lightningStrike(reason: string): void {
  if (!LIGHTNING_ENABLED) {
    logger.warn('⚡ Lightning strike requested but LIGHTNING_ENABLED=false');
    return;
  }

  if (!LIGHTNING_API_KEY) {
    logger.error('⚡ Lightning strike failed: ANTHROPIC_API_KEY not set');
    return;
  }

  if (lightningState.mode === 'claude') {
    logger.info('⚡ Already in Claude mode, no need to strike');
    return;
  }

  logger.info('⚡⚡⚡ LIGHTNING STRIKE! ⚡⚡⚡');
  logger.info(`   Reason: ${reason}`);
  logger.info(`   Igor is now THINKING...`);

  lightningState.mode = 'claude';
  lightningState.struckAt = new Date();
  lightningState.reason = reason;
  lightningState.totalStrikes++;
  lightningState.consecutiveFailures = 0;

  // Notify the Doctor about mode change
  bridge.sendTo('doctor', 'igor.lightning' as any, {
    id: IGOR_ID,
    mode: 'claude',
    reason,
    struckAt: lightningState.struckAt,
    totalStrikes: lightningState.totalStrikes,
  });
}

/**
 * Return to dumb mode (power down from Claude)
 */
function powerDown(): void {
  if (lightningState.mode === 'dumb') {
    return;
  }

  logger.info('🔋 Powering down from Claude mode to dumb mode');

  lightningState.mode = 'dumb';
  lightningState.reason = undefined;

  bridge.sendTo('doctor', 'igor.powerdown' as any, {
    id: IGOR_ID,
    mode: 'dumb',
    wasStruckFor: lightningState.struckAt
      ? Date.now() - lightningState.struckAt.getTime()
      : 0,
  });
}

/**
 * Ask Claude for help when in claude mode
 */
async function claudeThink(prompt: string, context?: Record<string, unknown>): Promise<string> {
  if (lightningState.mode !== 'claude') {
    throw new Error('Cannot think: not in Claude mode');
  }

  if (!LIGHTNING_API_KEY) {
    throw new Error('Cannot think: ANTHROPIC_API_KEY not set');
  }

  logger.info('🧠 Thinking...', { promptLength: prompt.length });

  const systemPrompt = `You are Igor, a test execution agent that has been "lightning struck" to gain intelligence.
You were running in dumb mode (just executing steps) but encountered a problem.
You now have the ability to think and reason about the problem.

Your context:
- Current plan: ${currentPlan?.id || 'none'}
- Current step: ${currentStep}
- Status: ${status}
- Route: ${IGOR_ROUTE || 'main'}

${context ? `Additional context:\n${JSON.stringify(context, null, 2)}` : ''}

Help solve the problem. Be concise and action-oriented.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': LIGHTNING_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: LIGHTNING_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error: ${response.status} ${errorText}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text?: string }>;
    };

    const thought = data.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');

    // Record the thought
    lightningState.lastThought = thought;
    lightningState.thinkingHistory.push({
      prompt,
      response: thought,
      timestamp: new Date(),
    });

    // Keep history bounded
    if (lightningState.thinkingHistory.length > 20) {
      lightningState.thinkingHistory.shift();
    }

    logger.info('🧠 Thought complete', { responseLength: thought.length });
    return thought;

  } catch (err) {
    logger.error('🧠 Thinking failed:', err);
    throw err;
  }
}

/**
 * Auto-strike if too many consecutive failures
 */
function checkAutoStrike(error: Error, step: PlanStep): void {
  lightningState.consecutiveFailures++;

  if (
    LIGHTNING_ENABLED &&
    lightningState.mode === 'dumb' &&
    lightningState.consecutiveFailures >= LIGHTNING_AUTO_THRESHOLD
  ) {
    lightningStrike(
      `Auto-triggered after ${lightningState.consecutiveFailures} consecutive failures. ` +
      `Last error: ${error.message}. Step: ${step.action}`
    );
  }
}

/**
 * Reset failure count on success
 */
function recordSuccess(): void {
  lightningState.consecutiveFailures = 0;
}

// =============================================================================
// Circuit Breaker for Frankenstein Communication
// =============================================================================
const frankensteinCircuit = new CircuitBreaker({
  name: 'frankenstein',
  failureThreshold: CIRCUIT_FAILURE_THRESHOLD,
  resetTimeout: CIRCUIT_RESET_TIMEOUT,
  onStateChange: (from, to, name) => {
    console.log(`[Igor] Circuit '${name}' state changed: ${from} -> ${to}`);
  },
});

// =============================================================================
// Frank Tool Integration - Use tools created by Frankenstein for failures
// =============================================================================

interface FrankTool {
  id: string;
  name: string;
  description: string;
  status: string;
}

// Cache of available Frank tools
let frankToolsCache: FrankTool[] = [];
let frankToolsCacheTime = 0;
const FRANK_TOOLS_CACHE_TTL = 30000; // 30 seconds

/**
 * Query Frankenstein for available tools
 */
async function queryFrankTools(): Promise<FrankTool[]> {
  // Return cached if fresh
  if (Date.now() - frankToolsCacheTime < FRANK_TOOLS_CACHE_TTL && frankToolsCache.length > 0) {
    return frankToolsCache;
  }

  try {
    // Send tool.list request via Bridge
    const requestId = generateId();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingFrankRequests.delete(requestId);
        resolve([]); // Return empty on timeout
      }, 5000);

      pendingFrankRequests.set(requestId, { resolve, reject, timeout });

      bridge.sendTo('frankenstein', 'tool.list', {}, requestId);
    });
  } catch (err) {
    logger.warn('Failed to query Frank tools', { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

// Pending Frank tool requests
const pendingFrankRequests = new Map<string, {
  resolve: (tools: FrankTool[]) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}>();

/**
 * Find a Frank tool that might help with a failure
 */
function findHelperTool(action: string, error: string, selector?: string): FrankTool | undefined {
  // Look for tools matching the failure pattern
  const errorLower = error.toLowerCase();
  const actionLower = action.toLowerCase();

  for (const tool of frankToolsCache) {
    const nameLower = tool.name.toLowerCase();
    const descLower = tool.description.toLowerCase();

    // Match by tool type keywords
    if (errorLower.includes('not found') || errorLower.includes('selector')) {
      if (nameLower.includes('selector') || nameLower.includes('smart')) {
        return tool;
      }
    }

    if (errorLower.includes('timeout') || errorLower.includes('wait')) {
      if (nameLower.includes('wait') || nameLower.includes('helper')) {
        return tool;
      }
    }

    if (errorLower.includes('popup') || errorLower.includes('modal')) {
      if (nameLower.includes('popup') || nameLower.includes('modal')) {
        return tool;
      }
    }

    if (errorLower.includes('dropdown') || errorLower.includes('select')) {
      if (nameLower.includes('dropdown') || nameLower.includes('select')) {
        return tool;
      }
    }
  }

  return undefined;
}

/**
 * Invoke a Frank tool to help with a failure
 */
async function invokeFrankTool(
  tool: FrankTool,
  params: Record<string, unknown>
): Promise<unknown> {
  const requestId = generateId();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingFrankInvokes.delete(requestId);
      reject(new Error(`Frank tool invocation timed out: ${tool.name}`));
    }, 10000);

    pendingFrankInvokes.set(requestId, { resolve, reject, timeout });

    bridge.sendTo('frankenstein', 'tool.invoke', {
      toolId: tool.id,
      params,
    }, requestId);
  });
}

// Pending Frank tool invocations
const pendingFrankInvokes = new Map<string, {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}>();

// Setup Frank message handlers (called after bridge is initialized)
function setupFrankHandlers(bridgeClient: BridgeClient) {
  // Handle tool.listed response
  bridgeClient.on('tool.listed' as any, (message: BridgeMessage) => {
    const { tools } = message.payload as { tools: FrankTool[] };
    const requestId = message.correlationId;

    // Update cache
    frankToolsCache = tools;
    frankToolsCacheTime = Date.now();

    // Resolve pending request
    if (requestId && pendingFrankRequests.has(requestId)) {
      const pending = pendingFrankRequests.get(requestId)!;
      clearTimeout(pending.timeout);
      pending.resolve(tools);
      pendingFrankRequests.delete(requestId);
    }

    console.log(`[igor] Frank tools updated: ${tools.length} available`);
  });

  // Handle tool.invoked response
  bridgeClient.on('tool.invoked' as any, (message: BridgeMessage) => {
    const result = message.payload;
    const requestId = message.correlationId;

    if (requestId && pendingFrankInvokes.has(requestId)) {
      const pending = pendingFrankInvokes.get(requestId)!;
      clearTimeout(pending.timeout);
      pending.resolve(result);
      pendingFrankInvokes.delete(requestId);
    }
  });

  // Handle tool.error for invocations
  bridgeClient.on('tool.error' as any, (message: BridgeMessage) => {
    const { error } = message.payload as { error: string };
    const requestId = message.correlationId;

    if (requestId && pendingFrankInvokes.has(requestId)) {
      const pending = pendingFrankInvokes.get(requestId)!;
      clearTimeout(pending.timeout);
      pending.reject(new Error(error));
      pendingFrankInvokes.delete(requestId);
    }
  });
}

// =============================================================================
// State
// =============================================================================
const startTime = Date.now();
let currentPlan: Plan | null = null;
let currentStep = 0;
let status: 'idle' | 'executing' | 'waiting' = 'idle';

// Pending response tracking
const pendingResponses = new Map<string, {
  resolve: (value: BridgeMessage) => void;
  timeout: ReturnType<typeof setTimeout>;
  createdAt: number;
}>();

// Cleanup stale pending responses (safety net for orphaned entries)
const PENDING_CLEANUP_INTERVAL_MS = 60000; // 1 minute
const PENDING_MAX_AGE_MS = 120000; // 2 minutes (well beyond any timeout)

setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  for (const [messageId, pending] of pendingResponses) {
    if (now - pending.createdAt > PENDING_MAX_AGE_MS) {
      clearTimeout(pending.timeout);
      pendingResponses.delete(messageId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[Igor] Cleaned up ${cleaned} stale pending responses`);
  }
}, PENDING_CLEANUP_INTERVAL_MS);

interface ToolBagItem {
  name: string;
  description: string;
  inputSchema: object;
}

interface Plan {
  id: string;
  steps: PlanStep[];
  correlationId: string;
  toolBag?: ToolBagItem[];  // Doctor-selected tools for this task
  toolSelectionReasoning?: string;
}

interface PlanStep {
  action: string;
  params: Record<string, unknown>;
  timeout?: number;
  retries?: number;
}

// =============================================================================
// Bridge Client
// =============================================================================
const bridge = new BridgeClient({
  componentId: IGOR_ID as any,  // Use route-specific ID if spawned
  version: IGOR_ROUTE ? `${IGOR_VERSION}-route-${IGOR_ROUTE}` : IGOR_VERSION,
  bridgeUrl: BRIDGE_URL,
  authToken: BRIDGE_AUTH_TOKEN,
});

// Setup Frank message handlers after bridge is created
setupFrankHandlers(bridge);

// =============================================================================
// Logger
// =============================================================================
const logger = createLogger({
  component: IGOR_ID,  // Use route-specific ID if spawned
  version: IGOR_VERSION,
  minLevel: (process.env.LOG_LEVEL as any) || 'INFO',
  pretty: process.env.LOG_FORMAT !== 'json',
});

// =============================================================================
// Exponential Backoff
// =============================================================================
const BACKOFF_BASE_MS = 1000;      // 1 second base
const BACKOFF_MAX_MS = 30000;      // 30 seconds max
const BACKOFF_JITTER = 0.2;        // 20% jitter

function calculateBackoff(attempt: number): number {
  // Exponential: base * 2^attempt with jitter
  const exponential = BACKOFF_BASE_MS * Math.pow(2, attempt);
  const capped = Math.min(exponential, BACKOFF_MAX_MS);
  // Add random jitter to prevent thundering herd (+/- 20%)
  const jitter = capped * BACKOFF_JITTER * (Math.random() * 2 - 1);
  // Clamp to ensure non-negative and at least half of base
  return Math.max(BACKOFF_BASE_MS / 2, Math.round(capped + jitter));
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// Plan Execution
// =============================================================================
async function executePlan(plan: Plan): Promise<void> {
  logger.info(`Executing plan: ${plan.id} (${plan.steps.length} steps)`, {
    planId: plan.id,
    correlationId: plan.correlationId,
    steps: plan.steps.length,
  });

  currentPlan = plan;
  currentStep = 0;
  status = 'executing';

  // Track retry attempts per step (don't mutate plan object)
  const stepAttempts = new Map<number, number>();

  bridge.sendTo('doctor', 'plan.accepted', {
    planId: plan.id,
    stepCount: plan.steps.length,
  }, plan.correlationId);

  for (let i = 0; i < plan.steps.length; i++) {
    currentStep = i;
    const step = plan.steps[i];
    const attemptNumber = (stepAttempts.get(i) ?? 0) + 1;
    const maxRetries = step.retries ?? 0;

    bridge.sendTo('doctor', 'step.started', {
      planId: plan.id,
      stepIndex: i,
      action: step.action,
      attempt: attemptNumber,
    }, plan.correlationId);

    try {
      const result = await executeStep(step);

      // Record success for lightning auto-strike tracking
      recordSuccess();

      bridge.sendTo('doctor', 'step.completed', {
        planId: plan.id,
        stepIndex: i,
        result,
      }, plan.correlationId);

      logger.info(`Step ${i + 1}/${plan.steps.length} completed: ${step.action}`, {
        planId: plan.id, stepIndex: i, action: step.action, correlationId: plan.correlationId,
      });
    } catch (err) {
      // Create structured error
      const structuredError = Errors.stepFailed(
        plan.id,
        i,
        step.action,
        err instanceof Error ? err : undefined
      );

      // Check if we should auto-strike to Claude mode
      checkAutoStrike(
        err instanceof Error ? err : new Error(String(err)),
        step
      );

      logger.error(`Step ${i + 1} failed: ${structuredError.toString()}`, {
        planId: plan.id, stepIndex: i, action: step.action, correlationId: plan.correlationId,
      });

      bridge.sendTo('doctor', 'step.failed', {
        planId: plan.id,
        stepIndex: i,
        error: serializeError(structuredError),
        retryable: isRetryable(err),
        lightningMode: lightningState.mode,  // Let doctor know if we're now thinking
      }, plan.correlationId);

      // Check if error is retryable and we have retries left
      const retriesUsed = stepAttempts.get(i) ?? 0;
      const retriesLeft = maxRetries - retriesUsed;

      if (isRetryable(err) && retriesLeft > 0) {
        const backoffMs = calculateBackoff(retriesUsed);

        logger.info(`Retrying step ${i + 1} in ${backoffMs}ms`, {
          planId: plan.id, stepIndex: i, retriesLeft, backoffMs, attemptNumber: attemptNumber + 1, correlationId: plan.correlationId,
        });

        // =====================================================================
        // Frank Tool Integration: Check for helper tools before retry
        // =====================================================================
        const errorMessage = err instanceof Error ? err.message : String(err);
        const selector = step.params.selector as string | undefined;

        // Refresh tool cache
        await queryFrankTools();

        // Look for a helper tool
        const helperTool = findHelperTool(step.action, errorMessage, selector);

        if (helperTool) {
          logger.info(`🔧 Found Frank tool to help: ${helperTool.name}`, {
            planId: plan.id, stepIndex: i, toolId: helperTool.id,
          });

          try {
            // Invoke the helper tool
            const toolResult = await invokeFrankTool(helperTool, {
              selector: selector,
              hint: step.params.text || step.action,
              action: step.action,
              error: errorMessage,
            });

            logger.info(`🔧 Frank tool result`, { tool: helperTool.name, result: toolResult });

            // Report tool usage to Doctor
            bridge.sendTo('doctor', 'frank.tool.used' as any, {
              planId: plan.id,
              stepIndex: i,
              toolId: helperTool.id,
              toolName: helperTool.name,
              result: toolResult,
            }, plan.correlationId);

            // If tool returned a new selector, update the step params for retry
            if (toolResult && typeof toolResult === 'object' && 'foundSelector' in toolResult) {
              const newSelector = (toolResult as { foundSelector: string }).foundSelector;
              if (newSelector && newSelector !== selector) {
                logger.info(`🔧 Using Frank-provided selector: ${newSelector}`);
                step.params.selector = newSelector;
              }
            }
          } catch (toolErr) {
            logger.warn(`Frank tool failed: ${helperTool.name}`, {
              error: toolErr instanceof Error ? toolErr.message : String(toolErr),
            });
          }
        }
        // =====================================================================

        bridge.sendTo('doctor', 'step.retrying', {
          planId: plan.id,
          stepIndex: i,
          retriesLeft,
          backoffMs,
          attemptNumber: attemptNumber + 1,
          frankToolUsed: helperTool?.name,
        }, plan.correlationId);

        await sleep(backoffMs);
        stepAttempts.set(i, retriesUsed + 1);
        i--; // Retry same step
        continue;
      }

      // Abort on non-retryable failure
      bridge.sendTo('doctor', 'plan.completed', {
        planId: plan.id,
        success: false,
        failedStep: i,
        error: serializeError(structuredError),
      }, plan.correlationId);

      status = 'idle';
      currentPlan = null;
      return;
    }
  }

  bridge.sendTo('doctor', 'plan.completed', {
    planId: plan.id,
    success: true,
  }, plan.correlationId);

  logger.info(`Plan ${plan.id} completed successfully`, { planId: plan.id, correlationId: plan.correlationId });
  status = 'idle';
  currentPlan = null;
}

async function executeStep(step: PlanStep): Promise<unknown> {
  const timeout = step.timeout || 30000;

  switch (step.action) {
    case 'launch':
      return sendToFrankenstein('browser.launch', step.params, timeout);

    case 'navigate':
      return sendToFrankenstein('browser.navigate', step.params, timeout);

    case 'click':
      return sendToFrankenstein('browser.click', step.params, timeout);

    case 'type':
      return sendToFrankenstein('browser.type', step.params, timeout);

    case 'screenshot':
      return sendToFrankenstein('browser.screenshot', step.params, timeout);

    case 'close':
      return sendToFrankenstein('browser.close', step.params, timeout);

    case 'wait':
      await new Promise(resolve => setTimeout(resolve, step.params.ms as number || 1000));
      return { waited: step.params.ms };

    default:
      throw Errors.unknownAction(step.action);
  }
}

function sendToFrankensteinRaw(type: string, payload: unknown, timeout: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const messageId = bridge.sendTo('frankenstein', type as any, payload);

    const timer = setTimeout(() => {
      pendingResponses.delete(messageId);
      reject(Errors.browserTimeout(type, timeout));
    }, timeout);

    pendingResponses.set(messageId, {
      resolve: (response: BridgeMessage) => {
        clearTimeout(timer);
        pendingResponses.delete(messageId);

        if (response.type === 'browser.error') {
          // Preserve structured error from Frankenstein if available
          const errorPayload = response.payload as SerializedError | { error: string };
          if ('code' in errorPayload) {
            // Already a structured error
            reject(Object.assign(new Error(errorPayload.message), errorPayload));
          } else {
            reject(new Error(errorPayload.error || 'Unknown browser error'));
          }
        } else {
          resolve(response.payload);
        }
      },
      timeout: timer,
      createdAt: Date.now(),
    });
  });
}

/**
 * Send command to Frankenstein with circuit breaker protection
 */
async function sendToFrankenstein(type: string, payload: unknown, timeout: number): Promise<unknown> {
  // Check circuit breaker before attempting
  if (!frankensteinCircuit.canExecute()) {
    const cooldown = frankensteinCircuit.getRemainingCooldown();
    throw new CircuitOpenError('frankenstein', cooldown);
  }

  try {
    const result = await sendToFrankensteinRaw(type, payload, timeout);
    frankensteinCircuit.onSuccess();
    return result;
  } catch (err) {
    frankensteinCircuit.onFailure();
    throw err;
  }
}

// =============================================================================
// Message Handlers
// =============================================================================
bridge.on('plan.submit', async (message: BridgeMessage) => {
  if (status !== 'idle') {
    bridge.sendTo('doctor', 'plan.rejected', {
      reason: 'Igor is busy executing another plan',
      currentPlanId: currentPlan?.id,
    }, message.id);
    return;
  }

  // Validate plan payload before accepting
  const payload = message.payload as {
    id?: string;
    steps?: unknown[];
    toolBag?: ToolBagItem[];
    toolSelectionReasoning?: string;
  };

  if (!payload || typeof payload !== 'object') {
    bridge.sendTo('doctor', 'plan.rejected', {
      reason: 'Invalid plan payload: expected object',
    }, message.id);
    logger.warn('Plan rejected: invalid payload type');
    return;
  }

  if (!payload.id || typeof payload.id !== 'string') {
    bridge.sendTo('doctor', 'plan.rejected', {
      reason: 'Invalid plan payload: missing or invalid id',
    }, message.id);
    logger.warn('Plan rejected: missing plan id');
    return;
  }

  if (!Array.isArray(payload.steps)) {
    bridge.sendTo('doctor', 'plan.rejected', {
      reason: 'Invalid plan payload: steps must be an array',
    }, message.id);
    logger.warn('Plan rejected: steps is not an array');
    return;
  }

  // Validate plan steps using shared validation
  const validation = validatePlan(payload.steps as any[]);
  if (!validation.valid) {
    bridge.sendTo('doctor', 'plan.rejected', {
      reason: 'Plan validation failed',
      errors: validation.errors,
    }, message.id);
    logger.warn(`Plan rejected: ${validation.errors.join(', ')}`);
    return;
  }

  const plan: Plan = {
    id: payload.id!,
    steps: payload.steps as PlanStep[],
    correlationId: message.id,
    toolBag: payload.toolBag,
    toolSelectionReasoning: payload.toolSelectionReasoning,
  };

  // Log tool bag if provided
  if (plan.toolBag && plan.toolBag.length > 0) {
    logger.info(`🧰 Received tool bag with ${plan.toolBag.length} tools:`, {
      tools: plan.toolBag.map(t => t.name),
      reasoning: plan.toolSelectionReasoning,
    });
  } else {
    logger.info(`📦 No tool bag provided - using all available tools`);
  }

  // Execute asynchronously
  executePlan(plan).catch(err => {
    logger.error('Plan execution error:', err);
  });
});

// Handle responses from Frankenstein
bridge.on('browser.launched', handleFrankensteinResponse);
bridge.on('browser.navigated', handleFrankensteinResponse);
bridge.on('browser.clicked', handleFrankensteinResponse);
bridge.on('browser.typed', handleFrankensteinResponse);
bridge.on('browser.screenshotted', handleFrankensteinResponse);
bridge.on('browser.closed', handleFrankensteinResponse);
bridge.on('browser.error', handleFrankensteinResponse);

function handleFrankensteinResponse(message: BridgeMessage) {
  const correlationId = message.correlationId;
  if (correlationId && pendingResponses.has(correlationId)) {
    const pending = pendingResponses.get(correlationId)!;
    pending.resolve(message);
  }
}

// =============================================================================
// Igor Spawning (for route-specific workers)
// =============================================================================

interface SpawnedIgor {
  id: string;
  route: string;
  routeName: string;
  port: number;
  process: ReturnType<typeof Bun.spawn> | null;
  status: 'spawning' | 'running' | 'dead';
  spawnedAt: Date;
  pid?: number;
}

const spawnedIgors = new Map<string, SpawnedIgor>();
let nextIgorPort = parseInt(process.env.IGOR_SPAWN_PORT_START || '7010');

// Base path for Igor script
const IGOR_SCRIPT_PATH = process.env.IGOR_SCRIPT_PATH || import.meta.path;

/**
 * Spawn a new Igor instance for a specific route
 */
async function spawnRouteIgor(
  id: string,
  route: string,
  routeName: string,
  conditions?: Record<string, unknown>
): Promise<SpawnedIgor> {
  // Check if already exists
  if (spawnedIgors.has(id)) {
    const existing = spawnedIgors.get(id)!;
    if (existing.status === 'running') {
      logger.info(`Route Igor already running: ${id}`);
      return existing;
    }
    // Clean up dead instance
    spawnedIgors.delete(id);
  }

  const port = nextIgorPort++;

  logger.info(`🔀 Spawning route Igor: ${id} (${routeName}) on port ${port}`);

  const spawnedIgor: SpawnedIgor = {
    id,
    route,
    routeName,
    port,
    process: null,
    status: 'spawning',
    spawnedAt: new Date(),
  };

  spawnedIgors.set(id, spawnedIgor);

  try {
    // Spawn new Igor process with route-specific config
    // Use full bun path to avoid PATH issues
    const bunPath = process.env.BUN_PATH || `${process.env.HOME}/.bun/bin/bun`;
    const proc = Bun.spawn([bunPath, 'run', IGOR_SCRIPT_PATH], {
      env: {
        ...process.env,
        PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH}`,
        IGOR_PORT: String(port),
        IGOR_ID: id,
        IGOR_ROUTE: route,
        IGOR_ROUTE_NAME: routeName,
        IGOR_ROUTE_CONDITIONS: conditions ? JSON.stringify(conditions) : '',
        // Share same Bridge
        BRIDGE_URL: BRIDGE_URL,
        BRIDGE_AUTH_TOKEN: BRIDGE_AUTH_TOKEN,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    spawnedIgor.process = proc;
    spawnedIgor.pid = proc.pid;
    spawnedIgor.status = 'running';

    // Handle process output
    (async () => {
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        logger.debug(`[${id}] ${text.trim()}`);
      }
    })();

    // Handle process exit
    proc.exited.then((exitCode) => {
      logger.warn(`Route Igor ${id} exited with code ${exitCode}`);
      spawnedIgor.status = 'dead';

      // Notify Doctor that this Igor is gone
      bridge.sendTo('doctor', 'igor.exited' as any, {
        id,
        route,
        exitCode,
      });
    });

    // Announce this new Igor to Doctor
    setTimeout(() => {
      bridge.sendTo('doctor', 'version.announce' as any, {
        component: id,
        version: IGOR_VERSION + `-route-${route}`,
      });
    }, 1000);  // Give it time to start

    logger.info(`✅ Route Igor spawned: ${id} (PID: ${proc.pid}, port: ${port})`);
    return spawnedIgor;

  } catch (err) {
    logger.error(`Failed to spawn route Igor ${id}:`, err);
    spawnedIgor.status = 'dead';
    throw err;
  }
}

/**
 * Kill a spawned Igor instance
 */
async function killRouteIgor(id: string): Promise<boolean> {
  const igor = spawnedIgors.get(id);
  if (!igor || !igor.process) {
    return false;
  }

  logger.info(`Killing route Igor: ${id}`);
  igor.process.kill();
  igor.status = 'dead';
  spawnedIgors.delete(id);
  return true;
}

/**
 * Get stats about spawned Igors
 */
function getSpawnedIgorStats() {
  const igors = Array.from(spawnedIgors.values());
  return {
    total: igors.length,
    running: igors.filter(i => i.status === 'running').length,
    dead: igors.filter(i => i.status === 'dead').length,
    instances: igors.map(i => ({
      id: i.id,
      route: i.route,
      routeName: i.routeName,
      port: i.port,
      status: i.status,
      pid: i.pid,
      uptime: Date.now() - i.spawnedAt.getTime(),
    })),
  };
}

// Handle spawn requests from Doctor
bridge.on('igor.spawn' as any, async (message: BridgeMessage) => {
  const { id, route, routeName, conditions } = message.payload as {
    id: string;
    route: string;
    routeName: string;
    conditions?: Record<string, unknown>;
  };

  logger.info(`📥 Received spawn request: ${id} (${routeName})`);

  try {
    const spawnedIgor = await spawnRouteIgor(id, route, routeName, conditions);

    bridge.sendTo('doctor', 'igor.spawned' as any, {
      id: spawnedIgor.id,
      route: spawnedIgor.route,
      port: spawnedIgor.port,
      pid: spawnedIgor.pid,
      status: spawnedIgor.status,
    }, message.id);

  } catch (err) {
    bridge.sendTo('doctor', 'igor.spawn.failed' as any, {
      id,
      route,
      error: err instanceof Error ? err.message : String(err),
    }, message.id);
  }
});

// =============================================================================
// Lightning Strike Message Handlers
// =============================================================================

// Handle lightning strike request from Doctor
bridge.on('igor.strike' as any, async (message: BridgeMessage) => {
  const { reason } = message.payload as { reason?: string };
  lightningStrike(reason || 'Requested by Doctor');

  bridge.sendTo('doctor', 'igor.struck' as any, {
    id: IGOR_ID,
    mode: lightningState.mode,
    reason: lightningState.reason,
    struckAt: lightningState.struckAt,
  }, message.id);
});

// Handle power down request from Doctor
bridge.on('igor.powerdown' as any, (message: BridgeMessage) => {
  powerDown();

  bridge.sendTo('doctor', 'igor.powereddown' as any, {
    id: IGOR_ID,
    mode: lightningState.mode,
  }, message.id);
});

// Handle think request from Doctor (requires claude mode)
bridge.on('igor.think' as any, async (message: BridgeMessage) => {
  const { prompt, context } = message.payload as {
    prompt: string;
    context?: Record<string, unknown>;
  };

  if (lightningState.mode !== 'claude') {
    bridge.sendTo('doctor', 'igor.thought.failed' as any, {
      id: IGOR_ID,
      error: 'Not in Claude mode. Use igor.strike first.',
    }, message.id);
    return;
  }

  try {
    const thought = await claudeThink(prompt, context);

    bridge.sendTo('doctor', 'igor.thought' as any, {
      id: IGOR_ID,
      prompt,
      thought,
      timestamp: new Date(),
    }, message.id);
  } catch (err) {
    bridge.sendTo('doctor', 'igor.thought.failed' as any, {
      id: IGOR_ID,
      prompt,
      error: err instanceof Error ? err.message : String(err),
    }, message.id);
  }
});

// Handle lightning status request
bridge.on('igor.lightning.status' as any, (message: BridgeMessage) => {
  bridge.sendTo('doctor', 'igor.lightning.status.response' as any, {
    id: IGOR_ID,
    mode: lightningState.mode,
    struckAt: lightningState.struckAt,
    reason: lightningState.reason,
    consecutiveFailures: lightningState.consecutiveFailures,
    totalStrikes: lightningState.totalStrikes,
    lastThought: lightningState.lastThought,
    thinkingHistoryCount: lightningState.thinkingHistory.length,
    lightningEnabled: LIGHTNING_ENABLED,
    hasApiKey: !!LIGHTNING_API_KEY,
  }, message.id);
});

// =============================================================================
// Health Check
// =============================================================================
function getHealth(): ComponentHealth & { status: string; currentStep?: number } {
  const circuitStats = frankensteinCircuit.getStats();
  const toolkitStats = stableToolkit.getStats();
  const frankStats = frankManager.getStats();
  const spawnedStats = getSpawnedIgorStats();

  return {
    status: 'healthy',
    version: IGOR_VERSION,
    uptime: Date.now() - startTime,
    pid: process.pid,
    componentId: IGOR_ID,
    route: IGOR_ROUTE || undefined,
    bridgeConnected: bridge.isConnected(),
    executionStatus: status,
    currentPlan: currentPlan?.id,
    currentStep: currentPlan ? currentStep : undefined,
    totalSteps: currentPlan?.steps.length,
    toolkit: {
      totalTools: toolkitStats.totalTools,
      builtinTools: toolkitStats.builtinTools,
      igorifiedTools: toolkitStats.igorifiedTools,
      totalInvocations: toolkitStats.totalInvocations,
    },
    franks: {
      total: frankStats.totalFranks,
      healthy: frankStats.healthy,
      busy: frankStats.busy,
      queueLength: frankStats.queueLength,
      tasksCompleted: frankStats.totalTasksCompleted,
      tasksFailed: frankStats.totalTasksFailed,
    },
    spawnedIgors: {
      total: spawnedStats.total,
      running: spawnedStats.running,
      dead: spawnedStats.dead,
    },
    circuitBreaker: {
      state: circuitStats.state,
      failures: circuitStats.failures,
      totalRequests: circuitStats.totalRequests,
      totalFailures: circuitStats.totalFailures,
    },
    lightning: {
      mode: lightningState.mode,
      enabled: LIGHTNING_ENABLED,
      hasApiKey: !!LIGHTNING_API_KEY,
      struckAt: lightningState.struckAt,
      reason: lightningState.reason,
      consecutiveFailures: lightningState.consecutiveFailures,
      totalStrikes: lightningState.totalStrikes,
      autoThreshold: LIGHTNING_AUTO_THRESHOLD,
      thinkingHistoryCount: lightningState.thinkingHistory.length,
    },
  } as any;
}

// =============================================================================
// HTTP Server - The FACE of Automated Processes
// =============================================================================

function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'X-Version': IGOR_VERSION });
  res.end(JSON.stringify(data, null, 2));
}

function extractPath(url: string): { path: string; params: Record<string, string> } {
  const [pathPart, queryPart] = url.split('?');
  const params: Record<string, string> = {};
  if (queryPart) {
    for (const pair of queryPart.split('&')) {
      const [key, value] = pair.split('=');
      if (key) params[key] = decodeURIComponent(value || '');
    }
  }
  return { path: pathPart, params };
}

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const { path, params } = extractPath(req.url || '/');
  const method = req.method || 'GET';

  try {
    // =========================================================================
    // Health & Status
    // =========================================================================
    if (path === '/health' && method === 'GET') {
      sendJson(res, 200, getHealth());
      return;
    }

    if (path === '/status' && method === 'GET') {
      sendJson(res, 200, {
        status,
        currentPlan: currentPlan?.id,
        currentStep,
        totalSteps: currentPlan?.steps.length,
        toolkit: stableToolkit.getStats(),
        franks: frankManager.getStats(),
      });
      return;
    }

    // =========================================================================
    // Stable Toolkit API
    // =========================================================================
    if (path === '/tools' && method === 'GET') {
      sendJson(res, 200, {
        tools: stableToolkit.list(),
        stats: stableToolkit.getStats(),
      });
      return;
    }

    if (path.startsWith('/tools/') && path.endsWith('/execute') && method === 'POST') {
      const toolName = path.replace('/tools/', '').replace('/execute', '');
      if (!stableToolkit.has(toolName)) {
        sendJson(res, 404, { error: `Tool not found: ${toolName}` });
        return;
      }

      const body = await parseBody(req) as Record<string, unknown>;
      const ctx = createToolContext({
        correlationId: params.correlationId || generateId(),
        timeout: parseInt(params.timeout || '30000'),
      });

      const result = await stableToolkit.execute(toolName, body, ctx);
      sendJson(res, result.success ? 200 : 500, result);
      return;
    }

    // =========================================================================
    // Frank Management API
    // =========================================================================
    if (path === '/franks' && method === 'GET') {
      sendJson(res, 200, {
        franks: frankManager.list(),
        stats: frankManager.getStats(),
      });
      return;
    }

    if (path === '/franks/spawn' && method === 'POST') {
      const body = await parseBody(req) as { capabilities?: string[] };
      try {
        const frank = await frankManager.spawn(body.capabilities);
        sendJson(res, 201, {
          id: frank.id,
          port: frank.port,
          status: frank.status,
          capabilities: frank.capabilities,
        });
      } catch (err) {
        sendJson(res, 503, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    if (path.startsWith('/franks/') && path.endsWith('/kill') && method === 'POST') {
      const frankId = path.replace('/franks/', '').replace('/kill', '');
      const killed = await frankManager.kill(frankId);
      if (killed) {
        sendJson(res, 200, { killed: true, id: frankId });
      } else {
        sendJson(res, 404, { error: `Frank not found: ${frankId}` });
      }
      return;
    }

    if (path.startsWith('/franks/') && path.endsWith('/execute') && method === 'POST') {
      const frankId = path.replace('/franks/', '').replace('/execute', '');
      const body = await parseBody(req) as { endpoint: string; payload: unknown };
      try {
        const result = await frankManager.executeOnFrank(frankId, body.endpoint, body.payload);
        sendJson(res, 200, { result });
      } catch (err) {
        sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    // =========================================================================
    // Spawned Igors API (route-specific workers)
    // =========================================================================
    if (path === '/igors' && method === 'GET') {
      sendJson(res, 200, getSpawnedIgorStats());
      return;
    }

    if (path === '/igors/spawn' && method === 'POST') {
      const body = await parseBody(req) as {
        id: string;
        route: string;
        routeName: string;
        conditions?: Record<string, unknown>;
      };

      if (!body.id || !body.route) {
        sendJson(res, 400, { error: 'Missing id or route' });
        return;
      }

      try {
        const igor = await spawnRouteIgor(body.id, body.route, body.routeName || body.route, body.conditions);
        sendJson(res, 201, {
          id: igor.id,
          route: igor.route,
          routeName: igor.routeName,
          port: igor.port,
          pid: igor.pid,
          status: igor.status,
        });
      } catch (err) {
        sendJson(res, 503, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    if (path.startsWith('/igors/') && path.endsWith('/kill') && method === 'POST') {
      const igorId = path.replace('/igors/', '').replace('/kill', '');
      const killed = await killRouteIgor(igorId);
      if (killed) {
        sendJson(res, 200, { killed: true, id: igorId });
      } else {
        sendJson(res, 404, { error: `Spawned Igor not found: ${igorId}` });
      }
      return;
    }

    // =========================================================================
    // Direct Execution API (external systems can submit work)
    // =========================================================================
    if (path === '/execute' && method === 'POST') {
      const body = await parseBody(req) as {
        action: string;
        params?: Record<string, unknown>;
        timeout?: number;
        useFrank?: boolean;
      };

      if (!body.action) {
        sendJson(res, 400, { error: 'Missing action field' });
        return;
      }

      const correlationId = params.correlationId || generateId();
      const timeout = body.timeout || 30000;

      // Check if stable toolkit has this action
      if (!body.useFrank && stableToolkit.has(body.action)) {
        const ctx = createToolContext({ correlationId, timeout });
        const result = await stableToolkit.execute(body.action, body.params || {}, ctx);
        sendJson(res, result.success ? 200 : 500, { ...result, correlationId });
        return;
      }

      // Route to Frankenstein
      try {
        const result = await sendToFrankenstein(`browser.${body.action}`, body.params, timeout);
        sendJson(res, 200, { success: true, result, correlationId });
      } catch (err) {
        sendJson(res, 500, {
          success: false,
          error: err instanceof Error ? err.message : String(err),
          correlationId,
        });
      }
      return;
    }

    // =========================================================================
    // Plan Submission API (external systems can submit plans directly)
    // =========================================================================
    if (path === '/plan' && method === 'POST') {
      if (status !== 'idle') {
        sendJson(res, 409, {
          error: 'Igor is busy',
          currentPlan: currentPlan?.id,
          currentStep,
        });
        return;
      }

      const body = await parseBody(req) as { id?: string; steps?: PlanStep[] };

      if (!body.id || !Array.isArray(body.steps)) {
        sendJson(res, 400, { error: 'Invalid plan: requires id and steps array' });
        return;
      }

      const validation = validatePlan(body.steps);
      if (!validation.valid) {
        sendJson(res, 400, { error: 'Plan validation failed', errors: validation.errors });
        return;
      }

      const plan: Plan = {
        id: body.id,
        steps: body.steps,
        correlationId: params.correlationId || generateId(),
      };

      // Execute asynchronously
      executePlan(plan).catch(err => {
        logger.error('Plan execution error:', err);
      });

      sendJson(res, 202, {
        accepted: true,
        planId: plan.id,
        correlationId: plan.correlationId,
        steps: plan.steps.length,
      });
      return;
    }

    // =========================================================================
    // Queue API
    // =========================================================================
    if (path === '/queue' && method === 'GET') {
      const stats = frankManager.getStats();
      sendJson(res, 200, {
        queueLength: stats.queueLength,
        totalFranks: stats.totalFranks,
        busyFranks: stats.busy,
        availableFranks: stats.healthy - stats.busy,
      });
      return;
    }

    if (path === '/queue' && method === 'POST') {
      const body = await parseBody(req) as {
        type: 'browser' | 'tool' | 'desktop';
        payload: unknown;
        timeout?: number;
      };

      if (!body.type || !body.payload) {
        sendJson(res, 400, { error: 'Missing type or payload' });
        return;
      }

      const taskId = frankManager.queueTask({
        type: body.type,
        payload: body.payload,
        timeout: body.timeout || 30000,
        correlationId: params.correlationId,
      });

      sendJson(res, 202, { queued: true, taskId });
      return;
    }

    // =========================================================================
    // Circuit Breaker API
    // =========================================================================
    if (path === '/circuit' && method === 'GET') {
      const stats = frankensteinCircuit.getStats();
      sendJson(res, 200, {
        state: stats.state,
        failures: stats.failures,
        totalRequests: stats.totalRequests,
        totalFailures: stats.totalFailures,
        remainingCooldown: frankensteinCircuit.getRemainingCooldown(),
      });
      return;
    }

    if (path === '/circuit/reset' && method === 'POST') {
      frankensteinCircuit.reset();
      sendJson(res, 200, { reset: true });
      return;
    }

    // =========================================================================
    // Lightning Strike API
    // =========================================================================
    if (path === '/lightning' && method === 'GET') {
      sendJson(res, 200, {
        mode: lightningState.mode,
        enabled: LIGHTNING_ENABLED,
        hasApiKey: !!LIGHTNING_API_KEY,
        struckAt: lightningState.struckAt,
        reason: lightningState.reason,
        consecutiveFailures: lightningState.consecutiveFailures,
        totalStrikes: lightningState.totalStrikes,
        autoThreshold: LIGHTNING_AUTO_THRESHOLD,
        lastThought: lightningState.lastThought,
        thinkingHistoryCount: lightningState.thinkingHistory.length,
      });
      return;
    }

    if (path === '/lightning/strike' && method === 'POST') {
      const body = await parseBody(req) as { reason?: string };
      lightningStrike(body.reason || 'HTTP API request');

      sendJson(res, 200, {
        struck: lightningState.mode === 'claude',
        mode: lightningState.mode,
        reason: lightningState.reason,
        struckAt: lightningState.struckAt,
        totalStrikes: lightningState.totalStrikes,
      });
      return;
    }

    if (path === '/lightning/powerdown' && method === 'POST') {
      const wasClaude = lightningState.mode === 'claude';
      powerDown();

      sendJson(res, 200, {
        poweredDown: wasClaude,
        mode: lightningState.mode,
      });
      return;
    }

    if (path === '/lightning/think' && method === 'POST') {
      if (lightningState.mode !== 'claude') {
        sendJson(res, 400, {
          error: 'Not in Claude mode. Strike first with POST /lightning/strike',
          mode: lightningState.mode,
        });
        return;
      }

      const body = await parseBody(req) as { prompt: string; context?: Record<string, unknown> };

      if (!body.prompt) {
        sendJson(res, 400, { error: 'Missing prompt field' });
        return;
      }

      try {
        const thought = await claudeThink(body.prompt, body.context);
        sendJson(res, 200, {
          prompt: body.prompt,
          thought,
          timestamp: new Date(),
        });
      } catch (err) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    if (path === '/lightning/history' && method === 'GET') {
      sendJson(res, 200, {
        mode: lightningState.mode,
        totalStrikes: lightningState.totalStrikes,
        thinkingHistory: lightningState.thinkingHistory,
      });
      return;
    }

    // =========================================================================
    // 404 Not Found
    // =========================================================================
    sendJson(res, 404, { error: 'Not Found', path });

  } catch (err) {
    logger.error('HTTP request error:', err);
    sendJson(res, 500, { error: err instanceof Error ? err.message : 'Internal Server Error' });
  }
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
// Startup
// =============================================================================
async function start() {
  logger.info('='.repeat(60));
  logger.info(`IGOR (${IGOR_ID}) - Starting version ${IGOR_VERSION}`);
  logger.info(`PID: ${process.pid}`);
  logger.info(`Port: ${PORT}`);
  logger.info(`Bridge: ${BRIDGE_URL}`);
  if (IGOR_ROUTE) {
    logger.info(`🔀 Route: ${IGOR_ROUTE} (${IGOR_ROUTE_NAME})`);
    if (IGOR_ROUTE_CONDITIONS) {
      logger.info(`   Conditions: ${JSON.stringify(IGOR_ROUTE_CONDITIONS)}`);
    }
  }
  logger.info('='.repeat(60));

  // Log lightning configuration
  logger.info(`Lightning: ${LIGHTNING_ENABLED ? 'ENABLED' : 'DISABLED'}`);
  if (LIGHTNING_ENABLED) {
    logger.info(`  - API Key: ${LIGHTNING_API_KEY ? 'SET' : 'NOT SET'}`);
    logger.info(`  - Model: ${LIGHTNING_MODEL}`);
    logger.info(`  - Auto-threshold: ${LIGHTNING_AUTO_THRESHOLD} failures`);
  }
  logger.info('='.repeat(60));

  // Start HTTP server
  httpServer.listen(PORT, () => {
    logger.info(`Endpoints:`);
    logger.info(`  - GET  /health            - Health status`);
    logger.info(`  - GET  /status            - Current status`);
    logger.info(`  - GET  /tools             - Stable toolkit`);
    logger.info(`  - GET  /franks            - Frank instances`);
    logger.info(`  - GET  /igors             - Spawned Igors`);
    logger.info(`  - POST /igors/spawn       - Spawn route Igor`);
    logger.info(`  - POST /execute           - Execute action`);
    logger.info(`  - POST /plan              - Submit plan`);
    logger.info(`  - GET  /lightning         - Lightning status`);
    logger.info(`  - POST /lightning/strike  - Elevate to Claude mode`);
    logger.info(`  - POST /lightning/think   - Ask Claude (requires strike)`);
    logger.info(`  - POST /lightning/powerdown - Return to dumb mode`);
  });

  // Connect to Bridge
  const connected = await bridge.connect();
  if (!connected) {
    logger.error( 'Failed to connect to Bridge');
    logger.info( 'Will retry connection...');
  }

  logger.info( 'Igor ready. Awaiting plans from Doctor...');
}

start();

// =============================================================================
// Graceful Shutdown
// =============================================================================
async function shutdown() {
  logger.info('Shutting down...');

  // Kill all spawned route Igors
  const spawnedIds = Array.from(spawnedIgors.keys());
  for (const id of spawnedIds) {
    logger.info(`Killing spawned Igor: ${id}`);
    await killRouteIgor(id);
  }

  frankManager.destroy();  // Kill all Frank instances
  bridge.disconnect();
  httpServer.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
