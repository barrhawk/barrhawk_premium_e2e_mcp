/**
 * Performance Analysis Tools - Free Tier
 *
 * Analyze page performance using Web Vitals and standard metrics.
 * No AI required - uses Lighthouse-style scoring and statistical analysis.
 */

import type { Page } from 'playwright';

// ============================================================================
// Types
// ============================================================================

export interface WebVitals {
  lcp: number | null;   // Largest Contentful Paint (ms)
  fid: number | null;   // First Input Delay (ms)
  cls: number | null;   // Cumulative Layout Shift
  fcp: number | null;   // First Contentful Paint (ms)
  ttfb: number | null;  // Time to First Byte (ms)
  inp: number | null;   // Interaction to Next Paint (ms)
}

export interface PerformanceMetrics extends WebVitals {
  domContentLoaded: number;
  loadComplete: number;
  resourceCount: number;
  resourceSize: number;  // Total bytes transferred
  jsHeapSize: number | null;
  domNodes: number;
  longTasks: number;
}

export interface PerformanceAnalyzeOptions {
  page: Page;
  url?: string;  // If provided, navigates to URL first
  waitForLoad?: boolean;
}

export interface PerformanceScore {
  overall: number;      // 0-100
  lcp: number;
  fid: number;
  cls: number;
  fcp: number;
  ttfb: number;
}

export interface PerformanceIssue {
  metric: string;
  value: number | string;
  threshold: number | string;
  severity: 'critical' | 'warning' | 'info';
  suggestion: string;
}

export interface PerformanceAnalyzeResult {
  url: string;
  timestamp: string;
  metrics: PerformanceMetrics;
  scores: PerformanceScore;
  issues: PerformanceIssue[];
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  message: string;
}

export interface PerformanceRun {
  runId: string;
  timestamp: string;
  url: string;
  metrics: PerformanceMetrics;
}

export interface RegressionOptions {
  baseline: PerformanceRun[];
  current: PerformanceRun[];
  thresholds?: {
    lcp?: number;  // Percentage increase to flag
    fcp?: number;
    cls?: number;
    ttfb?: number;
  };
}

export interface RegressionResult {
  hasRegression: boolean;
  regressions: Array<{
    metric: string;
    baselineAvg: number;
    currentAvg: number;
    change: number;      // Percentage change
    severity: 'critical' | 'warning' | 'minor';
  }>;
  improvements: Array<{
    metric: string;
    baselineAvg: number;
    currentAvg: number;
    change: number;
  }>;
  stable: string[];
  message: string;
}

export interface PerformanceBudget {
  lcp?: number;        // Max ms
  fcp?: number;        // Max ms
  cls?: number;        // Max score
  ttfb?: number;       // Max ms
  resourceSize?: number;  // Max bytes
  resourceCount?: number; // Max resources
  domNodes?: number;   // Max DOM nodes
  longTasks?: number;  // Max long tasks
}

export interface BudgetCheckOptions {
  metrics: PerformanceMetrics;
  budget: PerformanceBudget;
}

export interface BudgetViolation {
  metric: string;
  actual: number;
  budget: number;
  overage: number;  // Percentage over budget
  severity: 'critical' | 'warning';
}

export interface BudgetCheckResult {
  passed: boolean;
  violations: BudgetViolation[];
  passing: string[];
  score: number;  // Percentage of budgets met
  message: string;
}

// ============================================================================
// Web Vitals Thresholds (from Google)
// ============================================================================

const VITALS_THRESHOLDS = {
  lcp: { good: 2500, poor: 4000 },      // ms
  fid: { good: 100, poor: 300 },        // ms
  cls: { good: 0.1, poor: 0.25 },       // score
  fcp: { good: 1800, poor: 3000 },      // ms
  ttfb: { good: 800, poor: 1800 },      // ms
  inp: { good: 200, poor: 500 },        // ms
};

// ============================================================================
// Performance Analysis
// ============================================================================

/**
 * Analyze page performance and return metrics with scores
 */
export async function performanceAnalyze(options: PerformanceAnalyzeOptions): Promise<PerformanceAnalyzeResult> {
  const { page, url, waitForLoad = true } = options;

  // Navigate if URL provided
  if (url) {
    await page.goto(url, { waitUntil: waitForLoad ? 'load' : 'domcontentloaded' });
  }

  // Collect metrics
  const metrics = await collectMetrics(page);
  const currentUrl = page.url();

  // Calculate scores
  const scores = calculateScores(metrics);

  // Find issues
  const issues = findPerformanceIssues(metrics);

  // Calculate overall grade
  const grade = scoreToGrade(scores.overall);

  return {
    url: currentUrl,
    timestamp: new Date().toISOString(),
    metrics,
    scores,
    issues,
    grade,
    message: `Performance: ${scores.overall}/100 (${grade}) - LCP: ${metrics.lcp}ms, CLS: ${metrics.cls}`,
  };
}

