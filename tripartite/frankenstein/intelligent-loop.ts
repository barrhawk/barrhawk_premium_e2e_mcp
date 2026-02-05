/**
 * INTELLIGENT LOOP - AI-driven E2E testing (Callback Architecture)
 *
 * This version uses a callback pattern where Claude Code does the analysis.
 * Instead of calling the Anthropic API directly, it:
 * 1. OBSERVE: Take screenshot of current state
 * 2. YIELD: Return screenshot to Claude Code for analysis
 * 3. RECEIVE: Get action from Claude Code
 * 4. ACT: Execute the action
 * 5. REPEAT: Until goal achieved or max iterations
 *
 * This allows the intelligent loop to work through MCP without needing
 * a separate API key - Claude Code itself provides the intelligence.
 */

import { createLogger } from '../shared/logger.js';
import { takeScreenshot, mouseClick, typeText, pressKey, listWindows, focusWindow } from './system-tools.js';

const logger = createLogger({
  component: 'intelligent-loop',
  version: '2.0.0-callback',
  minLevel: 'INFO',
  pretty: true,
});

// =============================================================================
// Types
// =============================================================================

export interface LoopGoal {
  description: string;
  successCriteria?: string[];
  maxIterations?: number;
  timeoutMs?: number;
}

export interface LoopAction {
  type: 'click' | 'type' | 'press_key' | 'scroll' | 'wait' | 'focus_window' | 'done' | 'error';
  params?: Record<string, any>;
  reasoning?: string;
}

export interface LoopStep {
  iteration: number;
  timestamp: number;
  screenshotPath?: string;
  screenshotBase64?: string;
  analysis?: string;
  action: LoopAction;
  result?: any;
  error?: string;
}

export interface LoopSession {
  id: string;
  goal: LoopGoal;
  startTime: number;
  endTime?: number;
  status: 'running' | 'awaiting_action' | 'success' | 'failed' | 'timeout' | 'max_iterations';
  steps: LoopStep[];
  finalAnalysis?: string;
  currentIteration: number;
  pendingScreenshot?: {
    base64: string;
    path: string;
  };
}

// =============================================================================
// State
// =============================================================================

let currentSession: LoopSession | null = null;

// =============================================================================
// Action Execution
// =============================================================================

