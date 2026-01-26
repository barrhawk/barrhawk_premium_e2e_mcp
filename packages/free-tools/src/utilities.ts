/**
 * Utilities - Free Tier
 *
 * Browser utilities for storage, console, network, and screenshots.
 */

import type { Page, Route } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

// Storage Types
export interface StorageClearOptions {
  page: Page;
  type: 'cookies' | 'localStorage' | 'sessionStorage' | 'all';
  origin?: string;
}

export interface StorageClearResult {
  cleared: string[];
  message: string;
}

export interface StorageGetOptions {
  page: Page;
  type: 'cookies' | 'localStorage' | 'sessionStorage';
  key?: string;  // If not provided, get all
}

export interface StorageGetResult {
  type: string;
  data: Record<string, unknown> | unknown;
  count: number;
}

export interface StorageSetOptions {
  page: Page;
  type: 'cookies' | 'localStorage' | 'sessionStorage';
  key: string;
  value: string | Record<string, unknown>;
  // Cookie-specific options
  domain?: string;
  path?: string;
  expires?: number;  // Unix timestamp
  httpOnly?: boolean;
  secure?: boolean;
}

export interface StorageSetResult {
  success: boolean;
  type: string;
  key: string;
  message: string;
}

// Console Types
export interface ConsoleCaptureOptions {
  page: Page;
  types?: ('log' | 'info' | 'warn' | 'error' | 'debug')[];
  maxMessages?: number;
}

export interface ConsoleMessage {
  type: string;
  text: string;
  timestamp: string;
  location?: {
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
}

export interface ConsoleCaptureResult {
  messages: ConsoleMessage[];
  count: number;
  errors: number;
  warnings: number;
}

// Network Types
export interface NetworkWaitOptions {
  page: Page;
  state?: 'load' | 'domcontentloaded' | 'networkidle';
  timeout?: number;
}

export interface NetworkWaitResult {
  success: boolean;
  duration: number;
  message: string;
}

export interface NetworkMockOptions {
  page: Page;
  url: string;  // URL pattern (glob or regex string)
  response: {
    status?: number;
    headers?: Record<string, string>;
    body?: string | Record<string, unknown>;
    contentType?: string;
  };
}

export interface NetworkMockResult {
  success: boolean;
  pattern: string;
  message: string;
}

// Screenshot Types
export interface ScreenshotCompareOptions {
  baseline: string;  // Path to baseline image or base64
  current: string;   // Path to current image or base64
  threshold?: number;  // 0-1, percentage of different pixels allowed
  outputDiff?: string;  // Path to save diff image
}

export interface ScreenshotCompareResult {
  match: boolean;
  diffPercentage: number;
  diffPixels: number;
  totalPixels: number;
  message: string;
  diffImage?: string;
}

// ============================================================================
// Console Capture State
// ============================================================================

let capturedMessages: ConsoleMessage[] = [];
let captureActive = false;
let captureTypes: Set<string> = new Set();

// ============================================================================
// Storage Implementations
// ============================================================================

/**
 * Clear browser storage
 */
export async function storageClear(options: StorageClearOptions): Promise<StorageClearResult> {
  const { page, type, origin } = options;
  const cleared: string[] = [];

  const context = page.context();

  if (type === 'cookies' || type === 'all') {
    if (origin) {
      await context.clearCookies({ domain: new URL(origin).hostname });
    } else {
      await context.clearCookies();
    }
    cleared.push('cookies');
  }

  if (type === 'localStorage' || type === 'all') {
    await page.evaluate(() => localStorage.clear());
    cleared.push('localStorage');
  }

  if (type === 'sessionStorage' || type === 'all') {
    await page.evaluate(() => sessionStorage.clear());
    cleared.push('sessionStorage');
  }

  return {
    cleared,
    message: `Cleared: ${cleared.join(', ')}`,
  };
}

/**
 * Get storage values
 */
export async function storageGet(options: StorageGetOptions): Promise<StorageGetResult> {
  const { page, type, key } = options;

  if (type === 'cookies') {
    const context = page.context();
    const cookies = await context.cookies();

    if (key) {
      const cookie = cookies.find(c => c.name === key);
      return {
        type: 'cookies',
        data: cookie || null,
        count: cookie ? 1 : 0,
      };
    }

    const cookieMap: Record<string, unknown> = {};
    for (const cookie of cookies) {
      cookieMap[cookie.name] = cookie.value;
    }

    return {
      type: 'cookies',
      data: cookieMap,
      count: cookies.length,
    };
  }

  if (type === 'localStorage') {
    if (key) {
      const value = await page.evaluate((k) => localStorage.getItem(k), key);
      return {
        type: 'localStorage',
        data: value,
        count: value !== null ? 1 : 0,
      };
    }

    const data = await page.evaluate(() => {
      const items: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) {
          items[k] = localStorage.getItem(k) || '';
        }
      }
      return items;
    });

