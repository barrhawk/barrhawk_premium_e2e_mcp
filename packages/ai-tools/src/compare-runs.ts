/**
 * Compare Runs Tool
 *
 * Compares passing and failing test runs to identify differences.
 * Helps diagnose intermittent failures and regressions.
 */

export interface TestRunData {
  id: string;
  status: 'passed' | 'failed';
  timestamp: string;
  duration: number;
  steps: RunStep[];
  environment?: {
    browser?: string;
    viewport?: { width: number; height: number };
    baseUrl?: string;
    userAgent?: string;
  };
  screenshots?: string[];
  networkRequests?: NetworkRequest[];
  consoleMessages?: ConsoleMessage[];
  errorMessage?: string;
  stackTrace?: string;
}

export interface RunStep {
  name: string;
  action: string;
  selector?: string;
  value?: string;
  duration: number;
  status: 'passed' | 'failed' | 'skipped';
  screenshot?: string;
  error?: string;
}

export interface NetworkRequest {
  url: string;
  method: string;
  status: number;
  duration: number;
  timing?: {
    dns: number;
    connect: number;
    response: number;
  };
}

export interface ConsoleMessage {
  type: 'log' | 'warn' | 'error' | 'info';
  text: string;
  timestamp: string;
}

export interface CompareRunsOptions {
  passingRun: TestRunData;
  failingRun: TestRunData;
  focusAreas?: ('timing' | 'network' | 'steps' | 'environment' | 'console')[];
}

export interface Difference {
  category: string;
  field: string;
  passing: string;
  failing: string;
  significance: 'low' | 'medium' | 'high';
  possibleCause?: string;
}

export interface CompareRunsResult {
  summary: string;
  likelyRootCause: string;
  differences: Difference[];
  timingAnalysis: {
    totalDiff: number;
    significantSlowdowns: Array<{ step: string; diff: number }>;
    networkSlowdowns: Array<{ url: string; diff: number }>;
  };
  environmentChanges: Difference[];
  recommendations: string[];
  confidence: number;
}

/**
 * Compare passing and failing test runs
 */
export function compareRuns(options: CompareRunsOptions): CompareRunsResult {
  const { passingRun, failingRun, focusAreas } = options;

  const differences: Difference[] = [];

  // Compare environments
  const envDiffs = compareEnvironments(passingRun, failingRun);
  differences.push(...envDiffs);

  // Compare steps
  const stepDiffs = compareSteps(passingRun.steps, failingRun.steps);
  differences.push(...stepDiffs);

  // Compare network requests
  const networkDiffs = compareNetwork(passingRun.networkRequests, failingRun.networkRequests);
  differences.push(...networkDiffs);

  // Compare console messages
  const consoleDiffs = compareConsole(passingRun.consoleMessages, failingRun.consoleMessages);
  differences.push(...consoleDiffs);

  // Perform timing analysis
  const timingAnalysis = analyzeTimings(passingRun, failingRun);

  // Filter by focus areas if specified
  let filteredDiffs = differences;
  if (focusAreas && focusAreas.length > 0) {
    const categoryMap: Record<string, string[]> = {
      timing: ['Duration', 'Timing'],
      network: ['Network'],
      steps: ['Step'],
      environment: ['Environment'],
      console: ['Console'],
    };

    const allowedCategories = focusAreas.flatMap(area => categoryMap[area] || []);
    filteredDiffs = differences.filter(d =>
      allowedCategories.some(cat => d.category.includes(cat))
    );
  }

  // Determine likely root cause
  const likelyRootCause = determineLikelyCause(filteredDiffs, failingRun, timingAnalysis);

  // Generate summary
  const summary = generateSummary(filteredDiffs, timingAnalysis, failingRun);

  // Generate recommendations
  const recommendations = generateRecommendations(filteredDiffs, likelyRootCause, timingAnalysis);

  // Calculate confidence
  const confidence = calculateConfidence(filteredDiffs, likelyRootCause);

  return {
    summary,
    likelyRootCause,
    differences: filteredDiffs,
    timingAnalysis,
    environmentChanges: envDiffs,
    recommendations,
    confidence,
  };
}

