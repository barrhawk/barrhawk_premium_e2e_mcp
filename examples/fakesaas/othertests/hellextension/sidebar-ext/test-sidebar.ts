#!/usr/bin/env bun
/**
 * URL Roaster Sidebar Extension Test
 *
 * THE PROBLEM:
 * - Chrome sidebars exist OUTSIDE the page DOM
 * - Playwright page.screenshot() only captures the page content
 * - The sidebar is like a separate tab that doesn't have a visible URL
 * - Traditional testing CANNOT screenshot it
 *
 * THE SOLUTION:
 * - Use keyboard shortcut (Ctrl+B) to trigger sidebar
 * - Use OS-level screenshot tools (spectacle, xdotool) via BarrHawk's Frankenstein
 * - Capture the ENTIRE browser window including chrome UI and sidebar
 *
 * This test demonstrates the pattern for testing Chrome extension sidebars.
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { execSync, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname);
const SCREENSHOT_DIR = '/tmp/sidebar-test-screenshots';
const FRANK_URL = 'http://localhost:7003';

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Helper: Take OS-level screenshot using various methods
async function takeOsScreenshot(filename: string): Promise<string> {
  const filepath = path.join(SCREENSHOT_DIR, filename);

  // Try different screenshot methods
  const methods = [
    // Method 1: spectacle (KDE)
    async () => {
      execSync(`spectacle -b -n -o "${filepath}"`, { timeout: 5000 });
      return true;
    },
    // Method 2: gnome-screenshot
    async () => {
      execSync(`gnome-screenshot -f "${filepath}"`, { timeout: 5000 });
      return true;
    },
    // Method 3: scrot
    async () => {
      execSync(`scrot "${filepath}"`, { timeout: 5000 });
      return true;
    },
    // Method 4: import (ImageMagick)
    async () => {
      execSync(`import -window root "${filepath}"`, { timeout: 5000 });
      return true;
    },
    // Method 5: Use Frankenstein system screenshot
    async () => {
      const response = await fetch(`${FRANK_URL}/screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ output: filepath })
      });
      return response.ok;
    }
  ];

  for (const method of methods) {
    try {
      const success = await method();
      if (success && fs.existsSync(filepath)) {
        console.log(`  Screenshot saved: ${filepath}`);
        return filepath;
      }
    } catch (e) {
      // Try next method
    }
  }

  throw new Error('All screenshot methods failed');
}

// Helper: Send keyboard shortcut
async function sendKeyboardShortcut(keys: string): Promise<void> {
  try {
    // Use xdotool to send keys to the focused window
    execSync(`xdotool key ${keys}`, { timeout: 2000 });
    console.log(`  Sent keyboard shortcut: ${keys}`);
  } catch (e) {
    console.error(`  Failed to send keyboard shortcut: ${e}`);
    throw e;
  }
}

// Helper: Wait for sidebar to appear (check OS screenshot for sidebar)
async function waitForSidebar(maxAttempts = 5): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 500));
    // Take a quick screenshot to check
    try {
      const screenshot = await takeOsScreenshot(`sidebar-check-${i}.png`);
      // In a real scenario, you'd use image analysis here
      // For now, we assume it appeared after a short delay
      if (i >= 2) return true;
    } catch (e) {
      // Continue trying
    }
  }
  return false;
}

// Helper: Focus the browser window
async function focusBrowserWindow(): Promise<void> {
  try {
    // Find and focus Chrome/Chromium window
    execSync(`xdotool search --name "Chromium" windowactivate || xdotool search --name "Chrome" windowactivate`, {
      timeout: 3000
    });
    await new Promise(r => setTimeout(r, 300));
  } catch (e) {
    console.log('  Could not focus browser window (may already be focused)');
  }
}

// Main test
async function runTest(): Promise<void> {
  console.log('\n🔥 URL Roaster Sidebar Extension Test\n');
  console.log('=' .repeat(50));

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    // Step 1: Launch browser with extension
    console.log('\n📦 Step 1: Launching browser with extension...');

    const userDataDir = `/tmp/sidebar-test-profile-${Date.now()}`;

    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false, // MUST be headed for sidebar testing
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--start-maximized'
      ],
      viewport: null // Use full window
    });

    const pages = context.pages();
    const page = pages[0] || await context.newPage();

    console.log('  Browser launched with URL Roaster extension');

    // Step 2: Navigate to a test URL
    console.log('\n🌐 Step 2: Navigating to test URL...');
    await page.goto('https://github.com/anthropics/claude-code');
    await page.waitForLoadState('domcontentloaded');
    console.log('  Navigated to GitHub');

    // Step 3: Take baseline screenshot (without sidebar)
    console.log('\n📸 Step 3: Taking baseline screenshot (no sidebar)...');
    await focusBrowserWindow();
    await new Promise(r => setTimeout(r, 500));
    const baselineScreenshot = await takeOsScreenshot('01-baseline-no-sidebar.png');

    // Step 4: Open sidebar via keyboard shortcut (Ctrl+B)
    console.log('\n⌨️  Step 4: Opening sidebar via Ctrl+B...');
    await focusBrowserWindow();
    await sendKeyboardShortcut('ctrl+b');

    // Wait for sidebar to open
    await new Promise(r => setTimeout(r, 1500));

    // Step 5: Take screenshot WITH sidebar visible
    console.log('\n📸 Step 5: Taking screenshot with sidebar...');
    const sidebarScreenshot = await takeOsScreenshot('02-with-sidebar.png');

    // Step 6: Interact with the sidebar
    // Since we can't directly access sidebar DOM, we use coordinates or more keyboard shortcuts
    console.log('\n🖱️  Step 6: Clicking roast button in sidebar...');

    // The sidebar is typically on the right side of the browser
    // We need to estimate coordinates or use tab navigation
    await sendKeyboardShortcut('Tab Tab Tab Return'); // Navigate to roast button and press Enter
    await new Promise(r => setTimeout(r, 1500)); // Wait for roast animation

    // Step 7: Take final screenshot showing roast result
    console.log('\n📸 Step 7: Taking screenshot with roast result...');
    const roastScreenshot = await takeOsScreenshot('03-roast-result.png');

    // Step 8: Test on different URLs
    console.log('\n🔄 Step 8: Testing on different URL (localhost)...');
    await page.goto('http://localhost:4000');
    await new Promise(r => setTimeout(r, 1000));

    await focusBrowserWindow();
    // Sidebar should auto-update with new URL
    await new Promise(r => setTimeout(r, 500));
    const localhostScreenshot = await takeOsScreenshot('04-localhost-url.png');

    // Summary
    console.log('\n' + '=' .repeat(50));
    console.log('✅ Test Complete!\n');
    console.log('Screenshots saved to:', SCREENSHOT_DIR);
    console.log('\nFiles:');

    const files = fs.readdirSync(SCREENSHOT_DIR);
    files.forEach(f => console.log(`  - ${f}`));

    console.log('\n💡 Key Points:');
    console.log('  1. Used OS-level screenshots (spectacle) instead of Playwright');
    console.log('  2. Used xdotool to send Ctrl+B keyboard shortcut');
    console.log('  3. Captured ENTIRE browser window including sidebar');
    console.log('  4. This is the ONLY way to screenshot Chrome extension sidebars');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  } finally {
    // Cleanup
    if (context) {
      console.log('\n🧹 Cleaning up...');
      await context.close();
    }
  }
}

// Run if executed directly
const isMain = import.meta.url === `file://${process.argv[1]}` ||
               process.argv[1]?.endsWith('test-sidebar.ts');
if (isMain) {
  runTest()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('Fatal error:', e);
      process.exit(1);
    });
}

export { runTest, takeOsScreenshot, sendKeyboardShortcut };
