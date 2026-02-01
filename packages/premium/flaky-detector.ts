/**
 * BarrHawk E2E Flaky Test Detector
 *
 * Analyzes test run history to identify flaky tests that pass/fail inconsistently.
 * Provides recommendations for quarantine, investigation, or marking as stable.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// =============================================================================
// Types
// =============================================================================

export interface TestResult {
  testId: string;
  testName: string;
  runId: string;
  timestamp: Date;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  retryCount?: number;
}

export interface FlakyTestAnalysis {
  testId: string;
  testName: string;
  /** Total number of runs analyzed */
  runCount: number;
  /** Number of passed runs */
  passCount: number;
  /** Number of failed runs */
  failCount: number;
  /** Pass rate (0-1) */
  passRate: number;
  /** Flakiness score (0-1, higher = more flaky) */
  flakinessScore: number;
  /** Detected patterns */
  patterns: {
    /** Fails at specific times of day */
    timeOfDay: boolean;
    /** Fails more under load */
    loadRelated: boolean;
    /** Fails when run order changes */
    orderDependent: boolean;
    /** Different results across environments */
    environmentSpecific: boolean;
    /** Passes on retry frequently */
    retriesHelp: boolean;
  };
  /** Recommendation */
  recommendation: 'quarantine' | 'fix_urgently' | 'investigate' | 'stable' | 'monitor';
  /** Confidence in the analysis (0-1) */
  confidence: number;
  /** Recent trend */
  trend: 'improving' | 'degrading' | 'stable';
  /** Last N results for visualization */
  recentResults: Array<{ timestamp: Date; status: 'passed' | 'failed' }>;
  /** Average duration */
  avgDuration: number;
  /** Duration variance (high variance can indicate flakiness) */
  durationVariance: number;
  /** Common error messages when failing */
  commonErrors: string[];
}

export interface FlakyReport {
  generatedAt: Date;
  totalTests: number;
  flakyTests: number;
  stableTests: number;
  quarantined: number;
  analyses: FlakyTestAnalysis[];
  summary: {
    worstOffenders: Array<{ testId: string; testName: string; flakinessScore: number }>;
    recentlyBecameFlaky: Array<{ testId: string; testName: string; since: Date }>;
    recentlyStabilized: Array<{ testId: string; testName: string; since: Date }>;
  };
}

export interface FlakyDetectorConfig {
  /** Directory for storing analysis data */
  dataDir: string;
  /** Minimum runs required before analysis (default: 5) */
  minRuns: number;
  /** Flakiness threshold to flag as flaky (default: 0.1 = 10% failure rate) */
  flakinessThreshold: number;
  /** Number of recent results to analyze for trends (default: 20) */
  recentRunsWindow: number;
  /** Pass rate below which to recommend quarantine (default: 0.5) */
  quarantineThreshold: number;
}

// =============================================================================
// Flaky Test Detector
// =============================================================================

export class FlakyTestDetector {
  private config: Required<FlakyDetectorConfig>;
  private testHistory: Map<string, TestResult[]> = new Map();
  private quarantinedTests: Set<string> = new Set();

  constructor(config: Partial<FlakyDetectorConfig> = {}) {
    this.config = {
      dataDir: './flaky-data',
      minRuns: 5,
      flakinessThreshold: 0.1,
      recentRunsWindow: 20,
      quarantineThreshold: 0.5,
      ...config,
    };
  }

  async initialize(): Promise<void> {
    await mkdir(this.config.dataDir, { recursive: true });
    await this.loadHistory();
  }

  private async loadHistory(): Promise<void> {
    const historyPath = path.join(this.config.dataDir, 'test-history.json');
    if (existsSync(historyPath)) {
      try {
        const data = await readFile(historyPath, 'utf-8');
        const parsed = JSON.parse(data);
        for (const [testId, results] of Object.entries(parsed.history || {})) {
          this.testHistory.set(testId, (results as any[]).map(r => ({
            ...r,
            timestamp: new Date(r.timestamp),
          })));
        }
        this.quarantinedTests = new Set(parsed.quarantined || []);
      } catch {
        // Start fresh if corrupted
      }
    }
  }

