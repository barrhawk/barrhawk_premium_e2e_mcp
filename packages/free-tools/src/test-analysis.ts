/**
 * Test Analysis Tools - Free Tier
 *
 * Analyze test suites for flakiness, prioritization, duplication, and coverage gaps.
 * No AI required - uses statistical analysis and heuristics.
 */

// ============================================================================
// Types
// ============================================================================

export interface TestRunHistory {
  testId: string;
  testName: string;
  runs: Array<{
    runId: string;
    timestamp: string;
    status: 'passed' | 'failed' | 'skipped';
    duration: number;
    error?: string;
  }>;
}

export interface FlakyTestResult {
  testId: string;
  testName: string;
  flakinessScore: number;  // 0-100, higher = more flaky
  totalRuns: number;
  passCount: number;
  failCount: number;
  flipCount: number;  // Number of status changes
  averageDuration: number;
  durationVariance: number;
  isFlaky: boolean;
  pattern?: 'random' | 'timing' | 'environment' | 'order-dependent';
  recommendation: string;
}

export interface FlakyDetectOptions {
  history: TestRunHistory[];
  threshold?: number;  // Flakiness threshold (default: 10)
  minRuns?: number;    // Minimum runs to consider (default: 5)
}

export interface FlakyDetectResult {
  flakyTests: FlakyTestResult[];
  stableTests: number;
  totalTests: number;
  overallFlakinessRate: number;
  message: string;
}

export interface TestPriority {
  testId: string;
  testName: string;
  priorityScore: number;  // 0-100, higher = run first
  factors: {
    failureRate: number;
    recentFailures: number;
    executionTime: number;
    lastChanged: number;
    criticalPath: boolean;
  };
  recommendation: 'critical' | 'high' | 'medium' | 'low';
}

export interface PrioritizeOptions {
  history: TestRunHistory[];
  codeChanges?: string[];      // Files changed recently
  criticalPaths?: string[];    // Critical test patterns
  maxExecutionTime?: number;   // Target CI time in ms
}

export interface PrioritizeResult {
  prioritized: TestPriority[];
  suggestedOrder: string[];
  estimatedTime: number;
  message: string;
}

export interface TestSimilarity {
  testId1: string;
  testId2: string;
  testName1: string;
  testName2: string;
  similarityScore: number;  // 0-100
  sharedActions: string[];
  recommendation: 'merge' | 'review' | 'keep';
}

export interface DeduplicateOptions {
  tests: Array<{
    testId: string;
    testName: string;
    actions: string[];  // List of action descriptions
    selectors: string[];
    assertions: string[];
  }>;
  threshold?: number;  // Similarity threshold (default: 70)
}

export interface DeduplicateResult {
  duplicates: TestSimilarity[];
  uniqueTests: number;
  potentialSavings: number;  // Percentage of tests that could be removed
  message: string;
}

export interface CoverageGap {
  area: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  suggestedTests: string[];
}

export interface CoverageGapsOptions {
  tests: Array<{
    testName: string;
    actions: string[];
    urls: string[];
    elements: string[];
  }>;
  appStructure?: {
    pages: string[];
    features: string[];
    userFlows: string[];
  };
}

export interface CoverageGapsResult {
  gaps: CoverageGap[];
  coverageScore: number;  // 0-100
  testedAreas: string[];
  untestedAreas: string[];
  message: string;
}

// ============================================================================
// Flaky Test Detection
// ============================================================================

/**
 * Detect flaky tests from run history
 */
export function detectFlakyTests(options: FlakyDetectOptions): FlakyDetectResult {
  const { history, threshold = 10, minRuns = 5 } = options;
  const flakyTests: FlakyTestResult[] = [];
  let stableTests = 0;

  for (const test of history) {
    if (test.runs.length < minRuns) {
      continue;  // Not enough data
    }

    const analysis = analyzeTestFlakiness(test);

    if (analysis.flakinessScore >= threshold) {
      flakyTests.push(analysis);
    } else {
      stableTests++;
    }
  }

  // Sort by flakiness score descending
  flakyTests.sort((a, b) => b.flakinessScore - a.flakinessScore);

  const overallFlakinessRate = history.length > 0
    ? (flakyTests.length / history.length) * 100
    : 0;

  return {
    flakyTests,
    stableTests,
    totalTests: history.length,
    overallFlakinessRate: Math.round(overallFlakinessRate * 10) / 10,
    message: flakyTests.length > 0
      ? `Found ${flakyTests.length} flaky tests (${overallFlakinessRate.toFixed(1)}% of suite)`
      : `No flaky tests detected in ${history.length} tests`,
  };
}

