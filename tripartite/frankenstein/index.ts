#!/usr/bin/env bun
/**
 * FRANKENSTEIN - Port 7003
 *
 * The body of the tripartite architecture.
 * Dynamic, programmable worker that can be live-coded.
 *
 * Responsibilities:
 * - Browser management (Playwright)
 * - Dynamic tool creation and execution
 * - Desktop automation (ydotool, grim)
 * - Execute commands from Igor
 * - Emit all events to Bridge
 * - When tools prove useful, export for igorification
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { BridgeClient } from '../shared/client.js';
import { BridgeMessage, ComponentHealth, generateId } from '../shared/types.js';
import { validateUrl, validateSelector, validateText } from '../shared/validation.js';
import { Errors, serializeError, TripartiteError } from '../shared/errors.js';
import { createLogger, startTimer } from '../shared/logger.js';
import { toolRegistry, createToolContext, DynamicTool, ToolSchema, IgorExport } from './dynamic-tools.js';
import { takeScreenshot, detectTools, getSystemToolDefinitions } from './system-tools.js';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

// =============================================================================
// VERSION CANARY - CHANGE THIS ON EVERY DEPLOY
// =============================================================================
const FRANKENSTEIN_VERSION = '2026-01-21-v8-system';

// =============================================================================
// Configuration
// =============================================================================
const PORT = parseInt(process.env.FRANKENSTEIN_PORT || '7003');
const BRIDGE_URL = process.env.BRIDGE_URL || 'ws://localhost:7000';
const BRIDGE_AUTH_TOKEN = process.env.BRIDGE_AUTH_TOKEN || '';

// =============================================================================
// Logger
// =============================================================================
const logger = createLogger({
  component: 'frankenstein',
  version: FRANKENSTEIN_VERSION,
  minLevel: (process.env.LOG_LEVEL as any) || 'INFO',
  pretty: process.env.LOG_FORMAT !== 'json',
});

// =============================================================================
// Resource Limits
// =============================================================================
const MAX_BROWSERS = parseInt(process.env.MAX_BROWSERS || '3');
const MAX_PAGES_PER_BROWSER = parseInt(process.env.MAX_PAGES || '5');
const BROWSER_IDLE_TIMEOUT = parseInt(process.env.BROWSER_IDLE_TIMEOUT || '300000'); // 5 min

// Screenshot Storage
const SCREENSHOTS_DIR = process.env.SCREENSHOTS_DIR || '/tmp/tripartite-screenshots';
const BRIDGE_URL_HTTP = process.env.BRIDGE_URL?.replace('ws://', 'http://').replace(':7000', ':7000') || 'http://localhost:7000';

// Ensure screenshots directory exists
if (!existsSync(SCREENSHOTS_DIR)) {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// System tools availability
let systemTools: Awaited<ReturnType<typeof detectTools>> | null = null;

// =============================================================================
// State
// =============================================================================
interface BrowserInstance {
  browser: Browser;
  contexts: Map<string, BrowserContext>;
  pages: Map<string, Page>;
  createdAt: number;
  lastUsed: number;
}

const browsers = new Map<string, BrowserInstance>();
let activeBrowserId: string | null = null;
let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;
const startTime = Date.now();

// Track resource usage
let browserLaunchCount = 0;
let browserCloseCount = 0;
let browserLastUsed = Date.now();
let browserIdleEvictions = 0;

// =============================================================================
// Browser Idle Eviction
// =============================================================================
setInterval(() => {
  if (browser && Date.now() - browserLastUsed > BROWSER_IDLE_TIMEOUT) {
    logger.info('Evicting idle browser', { idleMs: Date.now() - browserLastUsed });
    browser.close().catch((err) => {
      logger.warn('Error closing idle browser', { error: err.message });
    });
    browser = null;
    context = null;
    page = null;
    browserCloseCount++;
    browserIdleEvictions++;
  }
}, 60000); // Check every minute

// =============================================================================
// Bridge Client
// =============================================================================
const bridge = new BridgeClient({
  componentId: 'frankenstein',
  version: FRANKENSTEIN_VERSION,
  bridgeUrl: BRIDGE_URL,
  authToken: BRIDGE_AUTH_TOKEN,
});

// =============================================================================
// Browser Commands
// =============================================================================
async function handleBrowserCommand(message: BridgeMessage): Promise<void> {
  const { type, payload, id, correlationId, source } = message;
  const getElapsed = startTimer();

  // Respond to the actual sender (supports spawned Igors like igor-user, igor-admin)
  const replyTo = source || 'igor';

  // Update last used timestamp for idle eviction
  browserLastUsed = Date.now();

  logger.info(`Received command: ${type}`, { requestId: id, correlationId });

  try {
    switch (type) {
      case 'browser.launch': {
        // Check resource limits
        if (browser !== null) {
          logger.warn('Browser already launched, closing existing');
          await browser.close();
          browserCloseCount++;
        }

        // Check if we've hit the limit (for future pool support)
        if (browserLaunchCount - browserCloseCount >= MAX_BROWSERS) {
          const error = Errors.browserLimitReached(browserLaunchCount - browserCloseCount, MAX_BROWSERS);
          logger.error('Browser limit reached', error);
          bridge.sendTo(replyTo, 'browser.error', serializeError(error), id);
          return;
        }

        const opts = payload as { headless?: boolean; viewport?: { width: number; height: number } };
        browser = await chromium.launch({ headless: opts.headless ?? true });
        browserLaunchCount++;

        context = await browser.newContext({
          viewport: opts.viewport || { width: 1280, height: 720 },
        });
        page = await context.newPage();

        // Attach console listener
        page.on('console', (msg) => {
          bridge.sendTo('broadcast', 'event.console', {
            level: msg.type(),
            text: msg.text(),
            location: msg.location(),
          });
        });

        // Attach error listener
        page.on('pageerror', (err) => {
          bridge.sendTo('broadcast', 'event.error', {
            message: err.message,
            stack: err.stack,
          });
        });

        bridge.sendTo(replyTo, 'browser.launched', { success: true }, id);
        logger.info( 'Browser launched');
        break;
      }

      case 'browser.navigate': {
        if (!page) {
          bridge.sendTo(replyTo, 'browser.error', serializeError(Errors.browserNotLaunched()), id);
          return;
        }
        const { url } = payload as { url: string };

        // Validate URL before navigation (allow localhost for local testing)
        const allowInternal = process.env.ALLOW_LOCALHOST !== 'false';
        const urlValidation = validateUrl(url, allowInternal);
        if (!urlValidation.valid) {
          bridge.sendTo(replyTo, 'browser.error', {
            error: `URL validation failed: ${urlValidation.error}`,
            command: 'browser.navigate',
            input: url,
          }, id);
          logger.warn( `Blocked navigation to invalid URL: ${url} - ${urlValidation.error}`);
          return;
        }

        await page.goto(urlValidation.sanitized!, { waitUntil: 'networkidle' });
        bridge.sendTo(replyTo, 'browser.navigated', { url: urlValidation.sanitized, title: await page.title() }, id);
        logger.info( `Navigated to: ${urlValidation.sanitized}`);
        break;
      }

      case 'browser.click': {
        if (!page) {
          bridge.sendTo(replyTo, 'browser.error', serializeError(Errors.browserNotLaunched()), id);
          return;
        }
        const { selector, text } = payload as { selector?: string; text?: string };

        // Validate selector if provided
        if (selector) {
          const selectorValidation = validateSelector(selector);
          if (!selectorValidation.valid) {
            bridge.sendTo(replyTo, 'browser.error', {
              error: `Selector validation failed: ${selectorValidation.error}`,
              command: 'browser.click',
            }, id);
            logger.warn( `Blocked click with invalid selector: ${selectorValidation.error}`);
            return;
          }
          await page.click(selectorValidation.sanitized!);
        } else if (text) {
          const textValidation = validateText(text, 1000);
          if (!textValidation.valid) {
            bridge.sendTo(replyTo, 'browser.error', {
              error: `Text validation failed: ${textValidation.error}`,
              command: 'browser.click',
            }, id);
            return;
          }
          await page.getByText(textValidation.sanitized!).click();
        } else {
          bridge.sendTo(replyTo, 'browser.error', {
            error: 'Click requires either selector or text',
            command: 'browser.click',
          }, id);
          return;
        }

        bridge.sendTo(replyTo, 'browser.clicked', { selector, text }, id);
        logger.info( `Clicked: ${selector || text}`);
        break;
      }

      case 'browser.type': {
        if (!page) {
          bridge.sendTo(replyTo, 'browser.error', serializeError(Errors.browserNotLaunched()), id);
          return;
        }
        const { selector: sel, text: txt, clear } = payload as { selector: string; text: string; clear?: boolean };

        // Validate selector
        const selectorValidation = validateSelector(sel);
        if (!selectorValidation.valid) {
          bridge.sendTo(replyTo, 'browser.error', {
            error: `Selector validation failed: ${selectorValidation.error}`,
            command: 'browser.type',
          }, id);
          logger.warn( `Blocked type with invalid selector: ${selectorValidation.error}`);
          return;
        }

        // Validate text
        const textValidation = validateText(txt);
        if (!textValidation.valid) {
          bridge.sendTo(replyTo, 'browser.error', {
            error: `Text validation failed: ${textValidation.error}`,
            command: 'browser.type',
          }, id);
          return;
        }

        if (clear) {
          await page.fill(selectorValidation.sanitized!, '');
        }
        await page.fill(selectorValidation.sanitized!, textValidation.sanitized!);
        bridge.sendTo(replyTo, 'browser.typed', { selector: selectorValidation.sanitized, length: textValidation.sanitized!.length }, id);
        logger.info( `Typed into: ${selectorValidation.sanitized}`);
        break;
      }

      case 'browser.screenshot': {
        if (!page) {
          bridge.sendTo(replyTo, 'browser.error', serializeError(Errors.browserNotLaunched()), id);
          return;
        }
        // Handle null/undefined payload
        const opts = (payload || {}) as {
          fullPage?: boolean;
          selector?: string;
          planId?: string;
          stepIndex?: number;
          storeOnly?: boolean;  // If true, don't return base64, just store
        };
        const { fullPage = true, selector: screenshotSel, planId, stepIndex, storeOnly } = opts;
        let screenshotBuffer: Buffer;

        if (screenshotSel) {
          // Validate selector if provided
          const selectorValidation = validateSelector(screenshotSel);
          if (!selectorValidation.valid) {
            bridge.sendTo(replyTo, 'browser.error', {
              error: `Selector validation failed: ${selectorValidation.error}`,
              command: 'browser.screenshot',
            }, id);
            return;
          }
          screenshotBuffer = await page.locator(selectorValidation.sanitized!).screenshot();
        } else {
          screenshotBuffer = await page.screenshot({ fullPage });
        }

        // Save to disk
        const timestamp = Date.now();
        const filename = `${planId || 'unknown'}_step${stepIndex ?? 'x'}_${timestamp}.png`;
        const filepath = `${SCREENSHOTS_DIR}/${filename}`;

        try {
          writeFileSync(filepath, screenshotBuffer);
          logger.info(`Screenshot saved: ${filepath}`);
        } catch (err) {
          logger.error('Failed to save screenshot:', err);
        }

        // Submit to Bridge's report system
        try {
          await fetch(`${BRIDGE_URL_HTTP}/screenshots`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              base64: screenshotBuffer.toString('base64'),
              planId,
              stepIndex,
              correlationId,
            }),
          });
        } catch (err) {
          logger.warn('Failed to submit screenshot to Bridge:', err);
        }

        // Return response
        if (storeOnly) {
          bridge.sendTo(replyTo, 'browser.screenshotted', { path: filepath, size: screenshotBuffer.length }, id);
        } else {
          const base64 = screenshotBuffer.toString('base64');
          bridge.sendTo(replyTo, 'browser.screenshotted', { base64, path: filepath, size: screenshotBuffer.length }, id);
        }
        logger.info('Screenshot taken');
        break;
      }

      case 'browser.close': {
        if (browser) {
          await browser.close();
          browser = null;
          context = null;
          page = null;
          browserCloseCount++;
        }
        bridge.sendTo(replyTo, 'browser.closed', { success: true, duration: getElapsed() }, id);
        logger.info('Browser closed', { duration: getElapsed() });
        break;
      }

      default: {
        const error = Errors.unknownAction(type);
        logger.warn( error.toString());
        bridge.sendTo(replyTo, 'browser.error', serializeError(error), id);
      }
    }
  } catch (err) {
    // Wrap raw errors in structured error types based on context
    let structuredError: TripartiteError;

    if (err instanceof TripartiteError) {
      structuredError = err;
    } else {
      const cause = err instanceof Error ? err : undefined;
      const message = err instanceof Error ? err.message : String(err);

      // Categorize based on error message patterns
      if (message.includes('timeout') || message.includes('Timeout')) {
        structuredError = Errors.browserTimeout(type, 30000);
      } else if (message.includes('Element') || message.includes('selector') || message.includes('locator')) {
        structuredError = Errors.elementNotFound(message);
      } else if (message.includes('Navigation') || message.includes('net::')) {
        structuredError = Errors.navigationFailed('unknown', cause);
      } else {
        structuredError = Errors.unexpected(message, cause);
      }
    }

    structuredError.context.command = type;
    logger.error( `Command failed: ${structuredError.toString()}`);
    bridge.sendTo(replyTo, 'browser.error', serializeError(structuredError), id);
  }
}

// =============================================================================
// Message Handlers - Browser
// =============================================================================
bridge.on('browser.launch', handleBrowserCommand);
bridge.on('browser.navigate', handleBrowserCommand);
bridge.on('browser.click', handleBrowserCommand);
bridge.on('browser.type', handleBrowserCommand);
bridge.on('browser.screenshot', handleBrowserCommand);
bridge.on('browser.close', handleBrowserCommand);

// =============================================================================
// Message Handlers - Dynamic Tools
// =============================================================================

// Create a new dynamic tool
bridge.on('tool.create', async (message: BridgeMessage) => {
  const { id, correlationId, payload, source } = message;
  const replyTo = source || 'igor';
  const { name, description, code, inputSchema, author } = payload as {
    name: string;
    description: string;
    code: string;
    inputSchema: ToolSchema;
    author?: string;
  };

  try {
    const tool = await toolRegistry.register({ name, description, code, inputSchema, author });
    logger.info(`Dynamic tool created: ${name}`, { toolId: tool.id, correlationId });
    bridge.sendTo(replyTo, 'tool.created', {
      id: tool.id,
      name: tool.name,
      status: tool.status,
    }, id);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to create tool ${name}:`, { error, correlationId });
    bridge.sendTo(replyTo, 'tool.error', { error, operation: 'create', name }, id);
  }
});

// Invoke a dynamic tool
bridge.on('tool.invoke', async (message: BridgeMessage) => {
  const { id, correlationId, payload, source } = message;
  const replyTo = source || 'igor';
  const { toolId, params } = payload as { toolId: string; params: Record<string, unknown> };

  const ctx = createToolContext({
    correlationId,
    timeout: 30000,
    screenshotFn: async () => {
      if (page) {
        const buffer = await page.screenshot();
        return buffer.toString('base64');
      }
      // Fall back to system screenshot
      const proc = Bun.spawn(['grim', '-'], { stdout: 'pipe' });
      const buffer = await new Response(proc.stdout).arrayBuffer();
      return Buffer.from(buffer).toString('base64');
    },
  });

  const result = await toolRegistry.invoke(toolId, params, ctx);
  logger.info(`Tool invoked: ${toolId}`, { success: result.success, duration: result.duration, correlationId });
  bridge.sendTo(replyTo, 'tool.invoked', result, id);
});

// Update tool code (hot reload)
bridge.on('tool.update', async (message: BridgeMessage) => {
  const { id, correlationId, payload, source } = message;
  const replyTo = source || 'igor';
  const { toolId, code } = payload as { toolId: string; code: string };

  try {
    const tool = await toolRegistry.update(toolId, code);
    logger.info(`Tool updated: ${tool.name}`, { toolId: tool.id, correlationId });
    bridge.sendTo(replyTo, 'tool.updated', { id: tool.id, name: tool.name }, id);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to update tool ${toolId}:`, { error, correlationId });
    bridge.sendTo(replyTo, 'tool.error', { error, operation: 'update', toolId }, id);
  }
});

// Delete a tool
bridge.on('tool.delete', async (message: BridgeMessage) => {
  const { id, correlationId, payload, source } = message;
  const replyTo = source || 'igor';
  const { toolId } = payload as { toolId: string };

  const deleted = toolRegistry.delete(toolId);
  logger.info(`Tool deleted: ${toolId}`, { success: deleted, correlationId });
  bridge.sendTo(replyTo, 'tool.deleted', { toolId, success: deleted }, id);
});

// List all tools
bridge.on('tool.list', async (message: BridgeMessage) => {
  const { id, correlationId, source } = message;
  const replyTo = source || 'igor';

  const tools = toolRegistry.list().map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    status: t.status,
    invocations: t.invocations,
    successRate: t.invocations > 0 ? t.successes / t.invocations : 0,
    lastUsed: t.lastUsed,
  }));

  logger.debug(`Tool list requested`, { count: tools.length, correlationId });
  bridge.sendTo(replyTo, 'tool.listed', { tools }, id);
});

// Export tool for igorification
bridge.on('tool.export', async (message: BridgeMessage) => {
  const { id, correlationId, payload, source } = message;
  const replyTo = source || 'igor';
  const { toolId } = payload as { toolId: string };

  try {
    const exported = toolRegistry.export(toolId);
    toolRegistry.markIgorified(toolId);
    logger.info(`Tool exported for igorification: ${exported.toolName}`, { correlationId });
    bridge.sendTo(replyTo, 'tool.exported', exported, id);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to export tool ${toolId}:`, { error, correlationId });
    bridge.sendTo(replyTo, 'tool.error', { error, operation: 'export', toolId }, id);
  }
});

// =============================================================================
// Debug Session State
// =============================================================================
let debugSession: {
  toolId: string;
  code: string;
  history: Array<{ input: string; output: string; timestamp: Date }>;
} | null = null;

// Start debug session for a tool
bridge.on('tool.debug.start', async (message: BridgeMessage) => {
  const { id, correlationId, payload, source } = message;
  const replyTo = source || 'igor';
  const { toolId } = payload as { toolId: string };

  const tool = toolRegistry.get(toolId);
  if (!tool) {
    bridge.sendTo(replyTo, 'tool.error', { error: `Tool not found: ${toolId}`, operation: 'debug.start' }, id);
    return;
  }

  debugSession = {
    toolId,
    code: tool.code,
    history: [],
  };

  logger.info(`Debug session started for tool: ${tool.name}`, { correlationId });
  bridge.sendTo(replyTo, 'tool.debug.output', {
    type: 'session_started',
    toolId,
    toolName: tool.name,
    currentCode: tool.code,
  }, id);
});

// Evaluate code in debug session
bridge.on('tool.debug.eval', async (message: BridgeMessage) => {
  const { id, correlationId, payload, source } = message;
  const replyTo = source || 'igor';
  const { code, testParams } = payload as { code: string; testParams?: Record<string, unknown> };

  if (!debugSession) {
    bridge.sendTo(replyTo, 'tool.error', { error: 'No active debug session', operation: 'debug.eval' }, id);
    return;
  }

  try {
    // Update the tool with new code
    await toolRegistry.update(debugSession.toolId, code);
    debugSession.code = code;

    // If test params provided, run the tool
    let testResult = null;
    if (testParams) {
      const ctx = createToolContext({ correlationId, timeout: 10000 });
      testResult = await toolRegistry.invoke(debugSession.toolId, testParams, ctx);
    }

    debugSession.history.push({
      input: code,
      output: testResult ? JSON.stringify(testResult) : 'Code updated (no test run)',
      timestamp: new Date(),
    });

    bridge.sendTo(replyTo, 'tool.debug.output', {
      type: 'eval_result',
      success: true,
      testResult,
      historyLength: debugSession.history.length,
    }, id);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    debugSession.history.push({
      input: code,
      output: `Error: ${error}`,
      timestamp: new Date(),
    });
    bridge.sendTo(replyTo, 'tool.debug.output', {
      type: 'eval_error',
      error,
    }, id);
  }
});

// Stop debug session
bridge.on('tool.debug.stop', async (message: BridgeMessage) => {
  const { id, correlationId, source } = message;
  const replyTo = source || 'igor';

  if (debugSession) {
    logger.info(`Debug session ended for tool: ${debugSession.toolId}`, {
      iterations: debugSession.history.length,
      correlationId,
    });
    debugSession = null;
  }

  bridge.sendTo(replyTo, 'tool.debug.output', { type: 'session_ended' }, id);
});

// =============================================================================
// Health Check
// =============================================================================
function getHealth(): ComponentHealth & { resources: object; dynamicTools: object; systemTools: object } {
  const idleMs = browser ? Date.now() - browserLastUsed : 0;
  const toolStats = toolRegistry.getStats();

  return {
    status: 'healthy',
    version: FRANKENSTEIN_VERSION,
    uptime: Date.now() - startTime,
    pid: process.pid,
    bridgeConnected: bridge.isConnected(),
    resources: {
      activeBrowsers: browserLaunchCount - browserCloseCount,
      maxBrowsers: MAX_BROWSERS,
      totalLaunched: browserLaunchCount,
      totalClosed: browserCloseCount,
      idleEvictions: browserIdleEvictions,
      currentBrowserIdleMs: idleMs,
      idleTimeoutMs: BROWSER_IDLE_TIMEOUT,
      memoryUsage: process.memoryUsage().heapUsed,
      screenshotsDir: SCREENSHOTS_DIR,
    },
    dynamicTools: {
      total: toolStats.totalTools,
      experimental: toolStats.experimental,
      stable: toolStats.stable,
      igorified: toolStats.igorified,
      totalInvocations: toolStats.totalInvocations,
      successRate: toolStats.overallSuccessRate,
      debugSessionActive: debugSession !== null,
    },
    systemTools: systemTools || { detecting: true },
  };
}

// =============================================================================
// HTTP Server
// =============================================================================
const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = req.url || '/';
  const setCors = () => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  };

  setCors();

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (url === '/health' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'X-Version': FRANKENSTEIN_VERSION,
    });
    res.end(JSON.stringify({
      ...getHealth(),
      browserActive: browser !== null,
    }));
    return;
  }

  // List all dynamic tools
  if (url === '/tools' && req.method === 'GET') {
    const tools = toolRegistry.list().map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      status: t.status,
      invocations: t.invocations,
      successRate: t.invocations > 0 ? t.successes / t.invocations : 0,
      lastUsed: t.lastUsed,
      lastError: t.lastError,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tools, stats: toolRegistry.getStats() }));
    return;
  }

  // Get igorification candidates
  if (url === '/tools/igorify-candidates' && req.method === 'GET') {
    const candidates = toolRegistry.getIgorificationCandidates();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      candidates: candidates.map(t => ({
        id: t.id,
        name: t.name,
        invocations: t.invocations,
        successRate: t.successes / t.invocations,
      })),
    }));
    return;
  }

  // Create a dynamic tool (POST /tools)
  if (url === '/tools' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { name, description, code, inputSchema, author } = JSON.parse(body);
        const tool = await toolRegistry.register({ name, description, code, inputSchema, author });
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: tool.id, name: tool.name, status: tool.status }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      }
    });
    return;
  }

  // Invoke a tool (POST /tools/:id/invoke)
  const invokeMatch = url.match(/^\/tools\/([^/]+)\/invoke$/);
  if (invokeMatch && req.method === 'POST') {
    const toolId = invokeMatch[1];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const params = JSON.parse(body);
        const ctx = createToolContext({ timeout: 30000 });
        const result = await toolRegistry.invoke(toolId, params, ctx);
        res.writeHead(result.success ? 200 : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      }
    });
    return;
  }

  // Export a tool for igorification (POST /tools/:id/export)
  const exportMatch = url.match(/^\/tools\/([^/]+)\/export$/);
  if (exportMatch && req.method === 'POST') {
    const toolId = exportMatch[1];
    try {
      const exported = toolRegistry.export(toolId);
      toolRegistry.markIgorified(toolId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(exported));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }

  // Delete a tool (DELETE /tools/:id)
  const deleteMatch = url.match(/^\/tools\/([^/]+)$/);
  if (deleteMatch && req.method === 'DELETE') {
    const toolId = deleteMatch[1];
    const deleted = toolRegistry.delete(toolId);
    res.writeHead(deleted ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ deleted }));
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
// Startup
// =============================================================================
async function start() {
  logger.info('='.repeat(60));
  logger.info(`FRANKENSTEIN - Starting version ${FRANKENSTEIN_VERSION}`);
  logger.info(`PID: ${process.pid}`);
  logger.info(`Port: ${PORT}`);
  logger.info(`Bridge: ${BRIDGE_URL}`);
  logger.info(`Screenshots: ${SCREENSHOTS_DIR}`);
  logger.info('='.repeat(60));

  // Detect system tools
  logger.info('Detecting system tools...');
  try {
    systemTools = await detectTools();
    logger.info(`System tools detected:`, systemTools);

    // Register system tools as dynamic tools if available
    if (systemTools.screenshot || systemTools.mouse || systemTools.keyboard) {
      const systemToolDefs = getSystemToolDefinitions();
      for (const def of systemToolDefs) {
        // Only register tools we have support for
        if (def.name.startsWith('desktop_') && !systemTools.screenshot) continue;
        if (def.name.startsWith('mouse_') && !systemTools.mouse) continue;
        if (def.name.startsWith('keyboard_') && !systemTools.keyboard) continue;
        if (def.name.startsWith('window_') && !systemTools.window) continue;

        try {
          await toolRegistry.register({
            name: def.name,
            description: def.description,
            code: def.code,
            inputSchema: def.inputSchema,
            author: 'system',
          });
          logger.info(`Registered system tool: ${def.name}`);
        } catch (err) {
          logger.warn(`Failed to register system tool ${def.name}:`, err);
        }
      }
    }
  } catch (err) {
    logger.warn('Failed to detect system tools:', err);
  }

  // Start HTTP server
  httpServer.listen(PORT, () => {
    logger.info(`Health endpoint: http://localhost:${PORT}/health`);
  });

  // Connect to Bridge
  const connected = await bridge.connect();
  if (!connected) {
    logger.error('Failed to connect to Bridge');
    logger.info('Will retry connection...');
  }

  logger.info('Frankenstein ready. Awaiting commands...');
}

start();

// =============================================================================
// Graceful Shutdown
// =============================================================================
async function shutdown() {
  logger.info( 'Shutting down...');

  if (browser) {
    await browser.close();
  }

  bridge.disconnect();
  httpServer.close();

  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// =============================================================================
// Exception Handlers - DO NOT EXIT, recover gracefully
// =============================================================================
let uncaughtExceptionCount = 0;
let unhandledRejectionCount = 0;

process.on('uncaughtException', (err) => {
  uncaughtExceptionCount++;
  logger.error('Uncaught exception (CONTINUING)', {
    error: err.message,
    stack: err.stack,
    count: uncaughtExceptionCount,
  });

  // Clean up browser gracefully but don't exit
  if (browser) {
    browser.close().catch(() => {});
    browser = null;
    context = null;
    page = null;
    browserCloseCount++;
  }

  // If we're getting too many exceptions, something is fundamentally broken
  if (uncaughtExceptionCount > 10) {
    logger.error('Too many uncaught exceptions (>10), exiting');
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason) => {
  unhandledRejectionCount++;
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error('Unhandled rejection (CONTINUING)', {
    error: err.message,
    stack: err.stack,
    count: unhandledRejectionCount,
  });

  // Clean up browser gracefully but don't exit
  if (browser) {
    browser.close().catch(() => {});
    browser = null;
    context = null;
    page = null;
    browserCloseCount++;
  }

  // If we're getting too many rejections, something is fundamentally broken
  if (unhandledRejectionCount > 10) {
    logger.error('Too many unhandled rejections (>10), exiting');
    process.exit(1);
  }
});
