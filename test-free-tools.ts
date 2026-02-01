#!/usr/bin/env npx tsx
/**
 * Test script for all 38 free tier tools
 * Run with: npx tsx test-free-tools.ts
 */

import { chromium } from 'playwright';

// Import all free tools
import {
  assertEquals,
  assertContains,
  assertVisible,
  assertExists,
  assertCount,
  assertUrl,
  assertTitle,
  assertAttribute,
} from './packages/free-tools/src/assertions.js';

import {
  selectorSuggest,
  selectorValidate,
  selectorAlternatives,
} from './packages/free-tools/src/selectors.js';

import {
  selectorStabilityScore,
} from './packages/free-tools/src/selector-stability.js';

import {
  testRecordStart,
  testRecordStop,
  testReplay,
  testExport,
} from './packages/free-tools/src/test-recorder.js';

import {
  detectFlakyTests,
  prioritizeTests,
  deduplicateTests,
  findCoverageGaps,
} from './packages/free-tools/src/test-analysis.js';

import {
  startTestSuite,
  addTestResult,
  endTestSuite,
  reportSummary,
  reportFailures,
  reportTiming,
} from './packages/free-tools/src/reporting.js';

import {
  performanceAnalyze,
  detectPerformanceRegression,
  checkPerformanceBudget,
} from './packages/free-tools/src/performance.js';

import {
  generateData,
  generateEdgeCases,
  generateFromSchema,
} from './packages/free-tools/src/data-generation.js';

import {
  storageClear,
  storageGet,
  storageSet,
  consoleStartCapture,
  consoleStopCapture,
  networkWait,
  networkMock,
} from './packages/free-tools/src/utilities.js';

import {
  a11yCheckBasic,
} from './packages/free-tools/src/a11y-basic.js';

import {
  securityScan,
} from './packages/free-tools/src/security-scan.js';

// Test runner
let passed = 0;
let failed = 0;
const results: { name: string; status: 'pass' | 'fail'; error?: string }[] = [];

async function test(name: string, fn: () => Promise<void>) {
  process.stdout.write(`Testing ${name}... `);
  try {
    await fn();
    passed++;
    results.push({ name, status: 'pass' });
    console.log('✅ PASS');
  } catch (error) {
    failed++;
    const msg = error instanceof Error ? error.message : String(error);
    results.push({ name, status: 'fail', error: msg });
    console.log(`❌ FAIL: ${msg}`);
  }
}