function analyzeTestFlakiness(test: TestRunHistory): FlakyTestResult {
  const runs = test.runs;
  const passCount = runs.filter(r => r.status === 'passed').length;
  const failCount = runs.filter(r => r.status === 'failed').length;

  // Count status flips
  let flipCount = 0;
  for (let i = 1; i < runs.length; i++) {
    if (runs[i].status !== runs[i - 1].status && runs[i].status !== 'skipped') {
      flipCount++;
    }
  }

  // Calculate duration statistics
  const durations = runs.map(r => r.duration);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const variance = durations.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) / durations.length;
  const durationVariance = Math.sqrt(variance) / avgDuration;  // Coefficient of variation

  // Calculate flakiness score
  const passRate = passCount / runs.length;
  const flipRate = flipCount / (runs.length - 1);

  // Flakiness is high when:
  // - Pass rate is between 20-80% (inconsistent)
  // - High flip rate
  // - High duration variance
  let flakinessScore = 0;

  // Pass rate contribution (0-40 points)
  // Most flaky when pass rate is around 50%
  const passRateFlakiness = 1 - Math.abs(passRate - 0.5) * 2;
  flakinessScore += passRateFlakiness * 40;

  // Flip rate contribution (0-40 points)
  flakinessScore += flipRate * 40;

  // Duration variance contribution (0-20 points)
  flakinessScore += Math.min(durationVariance, 1) * 20;

  flakinessScore = Math.round(Math.min(100, flakinessScore));

  // Detect pattern
  let pattern: FlakyTestResult['pattern'];
  if (durationVariance > 0.5) {
    pattern = 'timing';
  } else if (flipRate > 0.3) {
    pattern = 'random';
  } else if (detectOrderDependence(runs)) {
    pattern = 'order-dependent';
  } else {
    pattern = 'environment';
  }

  // Generate recommendation
  let recommendation: string;
  if (flakinessScore >= 50) {
    recommendation = 'High flakiness - investigate immediately. Check for race conditions and timing issues.';
  } else if (flakinessScore >= 25) {
    recommendation = 'Moderate flakiness - add retry logic or increase timeouts.';
  } else if (flakinessScore >= 10) {
    recommendation = 'Low flakiness - monitor and consider adding waits.';
  } else {
    recommendation = 'Stable test.';
  }

  return {
    testId: test.testId,
    testName: test.testName,
    flakinessScore,
    totalRuns: runs.length,
    passCount,
    failCount,
    flipCount,
    averageDuration: Math.round(avgDuration),
    durationVariance: Math.round(durationVariance * 100) / 100,
    isFlaky: flakinessScore >= 10,
    pattern,
    recommendation,
  };
}

