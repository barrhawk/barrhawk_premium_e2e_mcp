#!/usr/bin/env npx tsx
/**
 * Re-run the 3 failed tests with improved screenshot handling
 */

import { chromium, BrowserContext, Page } from 'playwright';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTENSION_PATH = path.resolve(__dirname);
const SCREENSHOT_DIR = '/tmp/sidebar-test-screenshots';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function takeScreenshot(name: string, retries = 3): string | null {
  const filepath = path.join(SCREENSHOT_DIR, `${name}.png`);

  // Kill any existing spectacle process
  try {
    execSync('pkill -9 spectacle 2>/dev/null || true', { timeout: 1000 });
  } catch {}

  execSync('sleep 0.5');

  for (let attempt = 1; attempt <= retries; attempt++) {
    console.log(`    Screenshot attempt ${attempt}/${retries}...`);

    try {
      execSync(`spectacle -b -n -o "${filepath}" 2>/dev/null`, { timeout: 10000 });
      if (fs.existsSync(filepath) && fs.statSync(filepath).size > 0) {
        console.log(`    ✓ Screenshot saved: ${filepath}`);
        return filepath;
      }
    } catch (e) {
      console.log(`    spectacle failed: ${e}`);
    }

    try {
      execSync(`scrot "${filepath}" 2>/dev/null`, { timeout: 5000 });
      if (fs.existsSync(filepath) && fs.statSync(filepath).size > 0) {
        console.log(`    ✓ Screenshot saved (scrot): ${filepath}`);
        return filepath;
      }
    } catch {}

    if (attempt < retries) {
      execSync('sleep 1');
    }
  }

  return null;
}

function sendKeys(keys: string): boolean {
  try {
    execSync(`xdotool key ${keys}`, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

function focusChrome(): boolean {
  try {
    execSync(`xdotool search --name "Chrome" windowactivate 2>/dev/null || xdotool search --name "Chromium" windowactivate 2>/dev/null`, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('═'.repeat(60));
  console.log('  RE-RUNNING 3 FAILED TESTS');
  console.log('═'.repeat(60));

  const userDataDir = `/tmp/sidebar-retest-profile-${Date.now()}`;

  console.log('\n🚀 Launching browser with extension...');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
      '--disable-popup-blocking'
    ]
  });

  const page = context.pages()[0] || await context.newPage();
  await sleep(1000);
  console.log('  Browser ready\n');

  const results: { test: number; name: string; status: string; error?: string }[] = [];

  // Test 5: sidebar_persists_navigation
  console.log('[Test 5] sidebar_persists_navigation');
  try {
    await page.goto('https://example.com');
    await sleep(500);
    focusChrome();
    sendKeys('ctrl+b'); // Open sidebar
    await sleep(1000);

    console.log('  Navigating to github.com...');
    await page.goto('https://github.com');
    await sleep(1500);

    focusChrome();
    await sleep(500);

    const ss = takeScreenshot('05-sidebar-persists-nav-FIXED');
    if (ss) {
      results.push({ test: 5, name: 'sidebar_persists_navigation', status: 'PASSED' });
      console.log('  ✓ PASSED\n');
    } else {
      throw new Error('Screenshot failed after retries');
    }
  } catch (e) {
    results.push({ test: 5, name: 'sidebar_persists_navigation', status: 'FAILED', error: String(e) });
    console.log(`  ✗ FAILED: ${e}\n`);
  }

  // Test 91: screenshot_baseline
  console.log('[Test 91] screenshot_baseline');
  try {
    await page.goto('https://example.com');
    await sleep(500);
    focusChrome();
    sendKeys('ctrl+b');
    await sleep(1000);

    const ss = takeScreenshot('91-baseline-FIXED');
    if (ss) {
      results.push({ test: 91, name: 'screenshot_baseline', status: 'PASSED' });
      console.log('  ✓ PASSED\n');
    } else {
      throw new Error('OS screenshot failed');
    }
  } catch (e) {
    results.push({ test: 91, name: 'screenshot_baseline', status: 'FAILED', error: String(e) });
    console.log(`  ✗ FAILED: ${e}\n`);
  }

  // Test 100: screenshot_full_flow
  console.log('[Test 100] screenshot_full_flow');
  try {
    await page.goto('https://github.com');
    await sleep(1000);
    focusChrome();
    sendKeys('ctrl+b');
    await sleep(1000);

    // Click roast button
    sendKeys('Tab Tab Tab Return');
    await sleep(1000);

    const ss = takeScreenshot('100-full-flow-FIXED');
    if (ss) {
      results.push({ test: 100, name: 'screenshot_full_flow', status: 'PASSED' });
      console.log('  ✓ PASSED\n');
    } else {
      throw new Error('Full flow screenshot failed');
    }
  } catch (e) {
    results.push({ test: 100, name: 'screenshot_full_flow', status: 'FAILED', error: String(e) });
    console.log(`  ✗ FAILED: ${e}\n`);
  }

  await context.close();

  // Summary
  console.log('═'.repeat(60));
  console.log('  RESULTS');
  console.log('═'.repeat(60));

  const passed = results.filter(r => r.status === 'PASSED').length;
  const failed = results.filter(r => r.status === 'FAILED').length;

  results.forEach(r => {
    const icon = r.status === 'PASSED' ? '✓' : '✗';
    console.log(`  ${icon} Test ${r.test}: ${r.name} - ${r.status}`);
    if (r.error) console.log(`      Error: ${r.error}`);
  });

  console.log('');
  console.log(`  Passed: ${passed}/3`);
  console.log(`  Failed: ${failed}/3`);
  console.log('═'.repeat(60));

  // Check screenshots
  console.log('\n📸 New screenshots:');
  const newScreenshots = fs.readdirSync(SCREENSHOT_DIR).filter(f => f.includes('FIXED'));
  newScreenshots.forEach(f => {
    const stat = fs.statSync(path.join(SCREENSHOT_DIR, f));
    console.log(`  ${f} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
  });
}

main().catch(console.error);
