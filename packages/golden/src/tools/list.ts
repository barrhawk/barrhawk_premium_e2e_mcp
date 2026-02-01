/**
 * Golden List Tool
 *
 * List available golden test suites and cases.
 */

import type { ListOptions, GoldenTestCase, GoldenSuite } from '../types.js';
import { loadSuites, loadAllCases, loadSuiteCases, getStats } from '../storage/cases.js';

export interface ListResult {
  suites: GoldenSuite[];
  cases: GoldenTestCase[];
  stats: {
    totalSuites: number;
    totalCases: number;
    casesBySuite: Record<string, number>;
  };
}

/**
 * List golden test suites and cases
 */
export function listGolden(options: ListOptions = {}): ListResult {
  const config = loadSuites();
  const stats = getStats();

  let suites = config.suites;
  let cases: GoldenTestCase[];

  if (options.suite) {
    suites = suites.filter(s => s.id === options.suite);
    cases = loadSuiteCases(options.suite);
  } else {
    cases = loadAllCases();
  }

  // Filter by tags if specified
  if (options.tags && options.tags.length > 0) {
    cases = cases.filter(c =>
      options.tags!.some(tag => c.tags.includes(tag))
    );
  }

  return { suites, cases, stats };
}

/**
 * Format list result as text
 */
export function formatListResult(result: ListResult): string {
  let output = `\nGolden Girl Test Cases\n`;
  output += '═'.repeat(50) + '\n\n';

  // Stats summary
  output += `Total Suites: ${result.stats.totalSuites}\n`;
  output += `Total Cases: ${result.stats.totalCases}\n\n`;

  // List suites
  for (const suite of result.suites) {
    const count = result.stats.casesBySuite[suite.id] || 0;
    output += `\n📁 ${suite.name} (${count} cases)\n`;
    output += `   ${suite.description}\n`;

    // List cases in this suite
    const suiteCases = result.cases.filter(c => c.suite === suite.id);
    if (suiteCases.length > 0) {
      output += '   ' + '─'.repeat(40) + '\n';
      for (const c of suiteCases) {
        const mode = c.matchMode.substring(0, 3).toUpperCase();
        const threshold = (c.threshold * 100).toFixed(0);
        output += `   • ${c.name}\n`;
        output += `     Mode: ${mode} | Threshold: ${threshold}% | Tags: ${c.tags.join(', ') || '-'}\n`;
      }
    }
  }

  return output;
}

/**
 * Get summary statistics only
 */
export function getSummary(): string {
  const stats = getStats();

  let output = `\nGolden Girl Summary\n`;
  output += '─'.repeat(30) + '\n';
  output += `Total Suites: ${stats.totalSuites}\n`;
  output += `Total Cases: ${stats.totalCases}\n`;
  output += '\nBy Suite:\n';

  for (const [suite, count] of Object.entries(stats.casesBySuite)) {
    output += `  ${suite}: ${count} cases\n`;
  }

  return output;
}
