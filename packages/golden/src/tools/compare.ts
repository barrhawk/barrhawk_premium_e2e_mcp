/**
 * Golden Compare Tool
 *
 * Compare an actual output against a golden expected output.
 */

import type {
  GoldenExpected,
  CompareOptions,
  ScoreResult,
  MatchMode,
} from '../types.js';
import { calculateScore } from '../scoring/index.js';

/**
 * Compare actual output against expected golden output
 */
export function compare(
  actual: unknown,
  expected: GoldenExpected,
  options: CompareOptions
): ScoreResult {
  const threshold = options.threshold ?? 0.8;
  return calculateScore(actual, expected, options.matchMode, threshold);
}

/**
 * Format comparison results as text
 */
export function formatCompareResult(result: ScoreResult, threshold: number = 0.8): string {
  let output = `\nComparison Result:\n`;
  output += '─'.repeat(30) + '\n';
  output += `Score: ${(result.score * 100).toFixed(0)}% / 100%\n`;
  output += `Status: ${result.score >= threshold ? 'PASS' : 'FAIL'} (threshold: ${(threshold * 100).toFixed(0)}%)\n`;

  if (result.breakdown.length > 0) {
    output += '\nBreakdown:\n';
    for (const b of result.breakdown) {
      const icon = b.score >= 0.5 ? '✅' : '⚠️';
      output += `  ${icon} ${b.check} (${(b.score * 100).toFixed(0)}%)\n`;
      output += `     ${b.details}\n`;
    }
  }

  return output;
}

/**
 * Quick semantic comparison (convenience function)
 */
export function compareText(actual: string, mustContain: string[], mustNotContain: string[] = []): ScoreResult {
  return compare(
    actual,
    { mustContain, mustNotContain },
    { matchMode: 'semantic', threshold: 0.8 }
  );
}

/**
 * Quick structure comparison (convenience function)
 */
export function compareStructure(
  actual: unknown,
  assertions: Array<{
    path: string;
    operator: 'equals' | 'contains' | 'exists' | '>=' | '<=';
    expected: unknown;
    weight?: number;
  }>
): ScoreResult {
  return compare(
    actual,
    {
      assertions: assertions.map(a => ({
        ...a,
        weight: a.weight ?? 1,
      })),
    },
    { matchMode: 'structure', threshold: 0.8 }
  );
}