function compareEnvironments(passing: TestRunData, failing: TestRunData): Difference[] {
  const diffs: Difference[] = [];

  const pEnv = passing.environment || {};
  const fEnv = failing.environment || {};

  if (pEnv.browser !== fEnv.browser) {
    diffs.push({
      category: 'Environment',
      field: 'Browser',
      passing: pEnv.browser || 'unknown',
      failing: fEnv.browser || 'unknown',
      significance: 'high',
      possibleCause: 'Different browsers may have rendering or behavior differences',
    });
  }

  if (pEnv.viewport && fEnv.viewport) {
    if (pEnv.viewport.width !== fEnv.viewport.width || pEnv.viewport.height !== fEnv.viewport.height) {
      diffs.push({
        category: 'Environment',
        field: 'Viewport',
        passing: `${pEnv.viewport.width}x${pEnv.viewport.height}`,
        failing: `${fEnv.viewport.width}x${fEnv.viewport.height}`,
        significance: 'medium',
        possibleCause: 'Different viewport sizes can affect element visibility and layout',
      });
    }
  }

  if (pEnv.baseUrl !== fEnv.baseUrl) {
    diffs.push({
      category: 'Environment',
      field: 'Base URL',
      passing: pEnv.baseUrl || 'unknown',
      failing: fEnv.baseUrl || 'unknown',
      significance: 'high',
      possibleCause: 'Different environments may have different data or configurations',
    });
  }

  if (pEnv.userAgent !== fEnv.userAgent) {
    diffs.push({
      category: 'Environment',
      field: 'User Agent',
      passing: truncate(pEnv.userAgent || 'unknown', 50),
      failing: truncate(fEnv.userAgent || 'unknown', 50),
      significance: 'medium',
      possibleCause: 'User agent differences can affect server responses',
    });
  }

  return diffs;
}

function compareSteps(passing: RunStep[], failing: RunStep[]): Difference[] {
  const diffs: Difference[] = [];

  const maxSteps = Math.max(passing.length, failing.length);

  for (let i = 0; i < maxSteps; i++) {
    const pStep = passing[i];
    const fStep = failing[i];

    // Missing step
    if (!pStep || !fStep) {
      diffs.push({
        category: 'Step',
        field: `Step ${i + 1}`,
        passing: pStep ? `${pStep.action}: ${pStep.name}` : '(missing)',
        failing: fStep ? `${fStep.action}: ${fStep.name}` : '(missing)',
        significance: 'high',
        possibleCause: 'Test execution diverged - steps do not match',
      });
      continue;
    }

    // Different status
    if (pStep.status !== fStep.status) {
      diffs.push({
        category: 'Step Status',
        field: `Step ${i + 1}: ${fStep.name}`,
        passing: pStep.status,
        failing: fStep.status,
        significance: fStep.status === 'failed' ? 'high' : 'medium',
        possibleCause: fStep.error || 'Step failed in failing run',
      });
    }

    // Significant timing difference (>50% slower)
    if (pStep.duration > 0 && fStep.duration > pStep.duration * 1.5) {
      diffs.push({
        category: 'Step Timing',
        field: `Step ${i + 1}: ${fStep.name}`,
        passing: `${pStep.duration}ms`,
        failing: `${fStep.duration}ms (${Math.round((fStep.duration - pStep.duration) / pStep.duration * 100)}% slower)`,
        significance: 'medium',
        possibleCause: 'Significant slowdown in this step may indicate performance issues',
      });
    }

    // Different selector
    if (pStep.selector !== fStep.selector) {
      diffs.push({
        category: 'Step Selector',
        field: `Step ${i + 1}: ${fStep.name}`,
        passing: pStep.selector || 'none',
        failing: fStep.selector || 'none',
        significance: 'low',
      });
    }
  }

  return diffs;
}

