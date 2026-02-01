/**
 * Golden Run Tool
 *
 * Run golden test cases against AI tools to validate quality.
 */

import { randomUUID } from 'node:crypto';
import type {
  RunOptions,
  GoldenRunResult,
  GoldenTestResult,
  GoldenTestCase,
  RunSummary,
} from '../types.js';
import { loadAllCases, loadSuiteCases, getSuite } from '../storage/cases.js';
import { calculateScore } from '../scoring/index.js';

// Store run results for reporting
const runResults = new Map<string, GoldenRunResult>();

/**
 * Execute a single golden test case
 */
async function executeTestCase(
  testCase: GoldenTestCase,
  toolExecutor?: (tool: string, args: Record<string, unknown>) => Promise<unknown>
): Promise<GoldenTestResult> {
  const startTime = Date.now();

  try {
    let actual: unknown;

    if (toolExecutor) {
      // Execute the actual tool
      actual = await toolExecutor(testCase.input.tool, testCase.input.args);
    } else {
      // Mock execution - return a placeholder for testing
      actual = {
        mock: true,
        tool: testCase.input.tool,
        message: 'No tool executor provided - using mock response',
      };
    }

    const duration = Date.now() - startTime;
    const score = calculateScore(
      actual,
      testCase.expected,
      testCase.matchMode,
      testCase.threshold
    );

    return {
      testCase,
      actual,
      score,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      testCase,
      actual: null,
      score: {
        score: 0,
        passed: false,
        breakdown: [{
          check: 'execution',
          weight: 1,
          score: 0,
          details: `Error: ${error instanceof Error ? error.message : String(error)}`,
        }],
      },
      error: error instanceof Error ? error.message : String(error),
      duration,
    };
  }
}

/**
 * Run golden test suite
 */
export async function runGoldenTests(
  options: RunOptions = {},
  toolExecutor?: (tool: string, args: Record<string, unknown>) => Promise<unknown>
): Promise<GoldenRunResult> {
  const runId = randomUUID();
  const startTime = Date.now();
  const threshold = options.threshold ?? 0.8;

  // Load test cases
  let cases: GoldenTestCase[];

  if (options.suite) {
    cases = loadSuiteCases(options.suite);
  } else {
    cases = loadAllCases();
  }

  // Filter by tool if specified
  if (options.tool) {
    cases = cases.filter(c => c.input.tool === options.tool);
  }

  // Filter by tags if specified
  if (options.tags && options.tags.length > 0) {
    cases = cases.filter(c =>
      options.tags!.some(tag => c.tags.includes(tag))
    );
  }

  // Execute all test cases
  const results: GoldenTestResult[] = [];

  for (const testCase of cases) {
    const result = await executeTestCase(testCase, toolExecutor);
    results.push(result);
  }

  // Calculate summary
  const passed = results.filter(r => r.score.score >= threshold).length;
  const failed = results.filter(r => r.score.score < threshold && !r.error).length;
  const skipped = results.filter(r => r.error).length;
  const averageScore = results.length > 0
    ? results.reduce((sum, r) => sum + r.score.score, 0) / results.length
    : 0;

  const summary: RunSummary = {
    total: results.length,
    passed,
    failed,
    skipped,
    averageScore,
  };

  const runResult: GoldenRunResult = {
    runId,
    suite: options.suite || 'all',
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime,
    results,
    summary,
  };

  // Store for reporting
  runResults.set(runId, runResult);

  return runResult;
}

/**
 * Get a previous run result
 */
export function getRunResult(runId: string): GoldenRunResult | undefined {
  return runResults.get(runId);
}

/**
 * Format run results as text
 */
export function formatRunResults(result: GoldenRunResult, verbose: boolean = false): string {
  let output = `\nGolden Girl Results: ${result.suite}\n`;
  output += '─'.repeat(50) + '\n\n';

  for (const r of result.results) {
    const icon = r.score.passed ? '✅' : r.error ? '⏭️' : '❌';
    const scoreStr = (r.score.score * 100).toFixed(0).padStart(3);
    const status = r.score.passed ? 'PASS' : r.error ? 'SKIP' : 'FAIL';
    output += `${icon} ${r.testCase.name.padEnd(25)} ${scoreStr}%  ${status}\n`;

    if (verbose && r.score.breakdown.length > 0) {
      for (const b of r.score.breakdown) {
        const checkIcon = b.score > 0.5 ? '  ✓' : '  ✗';
        output += `${checkIcon} ${b.check}: ${b.details}\n`;
      }
      output += '\n';
    }
  }

  output += '\n' + '─'.repeat(50) + '\n';
  output += `Overall: ${result.summary.passed}/${result.summary.total} passed `;
  output += `(${((result.summary.passed / result.summary.total) * 100).toFixed(0)}%)\n`;
  output += `Average score: ${(result.summary.averageScore * 100).toFixed(0)}%\n`;
  output += `Duration: ${(result.duration / 1000).toFixed(2)}s\n`;

  // Show failed test details
  const failed = result.results.filter(r => !r.score.passed && !r.error);
  if (failed.length > 0 && !verbose) {
    output += '\nFailed test details:\n';
    for (const r of failed) {
      const issues = r.score.breakdown
        .filter(b => b.score < 1)
        .map(b => b.details)
        .join(', ');
      output += `- ${r.testCase.name}: ${issues}\n`;
    }
  }

  return output;
}
