/**
 * Dynamic Tool: test_flaky_detect
 * Created: 2026-01-23T14:31:06.532Z
 * Permissions: none
 *
 * Analyze test run history to detect flaky tests. Identifies tests that pass and fail inconsistently.
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'test_flaky_detect',
  description: "Analyze test run history to detect flaky tests. Identifies tests that pass and fail inconsistently.",
  schema: {
      "type": "object",
      "properties": {
          "testHistory": {
              "type": "array",
              "description": "Array of test run histories with testId, testName, and runs array"
          },
          "minRuns": {
              "type": "number",
              "description": "Minimum runs needed to detect flakiness. Default: 5",
              "default": 5
          },
          "flakinessThreshold": {
              "type": "number",
              "description": "Inconsistency rate to consider flaky (0-1). Default: 0.1",
              "default": 0.1
          }
      },
      "required": [
          "testHistory"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const history = args.testHistory as Array<{testId: string, testName: string, runs: Array<{status: string}>}>;
    const minRuns = (args.minRuns as number) || 5;
    const threshold = (args.flakinessThreshold as number) || 0.1;
    
    const flakyTests: Array<{
      testId: string;
      testName: string;
      isFlaky: boolean;
      flakinessScore: number;
      passCount: number;
      failCount: number;
      totalRuns: number;
    }> = [];
    
    for (const test of history) {
      const runs = test.runs || [];
      if (runs.length < minRuns) continue;
      
      const passCount = runs.filter(r => r.status === 'passed').length;
      const failCount = runs.filter(r => r.status === 'failed').length;
      const totalRuns = runs.length;
      
      // Flakiness = how often results change / not consistently pass or fail
      const passRate = passCount / totalRuns;
      const flakinessScore = Math.min(passRate, 1 - passRate) * 2 * 100; // 0-100 scale
      const isFlaky = flakinessScore / 100 >= threshold;
      
      flakyTests.push({
        testId: test.testId,
        testName: test.testName,
        isFlaky,
        flakinessScore,
        passCount,
        failCount,
        totalRuns,
      });
    }
    
    const flaky = flakyTests.filter(t => t.isFlaky);
    const stable = flakyTests.filter(t => !t.isFlaky);
    
    let output = `Flaky Test Analysis\n\n`;
    output += `Analyzed: ${flakyTests.length} tests\n`;
    output += `Stable: ${stable.length} | Flaky: ${flaky.length}\n\n`;
    
    if (flaky.length > 0) {
      output += `Flaky Tests:\n`;
      for (const test of flaky.sort((a, b) => b.flakinessScore - a.flakinessScore)) {
        output += `- ${test.testName}: ${test.flakinessScore.toFixed(1)}% flaky (${test.passCount}/${test.totalRuns} passed)\n`;
      }
    }
    
    return { totalTests: flakyTests.length, stableTests: stable.length, flakyCount: flaky.length, flakyTests, output };
  },
};