function compareNetwork(
  passing?: NetworkRequest[],
  failing?: NetworkRequest[]
): Difference[] {
  const diffs: Difference[] = [];

  if (!passing || !failing) return diffs;

  // Index passing requests by URL
  const passingByUrl = new Map<string, NetworkRequest>();
  for (const req of passing) {
    passingByUrl.set(req.url, req);
  }

  // Check for different statuses
  for (const fReq of failing) {
    const pReq = passingByUrl.get(fReq.url);

    if (!pReq) {
      // New request in failing run
      if (fReq.status >= 400) {
        diffs.push({
          category: 'Network Request',
          field: truncate(fReq.url, 50),
          passing: '(not made)',
          failing: `${fReq.method} - ${fReq.status}`,
          significance: 'high',
          possibleCause: 'New failing network request in failing run',
        });
      }
      continue;
    }

    // Different status
    if (pReq.status !== fReq.status) {
      diffs.push({
        category: 'Network Status',
        field: truncate(fReq.url, 50),
        passing: `${pReq.status}`,
        failing: `${fReq.status}`,
        significance: fReq.status >= 400 ? 'high' : 'medium',
        possibleCause: `API returned different status: ${fReq.status}`,
      });
    }

    // Significant timing difference
    if (pReq.duration > 0 && fReq.duration > pReq.duration * 2) {
      diffs.push({
        category: 'Network Timing',
        field: truncate(fReq.url, 50),
        passing: `${pReq.duration}ms`,
        failing: `${fReq.duration}ms`,
        significance: 'medium',
        possibleCause: 'API response time significantly slower',
      });
    }
  }

  // Check for missing requests
  for (const pReq of passing) {
    const exists = failing.some(f => f.url === pReq.url);
    if (!exists && pReq.status < 400) {
      diffs.push({
        category: 'Network Request',
        field: truncate(pReq.url, 50),
        passing: `${pReq.method} - ${pReq.status}`,
        failing: '(not made)',
        significance: 'medium',
        possibleCause: 'Request from passing run not made in failing run',
      });
    }
  }

  return diffs;
}

function compareConsole(
  passing?: ConsoleMessage[],
  failing?: ConsoleMessage[]
): Difference[] {
  const diffs: Difference[] = [];

  const pErrors = (passing || []).filter(m => m.type === 'error');
  const fErrors = (failing || []).filter(m => m.type === 'error');

  // New errors in failing run
  for (const fErr of fErrors) {
    const exists = pErrors.some(p => p.text === fErr.text);
    if (!exists) {
      diffs.push({
        category: 'Console Error',
        field: 'New Error',
        passing: '(none)',
        failing: truncate(fErr.text, 100),
        significance: 'high',
        possibleCause: 'JavaScript error occurred in failing run',
      });
    }
  }

  // Warnings in failing run
  const fWarnings = (failing || []).filter(m => m.type === 'warn');
  const pWarnings = (passing || []).filter(m => m.type === 'warn');

  for (const fWarn of fWarnings) {
    const exists = pWarnings.some(p => p.text === fWarn.text);
    if (!exists && fWarnings.length > pWarnings.length) {
      diffs.push({
        category: 'Console Warning',
        field: 'New Warning',
        passing: '(none)',
        failing: truncate(fWarn.text, 100),
        significance: 'low',
      });
    }
  }

  return diffs;
}

