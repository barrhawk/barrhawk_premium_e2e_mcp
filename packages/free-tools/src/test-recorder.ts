/**
 * Test Recorder - Free Tier
 *
 * Record and replay browser actions.
 * For AI-powered test generation, upgrade to Premium.
 */

import type { Page } from 'playwright';

// ============================================================================
// Types
// ============================================================================

export interface RecordedAction {
  type: 'navigate' | 'click' | 'type' | 'select' | 'press' | 'wait' | 'scroll' | 'screenshot';
  timestamp: number;
  selector?: string;
  value?: string;
  url?: string;
  key?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  description: string;
}

export interface Recording {
  id: string;
  name: string;
  startTime: string;
  endTime?: string;
  baseUrl: string;
  actions: RecordedAction[];
  status: 'recording' | 'stopped' | 'completed';
}

export interface RecordStartOptions {
  page: Page;
  name?: string;
  baseUrl?: string;
}

export interface RecordStartResult {
  recording: Recording;
  message: string;
}

export interface RecordStopResult {
  recording: Recording;
  duration: number;
  actionCount: number;
  message: string;
}

export interface ReplayOptions {
  page: Page;
  recording: Recording;
  speed?: number;  // 1 = normal, 2 = 2x faster, 0.5 = half speed
  stopOnError?: boolean;
  timeout?: number;
}

export interface ReplayResult {
  success: boolean;
  actionsExecuted: number;
  totalActions: number;
  duration: number;
  errors: Array<{ action: RecordedAction; error: string }>;
  message: string;
}

export interface ExportOptions {
  recording: Recording;
  format: 'playwright' | 'cypress' | 'puppeteer' | 'mcp';
  includeAssertions?: boolean;
}

export interface ExportResult {
  code: string;
  format: string;
  lineCount: number;
}

// ============================================================================
// Recording State
// ============================================================================

let activeRecording: Recording | null = null;
let recordingPage: Page | null = null;
let lastRecording: Recording | null = null;  // Preserved after stop for export

// ============================================================================
// Implementations
// ============================================================================

/**
 * Start recording browser actions
 */
