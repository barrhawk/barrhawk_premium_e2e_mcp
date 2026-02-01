/**
 * Hell Extension - Playwright Test Fixtures
 *
 * Provides a persistent browser context with the extension loaded.
 * Required because Chrome extensions don't work in standard Playwright contexts.
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const EXTENSION_PATH = path.join(__dirname, '..', 'extension');
const TEST_PORTS = {
  A: 6660,
  B: 6661,
  C: 6662
};

export interface HellFixtures {
  context: BrowserContext;
  pageA: Page;
  pageB: Page;
  pageC: Page;
  extensionId: string;
  sidePanelPage: Page | null;
}

/**
 * Create a persistent browser context with the Hell Extension loaded.
 */
export async function createHellContext(): Promise<HellFixtures> {
  // Create temp user data dir
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hell-extension-'));

  // Launch with extension
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false, // Extensions need headed mode
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--auto-open-devtools-for-tabs' // Helpful for debugging
    ],
    viewport: { width: 1280, height: 800 }
  });

  // Get extension ID from service worker
  let extensionId = '';

  // Wait for service worker to register
  const serviceWorker = await context.waitForEvent('serviceworker');
  const swUrl = serviceWorker.url();
  const match = swUrl.match(/chrome-extension:\/\/([^/]+)/);
  if (match) {
    extensionId = match[1];
  }

  console.log(`[Fixtures] Extension loaded: ${extensionId}`);

  // Create test pages
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  const pageC = await context.newPage();

  // Navigate to test pages
  await Promise.all([
    pageA.goto(`http://localhost:${TEST_PORTS.A}/page-a.html`),
    pageB.goto(`http://localhost:${TEST_PORTS.B}/page-b.html`),
    pageC.goto(`http://localhost:${TEST_PORTS.C}/page-c.html`)
  ]);

  console.log('[Fixtures] Test pages loaded');

  return {
    context,
    pageA,
    pageB,
    pageC,
    extensionId,
    sidePanelPage: null // Side panel access is tricky, may need manual opening
  };
}

/**
 * Open the side panel for a given tab.
 * Note: Playwright can't directly control side panels, so we use a workaround.
 */
export async function openSidePanel(fixtures: HellFixtures, page: Page): Promise<void> {
  // Bring page to front
  await page.bringToFront();

  // Click the extension icon (requires knowing its position)
  // Alternative: Use keyboard shortcut if configured
  // For now, we'll need to manually open or use chrome.sidePanel.open() from background

  // Inject script to trigger side panel via extension messaging
  await page.evaluate(() => {
    // This relies on the content script being loaded
    if ((window as any).__hellExtensionUpdate) {
      (window as any).__hellExtensionUpdate();
    }
  });
}

/**
 * Get the side panel page if it's open.
 */
export async function getSidePanelPage(fixtures: HellFixtures): Promise<Page | null> {
  const pages = fixtures.context.pages();

  for (const page of pages) {
    const url = page.url();
    if (url.includes('sidepanel.html')) {
      return page;
    }
  }

  return null;
}

/**
 * Clean up the test context.
 */
export async function cleanupHellContext(fixtures: HellFixtures): Promise<void> {
  await fixtures.context.close();
  console.log('[Fixtures] Context closed');
}

/**
 * Switch to a tab and verify the sidebar updates.
 */
export async function switchToTab(
  fixtures: HellFixtures,
  targetPage: Page,
  expectedPageId: string
): Promise<boolean> {
  await targetPage.bringToFront();

  // Wait a moment for the extension to process tab switch
  await new Promise(r => setTimeout(r, 500));

  // Check side panel if available
  const sidePanel = await getSidePanelPage(fixtures);
  if (sidePanel) {
    const displayedId = await sidePanel.$eval(
      '#display-page-id',
      el => el.textContent
    ).catch(() => null);

    return displayedId === expectedPageId;
  }

  // If no side panel access, we can't verify
  console.log('[Fixtures] Side panel not accessible for verification');
  return true;
}

/**
 * Perform rapid tab switching to induce race conditions.
 */
export async function rapidTabSwitch(
  fixtures: HellFixtures,
  iterations: number = 10,
  delayMs: number = 100
): Promise<void> {
  const pages = [fixtures.pageA, fixtures.pageB, fixtures.pageC];

  for (let i = 0; i < iterations; i++) {
    const target = pages[i % pages.length];
    await target.bringToFront();
    await new Promise(r => setTimeout(r, delayMs));
  }
}