async function collectMetrics(page: Page): Promise<PerformanceMetrics> {
  const metrics = await page.evaluate(() => {
    const perf = performance;
    const entries = perf.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const paintEntries = perf.getEntriesByType('paint');
    const resourceEntries = perf.getEntriesByType('resource') as PerformanceResourceTiming[];

    // Get FCP
    const fcpEntry = paintEntries.find(e => e.name === 'first-contentful-paint');
    const fcp = fcpEntry ? fcpEntry.startTime : null;

    // Calculate resource totals
    let resourceSize = 0;
    for (const resource of resourceEntries) {
      resourceSize += resource.transferSize || 0;
    }

    // Get DOM node count
    const domNodes = document.querySelectorAll('*').length;

    // Get long tasks (if available)
    let longTasks = 0;
    try {
      const longTaskEntries = perf.getEntriesByType('longtask');
      longTasks = longTaskEntries.length;
    } catch {
      // Long task API may not be available
    }

    // Get JS heap size if available
    let jsHeapSize: number | null = null;
    try {
      // @ts-ignore - memory is non-standard
      if (performance.memory) {
        // @ts-ignore
        jsHeapSize = performance.memory.usedJSHeapSize;
      }
    } catch {
      // Memory API may not be available
    }

    return {
      domContentLoaded: entries.domContentLoadedEventEnd - entries.fetchStart,
      loadComplete: entries.loadEventEnd - entries.fetchStart,
      ttfb: entries.responseStart - entries.fetchStart,
      fcp,
      resourceCount: resourceEntries.length,
      resourceSize,
      domNodes,
      longTasks,
      jsHeapSize,
    };
  });

  // Get LCP using PerformanceObserver result or estimate
  const lcp = await page.evaluate(() => {
    return new Promise<number | null>((resolve) => {
      let lcpValue: number | null = null;

      // Try to get LCP from existing entries
      try {
        const entries = performance.getEntriesByType('largest-contentful-paint');
        if (entries.length > 0) {
          lcpValue = entries[entries.length - 1].startTime;
        }
      } catch {
        // LCP API may not be available
      }

      // If no LCP, estimate from images
      if (!lcpValue) {
        const images = document.querySelectorAll('img');
        if (images.length > 0) {
          // Use load event timing of largest image as estimate
          const resourceEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
          const imageEntries = resourceEntries.filter(r => r.initiatorType === 'img');
          if (imageEntries.length > 0) {
            lcpValue = Math.max(...imageEntries.map(e => e.responseEnd));
          }
        }
      }

      resolve(lcpValue);
    });
  });

  // Get CLS (requires LayoutShift entries)
  const cls = await page.evaluate(() => {
    try {
      const entries = performance.getEntriesByType('layout-shift') as any[];
      let clsValue = 0;
      for (const entry of entries) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
        }
      }
      return Math.round(clsValue * 1000) / 1000;
    } catch {
      return null;
    }
  });

  return {
    lcp,
    fid: null,  // FID requires user interaction
    cls,
    fcp: metrics.fcp,
    ttfb: metrics.ttfb,
    inp: null,  // INP requires user interaction
    domContentLoaded: metrics.domContentLoaded,
    loadComplete: metrics.loadComplete,
    resourceCount: metrics.resourceCount,
    resourceSize: metrics.resourceSize,
    jsHeapSize: metrics.jsHeapSize,
    domNodes: metrics.domNodes,
    longTasks: metrics.longTasks,
  };
}

function calculateScores(metrics: PerformanceMetrics): PerformanceScore {
  const lcpScore = metrics.lcp !== null ? scoreMetric(metrics.lcp, VITALS_THRESHOLDS.lcp) : 50;
  const fcpScore = metrics.fcp !== null ? scoreMetric(metrics.fcp, VITALS_THRESHOLDS.fcp) : 50;
  const clsScore = metrics.cls !== null ? scoreMetric(metrics.cls, VITALS_THRESHOLDS.cls) : 50;
  const ttfbScore = metrics.ttfb !== null ? scoreMetric(metrics.ttfb, VITALS_THRESHOLDS.ttfb) : 50;
  const fidScore = metrics.fid !== null ? scoreMetric(metrics.fid, VITALS_THRESHOLDS.fid) : 50;

  // Weighted average (LCP and CLS are most important)
  const overall = Math.round(
    lcpScore * 0.25 +
    fcpScore * 0.15 +
    clsScore * 0.25 +
    ttfbScore * 0.15 +
    fidScore * 0.20
  );

  return {
    overall,
    lcp: lcpScore,
    fid: fidScore,
    cls: clsScore,
    fcp: fcpScore,
    ttfb: ttfbScore,
  };
}

