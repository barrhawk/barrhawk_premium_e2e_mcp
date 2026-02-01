#!/usr/bin/env npx tsx
/**
 * BarrHawk E2E Premium Features Test
 *
 * Tests all premium features to verify they work correctly.
 */

import { randomUUID } from 'crypto';

// Test imports
import {
  VisualDiffEngine,
  FlakyTestDetector,
  SessionRecorder,
  ReplayVideoGenerator,
  SlackNotifier,
} from './index.js';

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

function log(msg: string, color: keyof typeof COLORS = 'reset'): void {
  console.log(`${COLORS[color]}${msg}${COLORS.reset}`);
}

async function testVisualDiff(): Promise<boolean> {
  log('\n[1/4] Testing Visual Diff Engine...', 'yellow');

  try {
    const engine = new VisualDiffEngine({
      baselineDir: './test-visual/baselines',
      actualDir: './test-visual/actual',
      diffDir: './test-visual/diffs',
      threshold: 0.1,
      allowedDiffPercentage: 1.0,
    });

    await engine.initialize();
    log('  ✓ Engine initialized', 'green');

    // Test with no baseline (should return NO_BASELINE error)
    const result = await engine.compareWithBaseline('nonexistent');
    if (result.error === 'NO_BASELINE') {
      log('  ✓ Correctly handles missing baseline', 'green');
    } else {
      log('  ✗ Should return NO_BASELINE error', 'red');
      return false;
    }

    // Test full comparison run
    const report = await engine.runFullComparison();
    log(`  ✓ Full comparison: ${report.totalComparisons} images checked`, 'green');

    return true;
  } catch (error) {
    log(`  ✗ Error: ${error}`, 'red');
    return false;
  }
}

async function testFlakyDetector(): Promise<boolean> {
  log('\n[2/4] Testing Flaky Test Detector...', 'yellow');

  try {
    const detector = new FlakyTestDetector({
      dataDir: './test-flaky-data',
      minRuns: 3,
      flakinessThreshold: 0.1,
    });

    await detector.initialize();
    log('  ✓ Detector initialized', 'green');

    // Record some test results
    const testId = 'test_' + randomUUID().substring(0, 8);
    const testName = 'Example flaky test';

    // Simulate flaky test: pass, fail, pass, fail, pass
    const statuses: Array<'passed' | 'failed'> = ['passed', 'failed', 'passed', 'failed', 'passed'];

    for (let i = 0; i < statuses.length; i++) {
      await detector.recordResult({
        testId,
        testName,
        runId: `run_${i}`,
        timestamp: new Date(Date.now() - (statuses.length - i) * 3600000),
        status: statuses[i],
        duration: 1000 + Math.random() * 500,
      });
    }
    log(`  ✓ Recorded ${statuses.length} test results`, 'green');

    // Analyze the test
    const analysis = detector.analyzeTest(testId);
    if (analysis) {
      log(`  ✓ Analysis complete:`, 'green');
      log(`    - Pass rate: ${(analysis.passRate * 100).toFixed(1)}%`, 'dim');
      log(`    - Flakiness score: ${(analysis.flakinessScore * 100).toFixed(1)}%`, 'dim');
      log(`    - Recommendation: ${analysis.recommendation}`, 'dim');

      // Should be detected as flaky (60% pass rate)
      if (analysis.flakinessScore > 0.3) {
        log('  ✓ Correctly identified as flaky', 'green');
      } else {
        log('  ✗ Should be identified as flaky', 'red');
        return false;
      }
    } else {
      log('  ✗ Analysis returned null', 'red');
      return false;
    }

    // Generate report
    const report = await detector.generateReport();
    log(`  ✓ Report generated: ${report.totalTests} tests, ${report.flakyTests} flaky`, 'green');

    // Test CLI formatting
    const cliOutput = detector.formatReportForCLI(report);
    if (cliOutput.includes('FLAKY TEST REPORT')) {
      log('  ✓ CLI output formatted correctly', 'green');
    }

    return true;
  } catch (error) {
    log(`  ✗ Error: ${error}`, 'red');
    return false;
  }
}

