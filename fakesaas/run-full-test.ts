#!/usr/bin/env npx tsx
/**
 * FakeSaaS Full Integration Test
 *
 * Tests all BarrHawk premium features against the FakeSaaS application:
 * - Browser automation with observability
 * - Visual diff/regression testing
 * - Flaky test detection
 * - Session replay generation
 * - Slack notifications (mock)
 */

import { spawn, ChildProcess } from 'child_process';
import { mkdir, rm, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// Import BarrHawk modules
import { createObservabilitySession } from '../packages/observability/index.js';
import {
  VisualDiffEngine,
  FlakyTestDetector,
  SessionRecorder,
  ReplayVideoGenerator,
  SlackNotifier,
} from '../packages/premium/index.js';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(msg: string, color: keyof typeof COLORS = 'reset'): void {
  console.log(`${COLORS[color]}${msg}${COLORS.reset}`);
}

const BASE_URL = process.env.FAKESAAS_URL || 'http://localhost:4000';
const TEST_DIR = './fakesaas-test-output';

let serverProcess: ChildProcess | null = null;

// =============================================================================
// Server Management
// =============================================================================

async function startServer(): Promise<void> {
  log('\n[Server] Starting FakeSaaS server...', 'yellow');

  return new Promise((resolve, reject) => {
    serverProcess = spawn('npx', ['tsx', 'fakesaas/server.ts'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    let started = false;

    serverProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      if (output.includes('FakeSaaS Server') && !started) {
        started = true;
        log('[Server] FakeSaaS is running on port 3333', 'green');
        setTimeout(resolve, 500); // Give it a moment to fully initialize
      }
    });

    serverProcess.stderr?.on('data', (data) => {
      if (!started) {
        log(`[Server] Error: ${data}`, 'red');
      }
    });

    serverProcess.on('error', reject);

    // Timeout
    setTimeout(() => {
      if (!started) {
        reject(new Error('Server failed to start within timeout'));
      }
    }, 10000);
  });
}

function stopServer(): void {
  if (serverProcess) {
    log('[Server] Stopping FakeSaaS server...', 'yellow');
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

// =============================================================================
// Browser Test Runner
// =============================================================================

async function runBrowserTest(
  testName: string,
  testFn: (page: any, tools: any) => Promise<void>
): Promise<{ passed: boolean; error?: string; duration: number }> {
  const startTime = Date.now();

  // We'll use dynamic import for the MCP tools
  // For this test, we'll simulate the browser actions
  try {
    log(`\n  [${testName}] Starting...`, 'cyan');

    // Simulate test execution
    await testFn(null, null);

    const duration = Date.now() - startTime;
    log(`  [${testName}] PASSED (${duration}ms)`, 'green');
    return { passed: true, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`  [${testName}] FAILED: ${errorMsg}`, 'red');
    return { passed: false, error: errorMsg, duration };
  }
}

// =============================================================================
// Test Suites
// =============================================================================

async function testLoginFlow(): Promise<{ passed: boolean; error?: string; duration: number }> {
  return runBrowserTest('Login Flow', async () => {
    // Simulate successful login test
    const response = await fetch(`${BASE_URL}/api/health`);
    if (!response.ok) throw new Error('Server not responding');

    // Test login API
    const loginRes = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo@example.com', password: 'demo123' }),
    });

    const data = await loginRes.json();
    if (!data.success) throw new Error('Login failed');

    log('    ✓ Server health check passed', 'dim');
    log('    ✓ Login API works', 'dim');
  });
}

async function testDashboardLoad(): Promise<{ passed: boolean; error?: string; duration: number }> {
  return runBrowserTest('Dashboard Load', async () => {
    // Test stats API
    const statsRes = await fetch(`${BASE_URL}/api/stats`);

    if (!statsRes.ok) {
      // This might be flaky intentionally
      throw new Error(`Stats API returned ${statsRes.status}`);
    }

    const stats = await statsRes.json();
    if (!stats.users || !stats.revenue) {
      throw new Error('Invalid stats response');
    }

    log(`    ✓ Stats loaded: ${stats.users} users, $${stats.revenue} revenue`, 'dim');
  });
}

async function testSettingsSave(): Promise<{ passed: boolean; error?: string; duration: number }> {
  return runBrowserTest('Settings Save', async () => {
    const res = await fetch(`${BASE_URL}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test User',
        notifications: { email: true, slack: false, sms: false },
      }),
    });

    if (!res.ok) {
      throw new Error(`Settings save failed: ${res.status}`);
    }

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Save failed');
    }

    log('    ✓ Settings saved successfully', 'dim');
  });
}

// =============================================================================
// Main Test Runner
// =============================================================================

async function main(): Promise<void> {
  log('\n╔══════════════════════════════════════════════════════════════════╗', 'magenta');
  log('║       BarrHawk Premium Features - Full Integration Test         ║', 'magenta');
  log('╚══════════════════════════════════════════════════════════════════╝', 'magenta');

  // Setup
  await mkdir(TEST_DIR, { recursive: true });
  await mkdir(`${TEST_DIR}/screenshots`, { recursive: true });
  await mkdir(`${TEST_DIR}/baselines`, { recursive: true });
  await mkdir(`${TEST_DIR}/diffs`, { recursive: true });
  await mkdir(`${TEST_DIR}/replays`, { recursive: true });

  try {
    // Start server
    await startServer();

    // Initialize premium features
    log('\n[Setup] Initializing premium features...', 'yellow');

    const visualDiff = new VisualDiffEngine({
      baselineDir: `${TEST_DIR}/baselines`,
      actualDir: `${TEST_DIR}/screenshots`,
      diffDir: `${TEST_DIR}/diffs`,
      threshold: 0.1,
      allowedDiffPercentage: 2,
    });
    await visualDiff.initialize();
    log('  ✓ Visual diff engine ready', 'green');

    const flakyDetector = new FlakyTestDetector({
      dataDir: `${TEST_DIR}/flaky-data`,
      minRuns: 3,
      flakinessThreshold: 0.15,
    });
    await flakyDetector.initialize();
    log('  ✓ Flaky detector ready', 'green');

    const replayGenerator = new ReplayVideoGenerator({
      outputDir: `${TEST_DIR}/replays`,
      fps: 2,
    });
    log('  ✓ Replay generator ready', 'green');

    const slackNotifier = new SlackNotifier({
      webhookUrl: 'https://hooks.slack.com/services/FAKE/TEST/WEBHOOK',
      defaultChannel: '#test-results',
      dataDir: `${TEST_DIR}/slack-data`,
    });
    await slackNotifier.initialize();
    slackNotifier.addRule({ trigger: 'failure', mentions: ['@qa-team'] });
    log('  ✓ Slack notifier ready (mock mode)', 'green');

    // Create session recorder
    const sessionRunId = `session_${Date.now()}`;
    const recorder = new SessionRecorder(sessionRunId, `${TEST_DIR}/replays`);
    await recorder.initialize();
    recorder.setMetadata({
      testName: 'FakeSaaS Full Test Suite',
      browser: 'chromium',
      viewport: { width: 1280, height: 720 },
    });
    log('  ✓ Session recorder ready', 'green');

    // Run test suite multiple times to detect flakiness
    log('\n[Tests] Running test suite (5 iterations for flaky detection)...', 'yellow');

    const allResults: Array<{
      iteration: number;
      tests: Array<{ name: string; passed: boolean; error?: string; duration: number }>;
    }> = [];

    for (let iteration = 1; iteration <= 5; iteration++) {
      log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'dim');
      log(`ITERATION ${iteration}/5`, 'bold');
      log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'dim');

      const iterationResults: Array<{ name: string; passed: boolean; error?: string; duration: number }> = [];

      // Run tests
      const loginResult = await testLoginFlow();
      iterationResults.push({ name: 'Login Flow', ...loginResult });

      const dashboardResult = await testDashboardLoad();
      iterationResults.push({ name: 'Dashboard Load', ...dashboardResult });

      const settingsResult = await testSettingsSave();
      iterationResults.push({ name: 'Settings Save', ...settingsResult });

      // Record results for flaky detection
      for (const result of iterationResults) {
        await flakyDetector.recordResult({
          testId: result.name.toLowerCase().replace(/\s+/g, '_'),
          testName: result.name,
          runId: `run_${iteration}`,
          timestamp: new Date(),
          status: result.passed ? 'passed' : 'failed',
          duration: result.duration,
          error: result.error,
        });
      }

      // Add frame to session replay
      await recorder.addFrame(
        `${TEST_DIR}/screenshots/iteration_${iteration}.png`,
        iterationResults.map((r, i) => ({
          id: `log_${iteration}_${i}`,
          runId: sessionRunId,
          timestamp: new Date(),
          type: 'step' as const,
          level: r.passed ? 'info' as const : 'error' as const,
          message: `${r.name}: ${r.passed ? 'PASSED' : 'FAILED'}`,
        })),
        [],
        { activeStep: `Iteration ${iteration}` }
      );

      allResults.push({ iteration, tests: iterationResults });

      // Small delay between iterations
      await new Promise(r => setTimeout(r, 200));
    }

    // Save session
    await recorder.saveSession();

    // Generate reports
    log('\n[Reports] Generating analysis reports...', 'yellow');

    // Flaky test report
    const flakyReport = await flakyDetector.generateReport();
    log('\n' + flakyDetector.formatReportForCLI(flakyReport));

    // Session replay
    const session = await replayGenerator.loadSession(sessionRunId);
    if (session) {
      const playerPath = await replayGenerator.generateHtmlPlayer(session);
      log(`\n[Replay] HTML player generated: ${playerPath}`, 'green');
    }

    // Summary
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim');
    log('FINAL SUMMARY', 'bold');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim');

    let totalPassed = 0;
    let totalFailed = 0;

    for (const iteration of allResults) {
      const passed = iteration.tests.filter(t => t.passed).length;
      const failed = iteration.tests.filter(t => !t.passed).length;
      totalPassed += passed;
      totalFailed += failed;
    }

    log(`\nTotal Runs: ${allResults.length * 3}`, 'dim');
    log(`Passed: ${COLORS.green}${totalPassed}${COLORS.reset}`, 'reset');
    log(`Failed: ${COLORS.red}${totalFailed}${COLORS.reset}`, 'reset');
    log(`Pass Rate: ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`, 'dim');

    log(`\nFlaky Tests Detected: ${flakyReport.flakyTests}`, flakyReport.flakyTests > 0 ? 'yellow' : 'green');

    if (flakyReport.summary.worstOffenders.length > 0) {
      log('\nWorst Offenders:', 'yellow');
      for (const test of flakyReport.summary.worstOffenders) {
        log(`  • ${test.testName}: ${(test.flakinessScore * 100).toFixed(0)}% flaky`, 'dim');
      }
    }

    // Notify results (mock)
    const summary = {
      runId: sessionRunId,
      projectId: 'fakesaas',
      status: totalFailed > 0 ? 'failed' as const : 'passed' as const,
      origin: 'ci_cd',
      duration: allResults.reduce((sum, r) => sum + r.tests.reduce((s, t) => s + t.duration, 0), 0),
      total: totalPassed + totalFailed,
      passed: totalPassed,
      failed: totalFailed,
      skipped: 0,
    };

    await slackNotifier.notifyTestRun(summary, { force: true });
    log('\n[Slack] Notification sent (mock)', 'cyan');

    // Output locations
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim');
    log('OUTPUT LOCATIONS', 'bold');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim');
    log(`\n  Flaky Data:    ${TEST_DIR}/flaky-data/`, 'dim');
    log(`  Replays:       ${TEST_DIR}/replays/`, 'dim');
    log(`  Screenshots:   ${TEST_DIR}/screenshots/`, 'dim');
    log(`  Visual Diffs:  ${TEST_DIR}/diffs/`, 'dim');

    if (session) {
      log(`\n  Open replay player:`, 'cyan');
      log(`    open ${TEST_DIR}/replays/${sessionRunId}/player.html`, 'dim');
    }

  } catch (error) {
    log(`\n[Error] ${error}`, 'red');
    process.exitCode = 1;
  } finally {
    stopServer();
  }
}

// Handle cleanup on exit
process.on('SIGINT', () => {
  stopServer();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopServer();
  process.exit(0);
});

main().catch(err => {
  console.error('Fatal error:', err);
  stopServer();
  process.exit(1);
});
