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
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'fs';

// =============================================================================
// Multi-instance support - MUST be defined first
// =============================================================================
const FRANK_INSTANCE_ID = process.env.FRANK_INSTANCE_ID || '';

// =============================================================================
// PHASE 1: Single Instance Guard (PID File per instance)
// =============================================================================
// PID file is unique per instance ID to allow multiple instances
const PID_FILE = FRANK_INSTANCE_ID ? `/tmp/frankenstein-${FRANK_INSTANCE_ID}.pid` : '/tmp/frankenstein.pid';

function ensureSingleInstance(): void {
  if (existsSync(PID_FILE)) {
    try {
      const oldPid = parseInt(readFileSync(PID_FILE, 'utf-8').trim());
      // Check if the old process is still running
      try {
        process.kill(oldPid, 0); // Signal 0 = check if process exists
        console.error(`[Frankenstein] Another instance already running (PID ${oldPid}). Exiting.`);
        process.exit(1);
      } catch {
        // Old process is dead, remove stale PID file
        console.log(`[Frankenstein] Removing stale PID file (old PID ${oldPid} not running)`);
        unlinkSync(PID_FILE);
      }
    } catch (err) {
      // Error reading PID file, remove it
      console.log(`[Frankenstein] Removing invalid PID file`);
      try { unlinkSync(PID_FILE); } catch {}
    }
  }

  // Write our PID
  writeFileSync(PID_FILE, process.pid.toString());
  console.log(`[Frankenstein] PID file written: ${PID_FILE} (PID: ${process.pid})`);

  // Clean up PID file on exit
  const cleanupPidFile = () => {
    try {
      if (existsSync(PID_FILE)) {
        const currentPid = readFileSync(PID_FILE, 'utf-8').trim();
        if (currentPid === process.pid.toString()) {
          unlinkSync(PID_FILE);
        }
      }
    } catch {}
  };

  process.on('exit', cleanupPidFile);
  process.on('SIGTERM', cleanupPidFile);
  process.on('SIGINT', cleanupPidFile);
}

// Run single instance check immediately
ensureSingleInstance();

// =============================================================================
// PHASE 1: Reconnection Backoff
// =============================================================================
let reconnectAttempts = 0;
const MAX_RECONNECT_BACKOFF = 30000; // 30 seconds max
const RECONNECT_BASE_MS = 1000;

function getReconnectDelay(): number {
  const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts), MAX_RECONNECT_BACKOFF);
  // Add 20% jitter to prevent thundering herd
  const jitter = delay * 0.2 * (Math.random() * 2 - 1);
  reconnectAttempts++;
  return Math.max(500, Math.round(delay + jitter));
}

function resetReconnectBackoff(): void {
  reconnectAttempts = 0;
}

// =============================================================================
// VERSION CANARY - CHANGE THIS ON EVERY DEPLOY
// =============================================================================
const FRANKENSTEIN_VERSION = '2026-01-30-v10-stable-websocket';

// =============================================================================
// Configuration
// =============================================================================
const REQUESTED_PORT = parseInt(process.env.FRANKENSTEIN_PORT || '7003');
const BRIDGE_URL = process.env.BRIDGE_URL || 'ws://localhost:7000';
const BRIDGE_AUTH_TOKEN = process.env.BRIDGE_AUTH_TOKEN || '';

// Port will be set after checking availability
let PORT = REQUESTED_PORT;

/**
 * Check if a port is available
 */
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = require('net').createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

/**
 * Find an available port starting from the requested port
 */
async function findAvailablePort(startPort: number, maxAttempts: number = 10): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
    console.log(`[Frankenstein] Port ${port} in use, trying ${port + 1}...`);
  }
  throw new Error(`No available port found in range ${startPort}-${startPort + maxAttempts - 1}`);
}

// Component ID for Bridge registration (allows multiple instances)
const COMPONENT_ID = FRANK_INSTANCE_ID ? `frankenstein-${FRANK_INSTANCE_ID}` : 'frankenstein' as const;