  private async saveHistory(): Promise<void> {
    const historyPath = path.join(this.config.dataDir, 'test-history.json');
    const data = {
      history: Object.fromEntries(this.testHistory),
      quarantined: Array.from(this.quarantinedTests),
      savedAt: new Date().toISOString(),
    };
    await writeFile(historyPath, JSON.stringify(data, null, 2));
  }

  /**
   * Record a test result
   */
  async recordResult(result: TestResult): Promise<void> {
    let history = this.testHistory.get(result.testId);
    if (!history) {
      history = [];
      this.testHistory.set(result.testId, history);
    }

    history.push(result);

    // Keep only recent results to prevent unbounded growth
    const maxHistory = this.config.recentRunsWindow * 5;
    if (history.length > maxHistory) {
      history.splice(0, history.length - maxHistory);
    }

    // Save periodically
    if (history.length % 10 === 0) {
      await this.saveHistory();
    }
  }

  /**
   * Record multiple results from a test run
   */
  async recordRunResults(results: TestResult[]): Promise<void> {
    for (const result of results) {
      await this.recordResult(result);
    }
    await this.saveHistory();
  }

  /**
   * Analyze a specific test for flakiness
   */
  analyzeTest(testId: string): FlakyTestAnalysis | null {
    const history = this.testHistory.get(testId);
    if (!history || history.length < this.config.minRuns) {
      return null;
    }

    const testName = history[0].testName;
    const recentHistory = history.slice(-this.config.recentRunsWindow);

    // Basic counts
    const runCount = recentHistory.length;
    const passCount = recentHistory.filter(r => r.status === 'passed').length;
    const failCount = recentHistory.filter(r => r.status === 'failed').length;
    const passRate = passCount / runCount;

    // Calculate flakiness score (0 = always same result, 1 = 50/50)
    // Formula: 1 - |passRate - 0.5| * 2, capped at 0
    const flakinessScore = Math.max(0, 1 - Math.abs(passRate - 0.5) * 2);

    // Detect patterns
    const patterns = this.detectPatterns(recentHistory);

    // Calculate trend
    const trend = this.calculateTrend(recentHistory);

    // Duration analysis
    const durations = recentHistory.map(r => r.duration).filter(d => d > 0);
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;
    const durationVariance = this.calculateVariance(durations);

    // Common errors
    const errors = recentHistory
      .filter(r => r.error)
      .map(r => r.error!);
    const commonErrors = this.findCommonErrors(errors);

    // Generate recommendation
    const recommendation = this.generateRecommendation(
      passRate,
      flakinessScore,
      patterns,
      trend
    );

    // Confidence based on sample size
    const confidence = Math.min(1, runCount / 20);

    return {
      testId,
      testName,
      runCount,
      passCount,
      failCount,
      passRate,
      flakinessScore,
      patterns,
      recommendation,
      confidence,
      trend,
      recentResults: recentHistory.map(r => ({
        timestamp: r.timestamp,
        status: r.status === 'skipped' ? 'passed' : r.status,
      })),
      avgDuration,
      durationVariance,
      commonErrors,
    };
  }

