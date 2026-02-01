/**
 * Golden Add Tool
 *
 * Add new golden test cases.
 */

import type { AddOptions, GoldenTestCase } from '../types.js';
import { addCase, getSuite, loadSuiteCases } from '../storage/cases.js';

/**
 * Add a new golden test case
 */
export function addGoldenCase(options: AddOptions): GoldenTestCase {
  // Validate suite exists
  const suite = getSuite(options.suite);
  if (!suite) {
    throw new Error(`Suite not found: ${options.suite}`);
  }

  // Add the case
  const testCase = addCase(options);

  return testCase;
}

/**
 * Format add result as text
 */
export function formatAddResult(testCase: GoldenTestCase): string {
  const suiteCount = loadSuiteCases(testCase.suite).length;

  let output = `\nGolden test added: ${testCase.name}\n`;
  output += '─'.repeat(40) + '\n';
  output += `ID: ${testCase.id}\n`;
  output += `Suite: ${testCase.suite}\n`;
  output += `Match Mode: ${testCase.matchMode}\n`;
  output += `Threshold: ${(testCase.threshold * 100).toFixed(0)}%\n`;
  output += `Tags: ${testCase.tags.join(', ') || 'none'}\n`;
  output += `\nTotal cases in suite: ${suiteCount}\n`;

  return output;
}

/**
 * Bulk add golden test cases
 */
export function addGoldenCases(cases: AddOptions[]): GoldenTestCase[] {
  const results: GoldenTestCase[] = [];

  for (const options of cases) {
    const testCase = addGoldenCase(options);
    results.push(testCase);
  }

  return results;
}
