/**
 * INTELLIGENT LOOP - AI-driven E2E testing
 *
 * Implements the think-act-observe loop:
 * 1. OBSERVE: Take screenshot of current state
 * 2. THINK: Send to Claude to analyze and decide next action
 * 3. ACT: Execute the decided action
 * 4. REPEAT: Until goal achieved or max iterations
 *
 * This enables truly intelligent, adaptive E2E testing that can handle
 * dynamic UIs, unexpected states, and complex multi-step workflows.
 */

import { createLogger } from '../shared/logger.js';
import { takeScreenshot, mouseClick, typeText, pressKey, listWindows, focusWindow } from './system-tools.js';
import Anthropic from '@anthropic-ai/sdk';

const logger = createLogger({
  component: 'intelligent-loop',
  version: '1.0.0',
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
  status: 'running' | 'success' | 'failed' | 'timeout' | 'max_iterations';
  steps: LoopStep[];
  finalAnalysis?: string;
}

export interface LoopOptions {
  goal: LoopGoal;
  anthropicApiKey?: string;
  model?: string;
  screenshotDir?: string;
  onStep?: (step: LoopStep) => void;
  browserContext?: any;  // Playwright browser context for hybrid mode
}

// =============================================================================
// State
// =============================================================================

let currentSession: LoopSession | null = null;
let anthropicClient: Anthropic | null = null;

// =============================================================================
// Claude Integration
// =============================================================================

function getAnthropicClient(apiKey?: string): Anthropic {
  if (anthropicClient) return anthropicClient;

  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY not set. Required for intelligent loop.');
  }

  anthropicClient = new Anthropic({ apiKey: key });
  return anthropicClient;
}

async function analyzeScreenshot(
  screenshotBase64: string,
  goal: LoopGoal,
  previousSteps: LoopStep[],
  client: Anthropic,
  model: string
): Promise<LoopAction> {
  const systemPrompt = `You are an AI assistant helping with E2E testing. You analyze screenshots and decide what action to take next.

Your goal: ${goal.description}
${goal.successCriteria ? `Success criteria:\n${goal.successCriteria.map(c => `- ${c}`).join('\n')}` : ''}

You must respond with a JSON object describing the next action:
{
  "type": "click" | "type" | "press_key" | "scroll" | "wait" | "focus_window" | "done" | "error",
  "params": { ... },  // Parameters for the action
  "reasoning": "..."  // Brief explanation of why this action
}

Action types:
- click: { "x": number, "y": number, "button": "left"|"right" }
- type: { "text": "string to type" }
- press_key: { "key": "Enter"|"Tab"|"Escape"|etc, "modifiers": ["ctrl", "shift"] }
- scroll: { "direction": "up"|"down", "amount": 300 }
- wait: { "ms": 1000 }
- focus_window: { "name": "window name pattern" }
- done: { "success": true, "message": "Goal achieved because..." }
- error: { "message": "Cannot proceed because..." }

Be precise with click coordinates - analyze the UI elements carefully.
If the goal appears to be achieved, return type "done".
If you cannot make progress, return type "error".`;

  const previousContext = previousSteps.length > 0
    ? `\n\nPrevious ${previousSteps.length} steps:\n${previousSteps.slice(-5).map((s, i) =>
        `${i + 1}. ${s.action.type}: ${s.action.reasoning || JSON.stringify(s.action.params)}`
      ).join('\n')}`
    : '';

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: screenshotBase64,
              },
            },
            {
              type: 'text',
              text: `Analyze this screenshot and decide the next action to achieve the goal.${previousContext}\n\nRespond with JSON only.`,
            },
          ],
        },
      ],
      system: systemPrompt,
    });

    // Extract JSON from response
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    // Parse JSON (handle potential markdown code blocks)
    let jsonStr = content.text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const action = JSON.parse(jsonStr) as LoopAction;
    return action;

  } catch (error: any) {
    logger.error('Failed to analyze screenshot:', error);
    return {
      type: 'error',
      params: { message: `Analysis failed: ${error.message}` },
      reasoning: 'Claude API error',
    };
  }
}

// =============================================================================
// Action Execution
// =============================================================================