  private detectPatterns(history: TestResult[]): FlakyTestAnalysis['patterns'] {
    const patterns = {
      timeOfDay: false,
      loadRelated: false,
      orderDependent: false,
      environmentSpecific: false,
      retriesHelp: false,
    };

    if (history.length < 5) return patterns;

    // Time of day pattern: failures cluster at specific hours
    const failureHours = history
      .filter(r => r.status === 'failed')
      .map(r => r.timestamp.getHours());

    if (failureHours.length >= 3) {
      const hourCounts = new Map<number, number>();
      failureHours.forEach(h => hourCounts.set(h, (hourCounts.get(h) || 0) + 1));
      const maxCount = Math.max(...hourCounts.values());
      // If >60% of failures are in same hour, likely time-related
      patterns.timeOfDay = maxCount / failureHours.length > 0.6;
    }

    // Retries help pattern
    const retriedTests = history.filter(r => (r.retryCount || 0) > 0);
    const retriedPassed = retriedTests.filter(r => r.status === 'passed');
    if (retriedTests.length >= 3) {
      patterns.retriesHelp = retriedPassed.length / retriedTests.length > 0.7;
    }

    // Duration variance pattern (high variance = possible load issues)
    const durations = history.map(r => r.duration);
    const variance = this.calculateVariance(durations);
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    patterns.loadRelated = variance > mean * 0.5; // CV > 0.5

    return patterns;
  }

  private calculateTrend(history: TestResult[]): 'improving' | 'degrading' | 'stable' {
    if (history.length < 6) return 'stable';

    const midpoint = Math.floor(history.length / 2);
    const firstHalf = history.slice(0, midpoint);
    const secondHalf = history.slice(midpoint);

    const firstPassRate = firstHalf.filter(r => r.status === 'passed').length / firstHalf.length;
    const secondPassRate = secondHalf.filter(r => r.status === 'passed').length / secondHalf.length;

    const diff = secondPassRate - firstPassRate;

    if (diff > 0.15) return 'improving';
    if (diff < -0.15) return 'degrading';
    return 'stable';
  }