    return {
      type: 'localStorage',
      data,
      count: Object.keys(data).length,
    };
  }

  if (type === 'sessionStorage') {
    if (key) {
      const value = await page.evaluate((k) => sessionStorage.getItem(k), key);
      return {
        type: 'sessionStorage',
        data: value,
        count: value !== null ? 1 : 0,
      };
    }

    const data = await page.evaluate(() => {
      const items: Record<string, string> = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k) {
          items[k] = sessionStorage.getItem(k) || '';
        }
      }
      return items;
    });

    return {
      type: 'sessionStorage',
      data,
      count: Object.keys(data).length,
    };
  }

  return {
    type,
    data: null,
    count: 0,
  };
}

/**
 * Set storage values
 */
export async function storageSet(options: StorageSetOptions): Promise<StorageSetResult> {
  const { page, type, key, value, domain, path: cookiePath, expires, httpOnly, secure } = options;

  try {
    if (type === 'cookies') {
      const context = page.context();
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);

      await context.addCookies([{
        name: key,
        value: stringValue,
        domain: domain || new URL(page.url()).hostname,
        path: cookiePath || '/',
        expires: expires,
        httpOnly: httpOnly,
        secure: secure,
      }]);

      return {
        success: true,
        type: 'cookies',
        key,
        message: `Cookie "${key}" set successfully`,
      };
    }

    if (type === 'localStorage') {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      await page.evaluate(({ k, v }) => localStorage.setItem(k, v), { k: key, v: stringValue });

      return {
        success: true,
        type: 'localStorage',
        key,
        message: `localStorage["${key}"] set successfully`,
      };
    }

    if (type === 'sessionStorage') {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      await page.evaluate(({ k, v }) => sessionStorage.setItem(k, v), { k: key, v: stringValue });

      return {
        success: true,
        type: 'sessionStorage',
        key,
        message: `sessionStorage["${key}"] set successfully`,
      };
    }

    return {
      success: false,
      type,
      key,
      message: `Unknown storage type: ${type}`,
    };
  } catch (error) {
    return {
      success: false,
      type,
      key,
      message: `Error setting ${type}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Console Implementations
// ============================================================================

/**
 * Start capturing console messages
 */
export function consoleStartCapture(options: ConsoleCaptureOptions): void {
  const { page, types = ['log', 'info', 'warn', 'error'], maxMessages = 1000 } = options;

  capturedMessages = [];
  captureActive = true;
  captureTypes = new Set(types);

  page.on('console', (msg) => {
    if (!captureActive) return;

    const msgType = msg.type();
    if (!captureTypes.has(msgType)) return;

    if (capturedMessages.length >= maxMessages) {
      capturedMessages.shift(); // Remove oldest
    }

    const location = msg.location();

    capturedMessages.push({
      type: msgType,
      text: msg.text(),
      timestamp: new Date().toISOString(),
      location: location ? {
        url: location.url,
        lineNumber: location.lineNumber,
        columnNumber: location.columnNumber,
      } : undefined,
    });
  });
}

/**
 * Stop capturing and return messages
 */
export function consoleStopCapture(): ConsoleCaptureResult {
  captureActive = false;

  const errors = capturedMessages.filter(m => m.type === 'error').length;
  const warnings = capturedMessages.filter(m => m.type === 'warn').length;

  const result: ConsoleCaptureResult = {
    messages: [...capturedMessages],
    count: capturedMessages.length,
    errors,
    warnings,
  };

  capturedMessages = [];

  return result;
}

/**
 * Get captured messages without stopping
 */
export function consoleGetMessages(): ConsoleCaptureResult {
  const errors = capturedMessages.filter(m => m.type === 'error').length;
  const warnings = capturedMessages.filter(m => m.type === 'warn').length;

  return {
    messages: [...capturedMessages],
    count: capturedMessages.length,
    errors,
    warnings,
  };
}

// ============================================================================
// Network Implementations
// ============================================================================

/**
 * Wait for network to be idle
 */
export async function networkWait(options: NetworkWaitOptions): Promise<NetworkWaitResult> {
  const { page, state = 'networkidle', timeout = 30000 } = options;
  const startTime = Date.now();

  try {
    await page.waitForLoadState(state, { timeout });

    return {
      success: true,
      duration: Date.now() - startTime,
      message: `Network reached "${state}" state`,
    };
  } catch (error) {
    return {
      success: false,
      duration: Date.now() - startTime,
      message: `Timeout waiting for "${state}": ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Mock network requests
 */
export async function networkMock(options: NetworkMockOptions): Promise<NetworkMockResult> {
  const { page, url, response } = options;

  try {
    await page.route(url, async (route: Route) => {
      const body = typeof response.body === 'string'
        ? response.body
        : JSON.stringify(response.body);

      await route.fulfill({
        status: response.status || 200,
        headers: {
          'Content-Type': response.contentType || 'application/json',
          ...response.headers,
        },
        body,
      });
    });

    return {
      success: true,
      pattern: url,
      message: `Mocked requests matching "${url}"`,
    };
  } catch (error) {
    return {
      success: false,
      pattern: url,
      message: `Failed to set up mock: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Remove network mocks
 */
export async function networkUnmock(page: Page, url?: string): Promise<{ success: boolean; message: string }> {
  try {
    if (url) {
      await page.unroute(url);
      return { success: true, message: `Removed mock for "${url}"` };
    } else {
      await page.unroute('**/*');
      return { success: true, message: 'Removed all network mocks' };
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to remove mock: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Screenshot Implementations
// ============================================================================

/**
 * Compare two screenshots (simple pixel comparison)
 * Note: This is a basic implementation. For AI-powered visual comparison, upgrade to Premium.
 */
export async function screenshotCompare(options: ScreenshotCompareOptions): Promise<ScreenshotCompareResult> {
  const { baseline, current, threshold = 0.01, outputDiff } = options;

  try {
    // Load images
    const baselineBuffer = loadImage(baseline);
    const currentBuffer = loadImage(current);

    // Simple size check
    if (baselineBuffer.length !== currentBuffer.length) {
      return {
        match: false,
        diffPercentage: 100,
        diffPixels: Math.max(baselineBuffer.length, currentBuffer.length),
        totalPixels: Math.max(baselineBuffer.length, currentBuffer.length),
        message: 'Images have different sizes',
      };
    }

    // Compare pixels
    let diffPixels = 0;
    const totalPixels = baselineBuffer.length;

    for (let i = 0; i < baselineBuffer.length; i++) {
      if (baselineBuffer[i] !== currentBuffer[i]) {
        diffPixels++;
      }
    }

    const diffPercentage = (diffPixels / totalPixels) * 100;
    const match = diffPercentage <= threshold * 100;

    // Generate diff image if requested (simple XOR diff)
    let diffImage: string | undefined;
    if (outputDiff && !match) {
      const diffBuffer = Buffer.alloc(baselineBuffer.length);
      for (let i = 0; i < baselineBuffer.length; i++) {
        diffBuffer[i] = baselineBuffer[i] ^ currentBuffer[i];
      }
      fs.writeFileSync(outputDiff, diffBuffer);
      diffImage = outputDiff;
    }

    return {
      match,
      diffPercentage: Math.round(diffPercentage * 100) / 100,
      diffPixels,
      totalPixels,
      message: match
        ? `Images match (${diffPercentage.toFixed(2)}% different, threshold: ${threshold * 100}%)`
        : `Images differ by ${diffPercentage.toFixed(2)}% (threshold: ${threshold * 100}%)`,
      diffImage,
    };
  } catch (error) {
    return {
      match: false,
      diffPercentage: 100,
      diffPixels: 0,
      totalPixels: 0,
      message: `Comparison failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function loadImage(source: string): Buffer {
  // Check if it's base64
  if (source.startsWith('data:image') || source.match(/^[A-Za-z0-9+/=]+$/)) {
    const base64Data = source.replace(/^data:image\/\w+;base64,/, '');
    return Buffer.from(base64Data, 'base64');
  }

  // Otherwise treat as file path
  if (!fs.existsSync(source)) {
    throw new Error(`Image file not found: ${source}`);
  }

  return fs.readFileSync(source);
}

/**
 * Format utility results for display
 */
export function formatUtilityResult(result: Record<string, unknown>): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'object' && value !== null) {
      lines.push(`${key}: ${JSON.stringify(value, null, 2)}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }

  return lines.join('\n');
}