export async function testRecordStart(options: RecordStartOptions): Promise<RecordStartResult> {
  const { page, name, baseUrl } = options;

  if (activeRecording) {
    throw new Error('A recording is already in progress. Stop it first.');
  }

  const recording: Recording = {
    id: `rec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    name: name || `Recording ${new Date().toLocaleString()}`,
    startTime: new Date().toISOString(),
    baseUrl: baseUrl || page.url(),
    actions: [],
    status: 'recording',
  };

  // Add initial navigation
  recording.actions.push({
    type: 'navigate',
    timestamp: Date.now(),
    url: page.url(),
    description: `Navigate to ${page.url()}`,
  });

  activeRecording = recording;
  recordingPage = page;

  // Set up action listeners
  setupRecordingListeners(page);

  return {
    recording,
    message: `Started recording: ${recording.name}`,
  };
}

/**
 * Stop recording and return the recorded actions
 */
export function testRecordStop(): RecordStopResult {
  if (!activeRecording) {
    throw new Error('No active recording to stop.');
  }

  activeRecording.endTime = new Date().toISOString();
  activeRecording.status = 'completed';

  const startTime = new Date(activeRecording.startTime).getTime();
  const endTime = new Date(activeRecording.endTime).getTime();
  const duration = endTime - startTime;

  const result: RecordStopResult = {
    recording: { ...activeRecording },
    duration,
    actionCount: activeRecording.actions.length,
    message: `Stopped recording: ${activeRecording.actions.length} actions captured in ${Math.round(duration / 1000)}s`,
  };

  // Preserve for export before clearing
  lastRecording = { ...activeRecording };

  // Clean up
  if (recordingPage) {
    removeRecordingListeners(recordingPage);
  }
  activeRecording = null;
  recordingPage = null;

  return result;
}

/**
 * Manually add an action to the recording
 */
export function recordAction(action: Omit<RecordedAction, 'timestamp'>): void {
  if (!activeRecording) {
    throw new Error('No active recording. Start recording first.');
  }

  activeRecording.actions.push({
    ...action,
    timestamp: Date.now(),
  });
}

/**
 * Replay a recorded test
 */
export async function testReplay(options: ReplayOptions): Promise<ReplayResult> {
  const { page, recording, speed = 1, stopOnError = false, timeout = 30000 } = options;

  const startTime = Date.now();
  const errors: ReplayResult['errors'] = [];
  let actionsExecuted = 0;

  for (const action of recording.actions) {
    try {
      await executeAction(page, action, timeout);
      actionsExecuted++;

      // Add delay based on speed
      if (speed < 1) {
        await page.waitForTimeout(Math.round(500 / speed));
      } else if (speed > 1) {
        await page.waitForTimeout(Math.round(100 / speed));
      } else {
        await page.waitForTimeout(100);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push({ action, error: errorMsg });

      if (stopOnError) {
        break;
      }
    }
  }

  const duration = Date.now() - startTime;
  const success = errors.length === 0;

  return {
    success,
    actionsExecuted,
    totalActions: recording.actions.length,
    duration,
    errors,
    message: success
      ? `Replay completed: ${actionsExecuted}/${recording.actions.length} actions in ${Math.round(duration / 1000)}s`
      : `Replay completed with ${errors.length} errors: ${actionsExecuted}/${recording.actions.length} actions`,
  };
}

/**
 * Export recording to code
 */
export function testExport(options: ExportOptions): ExportResult {
  const { recording, format, includeAssertions = false } = options;

  let code: string;

  switch (format) {
    case 'playwright':
      code = exportToPlaywright(recording, includeAssertions);
      break;
    case 'cypress':
      code = exportToCypress(recording, includeAssertions);
      break;
    case 'puppeteer':
      code = exportToPuppeteer(recording, includeAssertions);
      break;
    case 'mcp':
      code = exportToMCP(recording);
      break;
    default:
      code = exportToPlaywright(recording, includeAssertions);
  }

  return {
    code,
    format,
    lineCount: code.split('\n').length,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function setupRecordingListeners(page: Page): void {
  // Note: In a real implementation, this would use Playwright's tracing
  // or CDP to capture events. For now, actions must be manually recorded
  // via the recordAction function or through the MCP tools.
}

function removeRecordingListeners(page: Page): void {
  // Clean up listeners
}

async function executeAction(page: Page, action: RecordedAction, timeout: number): Promise<void> {
  switch (action.type) {
    case 'navigate':
      if (action.url) {
        await page.goto(action.url, { timeout });
      }
      break;

    case 'click':
      if (action.selector) {
        await page.click(action.selector, { timeout });
      }
      break;

    case 'type':
      if (action.selector && action.value !== undefined) {
        await page.fill(action.selector, action.value, { timeout });
      }
      break;

    case 'select':
      if (action.selector && action.value) {
        await page.selectOption(action.selector, action.value, { timeout });
      }
      break;

    case 'press':
      if (action.key) {
        if (action.selector) {
          await page.press(action.selector, action.key, { timeout });
        } else {
          await page.keyboard.press(action.key);
        }
      }
      break;

    case 'wait':
      if (action.selector) {
        await page.waitForSelector(action.selector, { timeout });
      } else if (action.value) {
        await page.waitForTimeout(parseInt(action.value));
      }
      break;

    case 'scroll':
      if (action.direction && action.amount) {
        const deltaX = action.direction === 'left' ? -action.amount :
                       action.direction === 'right' ? action.amount : 0;
        const deltaY = action.direction === 'up' ? -action.amount :
                       action.direction === 'down' ? action.amount : 0;
        await page.mouse.wheel(deltaX, deltaY);
      }
      break;

    case 'screenshot':
      await page.screenshot();
      break;
  }
}

function exportToPlaywright(recording: Recording, includeAssertions: boolean): string {
  const lines: string[] = [];

  lines.push(`import { test, expect } from '@playwright/test';`);
  lines.push('');
  lines.push(`test('${escapeString(recording.name)}', async ({ page }) => {`);

  for (const action of recording.actions) {
    const code = actionToPlaywright(action);
    if (code) {
      lines.push(`  ${code}`);
    }
  }

  if (includeAssertions) {
    lines.push('');
    lines.push('  // Add your assertions here');
    lines.push('  // await expect(page).toHaveTitle(/expected title/);');
  }

  lines.push('});');

  return lines.join('\n');
}

function actionToPlaywright(action: RecordedAction): string {
  switch (action.type) {
    case 'navigate':
      return action.url ? `await page.goto('${escapeString(action.url)}');` : '';
    case 'click':
      return action.selector ? `await page.click('${escapeString(action.selector)}');` : '';
    case 'type':
      return action.selector && action.value !== undefined
        ? `await page.fill('${escapeString(action.selector)}', '${escapeString(action.value)}');`
        : '';
    case 'select':
      return action.selector && action.value
        ? `await page.selectOption('${escapeString(action.selector)}', '${escapeString(action.value)}');`
        : '';
    case 'press':
      return action.key
        ? action.selector
          ? `await page.press('${escapeString(action.selector)}', '${action.key}');`
          : `await page.keyboard.press('${action.key}');`
        : '';
    case 'wait':
      return action.selector
        ? `await page.waitForSelector('${escapeString(action.selector)}');`
        : action.value
          ? `await page.waitForTimeout(${action.value});`
          : '';
    case 'screenshot':
      return `await page.screenshot();`;
    default:
      return '';
  }
}

function exportToCypress(recording: Recording, includeAssertions: boolean): string {
  const lines: string[] = [];

  lines.push(`describe('${escapeString(recording.name)}', () => {`);
  lines.push(`  it('should complete the recorded flow', () => {`);

  for (const action of recording.actions) {
    const code = actionToCypress(action);
    if (code) {
      lines.push(`    ${code}`);
    }
  }

  if (includeAssertions) {
    lines.push('');
    lines.push('    // Add your assertions here');
    lines.push("    // cy.url().should('include', '/expected-path');");
  }

  lines.push('  });');
  lines.push('});');

  return lines.join('\n');
}

function actionToCypress(action: RecordedAction): string {
  switch (action.type) {
    case 'navigate':
      return action.url ? `cy.visit('${escapeString(action.url)}');` : '';
    case 'click':
      return action.selector ? `cy.get('${escapeString(action.selector)}').click();` : '';
    case 'type':
      return action.selector && action.value !== undefined
        ? `cy.get('${escapeString(action.selector)}').clear().type('${escapeString(action.value)}');`
        : '';
    case 'select':
      return action.selector && action.value
        ? `cy.get('${escapeString(action.selector)}').select('${escapeString(action.value)}');`
        : '';
    case 'press':
      return action.key
        ? action.selector
          ? `cy.get('${escapeString(action.selector)}').type('{${action.key.toLowerCase()}}');`
          : `cy.get('body').type('{${action.key.toLowerCase()}}');`
        : '';
    case 'wait':
      return action.selector
        ? `cy.get('${escapeString(action.selector)}').should('exist');`
        : action.value
          ? `cy.wait(${action.value});`
          : '';
    default:
      return '';
  }
}

function exportToPuppeteer(recording: Recording, includeAssertions: boolean): string {
  const lines: string[] = [];

  lines.push(`const puppeteer = require('puppeteer');`);
  lines.push('');
  lines.push('(async () => {');
  lines.push('  const browser = await puppeteer.launch();');
  lines.push('  const page = await browser.newPage();');
  lines.push('');

  for (const action of recording.actions) {
    const code = actionToPuppeteer(action);
    if (code) {
      lines.push(`  ${code}`);
    }
  }

  if (includeAssertions) {
    lines.push('');
    lines.push('  // Add your assertions here');
  }

  lines.push('');
  lines.push('  await browser.close();');
  lines.push('})();');

  return lines.join('\n');
}

function actionToPuppeteer(action: RecordedAction): string {
  switch (action.type) {
    case 'navigate':
      return action.url ? `await page.goto('${escapeString(action.url)}');` : '';
    case 'click':
      return action.selector ? `await page.click('${escapeString(action.selector)}');` : '';
    case 'type':
      return action.selector && action.value !== undefined
        ? `await page.type('${escapeString(action.selector)}', '${escapeString(action.value)}');`
        : '';
    case 'wait':
      return action.selector
        ? `await page.waitForSelector('${escapeString(action.selector)}');`
        : action.value
          ? `await page.waitForTimeout(${action.value});`
          : '';
    default:
      return '';
  }
}

function exportToMCP(recording: Recording): string {
  const lines: string[] = [];

  lines.push(`# MCP Tool Calls for: ${recording.name}`);
  lines.push(`# Recorded: ${recording.startTime}`);
  lines.push('');

  for (const action of recording.actions) {
    const code = actionToMCP(action);
    if (code) {
      lines.push(code);
      lines.push('');
    }
  }

  return lines.join('\n');
}

function actionToMCP(action: RecordedAction): string {
  switch (action.type) {
    case 'navigate':
      return action.url ? `browser_navigate: { url: "${action.url}" }` : '';
    case 'click':
      return action.selector ? `browser_click: { selector: "${action.selector}" }` : '';
    case 'type':
      return action.selector && action.value !== undefined
        ? `browser_type: { selector: "${action.selector}", text: "${action.value}" }`
        : '';
    case 'press':
      return action.key ? `browser_press_key: { key: "${action.key}" }` : '';
    case 'wait':
      return action.selector ? `browser_wait: { selector: "${action.selector}" }` : '';
    case 'scroll':
      return action.direction ? `browser_scroll: { direction: "${action.direction}", amount: ${action.amount || 500} }` : '';
    case 'screenshot':
      return `browser_screenshot: {}`;
    default:
      return '';
  }
}

function escapeString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

/**
 * Get current recording status
 */
export function getRecordingStatus(): { isRecording: boolean; recording?: Recording } {
  return {
    isRecording: activeRecording !== null,
    recording: activeRecording || undefined,
  };
}

/**
 * Get the last completed recording (for export after stop)
 */
export function getLastRecording(): Recording | null {
  return lastRecording;
}