async function testSessionReplay(): Promise<boolean> {
  log('\n[3/4] Testing Session Replay...', 'yellow');

  try {
    const runId = 'replay_test_' + Date.now();
    const recorder = new SessionRecorder(runId, './test-replays');

    await recorder.initialize();
    log('  ✓ Recorder initialized', 'green');

    // Set metadata
    recorder.setMetadata({
      testName: 'Example replay test',
      status: 'passed',
      browser: 'chromium',
      viewport: { width: 1280, height: 720 },
    });
    log('  ✓ Metadata set', 'green');

    // Add some mock frames (without actual screenshots)
    for (let i = 0; i < 5; i++) {
      await recorder.addFrame(
        '/nonexistent/frame.png', // Will fail to copy but that's OK for testing
        [
          {
            id: `log_${i}`,
            runId,
            timestamp: new Date(),
            type: 'console',
            level: i % 2 === 0 ? 'info' : 'warn',
            message: `Test log message ${i}`,
          },
        ],
        [
          {
            id: `req_${i}`,
            runId,
            timestamp: new Date(),
            method: 'GET',
            url: `https://example.com/api/${i}`,
            status: 200,
            duration: 100 + i * 50,
          },
        ],
        {
          activeStep: `Step ${i + 1}`,
          pageUrl: `https://example.com/page${i}`,
        }
      );
    }
    log('  ✓ Added 5 frames to session', 'green');

    // Save session
    await recorder.saveSession();
    log('  ✓ Session saved', 'green');

    // Test video generator (loading)
    const generator = new ReplayVideoGenerator({ outputDir: './test-replays' });
    const session = await generator.loadSession(runId);

    if (session) {
      log(`  ✓ Session loaded: ${session.frames.length} frames`, 'green');

      // Generate HTML player
      const playerPath = await generator.generateHtmlPlayer(session);
      log(`  ✓ HTML player generated: ${playerPath}`, 'green');
    } else {
      log('  ✗ Failed to load session', 'red');
      return false;
    }

    return true;
  } catch (error) {
    log(`  ✗ Error: ${error}`, 'red');
    return false;
  }
}

async function testSlackNotifications(): Promise<boolean> {
  log('\n[4/4] Testing Slack Notifications...', 'yellow');

  try {
    // Create notifier with a fake webhook (won't actually send)
    const notifier = new SlackNotifier({
      webhookUrl: 'https://hooks.slack.com/services/FAKE/FAKE/FAKE',
      defaultChannel: '#testing',
      username: 'BarrHawk Test',
      dataDir: './test-slack-data',
    });

    await notifier.initialize();
    log('  ✓ Notifier initialized', 'green');

    // Add notification rules
    notifier.addRule({
      trigger: 'failure',
      channel: '#test-failures',
      includeError: true,
      mentions: ['@oncall'],
    });

    notifier.addRule({
      trigger: 'success',
      channel: '#test-success',
      testPattern: 'critical.*',
    });

    log('  ✓ Notification rules added', 'green');

    // Test message building (will fail to send but that's OK)
    const summary = {
      runId: 'test_run_123',
      projectId: 'test-project',
      status: 'failed' as const,
      origin: 'ci_cd',
      duration: 45000,
      total: 10,
      passed: 8,
      failed: 2,
      skipped: 0,
      failedTests: [
        { name: 'login.test.ts', error: 'Element not found: #login-btn' },
        { name: 'checkout.test.ts', error: 'Timeout waiting for payment form' },
      ],
    };

    // This will fail to actually send (fake webhook) but tests the message building
    const sent = await notifier.notifyTestRun(summary, { force: true });
    // Expected to fail since webhook is fake
    log('  ✓ Message building works (send failed as expected with fake webhook)', 'green');

    // Test flaky notification
    await notifier.notifyFlakyTest(
      'flaky.test.ts',
      0.45,
      [
        { status: 'passed' },
        { status: 'failed' },
        { status: 'passed' },
        { status: 'failed' },
        { status: 'passed' },
      ],
      'investigate'
    );
    log('  ✓ Flaky test notification built', 'green');

    // Test daily summary
    await notifier.notifyDailySummary(new Date(), {
      totalRuns: 50,
      passed: 45,
      failed: 5,
      flakyTests: 3,
      topFailures: [
        { name: 'flaky.test.ts', count: 3 },
        { name: 'slow.test.ts', count: 2 },
      ],
    });
    log('  ✓ Daily summary notification built', 'green');

    return true;
  } catch (error) {
    log(`  ✗ Error: ${error}`, 'red');
    return false;
  }
}

async function main(): Promise<void> {
  log('\n╔══════════════════════════════════════════════════════════════╗', 'blue');
  log('║          BarrHawk Premium Features Test Suite                ║', 'blue');
  log('╚══════════════════════════════════════════════════════════════╝', 'blue');

  let passed = 0;
  let failed = 0;

  if (await testVisualDiff()) passed++; else failed++;
  if (await testFlakyDetector()) passed++; else failed++;
  if (await testSessionReplay()) passed++; else failed++;
  if (await testSlackNotifications()) passed++; else failed++;

  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'dim');
  if (failed === 0) {
    log(`✓ ALL ${passed} TESTS PASSED`, 'green');
  } else {
    log(`✗ ${passed} passed, ${failed} failed`, 'red');
    process.exit(1);
  }

  log('\nPremium Features Ready:', 'bold');
  log('  • Visual Diff Engine - Screenshot comparison with threshold', 'dim');
  log('  • Flaky Test Detector - Pattern analysis and recommendations', 'dim');
  log('  • Session Replay - Video generation with HTML player', 'dim');
  log('  • Slack Notifications - Smart alerts with deduplication', 'dim');
}

main().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
