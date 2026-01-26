/**
 * Shared Browser State
 *
 * Singleton browser state that can be accessed by both the MCP server and dashboard.
 * This allows the dashboard to control and observe the same browser instance.
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import path from 'path';

export interface BrowserState {
  browser: Browser | null;
  context: BrowserContext | null;
  page: Page | null;
  currentUrl: string | null;
  isHeadless: boolean;
  runId: string | null;
}

// Singleton state
const state: BrowserState = {
  browser: null,
  context: null,
  page: null,
  currentUrl: null,
  isHeadless: false,
  runId: null,
};

// Event listeners for state changes
type StateChangeCallback = (state: BrowserState) => void;
const listeners: StateChangeCallback[] = [];

export function onStateChange(callback: StateChangeCallback) {
  listeners.push(callback);
  return () => {
    const idx = listeners.indexOf(callback);
    if (idx > -1) listeners.splice(idx, 1);
  };
}

function notifyListeners() {
  for (const listener of listeners) {
    try {
      listener(state);
    } catch {}
  }
}

export function getBrowserState(): Readonly<BrowserState> {
  return state;
}

export function getPage(): Page | null {
  return state.page;
}

export function isActive(): boolean {
  return state.page !== null;
}

export async function launch(options: {
  headless?: boolean;
  extensionPath?: string;
  url?: string;
  viewport?: { width: number; height: number };
}): Promise<{ success: boolean; message: string; runId?: string }> {
  // Close existing session
  await close();

  const { headless = false, extensionPath, url, viewport = { width: 1280, height: 800 } } = options;

  try {
    state.runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    state.isHeadless = headless;

    if (extensionPath) {
      const userDataDir = path.join(process.cwd(), 'user-data');
      state.context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
        ],
      });
      state.page = state.context.pages()[0] || await state.context.newPage();
    } else {
      state.browser = await chromium.launch({
        headless: headless,
        slowMo: 100,
      });
      state.context = await state.browser.newContext({ viewport });
      state.page = await state.context.newPage();
    }

    if (url) {
      await state.page.goto(url, { waitUntil: 'domcontentloaded' });
      state.currentUrl = url;
    }

    notifyListeners();

    return {
      success: true,
      message: `Browser launched${url ? ` and navigated to ${url}` : ''}`,
      runId: state.runId,
    };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export async function navigate(url: string): Promise<{ success: boolean; message: string; title?: string }> {
  if (!state.page) {
    return { success: false, message: 'No browser session. Launch browser first.' };
  }

  try {
    await state.page.goto(url, { waitUntil: 'domcontentloaded' });
    state.currentUrl = url;
    const title = await state.page.title();
    notifyListeners();
    return { success: true, message: `Navigated to ${url}`, title };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export async function screenshot(): Promise<{ success: boolean; data?: string; message?: string }> {
  if (!state.page) {
    return { success: false, message: 'No browser session' };
  }

  try {
    const buffer = await state.page.screenshot();
    const base64 = buffer.toString('base64');
    return { success: true, data: base64 };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export async function click(selector: string): Promise<{ success: boolean; message: string }> {
  if (!state.page) {
    return { success: false, message: 'No browser session' };
  }

  try {
    await state.page.click(selector);
    return { success: true, message: `Clicked ${selector}` };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export async function type(selector: string, text: string): Promise<{ success: boolean; message: string }> {
  if (!state.page) {
    return { success: false, message: 'No browser session' };
  }

  try {
    await state.page.fill(selector, text);
    return { success: true, message: `Typed into ${selector}` };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export async function close(): Promise<void> {
  if (state.browser) {
    await state.browser.close().catch(() => {});
    state.browser = null;
  }
  if (state.context) {
    await state.context.close().catch(() => {});
    state.context = null;
  }
  state.page = null;
  state.currentUrl = null;
  state.runId = null;
  notifyListeners();
}

export async function getInfo(): Promise<{
  active: boolean;
  url: string | null;
  headless: boolean;
  runId: string | null;
  title?: string;
}> {
  let title: string | undefined;
  if (state.page) {
    try {
      title = await state.page.title();
    } catch {}
  }

  return {
    active: state.page !== null,
    url: state.currentUrl,
    headless: state.isHeadless,
    runId: state.runId,
    title,
  };
}