function analyzeTimings(passing: TestRunData, failing: TestRunData): CompareRunsResult['timingAnalysis'] {
  const totalDiff = failing.duration - passing.duration;

  // Find significantly slower steps
  const significantSlowdowns: Array<{ step: string; diff: number }> = [];

  for (let i = 0; i < Math.min(passing.steps.length, failing.steps.length); i++) {
    const pStep = passing.steps[i];
    const fStep = failing.steps[i];

    if (fStep.duration > pStep.duration + 500) { // 500ms threshold
      significantSlowdowns.push({
        step: fStep.name,
        diff: fStep.duration - pStep.duration,
      });
    }
  }

  // Find significantly slower network requests
  const networkSlowdowns: Array<{ url: string; diff: number }> = [];

  if (passing.networkRequests && failing.networkRequests) {
    const pReqMap = new Map(passing.networkRequests.map(r => [r.url, r]));

    for (const fReq of failing.networkRequests) {
      const pReq = pReqMap.get(fReq.url);
      if (pReq && fReq.duration > pReq.duration + 1000) { // 1s threshold
        networkSlowdowns.push({
          url: fReq.url,
          diff: fReq.duration - pReq.duration,
        });
      }
    }
  }

  return {
    totalDiff,
    significantSlowdowns: significantSlowdowns.sort((a, b) => b.diff - a.diff).slice(0, 5),
    networkSlowdowns: networkSlowdowns.sort((a, b) => b.diff - a.diff).slice(0, 5),
  };
}

function determineLikelyCause(
  diffs: Difference[],
  failingRun: TestRunData,
  timingAnalysis: CompareRunsResult['timingAnalysis']
): string {
  // Check for explicit error message
  if (failingRun.errorMessage) {
    // Analyze error for common patterns
    const error = failingRun.errorMessage.toLowerCase();

    if (error.includes('timeout')) {
      if (timingAnalysis.networkSlowdowns.length > 0) {
        return 'Network slowdown caused timeout - API responses significantly slower';
      }
      return 'Timeout occurred - element or condition not met within time limit';
    }

    if (error.includes('element not found') || error.includes('no element')) {
      return 'Element not found - selector may have changed or element not rendered';
    }

    if (error.includes('assertion') || error.includes('expect')) {
      return 'Assertion failure - application state different from expected';
    }
  }

  // Analyze high significance differences
  const highSigDiffs = diffs.filter(d => d.significance === 'high');

  if (highSigDiffs.some(d => d.category === 'Network Status')) {
    const networkDiff = highSigDiffs.find(d => d.category === 'Network Status');
    return `API failure: ${networkDiff?.field} returned ${networkDiff?.failing}`;
  }

  if (highSigDiffs.some(d => d.category === 'Console Error')) {
    return 'JavaScript error occurred during test execution';
  }

  if (highSigDiffs.some(d => d.category === 'Environment' && d.field === 'Browser')) {
    return 'Browser difference - behavior varies between browsers';
  }

  if (highSigDiffs.some(d => d.category === 'Environment' && d.field === 'Base URL')) {
    return 'Different environment - base URL changed between runs';
  }

  // Check timing issues
  if (timingAnalysis.totalDiff > 5000) {
    return 'Significant performance degradation - test ran much slower';
  }

  // Default
  return 'Unable to determine specific cause - review differences for details';
}

function generateSummary(
  diffs: Difference[],
  timingAnalysis: CompareRunsResult['timingAnalysis'],
  failingRun: TestRunData
): string {
  const highCount = diffs.filter(d => d.significance === 'high').length;
  const medCount = diffs.filter(d => d.significance === 'medium').length;

  let summary = `Found ${diffs.length} differences between runs (${highCount} high, ${medCount} medium significance). `;

  if (timingAnalysis.totalDiff > 0) {
    summary += `Failing run was ${Math.round(timingAnalysis.totalDiff / 1000)}s slower. `;
  }

  if (failingRun.errorMessage) {
    summary += `Error: ${truncate(failingRun.errorMessage, 80)}`;
  }

  return summary;
}