export async function executeAction(action: LoopAction): Promise<any> {
  logger.info(`Executing action: ${action.type}`, action.params);

  switch (action.type) {
    case 'click': {
      const { x, y, button } = action.params || {};
      await mouseClick({ x, y, button });
      return { clicked: true, x, y };
    }

    case 'type': {
      const { text, delay } = action.params || {};
      await typeText(text, delay);
      return { typed: true, text };
    }

    case 'press_key': {
      const { key, modifiers } = action.params || {};
      await pressKey(key, modifiers);
      return { pressed: true, key, modifiers };
    }

    case 'scroll': {
      const { direction, amount } = action.params || {};
      const proc = Bun.spawn(['xdotool', 'click', direction === 'up' ? '4' : '5'], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      await proc.exited;
      return { scrolled: true, direction, amount };
    }

    case 'wait': {
      const { ms } = action.params || { ms: 1000 };
      await new Promise(r => setTimeout(r, ms));
      return { waited: true, ms };
    }

    case 'focus_window': {
      const { name, id } = action.params || {};
      if (id) {
        await focusWindow(id);
      } else if (name) {
        const windows = await listWindows();
        const match = windows.find(w => w.name.toLowerCase().includes(name.toLowerCase()));
        if (match) {
          await focusWindow(match.id);
        } else {
          throw new Error(`Window not found: ${name}`);
        }
      }
      return { focused: true, name };
    }

    case 'done':
      return { done: true, ...action.params };

    case 'error':
      throw new Error(action.params?.message || 'Unknown error');

    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

// =============================================================================
// Loop Management - Callback Architecture
// =============================================================================

/**
 * Start a new intelligent loop session.
 * Returns immediately with the first screenshot for Claude Code to analyze.
 */
export async function startLoop(goal: LoopGoal, screenshotDir = '/tmp/intelligent-loop'): Promise<{
  sessionId: string;
  iteration: number;
  screenshot: { base64: string; path: string };
  goal: LoopGoal;
  previousSteps: LoopStep[];
}> {
  if (currentSession?.status === 'running' || currentSession?.status === 'awaiting_action') {
    throw new Error('Loop already running. Stop it first or provide the next action.');
  }

  const id = `loop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const maxIterations = goal.maxIterations || 50;

  // Ensure screenshot directory exists
  const { mkdirSync, existsSync } = await import('fs');
  if (!existsSync(screenshotDir)) {
    mkdirSync(screenshotDir, { recursive: true });
  }

  currentSession = {
    id,
    goal,
    startTime: Date.now(),
    status: 'running',
    steps: [],
    currentIteration: 1,
  };

  logger.info(`Starting intelligent loop: ${id}`);
  logger.info(`Goal: ${goal.description}`);
  logger.info(`Max iterations: ${maxIterations}`);

  // Take initial screenshot
  const screenshotPath = `${screenshotDir}/step_1_${Date.now()}.png`;
  const screenshot = await takeScreenshot({ output: screenshotPath });

  currentSession.status = 'awaiting_action';
  currentSession.pendingScreenshot = {
    base64: screenshot.base64,
    path: screenshotPath,
  };

  return {
    sessionId: id,
    iteration: 1,
    screenshot: { base64: screenshot.base64, path: screenshotPath },
    goal,
    previousSteps: [],
  };
}

/**
 * Continue the loop with an action from Claude Code.
 * Executes the action and returns the next screenshot (or completion status).
 */
export async function continueLoop(
  sessionId: string,
  action: LoopAction,
  screenshotDir = '/tmp/intelligent-loop'
): Promise<{
  sessionId: string;
  iteration: number;
  status: LoopSession['status'];
  screenshot?: { base64: string; path: string };
  result?: any;
  error?: string;
  previousSteps: LoopStep[];
  finalAnalysis?: string;
}> {
  if (!currentSession || currentSession.id !== sessionId) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  if (currentSession.status !== 'awaiting_action') {
    throw new Error(`Session not awaiting action. Status: ${currentSession.status}`);
  }

  const iteration = currentSession.currentIteration;
  const maxIterations = currentSession.goal.maxIterations || 50;
  const timeoutMs = currentSession.goal.timeoutMs || 300000;

  // Check timeout
  if (Date.now() - currentSession.startTime > timeoutMs) {
    currentSession.status = 'timeout';
    currentSession.endTime = Date.now();
    currentSession.finalAnalysis = `Timed out after ${timeoutMs}ms`;
    const result = { ...currentSession };
    currentSession = null;
    return {
      sessionId,
      iteration,
      status: 'timeout',
      previousSteps: result.steps,
      finalAnalysis: result.finalAnalysis,
    };
  }

  logger.info(`\n=== Iteration ${iteration}/${maxIterations} ===`);
  logger.info(`Action received: ${action.type} - ${action.reasoning}`);

  const step: LoopStep = {
    iteration,
    timestamp: Date.now(),
    screenshotPath: currentSession.pendingScreenshot?.path,
    screenshotBase64: currentSession.pendingScreenshot?.base64,
    analysis: action.reasoning,
    action,
  };

  // Handle terminal actions
  if (action.type === 'done') {
    step.result = action.params;
    currentSession.steps.push(step);
    currentSession.status = action.params?.success ? 'success' : 'failed';
    currentSession.endTime = Date.now();
    currentSession.finalAnalysis = action.params?.message;

    const result = { ...currentSession };
    currentSession = null;

    logger.info(`Loop completed: ${result.status}`);
    return {
      sessionId,
      iteration,
      status: result.status,
      result: step.result,
      previousSteps: result.steps,
      finalAnalysis: result.finalAnalysis,
    };
  }

  if (action.type === 'error') {
    step.error = action.params?.message;
    currentSession.steps.push(step);
    currentSession.status = 'failed';
    currentSession.endTime = Date.now();
    currentSession.finalAnalysis = action.params?.message;

    const result = { ...currentSession };
    currentSession = null;

    logger.info(`Loop failed: ${result.finalAnalysis}`);
    return {
      sessionId,
      iteration,
      status: 'failed',
      error: step.error,
      previousSteps: result.steps,
      finalAnalysis: result.finalAnalysis,
    };
  }

  // Execute the action
  try {
    step.result = await executeAction(action);
    currentSession.steps.push(step);
    logger.info(`Action executed successfully`);
  } catch (error: any) {
    step.error = error.message;
    currentSession.steps.push(step);
    logger.error(`Action failed: ${error.message}`);
    // Continue to next iteration anyway
  }

  // Check if we've hit max iterations
  if (iteration >= maxIterations) {
    currentSession.status = 'max_iterations';
    currentSession.endTime = Date.now();
    currentSession.finalAnalysis = `Reached max iterations (${maxIterations}) without completing goal`;

    const result = { ...currentSession };
    currentSession = null;

    return {
      sessionId,
      iteration,
      status: 'max_iterations',
      previousSteps: result.steps,
      finalAnalysis: result.finalAnalysis,
    };
  }

  // Small delay before next screenshot
  await new Promise(r => setTimeout(r, 500));

  // Take next screenshot
  const nextIteration = iteration + 1;
  const screenshotPath = `${screenshotDir}/step_${nextIteration}_${Date.now()}.png`;
  const screenshot = await takeScreenshot({ output: screenshotPath });

  currentSession.currentIteration = nextIteration;
  currentSession.status = 'awaiting_action';
  currentSession.pendingScreenshot = {
    base64: screenshot.base64,
    path: screenshotPath,
  };

  return {
    sessionId,
    iteration: nextIteration,
    status: 'awaiting_action',
    screenshot: { base64: screenshot.base64, path: screenshotPath },
    previousSteps: currentSession.steps,
  };
}

/**
 * Stop the current loop
 */
export async function stopLoop(): Promise<LoopSession | null> {
  if (!currentSession) return null;

  currentSession.status = 'failed';
  currentSession.endTime = Date.now();
  currentSession.finalAnalysis = 'Manually stopped';

  const result = { ...currentSession };
  currentSession = null;

  logger.info('Loop manually stopped');
  return result;
}

/**
 * Get current loop status
 */
export function getLoopStatus(): LoopSession | null {
  return currentSession ? { ...currentSession } : null;
}

// =============================================================================
// Legacy Exports (for backward compatibility)
// =============================================================================

export const runIntelligentLoop = startLoop;
export const stopIntelligentLoop = stopLoop;

/**
 * Single-shot screenshot analysis (for one-off analysis without a loop)
 * Note: This still requires manual analysis by Claude Code
 */
export async function captureForAnalysis(context: string): Promise<{
  screenshot: { base64: string; path: string };
  context: string;
  prompt: string;
}> {
  const screenshotPath = `/tmp/intelligent-loop/analysis_${Date.now()}.png`;
  const { mkdirSync, existsSync } = await import('fs');
  if (!existsSync('/tmp/intelligent-loop')) {
    mkdirSync('/tmp/intelligent-loop', { recursive: true });
  }

  const screenshot = await takeScreenshot({ output: screenshotPath });

  const prompt = `Analyze this screenshot and decide the next action.

Context/Goal: ${context}

Respond with a JSON object:
{
  "type": "click" | "type" | "press_key" | "scroll" | "wait" | "focus_window" | "done" | "error",
  "params": { ... },
  "reasoning": "..."
}

Action types:
- click: { "x": number, "y": number, "button": "left"|"right" }
- type: { "text": "string to type" }
- press_key: { "key": "Enter"|"Tab"|"Escape"|etc, "modifiers": ["ctrl", "shift"] }
- scroll: { "direction": "up"|"down", "amount": 300 }
- wait: { "ms": 1000 }
- focus_window: { "name": "window name pattern" }
- done: { "success": true, "message": "Goal achieved because..." }
- error: { "message": "Cannot proceed because..." }`;

  return {
    screenshot: { base64: screenshot.base64, path: screenshotPath },
    context,
    prompt,
  };
}