function scoreMetric(value: number, thresholds: { good: number; poor: number }): number {
  if (value <= thresholds.good) {
    // Scale 90-100 for values better than good
    return 90 + (10 * (1 - value / thresholds.good));
  } else if (value <= thresholds.poor) {
    // Scale 50-89 for values between good and poor
    const range = thresholds.poor - thresholds.good;
    const position = (value - thresholds.good) / range;
    return Math.round(89 - (position * 39));
  } else {
    // Scale 0-49 for values worse than poor
    const overPoor = value - thresholds.poor;
    const score = Math.max(0, 49 - (overPoor / thresholds.poor) * 49);
    return Math.round(score);
  }
}

function findPerformanceIssues(metrics: PerformanceMetrics): PerformanceIssue[] {
  const issues: PerformanceIssue[] = [];

  // LCP issues
  if (metrics.lcp !== null) {
    if (metrics.lcp > VITALS_THRESHOLDS.lcp.poor) {
      issues.push({
        metric: 'LCP',
        value: metrics.lcp,
        threshold: VITALS_THRESHOLDS.lcp.good,
        severity: 'critical',
        suggestion: 'Optimize largest image/text block. Consider lazy loading, image compression, or CDN.',
      });
    } else if (metrics.lcp > VITALS_THRESHOLDS.lcp.good) {
      issues.push({
        metric: 'LCP',
        value: metrics.lcp,
        threshold: VITALS_THRESHOLDS.lcp.good,
        severity: 'warning',
        suggestion: 'LCP could be improved. Check image sizes and server response time.',
      });
    }
  }

  // CLS issues
  if (metrics.cls !== null && metrics.cls > VITALS_THRESHOLDS.cls.good) {
    issues.push({
      metric: 'CLS',
      value: metrics.cls,
      threshold: VITALS_THRESHOLDS.cls.good,
      severity: metrics.cls > VITALS_THRESHOLDS.cls.poor ? 'critical' : 'warning',
      suggestion: 'Layout shifts detected. Add size attributes to images/embeds, avoid inserting content above existing content.',
    });
  }

  // TTFB issues
  if (metrics.ttfb !== null && metrics.ttfb > VITALS_THRESHOLDS.ttfb.good) {
    issues.push({
      metric: 'TTFB',
      value: metrics.ttfb,
      threshold: VITALS_THRESHOLDS.ttfb.good,
      severity: metrics.ttfb > VITALS_THRESHOLDS.ttfb.poor ? 'critical' : 'warning',
      suggestion: 'Slow server response. Consider caching, CDN, or server optimization.',
    });
  }

  // Resource count issues
  if (metrics.resourceCount > 100) {
    issues.push({
      metric: 'Resource Count',
      value: metrics.resourceCount,
      threshold: 100,
      severity: metrics.resourceCount > 200 ? 'critical' : 'warning',
      suggestion: 'Too many resources. Bundle files, use sprites, or lazy load non-critical resources.',
    });
  }

  // Resource size issues (> 3MB)
  if (metrics.resourceSize > 3 * 1024 * 1024) {
    issues.push({
      metric: 'Page Size',
      value: `${(metrics.resourceSize / 1024 / 1024).toFixed(1)}MB`,
      threshold: '3MB',
      severity: metrics.resourceSize > 5 * 1024 * 1024 ? 'critical' : 'warning',
      suggestion: 'Page is too large. Compress images, minify JS/CSS, enable gzip.',
    });
  }

  // DOM node issues
  if (metrics.domNodes > 1500) {
    issues.push({
      metric: 'DOM Nodes',
      value: metrics.domNodes,
      threshold: 1500,
      severity: metrics.domNodes > 3000 ? 'critical' : 'warning',
      suggestion: 'Large DOM tree. Consider virtualization or pagination for large lists.',
    });
  }

  // Long task issues
  if (metrics.longTasks > 0) {
    issues.push({
      metric: 'Long Tasks',
      value: metrics.longTasks,
      threshold: 0,
      severity: metrics.longTasks > 3 ? 'critical' : 'warning',
      suggestion: 'JavaScript blocking main thread. Break up long tasks, use web workers.',
    });
  }

  return issues;
}

