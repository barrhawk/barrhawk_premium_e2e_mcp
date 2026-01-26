/**
 * Basic Reporting - Free Tier
 *
 * Simple test result reporting without AI analysis.
 * For AI-powered insights and recommendations, upgrade to Premium.
 */

// ============================================================================
// Types
// ============================================================================

export interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  screenshot?: string;
  timestamp: string;
}

export interface TestSuiteResults {
  name: string;
  tests: TestResult[];
  startTime: string;
  endTime: string;
  environment?: {
    browser?: string;
    viewport?: { width: number; height: number };
    baseUrl?: string;
  };
}

export interface ReportSummaryOptions {
  results: TestSuiteResults;
  format?: 'text' | 'markdown' | 'json';
}

export interface ReportSummaryResult {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  passRate: number;
  duration: number;
  output: string;
}

export interface ReportFailuresOptions {
  results: TestSuiteResults;
  includeScreenshots?: boolean;
  format?: 'text' | 'markdown' | 'json';
}

export interface FailureReport {
  count: number;
  failures: Array<{
    name: string;
    error: string;
    duration: number;
    screenshot?: string;
  }>;
  output: string;
}

export interface ReportTimingOptions {
  results: TestSuiteResults;
  sortBy?: 'name' | 'duration' | 'status';
  showSlowest?: number;
}

export interface TimingReport {
  totalDuration: number;
  averageDuration: number;
  slowestTests: Array<{
    name: string;
    duration: number;
    status: string;
  }>;
  fastestTests: Array<{
    name: string;
    duration: number;
    status: string;
  }>;
  output: string;
}

// ============================================================================
// Test Results Collector
// ============================================================================

let currentSuite: TestSuiteResults | null = null;

/**
 * Start a new test suite
 */
export function startTestSuite(name: string, environment?: TestSuiteResults['environment']): void {
  currentSuite = {
    name,
    tests: [],
    startTime: new Date().toISOString(),
    endTime: '',
    environment,
  };
}

/**
 * Add a test result to the current suite
 */
export function addTestResult(result: Omit<TestResult, 'timestamp'>): void {
  if (!currentSuite) {
    throw new Error('No test suite started. Call startTestSuite first.');
  }

  currentSuite.tests.push({
    ...result,
    timestamp: new Date().toISOString(),
  });
}

/**
 * End the current test suite
 */
export function endTestSuite(): TestSuiteResults {
  if (!currentSuite) {
    throw new Error('No test suite started.');
  }

  currentSuite.endTime = new Date().toISOString();
  const results = { ...currentSuite };
  currentSuite = null;

  return results;
}

/**
 * Get current test suite (without ending it)
 */
export function getCurrentSuite(): TestSuiteResults | null {
  return currentSuite;
}

// ============================================================================
// Implementations
// ============================================================================

/**
 * Generate a summary report
 */
export function reportSummary(options: ReportSummaryOptions): ReportSummaryResult {
  const { results, format = 'text' } = options;

  const total = results.tests.length;
  const passed = results.tests.filter(t => t.status === 'passed').length;
  const failed = results.tests.filter(t => t.status === 'failed').length;
  const skipped = results.tests.filter(t => t.status === 'skipped').length;
  const passRate = total > 0 ? (passed / total) * 100 : 0;
  const duration = results.tests.reduce((sum, t) => sum + t.duration, 0);

  let output: string;

  switch (format) {
    case 'markdown':
      output = formatSummaryMarkdown(results, { total, passed, failed, skipped, passRate, duration });
      break;
    case 'json':
      output = JSON.stringify({
        suite: results.name,
        total,
        passed,
        failed,
        skipped,
        passRate: Math.round(passRate * 10) / 10,
        duration,
        startTime: results.startTime,
        endTime: results.endTime,
      }, null, 2);
      break;
    default:
      output = formatSummaryText(results, { total, passed, failed, skipped, passRate, duration });
  }

  return {
    total,
    passed,
    failed,
    skipped,
    passRate: Math.round(passRate * 10) / 10,
    duration,
    output,
  };
}

/**
 * Generate a failures report
 */
export function reportFailures(options: ReportFailuresOptions): FailureReport {
  const { results, includeScreenshots = false, format = 'text' } = options;

  const failures = results.tests
    .filter(t => t.status === 'failed')
    .map(t => ({
      name: t.name,
      error: t.error || 'Unknown error',
      duration: t.duration,
      screenshot: includeScreenshots ? t.screenshot : undefined,
    }));

  let output: string;

  switch (format) {
    case 'markdown':
      output = formatFailuresMarkdown(failures);
      break;
    case 'json':
      output = JSON.stringify({ count: failures.length, failures }, null, 2);
      break;
    default:
      output = formatFailuresText(failures);
  }

  return {
    count: failures.length,
    failures,
    output,
  };
}

/**
 * Generate a timing report
 */
export function reportTiming(options: ReportTimingOptions): TimingReport {
  const { results, sortBy = 'duration', showSlowest = 5 } = options;

  const tests = [...results.tests];
  const totalDuration = tests.reduce((sum, t) => sum + t.duration, 0);
  const averageDuration = tests.length > 0 ? totalDuration / tests.length : 0;

  // Sort by duration descending
  tests.sort((a, b) => b.duration - a.duration);

  const slowestTests = tests.slice(0, showSlowest).map(t => ({
    name: t.name,
    duration: t.duration,
    status: t.status,
  }));

  const fastestTests = tests.slice(-showSlowest).reverse().map(t => ({
    name: t.name,
    duration: t.duration,
    status: t.status,
  }));

  const output = formatTimingReport({
    totalDuration,
    averageDuration,
    slowestTests,
    fastestTests,
    testCount: tests.length,
  });

  return {
    totalDuration,
    averageDuration: Math.round(averageDuration),
    slowestTests,
    fastestTests,
    output,
  };
}