// =============================================================================
// Logger - Uses component ID for multi-instance logging
// =============================================================================
const logger = createLogger({
  component: COMPONENT_ID,
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
const VIDEOS_DIR = process.env.VIDEOS_DIR || '/tmp/tripartite-videos';
const BRIDGE_URL_HTTP = process.env.BRIDGE_URL?.replace('ws://', 'http://').replace(':7000', ':7000') || 'http://localhost:7000';

// Ensure directories exist
if (!existsSync(SCREENSHOTS_DIR)) {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}
if (!existsSync(VIDEOS_DIR)) {
  mkdirSync(VIDEOS_DIR, { recursive: true });
}

// Video recording state
let isRecording = false;
let recordingStartTime = 0;
let currentVideoPath: string | null = null;

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
  componentId: COMPONENT_ID as any,  // Support multi-instance (frankenstein, frankenstein-1, etc.)
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

        const opts = payload as {
          headless?: boolean;
          viewport?: { width: number; height: number };
          extensions?: string[];
          recordVideo?: boolean;
          videoSize?: { width: number; height: number };
        };

        // If extensions are specified, use persistent context for extension support
        if (opts.extensions && opts.extensions.length > 0) {
          const extensionPaths = opts.extensions.join(',');
          const userDataDir = `/tmp/frank-ext-profile-${Date.now()}`;
          logger.info('Launching browser with extensions', { extensions: opts.extensions });

          context = await chromium.launchPersistentContext(userDataDir, {
            headless: false, // Extensions require headed mode
            args: [
              `--disable-extensions-except=${extensionPaths}`,
              `--load-extension=${extensionPaths}`,
              '--no-first-run',
              '--disable-popup-blocking',
            ],
            viewport: opts.viewport || { width: 1280, height: 720 },
          });

          // PersistentContext doesn't have a separate browser object
          browser = (context as any).browser?.() || null;
          page = context.pages()[0] || await context.newPage();
        } else {
          browser = await chromium.launch({
            headless: opts.headless ?? false,
            args: ['--window-size=1280,720', '--window-position=0,0'],
          });

          // Context options with optional video recording
          const contextOpts: any = {
            viewport: opts.viewport || { width: 1280, height: 720 },
          };

          if (opts.recordVideo) {
            // Don't set size - let Playwright auto-match to actual viewport
            // This prevents gray borders when window manager constrains the window
            contextOpts.recordVideo = {
              dir: VIDEOS_DIR,
              ...(opts.videoSize ? { size: opts.videoSize } : {}),
            };
            isRecording = true;
            recordingStartTime = Date.now();
            currentVideoPath = null;
            logger.info('Video recording enabled', { dir: VIDEOS_DIR, autoSize: !opts.videoSize });
          }

          context = await browser.newContext(contextOpts);
          page = await context.newPage();

          // Ensure viewport exactly matches video size for clean recordings
          const viewportSize = opts.viewport || { width: 1280, height: 720 };
          await page.setViewportSize(viewportSize);

          // If recording, track the video path
          if (opts.recordVideo && page) {
            const video = page.video();
            if (video) {
              video.path().then(p => {
                currentVideoPath = p;
                logger.info('Video recording started', { path: p });
              }).catch(() => {});
            }
          }
        }
        browserLaunchCount++;

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
        const { selector, text, waitForNavigation: wfn } = payload as { selector?: string; text?: string; waitForNavigation?: boolean };

        // Helper to perform click with optional navigation wait
        const performClick = async (clickFn: () => Promise<void>) => {
          if (wfn) {
            // Wait for navigation after click (for form submissions, links, etc.)
            await Promise.all([
              page!.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {
                // Navigation timeout is OK - some clicks don't navigate
                logger.debug('No navigation after click (may be expected)');
              }),
              clickFn(),
            ]);
          } else {
            await clickFn();
          }
        };

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
          await performClick(() => page!.click(selectorValidation.sanitized!));
        } else if (text) {
          const textValidation = validateText(text, 1000);
          if (!textValidation.valid) {
            bridge.sendTo(replyTo, 'browser.error', {
              error: `Text validation failed: ${textValidation.error}`,
              command: 'browser.click',
            }, id);
            return;
          }
          await performClick(() => page!.getByText(textValidation.sanitized!).click());
        } else {
          bridge.sendTo(replyTo, 'browser.error', {
            error: 'Click requires either selector or text',
            command: 'browser.click',
          }, id);
          return;
        }

        bridge.sendTo(replyTo, 'browser.clicked', { selector, text, navigated: wfn }, id);
        logger.info( `Clicked: ${selector || text}${wfn ? ' (waited for navigation)' : ''}`);
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

      case 'browser.select': {
        if (!page) {
          bridge.sendTo(replyTo, 'browser.error', serializeError(Errors.browserNotLaunched()), id);
          return;
        }
        const { selector: sel, value, label } = payload as { selector: string; value?: string; label?: string };

        // Validate selector
        const selectorValidation = validateSelector(sel);
        if (!selectorValidation.valid) {
          bridge.sendTo(replyTo, 'browser.error', {
            error: `Selector validation failed: ${selectorValidation.error}`,
            command: 'browser.select',
          }, id);
          return;
        }

        // Select by value or label
        if (value) {
          await page.selectOption(selectorValidation.sanitized!, { value });
        } else if (label) {
          await page.selectOption(selectorValidation.sanitized!, { label });
        } else {
          bridge.sendTo(replyTo, 'browser.error', {
            error: 'Select requires either value or label',
            command: 'browser.select',
          }, id);
          return;
        }

        bridge.sendTo(replyTo, 'browser.selected', { selector: selectorValidation.sanitized, value, label }, id);
        logger.info(`Selected: ${selectorValidation.sanitized} -> ${value || label}`);
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
        let videoPath: string | null = null;
        let videoDuration = 0;

        // If recording, save the video before closing
        if (isRecording && page) {
          const video = page.video();
          if (video) {
            try {
              videoPath = await video.path();
              videoDuration = Date.now() - recordingStartTime;
              logger.info('Video saved', { path: videoPath, durationMs: videoDuration });
            } catch (e) {
              logger.warn('Could not get video path', { error: (e as Error).message });
            }
          }
        }

        if (context) {
          await context.close(); // This finalizes the video
        }
        if (browser) {
          await browser.close();
          browser = null;
          context = null;
          page = null;
          browserCloseCount++;
        }

        // Reset recording state
        const wasRecording = isRecording;
        isRecording = false;
        recordingStartTime = 0;
        currentVideoPath = null;

        bridge.sendTo(replyTo, 'browser.closed', {
          success: true,
          duration: getElapsed(),
          video: wasRecording ? { path: videoPath, durationMs: videoDuration } : undefined,
        }, id);
        logger.info('Browser closed', { duration: getElapsed(), videoPath });
        break;
      }

      case 'browser.evaluate': {
        if (!page) {
          bridge.sendTo(replyTo, 'error', { message: 'No active page' }, id);
          break;
        }

        const script = payload.script as string;
        if (!script) {
          bridge.sendTo(replyTo, 'error', { message: 'Script is required' }, id);
          break;
        }

        try {
          // eslint-disable-next-line @typescript-eslint/no-implied-eval
          const result = await page.evaluate((s: string) => {
            // eslint-disable-next-line no-eval
            return eval(s);
          }, script);

          bridge.sendTo(replyTo, 'browser.evaluated', { result }, id);
          logger.info('Evaluated script', { scriptLength: script.length });
        } catch (e) {
          bridge.sendTo(replyTo, 'error', { message: (e as Error).message }, id);
        }
        break;
      }

      case 'video.status': {
        bridge.sendTo(replyTo, 'video.status', {
          isRecording,
          durationMs: isRecording ? Date.now() - recordingStartTime : 0,
          path: currentVideoPath,
          videosDir: VIDEOS_DIR,
        }, id);
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
bridge.on('browser.select', handleBrowserCommand);
bridge.on('browser.screenshot', handleBrowserCommand);
bridge.on('browser.close', handleBrowserCommand);
bridge.on('video.status', handleBrowserCommand);

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

    // Notify the original requestor
    bridge.sendTo(replyTo, 'tool.created', {
      id: tool.id,
      name: tool.name,
      status: tool.status,
    }, id);

    // Notify Bridge about new tool for broadcast to all Igors
    bridge.sendTo('bridge', 'tool.created' as any, {
      tool: {
        id: tool.id,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
    });
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
// Message Handlers - System (OS-Level) Tools
// =============================================================================

import {
  takeScreenshot as sysScreenshot,
  pressKey,
  typeText,
  mouseClick,
  mouseMove,
  mouseDrag,
  listWindows,
  focusWindow,
  findWindowByName,
} from './system-tools.js';

bridge.on('system.screenshot', async (message: BridgeMessage) => {
  const { id, payload, source } = message;
  const replyTo = source || 'igor';
  const opts = (payload || {}) as { output?: string; base64?: boolean };

  try {
    const result = await sysScreenshot({ output: opts.output });
    const response: any = { path: result.path, tool: result.tool, size: 0 };

    // Get file size
    try {
      const file = Bun.file(result.path);
      response.size = file.size;
    } catch {}

    if (opts.base64) {
      response.base64 = result.base64;
    }

    bridge.sendTo(replyTo, 'system.screenshot.done', response, id);
    logger.info(`OS screenshot taken: ${result.path}`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error('OS screenshot failed:', { error });
    bridge.sendTo(replyTo, 'system.screenshot.error', { error }, id);
  }
});

bridge.on('system.keyboard.press', async (message: BridgeMessage) => {
  const { id, payload, source } = message;
  const replyTo = source || 'igor';
  const { combo } = payload as { combo: string };

  try {
    // Parse combo like "ctrl+b" into key and modifiers
    const parts = combo.split('+');
    const key = parts.pop()!;
    const modifiers = parts;
    await pressKey(key, modifiers);
    bridge.sendTo(replyTo, 'system.keyboard.done', { pressed: true, combo }, id);
    logger.info(`OS key pressed: ${combo}`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    bridge.sendTo(replyTo, 'system.keyboard.error', { error }, id);
  }
});

bridge.on('system.keyboard.type', async (message: BridgeMessage) => {
  const { id, payload, source } = message;
  const replyTo = source || 'igor';
  const { text, delay } = payload as { text: string; delay?: number };

  try {
    await typeText(text, delay || 0);
    bridge.sendTo(replyTo, 'system.keyboard.done', { typed: true, length: text.length }, id);
    logger.info(`OS text typed: ${text.length} chars`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    bridge.sendTo(replyTo, 'system.keyboard.error', { error }, id);
  }
});

bridge.on('system.mouse.click', async (message: BridgeMessage) => {
  const { id, payload, source } = message;
  const replyTo = source || 'igor';
  const { x, y, button, clicks } = payload as { x: number; y: number; button?: string; clicks?: number };

  try {
    await mouseClick({
      x, y,
      button: (button as 'left' | 'right' | 'middle') || 'left',
      clicks: clicks || 1,
    });
    bridge.sendTo(replyTo, 'system.mouse.done', { clicked: true, x, y }, id);
    logger.info(`OS mouse click at ${x},${y}`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    bridge.sendTo(replyTo, 'system.mouse.error', { error }, id);
  }
});

bridge.on('system.mouse.move', async (message: BridgeMessage) => {
  const { id, payload, source } = message;
  const replyTo = source || 'igor';
  const { x, y } = payload as { x: number; y: number };

  try {
    await mouseMove({ x, y });
    bridge.sendTo(replyTo, 'system.mouse.done', { moved: true, x, y }, id);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    bridge.sendTo(replyTo, 'system.mouse.error', { error }, id);
  }
});

bridge.on('system.mouse.drag', async (message: BridgeMessage) => {
  const { id, payload, source } = message;
  const replyTo = source || 'igor';
  const { fromX, fromY, toX, toY, button } = payload as {
    fromX: number; fromY: number; toX: number; toY: number; button?: string;
  };

  try {
    await mouseDrag(fromX, fromY, toX, toY, (button as 'left' | 'right' | 'middle') || 'left');
    bridge.sendTo(replyTo, 'system.mouse.done', { dragged: true, from: { x: fromX, y: fromY }, to: { x: toX, y: toY } }, id);
    logger.info(`OS mouse drag from ${fromX},${fromY} to ${toX},${toY}`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    bridge.sendTo(replyTo, 'system.mouse.error', { error }, id);
  }
});

bridge.on('system.window.list', async (message: BridgeMessage) => {
  const { id, source } = message;
  const replyTo = source || 'igor';

  try {
    const windows = await listWindows();
    bridge.sendTo(replyTo, 'system.window.done', { windows, count: windows.length }, id);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    bridge.sendTo(replyTo, 'system.window.error', { error }, id);
  }
});

bridge.on('system.window.focus', async (message: BridgeMessage) => {
  const { id, payload, source } = message;
  const replyTo = source || 'igor';
  const { name, id: windowId } = payload as { name?: string; id?: string };

  try {
    let targetId = windowId;
    if (!targetId && name) {
      targetId = await findWindowByName(name) || undefined;
    }
    if (!targetId) {
      throw new Error(`Window not found: ${name || windowId}`);
    }
    await focusWindow(targetId);
    bridge.sendTo(replyTo, 'system.window.done', { focused: true, windowId: targetId }, id);
    logger.info(`OS window focused: ${targetId}`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    bridge.sendTo(replyTo, 'system.window.error', { error }, id);
  }
});

// =============================================================================
// PHASE 1: Shutdown Handler (from Doctor for tool reloads)
// =============================================================================
bridge.on('shutdown' as any, async (message: BridgeMessage) => {
  const { reason } = (message.payload || {}) as { reason?: string };
  logger.info(`Shutdown requested: ${reason || 'no reason given'}`);

  // Close browser if open
  if (browser) {
    try {
      await browser.close();
    } catch {}
    browser = null;
    context = null;
    page = null;
  }

  // Disconnect from bridge gracefully
  bridge.disconnect();

  // Clean up PID file
  try {
    if (existsSync(PID_FILE)) {
      unlinkSync(PID_FILE);
    }
  } catch {}

  // Exit process (Doctor will restart us)
  logger.info('Frankenstein shutting down for restart...');
  process.exit(0);
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

        // Broadcast tool creation to Bridge for Igor injection
        bridge.sendTo('bridge', 'tool.created' as any, {
          tool: {
            id: tool.id,
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          },
        });

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
  // Find available port before starting
  try {
    PORT = await findAvailablePort(REQUESTED_PORT);
    if (PORT !== REQUESTED_PORT) {
      console.log(`[Frankenstein] Using port ${PORT} (requested ${REQUESTED_PORT} was in use)`);
    }
  } catch (err) {
    console.error(`[Frankenstein] Failed to find available port: ${err}`);
    process.exit(1);
  }

  logger.info('='.repeat(60));
  logger.info(`FRANKENSTEIN - Starting version ${FRANKENSTEIN_VERSION}`);
  logger.info(`Component ID: ${COMPONENT_ID}${FRANK_INSTANCE_ID ? ` (instance: ${FRANK_INSTANCE_ID})` : ''}`);
  logger.info(`PID: ${process.pid}`);
  logger.info(`Port: ${PORT}${PORT !== REQUESTED_PORT ? ` (auto-assigned, requested ${REQUESTED_PORT})` : ''}`);
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

  // Connect to Bridge with backoff retry
  let connected = false;
  while (!connected) {
    connected = await bridge.connect();
    if (connected) {
      resetReconnectBackoff();
      logger.info('Connected to Bridge successfully');
    } else {
      const delay = getReconnectDelay();
      logger.warn(`Failed to connect to Bridge, retrying in ${delay}ms (attempt ${reconnectAttempts})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
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