function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 50) return 'C';
  if (score >= 25) return 'D';
  return 'F';
}

// ============================================================================
// Regression Detection
// ============================================================================

/**
 * Detect performance regressions between baseline and current runs
 */
export function detectPerformanceRegression(options: RegressionOptions): RegressionResult {
  const { baseline, current, thresholds = {} } = options;

  const defaultThresholds = {
    lcp: thresholds.lcp ?? 10,
    fcp: thresholds.fcp ?? 10,
    cls: thresholds.cls ?? 20,
    ttfb: thresholds.ttfb ?? 15,
  };

  const regressions: RegressionResult['regressions'] = [];
  const improvements: RegressionResult['improvements'] = [];
  const stable: string[] = [];

  const metrics = ['lcp', 'fcp', 'cls', 'ttfb'] as const;

  for (const metric of metrics) {
    const baselineValues = baseline
      .map(r => r.metrics[metric])
      .filter((v): v is number => v !== null);
    const currentValues = current
      .map(r => r.metrics[metric])
      .filter((v): v is number => v !== null);

    if (baselineValues.length === 0 || currentValues.length === 0) {
      continue;
    }

    const baselineAvg = baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length;
    const currentAvg = currentValues.reduce((a, b) => a + b, 0) / currentValues.length;

    const change = ((currentAvg - baselineAvg) / baselineAvg) * 100;
    const threshold = defaultThresholds[metric] || 10;

    if (change > threshold) {
      regressions.push({
        metric: metric.toUpperCase(),
        baselineAvg: Math.round(baselineAvg * 100) / 100,
        currentAvg: Math.round(currentAvg * 100) / 100,
        change: Math.round(change * 10) / 10,
        severity: change > threshold * 2 ? 'critical' : change > threshold * 1.5 ? 'warning' : 'minor',
      });
    } else if (change < -threshold) {
      improvements.push({
        metric: metric.toUpperCase(),
        baselineAvg: Math.round(baselineAvg * 100) / 100,
        currentAvg: Math.round(currentAvg * 100) / 100,
        change: Math.round(change * 10) / 10,
      });
    } else {
      stable.push(metric.toUpperCase());
    }
  }

  const hasRegression = regressions.some(r => r.severity === 'critical' || r.severity === 'warning');

  return {
    hasRegression,
    regressions,
    improvements,
    stable,
    message: hasRegression
      ? `Performance regression detected: ${regressions.map(r => `${r.metric} +${r.change}%`).join(', ')}`
      : regressions.length > 0
        ? `Minor regressions: ${regressions.map(r => `${r.metric} +${r.change}%`).join(', ')}`
        : improvements.length > 0
          ? `Performance improved: ${improvements.map(i => `${i.metric} ${i.change}%`).join(', ')}`
          : 'Performance is stable',
  };
}

// ============================================================================
// Budget Checking
// ============================================================================

/**
 * Check performance against defined budgets
 */
export function checkPerformanceBudget(options: BudgetCheckOptions): BudgetCheckResult {
  const { metrics, budget } = options;
  const violations: BudgetViolation[] = [];
  const passing: string[] = [];

  const checks: Array<{ name: string; actual: number | null; budget: number | undefined }> = [
    { name: 'LCP', actual: metrics.lcp, budget: budget.lcp },
    { name: 'FCP', actual: metrics.fcp, budget: budget.fcp },
    { name: 'CLS', actual: metrics.cls, budget: budget.cls },
    { name: 'TTFB', actual: metrics.ttfb, budget: budget.ttfb },
    { name: 'Resource Size', actual: metrics.resourceSize, budget: budget.resourceSize },
    { name: 'Resource Count', actual: metrics.resourceCount, budget: budget.resourceCount },
    { name: 'DOM Nodes', actual: metrics.domNodes, budget: budget.domNodes },
    { name: 'Long Tasks', actual: metrics.longTasks, budget: budget.longTasks },
  ];

  for (const check of checks) {
    if (check.budget === undefined || check.actual === null) {
      continue;
    }

    if (check.actual > check.budget) {
      const overage = ((check.actual - check.budget) / check.budget) * 100;
      violations.push({
        metric: check.name,
        actual: check.actual,
        budget: check.budget,
        overage: Math.round(overage * 10) / 10,
        severity: overage > 50 ? 'critical' : 'warning',
      });
    } else {
      passing.push(check.name);
    }
  }

  const totalChecks = violations.length + passing.length;
  const score = totalChecks > 0 ? Math.round((passing.length / totalChecks) * 100) : 100;

  return {
    passed: violations.length === 0,
    violations,
    passing,
    score,
    message: violations.length === 0
      ? `All ${passing.length} performance budgets met`
      : `${violations.length} budget violations: ${violations.map(v => `${v.metric} (+${v.overage}%)`).join(', ')}`,
  };
}