// ============================================================================
// Formatters
// ============================================================================

function formatSummaryText(
  results: TestSuiteResults,
  stats: { total: number; passed: number; failed: number; skipped: number; passRate: number; duration: number }
): string {
  const lines: string[] = [];

  lines.push('═'.repeat(50));
  lines.push(`TEST SUMMARY: ${results.name}`);
  lines.push('═'.repeat(50));
  lines.push('');
  lines.push(`Total:    ${stats.total}`);
  lines.push(`Passed:   ${stats.passed} ✅`);
  lines.push(`Failed:   ${stats.failed} ❌`);
  lines.push(`Skipped:  ${stats.skipped} ⏭️`);
  lines.push('');
  lines.push(`Pass Rate: ${stats.passRate.toFixed(1)}%`);
  lines.push(`Duration:  ${formatDuration(stats.duration)}`);
  lines.push('');

  if (results.environment) {
    lines.push('Environment:');
    if (results.environment.browser) {
      lines.push(`  Browser: ${results.environment.browser}`);
    }
    if (results.environment.viewport) {
      lines.push(`  Viewport: ${results.environment.viewport.width}x${results.environment.viewport.height}`);
    }
    if (results.environment.baseUrl) {
      lines.push(`  Base URL: ${results.environment.baseUrl}`);
    }
  }

  lines.push('');
  lines.push('─'.repeat(50));
  lines.push('Results:');
  lines.push('─'.repeat(50));

  for (const test of results.tests) {
    const icon = test.status === 'passed' ? '✅' :
                 test.status === 'failed' ? '❌' : '⏭️';
    lines.push(`${icon} ${test.name} (${test.duration}ms)`);
  }

  return lines.join('\n');
}

function formatSummaryMarkdown(
  results: TestSuiteResults,
  stats: { total: number; passed: number; failed: number; skipped: number; passRate: number; duration: number }
): string {
  const lines: string[] = [];

  lines.push(`# Test Summary: ${results.name}`);
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total | ${stats.total} |`);
  lines.push(`| Passed | ${stats.passed} ✅ |`);
  lines.push(`| Failed | ${stats.failed} ❌ |`);
  lines.push(`| Skipped | ${stats.skipped} ⏭️ |`);
  lines.push(`| Pass Rate | ${stats.passRate.toFixed(1)}% |`);
  lines.push(`| Duration | ${formatDuration(stats.duration)} |`);
  lines.push('');

  lines.push('## Test Results');
  lines.push('');
  lines.push('| Status | Test | Duration |');
  lines.push('|--------|------|----------|');

  for (const test of results.tests) {
    const icon = test.status === 'passed' ? '✅' :
                 test.status === 'failed' ? '❌' : '⏭️';
    lines.push(`| ${icon} | ${test.name} | ${test.duration}ms |`);
  }

  return lines.join('\n');
}

function formatFailuresText(failures: FailureReport['failures']): string {
  if (failures.length === 0) {
    return '✅ No failures!';
  }

  const lines: string[] = [];

  lines.push('═'.repeat(50));
  lines.push(`FAILURES (${failures.length})`);
  lines.push('═'.repeat(50));
  lines.push('');

  for (const failure of failures) {
    lines.push(`❌ ${failure.name}`);
    lines.push(`   Duration: ${failure.duration}ms`);
    lines.push(`   Error: ${failure.error}`);
    if (failure.screenshot) {
      lines.push(`   Screenshot: ${failure.screenshot}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatFailuresMarkdown(failures: FailureReport['failures']): string {
  if (failures.length === 0) {
    return '✅ **No failures!**';
  }

  const lines: string[] = [];

  lines.push(`# Failures (${failures.length})`);
  lines.push('');

  for (const failure of failures) {
    lines.push(`## ❌ ${failure.name}`);
    lines.push('');
    lines.push(`**Duration:** ${failure.duration}ms`);
    lines.push('');
    lines.push('**Error:**');
    lines.push('```');
    lines.push(failure.error);
    lines.push('```');
    if (failure.screenshot) {
      lines.push('');
      lines.push(`**Screenshot:** ${failure.screenshot}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatTimingReport(data: {
  totalDuration: number;
  averageDuration: number;
  slowestTests: TimingReport['slowestTests'];
  fastestTests: TimingReport['fastestTests'];
  testCount: number;
}): string {
  const lines: string[] = [];

  lines.push('═'.repeat(50));
  lines.push('TIMING REPORT');
  lines.push('═'.repeat(50));
  lines.push('');
  lines.push(`Total Duration: ${formatDuration(data.totalDuration)}`);
  lines.push(`Average Duration: ${formatDuration(data.averageDuration)}`);
  lines.push(`Test Count: ${data.testCount}`);
  lines.push('');

  lines.push('─'.repeat(50));
  lines.push('Slowest Tests:');
  lines.push('─'.repeat(50));

  for (const test of data.slowestTests) {
    const icon = test.status === 'passed' ? '✅' : '❌';
    lines.push(`  ${icon} ${test.name}: ${formatDuration(test.duration)}`);
  }

  lines.push('');
  lines.push('─'.repeat(50));
  lines.push('Fastest Tests:');
  lines.push('─'.repeat(50));

  for (const test of data.fastestTests) {
    const icon = test.status === 'passed' ? '✅' : '❌';
    lines.push(`  ${icon} ${test.name}: ${formatDuration(test.duration)}`);
  }

  return lines.join('\n');
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}