function detectOrderDependence(runs: TestRunHistory['runs']): boolean {
  // Check if failures tend to cluster at certain run positions
  const failPositions = runs
    .map((r, i) => r.status === 'failed' ? i : -1)
    .filter(i => i >= 0);

  if (failPositions.length < 2) return false;

  // Check if failures are clustered (within 2 positions of each other)
  for (let i = 1; i < failPositions.length; i++) {
    if (failPositions[i] - failPositions[i - 1] <= 2) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// Test Prioritization
// ============================================================================

/**
 * Prioritize tests for optimal CI execution
 */
export function prioritizeTests(options: PrioritizeOptions): PrioritizeResult {
  const { history, codeChanges = [], criticalPaths = [], maxExecutionTime } = options;
  const priorities: TestPriority[] = [];

  for (const test of history) {
    const priority = calculateTestPriority(test, codeChanges, criticalPaths);
    priorities.push(priority);
  }

  // Sort by priority score descending
  priorities.sort((a, b) => b.priorityScore - a.priorityScore);

  // Build suggested order, respecting max execution time if set
  const suggestedOrder: string[] = [];
  let totalTime = 0;

  for (const p of priorities) {
    if (maxExecutionTime && totalTime + p.factors.executionTime > maxExecutionTime) {
      break;
    }
    suggestedOrder.push(p.testId);
    totalTime += p.factors.executionTime;
  }

  return {
    prioritized: priorities,
    suggestedOrder,
    estimatedTime: totalTime,
    message: `Prioritized ${priorities.length} tests. Critical: ${priorities.filter(p => p.recommendation === 'critical').length}, High: ${priorities.filter(p => p.recommendation === 'high').length}`,
  };
}

function calculateTestPriority(
  test: TestRunHistory,
  codeChanges: string[],
  criticalPaths: string[]
): TestPriority {
  const runs = test.runs;
  let score = 50;  // Base score

  // Factor: Failure rate (0-25 points)
  const failureRate = runs.filter(r => r.status === 'failed').length / runs.length;
  score += failureRate * 25;

  // Factor: Recent failures (0-20 points)
  const recentRuns = runs.slice(-5);
  const recentFailures = recentRuns.filter(r => r.status === 'failed').length;
  score += (recentFailures / 5) * 20;

  // Factor: Execution time (fast tests get bonus, 0-15 points)
  const avgDuration = runs.reduce((sum, r) => sum + r.duration, 0) / runs.length;
  const timeBonus = Math.max(0, 15 - (avgDuration / 10000) * 15);  // Bonus decreases with time
  score += timeBonus;

  // Factor: Code changes (0-20 points)
  let changedScore = 0;
  for (const change of codeChanges) {
    if (test.testName.toLowerCase().includes(change.toLowerCase().replace(/\.\w+$/, ''))) {
      changedScore = 20;
      break;
    }
  }
  score += changedScore;

  // Factor: Critical path (0-20 points)
  let isCritical = false;
  for (const path of criticalPaths) {
    if (test.testName.toLowerCase().includes(path.toLowerCase())) {
      score += 20;
      isCritical = true;
      break;
    }
  }

  score = Math.min(100, Math.round(score));

  // Determine recommendation
  let recommendation: TestPriority['recommendation'];
  if (score >= 80 || isCritical) {
    recommendation = 'critical';
  } else if (score >= 60) {
    recommendation = 'high';
  } else if (score >= 40) {
    recommendation = 'medium';
  } else {
    recommendation = 'low';
  }

  return {
    testId: test.testId,
    testName: test.testName,
    priorityScore: score,
    factors: {
      failureRate: Math.round(failureRate * 100),
      recentFailures,
      executionTime: Math.round(avgDuration),
      lastChanged: changedScore,
      criticalPath: isCritical,
    },
    recommendation,
  };
}

// ============================================================================
// Test Deduplication
// ============================================================================

/**
 * Find duplicate or highly similar tests
 */
export function deduplicateTests(options: DeduplicateOptions): DeduplicateResult {
  const { tests, threshold = 70 } = options;
  const duplicates: TestSimilarity[] = [];

  // Compare all pairs of tests
  for (let i = 0; i < tests.length; i++) {
    for (let j = i + 1; j < tests.length; j++) {
      const similarity = calculateTestSimilarity(tests[i], tests[j]);

      if (similarity.similarityScore >= threshold) {
        duplicates.push(similarity);
      }
    }
  }

  // Sort by similarity descending
  duplicates.sort((a, b) => b.similarityScore - a.similarityScore);

  // Calculate unique tests (not involved in any duplicate pair)
  const involvedTests = new Set<string>();
  for (const dup of duplicates) {
    involvedTests.add(dup.testId1);
    involvedTests.add(dup.testId2);
  }
  const uniqueTests = tests.length - involvedTests.size;

  const potentialSavings = tests.length > 0
    ? (duplicates.length / tests.length) * 100
    : 0;

  return {
    duplicates,
    uniqueTests,
    potentialSavings: Math.round(potentialSavings * 10) / 10,
    message: duplicates.length > 0
      ? `Found ${duplicates.length} potential duplicate pairs (${potentialSavings.toFixed(1)}% could be consolidated)`
      : 'No duplicate tests found',
  };
}

function calculateTestSimilarity(
  test1: DeduplicateOptions['tests'][0],
  test2: DeduplicateOptions['tests'][0]
): TestSimilarity {
  // Calculate Jaccard similarity for each aspect
  const actionSim = jaccardSimilarity(test1.actions, test2.actions);
  const selectorSim = jaccardSimilarity(test1.selectors, test2.selectors);
  const assertionSim = jaccardSimilarity(test1.assertions, test2.assertions);

  // Weighted average
  const similarityScore = Math.round(
    actionSim * 0.4 + selectorSim * 0.35 + assertionSim * 0.25
  );

  // Find shared actions
  const sharedActions = test1.actions.filter(a => test2.actions.includes(a));

  // Determine recommendation
  let recommendation: TestSimilarity['recommendation'];
  if (similarityScore >= 90) {
    recommendation = 'merge';
  } else if (similarityScore >= 70) {
    recommendation = 'review';
  } else {
    recommendation = 'keep';
  }

  return {
    testId1: test1.testId,
    testId2: test2.testId,
    testName1: test1.testName,
    testName2: test2.testName,
    similarityScore,
    sharedActions,
    recommendation,
  };
}

function jaccardSimilarity(arr1: string[], arr2: string[]): number {
  if (arr1.length === 0 && arr2.length === 0) return 100;

  const set1 = new Set(arr1);
  const set2 = new Set(arr2);

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return Math.round((intersection.size / union.size) * 100);
}

// ============================================================================
// Coverage Gap Analysis
// ============================================================================

/**
 * Identify coverage gaps in test suite
 */
export function findCoverageGaps(options: CoverageGapsOptions): CoverageGapsResult {
  const { tests, appStructure } = options;
  const gaps: CoverageGap[] = [];
  const testedAreas: string[] = [];
  const untestedAreas: string[] = [];

  // Extract what's being tested
  const testedUrls = new Set<string>();
  const testedElements = new Set<string>();
  const testedActions = new Set<string>();

  for (const test of tests) {
    test.urls.forEach(u => testedUrls.add(u));
    test.elements.forEach(e => testedElements.add(e));
    test.actions.forEach(a => testedActions.add(a.toLowerCase()));
  }

  // Check common areas if no app structure provided
  const commonAreas = [
    { name: 'Authentication', patterns: ['login', 'logout', 'signin', 'signout', 'password', 'auth'] },
    { name: 'Navigation', patterns: ['nav', 'menu', 'header', 'footer', 'sidebar'] },
    { name: 'Forms', patterns: ['form', 'input', 'submit', 'validation'] },
    { name: 'Search', patterns: ['search', 'filter', 'sort'] },
    { name: 'Pagination', patterns: ['page', 'next', 'previous', 'pagination'] },
    { name: 'Error handling', patterns: ['error', '404', '500', 'not found'] },
    { name: 'Responsive', patterns: ['mobile', 'tablet', 'viewport', 'responsive'] },
    { name: 'Accessibility', patterns: ['aria', 'keyboard', 'focus', 'a11y'] },
  ];

  for (const area of commonAreas) {
    const isTested = area.patterns.some(pattern =>
      [...testedActions].some(a => a.includes(pattern)) ||
      [...testedElements].some(e => e.toLowerCase().includes(pattern))
    );

    if (isTested) {
      testedAreas.push(area.name);
    } else {
      untestedAreas.push(area.name);
      gaps.push({
        area: area.name,
        description: `No tests found covering ${area.name.toLowerCase()} functionality`,
        severity: ['Authentication', 'Error handling'].includes(area.name) ? 'high' : 'medium',
        suggestedTests: [
          `Test ${area.name.toLowerCase()} happy path`,
          `Test ${area.name.toLowerCase()} error cases`,
        ],
      });
    }
  }

  // Check app structure if provided
  if (appStructure) {
    for (const page of appStructure.pages || []) {
      if (!testedUrls.has(page)) {
        gaps.push({
          area: `Page: ${page}`,
          description: `Page ${page} has no test coverage`,
          severity: 'medium',
          suggestedTests: [`Navigate to ${page} and verify content`],
        });
        untestedAreas.push(page);
      } else {
        testedAreas.push(page);
      }
    }

    for (const feature of appStructure.features || []) {
      const featureTested = [...testedActions].some(a => a.includes(feature.toLowerCase()));
      if (!featureTested) {
        gaps.push({
          area: `Feature: ${feature}`,
          description: `Feature "${feature}" has no test coverage`,
          severity: 'high',
          suggestedTests: [`Test ${feature} functionality`],
        });
        untestedAreas.push(feature);
      } else {
        testedAreas.push(feature);
      }
    }
  }

  // Calculate coverage score
  const totalAreas = testedAreas.length + untestedAreas.length;
  const coverageScore = totalAreas > 0
    ? Math.round((testedAreas.length / totalAreas) * 100)
    : 0;

  return {
    gaps,
    coverageScore,
    testedAreas,
    untestedAreas,
    message: `Coverage: ${coverageScore}% - ${testedAreas.length} areas covered, ${gaps.length} gaps found`,
  };
}

// ============================================================================
// Formatters
// ============================================================================

export function formatFlakyResult(result: FlakyDetectResult): string {
  const lines: string[] = [];

  lines.push(`# Flaky Test Analysis`);
  lines.push('');
  lines.push(`**Total Tests:** ${result.totalTests}`);
  lines.push(`**Flaky Tests:** ${result.flakyTests.length}`);
  lines.push(`**Stable Tests:** ${result.stableTests}`);
  lines.push(`**Flakiness Rate:** ${result.overallFlakinessRate}%`);
  lines.push('');

  if (result.flakyTests.length > 0) {
    lines.push('## Flaky Tests');
    lines.push('');

    for (const test of result.flakyTests) {
      const icon = test.flakinessScore >= 50 ? '🔴' : test.flakinessScore >= 25 ? '🟡' : '🟠';
      lines.push(`### ${icon} ${test.testName}`);
      lines.push(`- **Score:** ${test.flakinessScore}/100`);
      lines.push(`- **Pass/Fail:** ${test.passCount}/${test.failCount}`);
      lines.push(`- **Flips:** ${test.flipCount}`);
      lines.push(`- **Pattern:** ${test.pattern || 'unknown'}`);
      lines.push(`- **Recommendation:** ${test.recommendation}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function formatPriorityResult(result: PrioritizeResult): string {
  const lines: string[] = [];

  lines.push(`# Test Priority Analysis`);
  lines.push('');
  lines.push(`**Estimated Time:** ${Math.round(result.estimatedTime / 1000)}s`);
  lines.push('');
  lines.push('## Suggested Order');
  lines.push('');

  for (let i = 0; i < Math.min(result.prioritized.length, 20); i++) {
    const test = result.prioritized[i];
    const icon = test.recommendation === 'critical' ? '🔴' :
                 test.recommendation === 'high' ? '🟠' :
                 test.recommendation === 'medium' ? '🟡' : '🟢';
    lines.push(`${i + 1}. ${icon} **${test.testName}** (${test.priorityScore})`);
  }

  return lines.join('\n');
}

export function formatDedupeResult(result: DeduplicateResult): string {
  const lines: string[] = [];

  lines.push(`# Test Deduplication Analysis`);
  lines.push('');
  lines.push(`**Unique Tests:** ${result.uniqueTests}`);
  lines.push(`**Potential Duplicates:** ${result.duplicates.length}`);
  lines.push(`**Potential Savings:** ${result.potentialSavings}%`);
  lines.push('');

  if (result.duplicates.length > 0) {
    lines.push('## Similar Test Pairs');
    lines.push('');

    for (const dup of result.duplicates.slice(0, 10)) {
      const icon = dup.recommendation === 'merge' ? '🔴' : dup.recommendation === 'review' ? '🟡' : '🟢';
      lines.push(`### ${icon} ${dup.similarityScore}% Similar`);
      lines.push(`- **Test 1:** ${dup.testName1}`);
      lines.push(`- **Test 2:** ${dup.testName2}`);
      lines.push(`- **Recommendation:** ${dup.recommendation}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function formatCoverageResult(result: CoverageGapsResult): string {
  const lines: string[] = [];
  const icon = result.coverageScore >= 80 ? '✅' : result.coverageScore >= 50 ? '⚠️' : '❌';

  lines.push(`# Coverage Gap Analysis`);
  lines.push('');
  lines.push(`${icon} **Coverage Score:** ${result.coverageScore}%`);
  lines.push('');

  if (result.testedAreas.length > 0) {
    lines.push('## Covered Areas');
    for (const area of result.testedAreas) {
      lines.push(`- ✅ ${area}`);
    }
    lines.push('');
  }

  if (result.gaps.length > 0) {
    lines.push('## Coverage Gaps');
    lines.push('');

    for (const gap of result.gaps) {
      const sev = gap.severity === 'high' ? '🔴' : gap.severity === 'medium' ? '🟡' : '🟢';
      lines.push(`### ${sev} ${gap.area}`);
      lines.push(gap.description);
      lines.push('**Suggested tests:**');
      for (const test of gap.suggestedTests) {
        lines.push(`- ${test}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