function generateRecommendations(
  diffs: Difference[],
  likelyCause: string,
  timingAnalysis: CompareRunsResult['timingAnalysis']
): string[] {
  const recommendations: string[] = [];

  // Based on likely cause
  if (likelyCause.includes('timeout') || likelyCause.includes('slowdown')) {
    recommendations.push('Increase timeout values for slow operations');
    recommendations.push('Add explicit waits for network idle state');
    recommendations.push('Consider mocking slow API endpoints');
  }

  if (likelyCause.includes('API failure') || likelyCause.includes('Network')) {
    recommendations.push('Add retry logic for flaky network requests');
    recommendations.push('Implement request interception to mock unreliable APIs');
    recommendations.push('Check if API changes require test updates');
  }

  if (likelyCause.includes('Element not found')) {
    recommendations.push('Use more stable selectors (data-testid)');
    recommendations.push('Add explicit wait for element visibility');
    recommendations.push('Check if UI layout changes affected selectors');
  }

  if (likelyCause.includes('Browser difference')) {
    recommendations.push('Normalize test to work across browsers');
    recommendations.push('Add browser-specific handling where needed');
    recommendations.push('Review browser-specific CSS or JavaScript');
  }

  if (likelyCause.includes('JavaScript error')) {
    recommendations.push('Fix the JavaScript error in the application');
    recommendations.push('Add console error monitoring in tests');
    recommendations.push('Check for race conditions in async code');
  }

  // Based on specific differences
  const envDiffs = diffs.filter(d => d.category === 'Environment');
  if (envDiffs.length > 0) {
    recommendations.push('Standardize test environment configuration');
  }

  if (timingAnalysis.networkSlowdowns.length > 0) {
    recommendations.push('Monitor API performance and set alerts');
  }

  // Generic recommendations
  if (recommendations.length < 2) {
    recommendations.push('Add more detailed logging to identify the exact failure point');
    recommendations.push('Run test multiple times to check for flakiness');
  }

  return [...new Set(recommendations)].slice(0, 6);
}

function calculateConfidence(diffs: Difference[], likelyCause: string): number {
  // High confidence if we have clear high-significance differences
  const highSigCount = diffs.filter(d => d.significance === 'high').length;

  if (highSigCount >= 2) return 0.9;
  if (highSigCount === 1) return 0.8;

  // Medium confidence if we have medium-significance differences
  const medSigCount = diffs.filter(d => d.significance === 'medium').length;
  if (medSigCount >= 3) return 0.7;
  if (medSigCount >= 1) return 0.6;

  // Lower confidence otherwise
  if (likelyCause.includes('Unable to determine')) return 0.3;

  return 0.5;
}

function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.substring(0, length - 3) + '...';
}

/**
 * Format comparison results as readable output
 */
export function formatCompareResults(result: CompareRunsResult): string {
  const lines: string[] = [];

  lines.push('# Test Run Comparison');
  lines.push('');
  lines.push(`## Summary`);
  lines.push(result.summary);
  lines.push('');
  lines.push(`## Likely Root Cause`);
  lines.push(`**${result.likelyRootCause}**`);
  lines.push(`(Confidence: ${Math.round(result.confidence * 100)}%)`);
  lines.push('');

  if (result.differences.length > 0) {
    lines.push(`## Key Differences (${result.differences.length})`);
    lines.push('');

    // Group by category
    const byCategory = new Map<string, Difference[]>();
    for (const diff of result.differences) {
      const existing = byCategory.get(diff.category) || [];
      existing.push(diff);
      byCategory.set(diff.category, existing);
    }

    for (const [category, diffs] of byCategory) {
      lines.push(`### ${category}`);
      for (const diff of diffs) {
        const icon = diff.significance === 'high' ? '🔴' : diff.significance === 'medium' ? '🟡' : '🟢';
        lines.push(`${icon} **${diff.field}**`);
        lines.push(`  - Passing: ${diff.passing}`);
        lines.push(`  - Failing: ${diff.failing}`);
        if (diff.possibleCause) {
          lines.push(`  - Possible cause: ${diff.possibleCause}`);
        }
      }
      lines.push('');
    }
  }

  if (result.timingAnalysis.significantSlowdowns.length > 0) {
    lines.push(`## Timing Slowdowns`);
    for (const s of result.timingAnalysis.significantSlowdowns) {
      lines.push(`- ${s.step}: +${s.diff}ms`);
    }
    lines.push('');
  }

  if (result.recommendations.length > 0) {
    lines.push(`## Recommendations`);
    result.recommendations.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
  }

  return lines.join('\n');
}