async function main() {
  console.log('\n🦅 BarrHawk Free Tools Test Suite\n');
  console.log('='.repeat(50));
  console.log('Testing all 38 free tier tools...\n');

  // Launch browser
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to test page
  await page.goto('https://the-internet.herokuapp.com/login');
  await page.waitForLoadState('networkidle');
  console.log('Navigated to test page\n');

  // ============================================
  // 1. ASSERTION TOOLS (8)
  // ============================================
  console.log('\n--- ASSERTIONS (8 tools) ---\n');

  await test('assert_equals', async () => {
    const result = assertEquals({ expected: 'hello', actual: 'hello' });
    if (!result.passed) throw new Error(result.message);
  });

  await test('assert_equals (fail case)', async () => {
    const result = assertEquals({ expected: 'hello', actual: 'world' });
    if (result.passed) throw new Error('Should have failed');
  });

  await test('assert_contains', async () => {
    const result = assertContains({ text: 'hello world', substring: 'world' });
    if (!result.passed) throw new Error(result.message);
  });

  await test('assert_visible', async () => {
    const result = await assertVisible({ page, selector: 'h2' });
    if (!result.passed) throw new Error(result.message);
  });

  await test('assert_exists', async () => {
    const result = await assertExists({ page, selector: '#username' });
    if (!result.passed) throw new Error(result.message);
  });

  await test('assert_count', async () => {
    const result = await assertCount({ page, selector: 'input', expected: 2 });
    if (!result.passed) throw new Error(result.message);
  });

  await test('assert_url', async () => {
    const result = await assertUrl({ page, expected: 'login', matchType: 'contains' });
    if (!result.passed) throw new Error(result.message);
  });

  await test('assert_title', async () => {
    const result = await assertTitle({ page, expected: 'Internet', matchType: 'contains' });
    if (!result.passed) throw new Error(result.message);
  });

  await test('assert_attribute', async () => {
    const result = await assertAttribute({ page, selector: '#username', attribute: 'id', expected: 'username' });
    if (!result.passed) throw new Error(result.message);
  });

  // ============================================
  // 2. SELECTOR TOOLS (4)
  // ============================================
  console.log('\n--- SELECTOR TOOLS (4 tools) ---\n');

  await test('selector_suggest', async () => {
    const result = await selectorSuggest({ page, description: 'input field' });
    if (!result.suggestions || result.suggestions.length === 0) throw new Error('No selectors suggested');
    console.log(`   Found ${result.suggestions.length} suggestions, recommended: ${result.recommended}`);
  });

  await test('selector_validate', async () => {
    const result = await selectorValidate({ page, selector: '#username' });
    if (!result.valid) throw new Error('Selector should be valid');
    console.log(`   Matches: ${result.matchCount} element(s)`);
  });

  await test('selector_alternatives', async () => {
    const result = await selectorAlternatives({ page, selector: '#username' });
    if (!result.alternatives || result.alternatives.length === 0) throw new Error('No alternatives found');
    console.log(`   Found ${result.alternatives.length} alternative selectors`);
  });

  await test('selector_stability_score', async () => {
    const result = await selectorStabilityScore({ page, selector: '#username' });
    console.log(`   Score: ${result.score}/100 (${result.grade})`);
    if (result.score < 0 || result.score > 100) throw new Error('Invalid score');
  });

  // ============================================
  // 3. RECORDING TOOLS (4)
  // ============================================
  console.log('\n--- RECORDING TOOLS (4 tools) ---\n');

  await test('test_record_start', async () => {
    const result = await testRecordStart({ page });
    console.log(`   Recording started: ${result.recording.id}`);
  });

  await test('test_record_stop', async () => {
    // Do some actions
    await page.fill('#username', 'testuser');
    await page.fill('#password', 'testpass');
    const result = testRecordStop();
    console.log(`   Recorded ${result.actionCount} actions in ${result.duration}ms`);
  });

  await test('test_replay', async () => {
    // Create a simple recording
    const recording = {
      id: 'test-replay',
      name: 'Test Replay',
      startTime: new Date().toISOString(),
      baseUrl: 'https://the-internet.herokuapp.com',
      actions: [
        { type: 'type' as const, selector: '#username', value: 'replayed', timestamp: Date.now(), description: 'Fill username' },
      ],
      status: 'completed' as const,
    };
    const result = await testReplay({ page, recording });
    console.log(`   Replayed ${result.actionsExecuted}/${result.totalActions} actions`);
  });

  await test('test_export (Playwright)', async () => {
    const recording = {
      id: 'test-export',
      name: 'Test Export',
      startTime: new Date().toISOString(),
      baseUrl: 'https://example.com',
      actions: [
        { type: 'navigate' as const, url: 'https://example.com', timestamp: Date.now(), description: 'Go to page' },
        { type: 'click' as const, selector: 'a', timestamp: Date.now(), description: 'Click link' },
      ],
      status: 'completed' as const,
    };
    const result = testExport({ recording, format: 'playwright' });
    if (!result.code || !result.code.includes('page.goto')) throw new Error('Invalid export');
    console.log(`   Exported ${result.lineCount} lines to ${result.format}`);
  });

  // ============================================
  // 4. TEST ANALYSIS TOOLS (4)
  // ============================================
  console.log('\n--- TEST ANALYSIS TOOLS (4 tools) ---\n');

  await test('test_flaky_detect', async () => {
    const history = [
      { testId: 'test1', testName: 'Login Test', runs: [
        { runId: '1', timestamp: '2024-01-01', status: 'passed' as const, duration: 100 },
        { runId: '2', timestamp: '2024-01-02', status: 'failed' as const, duration: 150 },
        { runId: '3', timestamp: '2024-01-03', status: 'passed' as const, duration: 120 },
        { runId: '4', timestamp: '2024-01-04', status: 'failed' as const, duration: 130 },
        { runId: '5', timestamp: '2024-01-05', status: 'passed' as const, duration: 110 },
      ]},
    ];
    const result = detectFlakyTests({ history });
    console.log(`   Analyzed ${result.totalTests} tests, found ${result.flakyTests.filter(t => t.isFlaky).length} flaky`);
  });

  await test('test_prioritize', async () => {
    const history = [
      { testId: 'test1', testName: 'Login', runs: [
        { runId: '1', timestamp: '2024-01-01', status: 'failed' as const, duration: 100 },
        { runId: '2', timestamp: '2024-01-02', status: 'passed' as const, duration: 100 },
      ]},
      { testId: 'test2', testName: 'Search', runs: [
        { runId: '1', timestamp: '2024-01-01', status: 'passed' as const, duration: 50 },
        { runId: '2', timestamp: '2024-01-02', status: 'passed' as const, duration: 50 },
      ]},
    ];
    const result = prioritizeTests({ history });
    console.log(`   Prioritized ${result.prioritized.length} tests`);
  });

  await test('test_deduplicate', async () => {
    const tests = [
      { testId: '1', testName: 'Login A', actions: ['click login', 'fill user', 'fill pass', 'click submit'], selectors: ['#login'], assertions: ['visible'] },
      { testId: '2', testName: 'Login B', actions: ['click login', 'fill user', 'fill pass', 'click submit'], selectors: ['#login'], assertions: ['visible'] },
    ];
    const result = deduplicateTests({ tests });
    console.log(`   Found ${result.duplicates.length} duplicate pairs`);
  });

  await test('test_coverage_gaps', async () => {
    const tests = [
      { testName: 'Login', actions: ['login'], urls: ['/login'], elements: ['#username'] },
    ];
    const result = findCoverageGaps({ tests });
    console.log(`   Coverage score: ${result.coverageScore}/100, ${result.gaps.length} gaps found`);
  });

  // ============================================
  // 5. REPORTING TOOLS (6)
  // ============================================
  console.log('\n--- REPORTING TOOLS (6 tools) ---\n');

  await test('report_summary', async () => {
    const results = {
      name: 'Test Suite',
      tests: [
        { name: 'Test 1', status: 'passed' as const, duration: 100, timestamp: Date.now() },
        { name: 'Test 2', status: 'failed' as const, duration: 200, timestamp: Date.now(), error: 'Timeout' },
        { name: 'Test 3', status: 'passed' as const, duration: 150, timestamp: Date.now() },
      ],
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      duration: 450,
    };
    const result = reportSummary({ results });
    console.log(`   ${result.passed}/${result.total} passed (${result.passRate}%)`);
  });

  await test('report_failures', async () => {
    const results = {
      name: 'Test Suite',
      tests: [
        { name: 'Test 1', status: 'failed' as const, duration: 200, timestamp: Date.now(), error: 'Element not found' },
      ],
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      duration: 200,
    };
    const result = reportFailures({ results });
    console.log(`   ${result.failures.length} failures reported`);
  });

  await test('report_timing', async () => {
    const results = {
      name: 'Test Suite',
      tests: [
        { name: 'Test 1', status: 'passed' as const, duration: 100, timestamp: Date.now() },
        { name: 'Test 2', status: 'passed' as const, duration: 500, timestamp: Date.now() },
      ],
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      duration: 600,
    };
    const result = reportTiming({ results });
    console.log(`   Total: ${result.totalDuration}ms, Avg: ${result.averageDuration}ms`);
  });

  await test('test_suite_start', async () => {
    startTestSuite('Integration Tests', { browser: 'chromium', os: 'linux' });
    console.log('   Suite started');
  });

  await test('test_suite_add_result', async () => {
    addTestResult({ name: 'Sample Test', status: 'passed', duration: 100 });
    console.log('   Result added');
  });

  await test('test_suite_end', async () => {
    const suite = endTestSuite();
    console.log(`   Suite ended: ${suite.tests.length} tests`);
  });

  // ============================================
  // 6. PERFORMANCE TOOLS (3)
  // ============================================
  console.log('\n--- PERFORMANCE TOOLS (3 tools) ---\n');

  await test('performance_analyze', async () => {
    const result = await performanceAnalyze({ page });
    console.log(`   Overall: ${result.scores.overall}/100 (${result.grade})`);
    console.log(`   LCP: ${result.metrics.lcp}ms, FCP: ${result.metrics.fcp}ms`);
  });

  await test('performance_regression', async () => {
    const baseline = [
      { runId: '1', timestamp: '2024-01-01', url: 'test', metrics: { lcp: 1000, fcp: 500, cls: 0.1, ttfb: 200, fid: null, inp: null, domContentLoaded: 500, loadComplete: 1500, resourceCount: 10, resourceSize: 100000, jsHeapSize: null, domNodes: 100, longTasks: 0 }},
    ];
    const current = [
      { runId: '2', timestamp: '2024-01-02', url: 'test', metrics: { lcp: 1500, fcp: 700, cls: 0.1, ttfb: 250, fid: null, inp: null, domContentLoaded: 700, loadComplete: 2000, resourceCount: 12, resourceSize: 120000, jsHeapSize: null, domNodes: 120, longTasks: 1 }},
    ];
    const result = detectPerformanceRegression({ baseline, current });
    console.log(`   Regressions: ${result.hasRegression ? result.regressions.length : 0}`);
  });

  await test('performance_budget_check', async () => {
    const perf = await performanceAnalyze({ page });
    const result = checkPerformanceBudget({
      metrics: perf.metrics,
      budget: { lcp: 5000, fcp: 3000, cls: 0.25, ttfb: 2000 },
    });
    console.log(`   Budget: ${result.passed ? 'PASSED' : 'FAILED'} (${result.score}%)`);
  });

  // ============================================
  // 7. DATA GENERATION TOOLS (3)
  // ============================================
  console.log('\n--- DATA GENERATION TOOLS (3 tools) ---\n');

  await test('data_generate', async () => {
    const nameResult = generateData({ type: 'name', count: 3 });
    const emailResult = generateData({ type: 'email', count: 3 });
    console.log(`   Generated: ${nameResult.data.join(', ')}`);
    console.log(`   Generated: ${emailResult.data.join(', ')}`);
  });

  await test('data_edge_cases', async () => {
    const result = generateEdgeCases({ type: 'string' });
    console.log(`   Generated ${result.count} edge cases for strings`);
  });

  await test('data_from_schema', async () => {
    const schema = {
      name: 'user',
      type: 'object' as const,
      properties: {
        username: { name: 'username', type: 'string' as const, minLength: 3, maxLength: 20 },
        email: { name: 'email', type: 'string' as const, format: 'email' },
        age: { name: 'age', type: 'integer' as const, minimum: 18, maximum: 99 },
      },
    };
    const result = generateFromSchema({ schema, count: 2 });
    console.log(`   Generated ${result.count} objects from schema`);
  });

  // ============================================
  // 8. STORAGE & NETWORK TOOLS (7)
  // ============================================
  console.log('\n--- STORAGE & NETWORK TOOLS (7 tools) ---\n');

  await test('storage_set', async () => {
    await storageSet({ page, type: 'localStorage', key: 'testKey', value: 'testValue' });
    console.log('   Set localStorage item');
  });

  await test('storage_get', async () => {
    const result = await storageGet({ page, type: 'localStorage', key: 'testKey' });
    console.log(`   Got value: ${JSON.stringify(result.data)}`);
  });

  await test('storage_clear', async () => {
    await storageClear({ page, type: 'localStorage' });
    console.log('   Cleared localStorage');
  });

  await test('console_start_capture', async () => {
    consoleStartCapture({ page });
    console.log('   Console capture started');
  });

  await test('console_stop_capture', async () => {
    // Trigger some console output
    await page.evaluate(() => console.log('Test message from page'));
    const result = consoleStopCapture();
    console.log(`   Captured ${result.count} console messages`);
  });

  await test('network_wait', async () => {
    const result = await networkWait({ page, state: 'idle', timeout: 5000 });
    console.log(`   Network ${result.achieved ? 'idle' : 'busy'}`);
  });

  await test('network_mock', async () => {
    const result = await networkMock({
      page,
      urlPattern: '**/api/test',
      response: { status: 200, body: '{"mocked": true}' },
    });
    console.log(`   Mock registered: ${result.pattern}`);
  });

  // ============================================
  // 9. ACCESSIBILITY & SECURITY (2)
  // ============================================
  console.log('\n--- ACCESSIBILITY & SECURITY (2 tools) ---\n');

  await test('a11y_check_basic', async () => {
    const result = await a11yCheckBasic({ page });
    console.log(`   Found ${result.issues.length} a11y issues`);
    console.log(`   Grade: ${result.grade}, Score: ${result.score}/100`);
  });

  await test('security_scan', async () => {
    const result = await securityScan({ page });
    console.log(`   Found ${result.summary.total} security issues`);
    console.log(`   Score: ${result.score}/100, Passed: ${result.passed}`);
  });

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 TEST RESULTS SUMMARY\n');
  console.log(`Total: ${passed + failed}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);
  console.log(`Pass Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%\n`);

  if (failed > 0) {
    console.log('Failed Tests:');
    results.filter(r => r.status === 'fail').forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
  }

  // Cleanup
  console.log('\nClosing browser...');
  await browser.close();

  console.log('\n🦅 Test suite complete!\n');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
