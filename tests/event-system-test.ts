#!/usr/bin/env npx tsx
/**
 * BarrHawk E2E Event System Test
 *
 * Tests the event system integration by:
 * 1. Setting up an event listener
 * 2. Running browser automation
 * 3. Verifying events are emitted
 *
 * Run: npx tsx tests/event-system-test.ts
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import {
  InMemoryEventTransport,
  BarrHawkEventEmitter,
  type BarrHawkEvent,
  type EventType,
} from '../packages/events/index.js';

// Test configuration
const TEST_URL = 'https://example.com';
const SCREENSHOT_DIR = './test-artifacts/event-test';

// Collected events
const collectedEvents: BarrHawkEvent[] = [];

async function main() {
  console.log('='.repeat(60));
  console.log('BarrHawk E2E Event System Test');
  console.log('='.repeat(60));
  console.log();

  // 1. Set up event transport and emitter
  console.log('[1/6] Setting up event transport...');
  const transport = new InMemoryEventTransport();
  const emitter = new BarrHawkEventEmitter(transport);

  // Subscribe to all events
  transport.subscribe('events:*:*', (event) => {
    collectedEvents.push(event);
    console.log(`  [EVENT] ${event.type}`);
  });

  emitter.setTenantContext('test-tenant');
  emitter.setSource({
    type: 'mcp',
    origin: 'human_api',
    clientInfo: { name: 'event-test', version: '1.0.0' },
  });

  console.log('  Event transport ready');
  console.log();

  // 2. Launch browser
  console.log('[2/6] Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Generate run ID
  const runId = `test_${Date.now()}`;
  emitter.setRunContext({ runId, projectId: 'test-project' });

  // Emit test run started
  await emitter.emitTestRunStarted(runId, 'test-project', 'human_api', {
    trigger: 'test-script',
    originConfidence: 1.0,
    originIndicators: ['test_script'],
  });

  // Set up console capture
  page.on('console', async (msg) => {
    await emitter.emitConsoleCaptured(
      msg.type() as 'log' | 'info' | 'warn' | 'error' | 'debug',
      msg.text(),
      []
    );
  });

  // Emit browser launched
  await emitter.emitBrowserLaunched(true, { width: 1280, height: 800 });
  console.log('  Browser launched');
  console.log();

  // 3. Navigate to test URL
  console.log(`[3/6] Navigating to ${TEST_URL}...`);
  const startTime = Date.now();
  await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });
  const loadTime = Date.now() - startTime;

  await emitter.emitBrowserNavigated(TEST_URL, await page.title(), loadTime);
  console.log(`  Navigated to: ${page.url()} (${loadTime}ms)`);
  console.log();

  // 4. Take screenshot
  console.log('[4/6] Taking screenshot...');
  const screenshot = await page.screenshot();
  const screenshotId = `ss_${Date.now()}`;

  await emitter.emitScreenshotCaptured(
    screenshotId,
    `memory://${screenshotId}`,
    1280,
    800,
    'viewport',
    screenshot.length
  );
  console.log(`  Screenshot captured (${screenshot.length} bytes)`);
  console.log();

  // 5. Click on a link
  console.log('[5/6] Clicking "More information" link...');
  try {
    await emitter.emitStepStarted(1, 'Click more info link', 'browser', 'browser_click');
    const clickStart = Date.now();

    await page.getByText('More information').click();

    await emitter.emitStepCompleted('passed', Date.now() - clickStart);
    await emitter.emitBrowserClick(true, { text: 'More information' });
    console.log('  Clicked successfully');
  } catch (err) {
    await emitter.emitStepCompleted('failed', 0, {
      error: (err as Error).message,
    });
    await emitter.emitBrowserClick(false, { text: 'More information' });
    console.log(`  Click failed: ${(err as Error).message}`);
  }
  console.log();

  // Wait a moment for navigation
  await page.waitForTimeout(1000);

  // Take another screenshot
  const screenshot2 = await page.screenshot();
  await emitter.emitScreenshotCaptured(
    `ss_${Date.now()}`,
    `memory://ss_${Date.now()}`,
    1280,
    800,
    'viewport',
    screenshot2.length
  );

  // 6. Close browser and emit completion
  console.log('[6/6] Closing browser...');
  await browser.close();

  await emitter.emitTestRunCompleted('passed', {
    total: 1,
    passed: 1,
    failed: 0,
    skipped: 0,
    duration: Date.now() - startTime,
  });
  console.log('  Browser closed');
  console.log();

  // Report results
  console.log('='.repeat(60));
  console.log('Test Results');
  console.log('='.repeat(60));
  console.log();

  console.log(`Total events collected: ${collectedEvents.length}`);
  console.log();

  // Group events by type
  const eventsByType = new Map<string, number>();
  for (const event of collectedEvents) {
    const count = eventsByType.get(event.type) || 0;
    eventsByType.set(event.type, count + 1);
  }

  console.log('Events by type:');
  for (const [type, count] of Array.from(eventsByType.entries()).sort()) {
    console.log(`  ${type}: ${count}`);
  }
  console.log();

  // Validate expected events
  const expectedEvents: EventType[] = [
    'test.run.started',
    'browser.launched',
    'browser.navigated',
    'screenshot.captured',
    'test.step.started',
    'test.step.completed',
    'browser.click',
    'test.run.completed',
  ];

  console.log('Expected events check:');
  let allPassed = true;
  for (const expected of expectedEvents) {
    const found = collectedEvents.some(e => e.type === expected);
    const status = found ? '✓' : '✗';
    console.log(`  ${status} ${expected}`);
    if (!found) allPassed = false;
  }
  console.log();

  if (allPassed) {
    console.log('✓ All expected events were emitted!');
    console.log();
    console.log('Event system integration test PASSED');
  } else {
    console.log('✗ Some expected events were missing');
    console.log();
    console.log('Event system integration test FAILED');
    process.exit(1);
  }

  // Show sample event detail
  console.log();
  console.log('Sample event (test.run.started):');
  const sampleEvent = collectedEvents.find(e => e.type === 'test.run.started');
  if (sampleEvent) {
    console.log(JSON.stringify(sampleEvent, null, 2));
  }
}

main().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