  private calculateVariance(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);
  }

  private findCommonErrors(errors: string[]): string[] {
    if (errors.length === 0) return [];

    const errorCounts = new Map<string, number>();
    errors.forEach(e => {
      // Normalize error message (remove line numbers, timestamps)
      const normalized = e
        .replace(/:\d+:\d+/g, ':X:X')
        .replace(/\d{4}-\d{2}-\d{2}/g, 'DATE')
        .substring(0, 200);
      errorCounts.set(normalized, (errorCounts.get(normalized) || 0) + 1);
    });

    return Array.from(errorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([error]) => error);
  }

  private generateRecommendation(
    passRate: number,
    flakinessScore: number,
    patterns: FlakyTestAnalysis['patterns'],
    trend: string
  ): FlakyTestAnalysis['recommendation'] {
    // Very low pass rate = quarantine immediately
    if (passRate < this.config.quarantineThreshold) {
      return 'quarantine';
    }

    // High flakiness with degrading trend = fix urgently
    if (flakinessScore > 0.3 && trend === 'degrading') {
      return 'fix_urgently';
    }

    // Moderate flakiness = investigate
    if (flakinessScore > this.config.flakinessThreshold) {
      return 'investigate';
    }

    // Low flakiness but some failures = monitor
    if (passRate < 0.95) {
      return 'monitor';
    }

    return 'stable';
  }

  /**
   * Generate full flaky test report
   */
  async generateReport(): Promise<FlakyReport> {
    const analyses: FlakyTestAnalysis[] = [];

    for (const testId of this.testHistory.keys()) {
      const analysis = this.analyzeTest(testId);
      if (analysis) {
        analyses.push(analysis);
      }
    }

    // Sort by flakiness score descending
    analyses.sort((a, b) => b.flakinessScore - a.flakinessScore);

    const flakyTests = analyses.filter(a => a.flakinessScore > this.config.flakinessThreshold);
    const stableTests = analyses.filter(a => a.recommendation === 'stable');

    return {
      generatedAt: new Date(),
      totalTests: analyses.length,
      flakyTests: flakyTests.length,
      stableTests: stableTests.length,
      quarantined: this.quarantinedTests.size,
      analyses,
      summary: {
        worstOffenders: flakyTests.slice(0, 5).map(a => ({
          testId: a.testId,
          testName: a.testName,
          flakinessScore: a.flakinessScore,
        })),
        recentlyBecameFlaky: flakyTests
          .filter(a => a.trend === 'degrading')
          .slice(0, 5)
          .map(a => ({
            testId: a.testId,
            testName: a.testName,
            since: a.recentResults[0]?.timestamp || new Date(),
          })),
        recentlyStabilized: analyses
          .filter(a => a.trend === 'improving' && a.recommendation === 'stable')
          .slice(0, 5)
          .map(a => ({
            testId: a.testId,
            testName: a.testName,
            since: a.recentResults[0]?.timestamp || new Date(),
          })),
      },
    };
  }

  /**
   * Quarantine a test (exclude from CI failures)
   */
  async quarantineTest(testId: string): Promise<void> {
    this.quarantinedTests.add(testId);
    await this.saveHistory();
  }

  /**
   * Remove test from quarantine
   */
  async unquarantineTest(testId: string): Promise<void> {
    this.quarantinedTests.delete(testId);
    await this.saveHistory();
  }

  /**
   * Check if a test is quarantined
   */
  isQuarantined(testId: string): boolean {
    return this.quarantinedTests.has(testId);
  }

  /**
   * Get all quarantined tests
   */
  getQuarantinedTests(): string[] {
    return Array.from(this.quarantinedTests);
  }

  /**
   * Generate CLI-friendly report
   */
  formatReportForCLI(report: FlakyReport): string {
    const lines: string[] = [];

    lines.push('\n╔══════════════════════════════════════════════════════════════╗');
    lines.push('║                   FLAKY TEST REPORT                          ║');
    lines.push('╚══════════════════════════════════════════════════════════════╝\n');

    lines.push(`Generated: ${report.generatedAt.toISOString()}`);
    lines.push(`Total Tests: ${report.totalTests}`);
    lines.push(`Flaky: \x1b[33m${report.flakyTests}\x1b[0m`);
    lines.push(`Stable: \x1b[32m${report.stableTests}\x1b[0m`);
    lines.push(`Quarantined: \x1b[31m${report.quarantined}\x1b[0m`);

    if (report.summary.worstOffenders.length > 0) {
      lines.push('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push('WORST OFFENDERS');
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      for (const test of report.summary.worstOffenders) {
        const scoreBar = '█'.repeat(Math.round(test.flakinessScore * 10));
        lines.push(`  ${test.testName}`);
        lines.push(`  \x1b[31m${scoreBar.padEnd(10)}\x1b[0m ${(test.flakinessScore * 100).toFixed(1)}% flaky\n`);
      }
    }

    if (report.analyses.length > 0) {
      lines.push('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push('ALL TESTS');
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      for (const analysis of report.analyses.slice(0, 20)) {
        const statusIcon = analysis.recommendation === 'stable' ? '\x1b[32m✓\x1b[0m' :
          analysis.recommendation === 'quarantine' ? '\x1b[31m⊘\x1b[0m' :
          analysis.recommendation === 'fix_urgently' ? '\x1b[31m!\x1b[0m' :
          '\x1b[33m?\x1b[0m';

        const passBar = analysis.recentResults.map(r =>
          r.status === 'passed' ? '\x1b[32m●\x1b[0m' : '\x1b[31m●\x1b[0m'
        ).join('');

        lines.push(`${statusIcon} ${analysis.testName.substring(0, 40).padEnd(40)}`);
        lines.push(`  ${passBar} ${(analysis.passRate * 100).toFixed(0)}% pass (${analysis.runCount} runs)`);
        lines.push(`  Recommendation: ${analysis.recommendation}\n`);
      }
    }

    return lines.join('\n');
  }
}

// =============================================================================
// Singleton
// =============================================================================

let defaultDetector: FlakyTestDetector | null = null;

export async function getFlakyDetector(config?: Partial<FlakyDetectorConfig>): Promise<FlakyTestDetector> {
  if (!defaultDetector) {
    defaultDetector = new FlakyTestDetector(config);
    await defaultDetector.initialize();
  }
  return defaultDetector;
}