// ============================================================================
// Formatters
// ============================================================================

export function formatPerformanceResult(result: PerformanceAnalyzeResult): string {
  const lines: string[] = [];
  const icon = result.grade === 'A' || result.grade === 'B' ? '✅' :
               result.grade === 'C' ? '⚠️' : '❌';

  lines.push(`# Performance Analysis`);
  lines.push('');
  lines.push(`${icon} **Score:** ${result.scores.overall}/100 (${result.grade})`);
  lines.push(`**URL:** ${result.url}`);
  lines.push('');

  lines.push('## Core Web Vitals');
  lines.push('');
  lines.push(`| Metric | Value | Score |`);
  lines.push(`|--------|-------|-------|`);
  lines.push(`| LCP | ${result.metrics.lcp ?? 'N/A'}ms | ${result.scores.lcp} |`);
  lines.push(`| FCP | ${result.metrics.fcp ?? 'N/A'}ms | ${result.scores.fcp} |`);
  lines.push(`| CLS | ${result.metrics.cls ?? 'N/A'} | ${result.scores.cls} |`);
  lines.push(`| TTFB | ${result.metrics.ttfb ?? 'N/A'}ms | ${result.scores.ttfb} |`);
  lines.push('');

  lines.push('## Other Metrics');
  lines.push('');
  lines.push(`- **DOM Content Loaded:** ${result.metrics.domContentLoaded}ms`);
  lines.push(`- **Load Complete:** ${result.metrics.loadComplete}ms`);
  lines.push(`- **Resources:** ${result.metrics.resourceCount} (${(result.metrics.resourceSize / 1024).toFixed(0)}KB)`);
  lines.push(`- **DOM Nodes:** ${result.metrics.domNodes}`);
  lines.push(`- **Long Tasks:** ${result.metrics.longTasks}`);
  lines.push('');

  if (result.issues.length > 0) {
    lines.push('## Issues');
    lines.push('');
    for (const issue of result.issues) {
      const sev = issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '🟡' : 'ℹ️';
      lines.push(`${sev} **${issue.metric}:** ${issue.value} (threshold: ${issue.threshold})`);
      lines.push(`   ${issue.suggestion}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function formatRegressionResult(result: RegressionResult): string {
  const lines: string[] = [];
  const icon = result.hasRegression ? '❌' : '✅';

  lines.push(`# Performance Regression Check`);
  lines.push('');
  lines.push(`${icon} ${result.message}`);
  lines.push('');

  if (result.regressions.length > 0) {
    lines.push('## Regressions');
    for (const reg of result.regressions) {
      const sev = reg.severity === 'critical' ? '🔴' : reg.severity === 'warning' ? '🟡' : '🟠';
      lines.push(`${sev} **${reg.metric}:** ${reg.baselineAvg} → ${reg.currentAvg} (+${reg.change}%)`);
    }
    lines.push('');
  }

  if (result.improvements.length > 0) {
    lines.push('## Improvements');
    for (const imp of result.improvements) {
      lines.push(`✅ **${imp.metric}:** ${imp.baselineAvg} → ${imp.currentAvg} (${imp.change}%)`);
    }
    lines.push('');
  }

  if (result.stable.length > 0) {
    lines.push(`**Stable:** ${result.stable.join(', ')}`);
  }

  return lines.join('\n');
}

export function formatBudgetResult(result: BudgetCheckResult): string {
  const lines: string[] = [];
  const icon = result.passed ? '✅' : '❌';

  lines.push(`# Performance Budget Check`);
  lines.push('');
  lines.push(`${icon} ${result.message}`);
  lines.push(`**Score:** ${result.score}%`);
  lines.push('');

  if (result.violations.length > 0) {
    lines.push('## Violations');
    for (const v of result.violations) {
      const sev = v.severity === 'critical' ? '🔴' : '🟡';
      lines.push(`${sev} **${v.metric}:** ${v.actual} (budget: ${v.budget}, +${v.overage}% over)`);
    }
    lines.push('');
  }

  if (result.passing.length > 0) {
    lines.push(`**Passing:** ${result.passing.join(', ')}`);
  }

  return lines.join('\n');
}
