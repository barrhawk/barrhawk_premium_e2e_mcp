#!/usr/bin/env npx tsx
/**
 * BarrHawk E2E Observability Integration Test
 *
 * Tests the full observability pipeline:
 * 1. Creates an observability session
 * 2. Emits various test events
 * 3. Verifies data persistence
 * 4. Shows results via CLI
 */

import { createObservabilitySession, getObservabilityStore } from './index.js';
import { randomUUID } from 'crypto';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(msg: string, color: keyof typeof COLORS = 'reset'): void {
  console.log(`${COLORS[color]}${msg}${COLORS.reset}`);
}

async function runIntegrationTest(): Promise<void> {
  log('\n╔═══════════════════════════════════════════════════════════════╗', 'cyan');
  log('║     BarrHawk Observability Integration Test                   ║', 'cyan');
  log('╚═══════════════════════════════════════════════════════════════╝\n', 'cyan');

  const runId = `test_${Date.now()}_${randomUUID().substring(0, 8)}`;
  log(`Test Run ID: ${runId}`, 'blue');

  // Create observability session
  log('\n[1/6] Creating observability session...', 'yellow');
  const session = await createObservabilitySession(runId, {
    dataDir: './observability-data',
    logToConsole: true,
  });

  const { emitter, store } = session;
  log('  ✓ Session created', 'green');

  // Emit browser events
  log('\n[2/6] Emitting browser events...', 'yellow');

  await emitter.emitBrowserLaunched(
    false,
    { width: 1280, height: 720 }
  );
  log('  → Browser launched', 'dim');

  await emitter.emitBrowserNavigated(
    'https://example.com',
    'Example Domain',
    250
  );
  log('  → Navigated to example.com', 'dim');

  await emitter.emitBrowserClick(
    true,
    { selector: '#login-button' }
  );
  log('  → Clicked login button', 'dim');

  // Emit console logs
  log('\n[3/6] Emitting console log events...', 'yellow');

  await emitter.emitConsoleCaptured('log', 'Page loaded successfully');
  await emitter.emitConsoleCaptured('info', 'User session initialized');
  await emitter.emitConsoleCaptured('warn', 'Deprecated API used: oldMethod()');
  await emitter.emitConsoleCaptured('error', 'Failed to load resource: image.png', undefined, {
    url: 'https://example.com/script.js',
    lineNumber: 42,
    columnNumber: 15,
  });
  await emitter.emitConsoleCaptured('debug', 'Debug: state = { loaded: true }');
  log('  ✓ 5 console logs captured', 'green');

  // Emit network requests
  log('\n[4/6] Emitting network events...', 'yellow');

  const requests = [
    { id: 'req_1', method: 'GET', url: 'https://example.com/' },
    { id: 'req_2', method: 'GET', url: 'https://example.com/style.css' },
    { id: 'req_3', method: 'GET', url: 'https://example.com/app.js' },
    { id: 'req_4', method: 'POST', url: 'https://api.example.com/analytics' },
    { id: 'req_5', method: 'GET', url: 'https://example.com/missing.png' },
  ];

  for (const req of requests) {
    await emitter.emitApiRequestSent(req.id, req.method, req.url);
  }

  // Simulate responses
  await emitter.emitApiResponseReceived('req_1', 200, 'OK', 150, 5432);
  await emitter.emitApiResponseReceived('req_2', 200, 'OK', 50, 1234);
  await emitter.emitApiResponseReceived('req_3', 200, 'OK', 120, 45678);
  await emitter.emitApiResponseReceived('req_4', 201, 'Created', 80, 45);
  await emitter.emitApiResponseReceived('req_5', 404, 'Not Found', 30, 0);
  log('  ✓ 5 network request/response pairs captured', 'green');

  // Emit screenshots
  log('\n[5/6] Emitting screenshot events...', 'yellow');

  await emitter.emitScreenshotCaptured(
    `ss_${Date.now()}_1`,
    './observability-data/screenshots/test1.png',
    1280,
    720,
    'viewport',
    125000
  );

  await emitter.emitScreenshotCaptured(
    `ss_${Date.now()}_2`,
    './observability-data/screenshots/test2.png',
    1280,
    2400,
    'full_page',
    380000
  );
  log('  ✓ 2 screenshots captured', 'green');

  // Emit step events
  await emitter.emitStepStarted(0, 'Navigate to homepage', 'browser', 'navigate');
  await new Promise(r => setTimeout(r, 50));
  await emitter.emitStepCompleted('passed', 250);

  await emitter.emitStepStarted(1, 'Click login button', 'browser', 'click');
  await new Promise(r => setTimeout(r, 50));
  await emitter.emitStepCompleted('passed', 120);

  // Stop the session (this flushes and completes the run)
  log('\n[6/6] Stopping session and flushing data...', 'yellow');
  await session.stop();
  log('  ✓ Session stopped, data flushed', 'green');

  // Verify persisted data
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim');
  log('VERIFICATION RESULTS', 'bold');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'dim');

  const freshStore = await getObservabilityStore('./observability-data');

  const run = await freshStore.getRun(runId);
  const logs = await freshStore.getLogs(runId);
  const screenshots = await freshStore.getScreenshots(runId);
  const network = await freshStore.getNetworkRequests(runId);
  const summary = await freshStore.getRunSummary(runId);

  let passed = 0;
  let failed = 0;

  function check(name: string, condition: boolean): void {
    if (condition) {
      log(`  ✓ ${name}`, 'green');
      passed++;
    } else {
      log(`  ✗ ${name}`, 'red');
      failed++;
    }
  }

  check('Run record exists', !!run);
  check('Run has correct ID', run?.runId === runId);
  check('Run status is passed', run?.status === 'passed');
  check('Logs captured (expected 5+ console + steps)', logs.length >= 5);
  check('Console logs present', logs.some(l => l.type === 'console'));
  check('Error logs present', logs.some(l => l.level === 'error'));
  check('Navigation logs present', logs.some(l => l.type === 'navigation'));
  check('Click logs present', logs.some(l => l.type === 'click'));
  check('Step logs present', logs.some(l => l.type === 'step'));
  check('Screenshots captured (expected 2)', screenshots.length === 2);
  check('Network requests captured (expected 5)', network.length >= 5);
  check('404 response captured', network.some(n => n.status === 404));
  check('Summary available', !!summary);

  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim');
  log(`RESULTS: ${passed} passed, ${failed} failed`, failed === 0 ? 'green' : 'red');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'dim');

  // Show data summary
  log('DATA SUMMARY', 'bold');
  log(`  Run ID:       ${runId}`, 'dim');
  log(`  Status:       ${run?.status}`, 'dim');
  log(`  Logs:         ${logs.length}`, 'dim');
  log(`  Screenshots:  ${screenshots.length}`, 'dim');
  log(`  Network:      ${network.length}`, 'dim');

  // Log types breakdown
  const logTypes: Record<string, number> = {};
  for (const log of logs) {
    logTypes[log.type] = (logTypes[log.type] || 0) + 1;
  }
  log('\n  Log Types:', 'dim');
  for (const [type, count] of Object.entries(logTypes)) {
    log(`    - ${type}: ${count}`, 'dim');
  }

  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim');
  log('NEXT STEPS', 'bold');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'dim');
  log('  View logs via CLI:', 'cyan');
  log(`    npx tsx packages/observability/cli.ts logs ${runId}\n`, 'dim');
  log('  View run summary:', 'cyan');
  log(`    npx tsx packages/observability/cli.ts summary ${runId}\n`, 'dim');
  log('  Start web viewer:', 'cyan');
  log('    npx tsx packages/observability/viewer.ts\n', 'dim');
  log('    Then open: http://localhost:3030\n', 'dim');

  if (failed > 0) {
    process.exit(1);
  }
}

runIntegrationTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