async function executeAction(action: LoopAction): Promise<any> {
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
      // Use xdotool for scrolling
      const scrollAmount = direction === 'up' ? -amount : amount;
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
// Main Loop
// =============================================================================

export async function runIntelligentLoop(options: LoopOptions): Promise<LoopSession> {
  if (currentSession?.status === 'running') {
    throw new Error('Loop already running. Stop it first.');
  }

  const { goal, anthropicApiKey, model = 'claude-sonnet-4-20250514', screenshotDir = '/tmp/intelligent-loop', onStep } = options;
  const maxIterations = goal.maxIterations || 50;
  const timeoutMs = goal.timeoutMs || 300000; // 5 minutes default

  const client = getAnthropicClient(anthropicApiKey);
  const id = `loop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  currentSession = {
    id,
    goal,
    startTime: Date.now(),
    status: 'running',
    steps: [],
  };

  logger.info(`Starting intelligent loop: ${id}`);
  logger.info(`Goal: ${goal.description}`);
  logger.info(`Max iterations: ${maxIterations}, Timeout: ${timeoutMs}ms`);

  const startTime = Date.now();

  try {
    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        currentSession.status = 'timeout';
        currentSession.finalAnalysis = `Timed out after ${timeoutMs}ms`;
        break;
      }

      logger.info(`\n=== Iteration ${iteration}/${maxIterations} ===`);

      // 1. OBSERVE: Take screenshot
      const screenshotPath = `${screenshotDir}/step_${iteration}_${Date.now()}.png`;
      const screenshot = await takeScreenshot({ output: screenshotPath });

      // 2. THINK: Analyze with Claude
      const action = await analyzeScreenshot(
        screenshot.base64,
        goal,
        currentSession.steps,
        client,
        model
      );

      logger.info(`Action decided: ${action.type} - ${action.reasoning}`);

      const step: LoopStep = {
        iteration,
        timestamp: Date.now(),
        screenshotPath,
        analysis: action.reasoning,
        action,
      };

      // 3. ACT: Execute the action
      try {
        if (action.type === 'done') {
          step.result = action.params;
          currentSession.steps.push(step);
          currentSession.status = action.params?.success ? 'success' : 'failed';
          currentSession.finalAnalysis = action.params?.message;

          if (onStep) onStep(step);
          break;
        }

        if (action.type === 'error') {
          step.error = action.params?.message;
          currentSession.steps.push(step);
          currentSession.status = 'failed';
          currentSession.finalAnalysis = action.params?.message;

          if (onStep) onStep(step);
          break;
        }

        step.result = await executeAction(action);
        currentSession.steps.push(step);

        if (onStep) onStep(step);

        // Small delay between actions
        await new Promise(r => setTimeout(r, 500));

      } catch (error: any) {
        step.error = error.message;
        currentSession.steps.push(step);
        logger.error(`Action failed: ${error.message}`);

        if (onStep) onStep(step);

        // Continue trying unless it's a critical error
        if (iteration >= maxIterations - 1) {
          currentSession.status = 'failed';
          currentSession.finalAnalysis = `Failed after ${iteration} iterations: ${error.message}`;
        }
      }
    }

    if (currentSession.status === 'running') {
      currentSession.status = 'max_iterations';
      currentSession.finalAnalysis = `Reached max iterations (${maxIterations}) without completing goal`;
    }

  } catch (error: any) {
    currentSession.status = 'failed';
    currentSession.finalAnalysis = `Loop error: ${error.message}`;
    logger.error('Loop failed:', error);
  }

  currentSession.endTime = Date.now();

  const duration = (currentSession.endTime - currentSession.startTime) / 1000;
  logger.info(`\n=== Loop Complete ===`);
  logger.info(`Status: ${currentSession.status}`);
  logger.info(`Duration: ${duration}s`);
  logger.info(`Steps: ${currentSession.steps.length}`);
  logger.info(`Final: ${currentSession.finalAnalysis}`);

  const result = { ...currentSession };
  currentSession = null;
  return result;
}

export async function stopIntelligentLoop(): Promise<LoopSession | null> {
  if (!currentSession) return null;

  currentSession.status = 'failed';
  currentSession.endTime = Date.now();
  currentSession.finalAnalysis = 'Manually stopped';

  const result = { ...currentSession };
  currentSession = null;
  return result;
}

export function getLoopStatus(): LoopSession | null {
  return currentSession;
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Run a simple intelligent test with a text goal
 */
export async function intelligentTest(
  goalDescription: string,
  options: Partial<LoopOptions> = {}
): Promise<LoopSession> {
  return runIntelligentLoop({
    ...options,
    goal: {
      description: goalDescription,
      maxIterations: options.goal?.maxIterations || 30,
      timeoutMs: options.goal?.timeoutMs || 180000,
      ...options.goal,
    },
  });
}

/**
 * Analyze a single screenshot and get recommended action
 */
export async function analyzeState(
  screenshotBase64: string,
  context: string,
  apiKey?: string
): Promise<LoopAction> {
  const client = getAnthropicClient(apiKey);

  return analyzeScreenshot(
    screenshotBase64,
    { description: context },
    [],
    client,
    'claude-sonnet-4-20250514'
  );
}
