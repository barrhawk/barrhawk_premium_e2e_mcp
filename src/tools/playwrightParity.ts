/**
 * Playwright MCP Parity Tools
 *
 * 18 tools to achieve feature parity with Microsoft's Playwright MCP
 * EEE Strategy: Embrace, Extend, Extinguish
 */

import { Page, Dialog, BrowserContext } from 'playwright';
import { BrowserManager } from '../browser/launcher.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Store for network requests and dialogs
const networkRequests: Map<string, Array<{
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  headers: Record<string, string>;
  responseHeaders?: Record<string, string>;
  timing?: { startTime: number; endTime?: number };
  resourceType: string;
  size?: number;
}>> = new Map();

const pendingDialogs: Map<string, Dialog> = new Map();
let tracingActive = false;

// =============================================================================
// 1. browser_snapshot - Accessibility tree (THEIR CROWN JEWEL, NOW OURS)
// =============================================================================
export async function handleSnapshot(
  browserManager: BrowserManager,
  args: { root?: string; includeHidden?: boolean }
): Promise<object> {
  const page = browserManager.getPage();
  const { root, includeHidden = false } = args;

  let rootElement = undefined;
  if (root) {
    rootElement = await page.$(root);
  }

  // Playwright's accessibility API
  const snapshot = await (page as any).accessibility.snapshot({
    root: rootElement || undefined,
    interestingOnly: !includeHidden,
  });

  // Also get a simplified DOM structure for hybrid mode
  const domSummary = await page.evaluate(() => {
    const getInteractiveElements = (el: Element, depth = 0): any[] => {
      if (depth > 5) return [];
      const results: any[] = [];

      const isInteractive = (e: Element) => {
        const tag = e.tagName.toLowerCase();
        const role = e.getAttribute('role');
        const tabIndex = e.getAttribute('tabindex');
        return ['a', 'button', 'input', 'select', 'textarea', 'details', 'summary'].includes(tag) ||
               role || tabIndex !== null;
      };

      if (isInteractive(el)) {
        results.push({
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role'),
          name: el.getAttribute('aria-label') || el.getAttribute('name') || (el as HTMLElement).innerText?.slice(0, 50),
          id: el.id || undefined,
          class: el.className || undefined,
          type: el.getAttribute('type'),
          href: el.getAttribute('href'),
          value: (el as HTMLInputElement).value || undefined,
          checked: (el as HTMLInputElement).checked,
          disabled: (el as HTMLButtonElement).disabled,
        });
      }

      for (const child of el.children) {
        results.push(...getInteractiveElements(child, depth + 1));
      }
      return results;
    };

    return {
      title: document.title,
      url: window.location.href,
      interactiveElements: getInteractiveElements(document.body),
    };
  });

  return {
    success: true,
    accessibilityTree: snapshot,
    domSummary,
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// 2. browser_evaluate - Run arbitrary JavaScript
// =============================================================================
export async function handleEvaluate(
  browserManager: BrowserManager,
  args: { expression: string; arg?: unknown }
): Promise<object> {
  const page = browserManager.getPage();
  const { expression, arg } = args;

  try {
    const result = await page.evaluate(expression, arg);
    return {
      success: true,
      result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// 3. browser_console_messages - Get console output
// =============================================================================
export async function handleConsoleMessages(
  browserManager: BrowserManager,
  args: { clear?: boolean; filter?: string }
): Promise<object> {
  const messages = browserManager.getConsoleMessages();
  const { clear = false, filter } = args;

  let filtered = messages;
  if (filter) {
    filtered = messages.filter(m => m.type === filter || m.text.includes(filter));
  }

  if (clear) {
    browserManager.clearConsoleMessages();
  }

  return {
    success: true,
    count: filtered.length,
    messages: filtered,
  };
}

// =============================================================================
// 4. browser_network_requests - Capture network traffic
// =============================================================================
export async function handleNetworkRequests(
  browserManager: BrowserManager,
  args: { start?: boolean; stop?: boolean; clear?: boolean; filter?: string }
): Promise<object> {
  const page = browserManager.getPage();
  const sessionId = (browserManager as any).activeSessionId || 'default';
  const { start, stop, clear, filter } = args;

  if (start) {
    networkRequests.set(sessionId, []);

    page.on('request', (request) => {
      const reqs = networkRequests.get(sessionId) || [];
      reqs.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        resourceType: request.resourceType(),
        timing: { startTime: Date.now() },
      });
      networkRequests.set(sessionId, reqs);
    });

    page.on('response', (response) => {
      const reqs = networkRequests.get(sessionId) || [];
      const req = reqs.find(r => r.url === response.url() && !r.status);
      if (req) {
        req.status = response.status();
        req.statusText = response.statusText();
        req.responseHeaders = response.headers();
        if (req.timing) req.timing.endTime = Date.now();
      }
    });

    return { success: true, message: 'Network capture started' };
  }

  if (clear) {
    networkRequests.set(sessionId, []);
    return { success: true, message: 'Network requests cleared' };
  }

  let requests = networkRequests.get(sessionId) || [];

  if (filter) {
    requests = requests.filter(r =>
      r.url.includes(filter) ||
      r.resourceType === filter ||
      r.method === filter.toUpperCase()
    );
  }

  return {
    success: true,
    count: requests.length,
    requests,
  };
}

// =============================================================================
// 5. browser_hover - Hover over element
// =============================================================================
export async function handleHover(
  browserManager: BrowserManager,
  args: { selector: string; position?: { x: number; y: number } }
): Promise<object> {
  const page = browserManager.getPage();
  const { selector, position } = args;

  await page.hover(selector, { position });

  return {
    success: true,
    message: `Hovered over ${selector}`,
  };
}

// =============================================================================
// 6. browser_drag - Drag and drop
// =============================================================================
export async function handleDrag(
  browserManager: BrowserManager,
  args: {
    source: string;
    target: string;
    sourcePosition?: { x: number; y: number };
    targetPosition?: { x: number; y: number };
  }
): Promise<object> {
  const page = browserManager.getPage();
  const { source, target, sourcePosition, targetPosition } = args;

  await page.dragAndDrop(source, target, {
    sourcePosition,
    targetPosition,
  });

  return {
    success: true,
    message: `Dragged from ${source} to ${target}`,
  };
}

// =============================================================================
// 7. browser_select_option - Select dropdown option
// =============================================================================
export async function handleSelectOption(
  browserManager: BrowserManager,
  args: {
    selector: string;
    value?: string;
    label?: string;
    index?: number;
    values?: string[];
  }
): Promise<object> {
  const page = browserManager.getPage();
  const { selector, value, label, index, values } = args;

  let selected: string[];

  if (values) {
    selected = await page.selectOption(selector, values);
  } else if (value !== undefined) {
    selected = await page.selectOption(selector, { value });
  } else if (label !== undefined) {
    selected = await page.selectOption(selector, { label });
  } else if (index !== undefined) {
    selected = await page.selectOption(selector, { index });
  } else {
    throw new Error('Must provide value, label, index, or values');
  }

  return {
    success: true,
    selected,
    message: `Selected option(s) in ${selector}`,
  };
}

// =============================================================================
// 8. browser_file_upload - Upload files
// =============================================================================
export async function handleFileUpload(
  browserManager: BrowserManager,
  args: { selector: string; files: string | string[] }
): Promise<object> {
  const page = browserManager.getPage();
  const { selector, files } = args;

  const fileList = Array.isArray(files) ? files : [files];

  // Verify files exist
  for (const file of fileList) {
    try {
      await fs.access(file);
    } catch {
      throw new Error(`File not found: ${file}`);
    }
  }

  await page.setInputFiles(selector, fileList);

  return {
    success: true,
    files: fileList,
    message: `Uploaded ${fileList.length} file(s) to ${selector}`,
  };
}

// =============================================================================
// 9. browser_handle_dialog - Handle alerts/confirms/prompts
// =============================================================================
export async function handleDialog(
  browserManager: BrowserManager,
  args: {
    action: 'accept' | 'dismiss' | 'listen';
    promptText?: string;
    autoRespond?: boolean;
  }
): Promise<object> {
  const page = browserManager.getPage();
  const { action, promptText, autoRespond = true } = args;

  if (action === 'listen') {
    page.on('dialog', async (dialog) => {
      const id = `dialog-${Date.now()}`;
      pendingDialogs.set(id, dialog);
      console.error(`[Dialog] ${dialog.type()}: ${dialog.message()}`);

      if (autoRespond) {
        if (dialog.type() === 'prompt' && promptText) {
          await dialog.accept(promptText);
        } else {
          await dialog.accept();
        }
        pendingDialogs.delete(id);
      }
    });

    return {
      success: true,
      message: 'Dialog listener active',
      autoRespond,
    };
  }

  // Handle pending dialog
  const dialogEntries = Array.from(pendingDialogs.entries());
  if (dialogEntries.length === 0) {
    return {
      success: false,
      message: 'No pending dialogs',
    };
  }

  const [id, dialog] = dialogEntries[0];

  if (action === 'accept') {
    await dialog.accept(promptText);
  } else {
    await dialog.dismiss();
  }

  pendingDialogs.delete(id);

  return {
    success: true,
    action,
    dialogType: dialog.type(),
    message: dialog.message(),
  };
}

// =============================================================================
// 10. browser_fill_form - Batch form filling
// =============================================================================
export async function handleFillForm(
  browserManager: BrowserManager,
  args: {
    fields: Array<{ selector: string; value: string; type?: 'text' | 'select' | 'checkbox' | 'radio' | 'file' }>;
    submit?: string;
  }
): Promise<object> {
  const page = browserManager.getPage();
  const { fields, submit } = args;

  const results: Array<{ selector: string; success: boolean; error?: string }> = [];

  for (const field of fields) {
    try {
      const type = field.type || 'text';

      switch (type) {
        case 'select':
          await page.selectOption(field.selector, field.value);
          break;
        case 'checkbox':
        case 'radio':
          if (field.value === 'true' || field.value === '1') {
            await page.check(field.selector);
          } else {
            await page.uncheck(field.selector);
          }
          break;
        case 'file':
          await page.setInputFiles(field.selector, field.value);
          break;
        default:
          await page.fill(field.selector, field.value);
      }

      results.push({ selector: field.selector, success: true });
    } catch (error) {
      results.push({
        selector: field.selector,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (submit) {
    await page.click(submit);
  }

  return {
    success: results.every(r => r.success),
    filled: results.filter(r => r.success).length,
    total: fields.length,
    results,
    submitted: !!submit,
  };
}

// =============================================================================
// 11. browser_navigate_back - Go back in history
// =============================================================================
export async function handleNavigateBack(
  browserManager: BrowserManager,
  args: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }
): Promise<object> {
  const page = browserManager.getPage();
  const { waitUntil = 'domcontentloaded' } = args;

  const response = await page.goBack({ waitUntil });

  return {
    success: true,
    url: page.url(),
    status: response?.status(),
  };
}

// =============================================================================
// 12. browser_navigate_forward - Go forward in history
// =============================================================================
export async function handleNavigateForward(
  browserManager: BrowserManager,
  args: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }
): Promise<object> {
  const page = browserManager.getPage();
  const { waitUntil = 'domcontentloaded' } = args;

  const response = await page.goForward({ waitUntil });

  return {
    success: true,
    url: page.url(),
    status: response?.status(),
  };
}

// =============================================================================
// 13. browser_resize - Resize viewport
// =============================================================================
export async function handleResize(
  browserManager: BrowserManager,
  args: { width: number; height: number }
): Promise<object> {
  const page = browserManager.getPage();
  const { width, height } = args;

  await page.setViewportSize({ width, height });

  return {
    success: true,
    viewport: { width, height },
  };
}

// =============================================================================
// 14. browser_tabs - Tab management
// =============================================================================
export async function handleTabs(
  browserManager: BrowserManager,
  args: { action: 'list' | 'new' | 'close' | 'switch'; url?: string; index?: number }
): Promise<object> {
  const session = browserManager.getSession();
  const context = session.context;
  const { action, url, index } = args;

  switch (action) {
    case 'list': {
      const pages = context.pages();
      return {
        success: true,
        tabs: pages.map((p, i) => ({
          index: i,
          url: p.url(),
          title: '', // Would need async call
          active: p === session.page,
        })),
        count: pages.length,
      };
    }

    case 'new': {
      const newPage = await context.newPage();
      if (url) {
        await newPage.goto(url);
      }
      return {
        success: true,
        message: `Opened new tab${url ? ` at ${url}` : ''}`,
        tabCount: context.pages().length,
      };
    }

    case 'close': {
      const pages = context.pages();
      const targetIndex = index ?? pages.length - 1;
      if (targetIndex >= 0 && targetIndex < pages.length) {
        await pages[targetIndex].close();
        return {
          success: true,
          message: `Closed tab ${targetIndex}`,
          tabCount: context.pages().length,
        };
      }
      throw new Error(`Invalid tab index: ${targetIndex}`);
    }

    case 'switch': {
      const pages = context.pages();
      const targetIndex = index ?? 0;
      if (targetIndex >= 0 && targetIndex < pages.length) {
        await pages[targetIndex].bringToFront();
        // Note: This doesn't change browserManager's active page
        // Would need to update IgorSession.page
        return {
          success: true,
          message: `Switched to tab ${targetIndex}`,
          url: pages[targetIndex].url(),
        };
      }
      throw new Error(`Invalid tab index: ${targetIndex}`);
    }

    default:
      throw new Error(`Unknown tab action: ${action}`);
  }
}

// =============================================================================
// 15. browser_pdf_save - Save page as PDF
// =============================================================================
export async function handlePdfSave(
  browserManager: BrowserManager,
  args: {
    path: string;
    format?: 'Letter' | 'Legal' | 'Tabloid' | 'Ledger' | 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6';
    landscape?: boolean;
    printBackground?: boolean;
    scale?: number;
    margin?: { top?: string; right?: string; bottom?: string; left?: string };
  }
): Promise<object> {
  const page = browserManager.getPage();
  const {
    path: filePath,
    format = 'A4',
    landscape = false,
    printBackground = true,
    scale = 1,
    margin,
  } = args;

  // Ensure directory exists
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  await page.pdf({
    path: filePath,
    format,
    landscape,
    printBackground,
    scale,
    margin,
  });

  const stats = await fs.stat(filePath);

  return {
    success: true,
    path: filePath,
    size: stats.size,
    format,
  };
}

// =============================================================================
// 16. browser_mouse_move - Move mouse to coordinates
// =============================================================================
export async function handleMouseMove(
  browserManager: BrowserManager,
  args: { x: number; y: number; steps?: number }
): Promise<object> {
  const page = browserManager.getPage();
  const { x, y, steps = 1 } = args;

  await page.mouse.move(x, y, { steps });

  return {
    success: true,
    position: { x, y },
  };
}

// =============================================================================
// 17. browser_mouse_click_xy - Click at coordinates
// =============================================================================
export async function handleMouseClickXY(
  browserManager: BrowserManager,
  args: {
    x: number;
    y: number;
    button?: 'left' | 'right' | 'middle';
    clickCount?: number;
    delay?: number;
  }
): Promise<object> {
  const page = browserManager.getPage();
  const { x, y, button = 'left', clickCount = 1, delay } = args;

  await page.mouse.click(x, y, { button, clickCount, delay });

  return {
    success: true,
    position: { x, y },
    button,
    clickCount,
  };
}

// =============================================================================
// 18. browser_mouse_drag_xy - Drag from one coordinate to another
// =============================================================================
export async function handleMouseDragXY(
  browserManager: BrowserManager,
  args: {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    steps?: number;
  }
): Promise<object> {
  const page = browserManager.getPage();
  const { fromX, fromY, toX, toY, steps = 10 } = args;

  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps });
  await page.mouse.up();

  return {
    success: true,
    from: { x: fromX, y: fromY },
    to: { x: toX, y: toY },
  };
}

// =============================================================================
// 19. browser_mouse_wheel - Scroll with mouse wheel
// =============================================================================
export async function handleMouseWheel(
  browserManager: BrowserManager,
  args: { deltaX?: number; deltaY?: number }
): Promise<object> {
  const page = browserManager.getPage();
  const { deltaX = 0, deltaY = 0 } = args;

  await page.mouse.wheel(deltaX, deltaY);

  return {
    success: true,
    delta: { x: deltaX, y: deltaY },
  };
}

// =============================================================================
// 20. browser_start_tracing - Start performance tracing
// =============================================================================
export async function handleStartTracing(
  browserManager: BrowserManager,
  args: {
    screenshots?: boolean;
    snapshots?: boolean;
    sources?: boolean;
  }
): Promise<object> {
  const session = browserManager.getSession();
  const context = session.context;
  const { screenshots = true, snapshots = true, sources = false } = args;

  if (tracingActive) {
    return { success: false, error: 'Tracing already active' };
  }

  await context.tracing.start({
    screenshots,
    snapshots,
    sources,
  });

  tracingActive = true;

  return {
    success: true,
    message: 'Tracing started',
    options: { screenshots, snapshots, sources },
  };
}

// =============================================================================
// 21. browser_stop_tracing - Stop tracing and save
// =============================================================================
export async function handleStopTracing(
  browserManager: BrowserManager,
  args: { path: string }
): Promise<object> {
  const session = browserManager.getSession();
  const context = session.context;
  const { path: filePath } = args;

  if (!tracingActive) {
    return { success: false, error: 'No active tracing session' };
  }

  // Ensure directory exists
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  await context.tracing.stop({ path: filePath });
  tracingActive = false;

  const stats = await fs.stat(filePath);

  return {
    success: true,
    path: filePath,
    size: stats.size,
    message: 'Trace saved. Open with: npx playwright show-trace ' + filePath,
  };
}

// =============================================================================
// 22. browser_reload - Reload the page
// =============================================================================
export async function handleReload(
  browserManager: BrowserManager,
  args: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }
): Promise<object> {
  const page = browserManager.getPage();
  const { waitUntil = 'domcontentloaded' } = args;

  const response = await page.reload({ waitUntil });

  return {
    success: true,
    url: page.url(),
    status: response?.status(),
  };
}
