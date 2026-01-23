/**
 * Dynamic Tool: test_prioritize
 * Created: 2026-01-23T14:31:07.317Z
 * Permissions: none
 *
 * Score and rank tests by priority based on failure rate, recent failures, execution time, and stability.
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'test_prioritize',
  description: "Score and rank tests by priority based on failure rate, recent failures, execution time, and stability.",
  schema: {
      "type": "object",
      "properties": {
          "testHistory": {
              "type": "array",
              "description": "Array of test run histories"
          },
          "weights": {
              "type": "object",
              "properties": {
                  "failureRate": {
                      "type": "number"
                  },
                  "recentFailures": {
                      "type": "number"
                  },
                  "executionTime": {
                      "type": "number"
                  },
                  "stability": {
                      "type": "number"
                  }
              },
              "description": "Custom priority weights (0-1)"
          }
      },
      "required": [
          "testHistory"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const history = args.testHistory as Array<{testId: string, testName: string, runs: Array<{status: string, duration?: number, timestamp?: string}>}>;
    const weights = (args.weights as Record<string, number>) || {};
    const w = {
      failureRate: weights.failureRate ?? 0.4,
      recentFailures: weights.recentFailures ?? 0.3,
      executionTime: weights.executionTime ?? 0.1,
      stability: weights.stability ?? 0.2,
    };
    
    const prioritized: Array<{
      testId: string;
      testName: string;
      priorityScore: number;
      factors: Record<string, number>;
      recommendation: string;
    }> = [];
    
    for (const test of history) {
      const runs = test.runs || [];
      if (runs.length === 0) continue;
      
      // Calculate factors
      const failCount = runs.filter(r => r.status === 'failed').length;
      const failureRate = failCount / runs.length;
      
      // Recent failures (last 5 runs)
      const recentRuns = runs.slice(-5);
      const recentFailures = recentRuns.filter(r => r.status === 'failed').length / recentRuns.length;
      
      // Execution time (normalize: faster = higher score)
      const avgDuration = runs.reduce((sum, r) => sum + (r.duration || 0), 0) / runs.length;
      const executionScore = avgDuration > 0 ? Math.max(0, 1 - avgDuration / 60000) : 0.5; // Normalize to 1 min
      
      // Stability (inverse of variance in pass/fail)
      const passRate = 1 - failureRate;
      const stability = 1 - Math.min(passRate, failureRate) * 2;
      
      const priorityScore = (
        w.failureRate * failureRate +
        w.recentFailures * recentFailures +
        w.executionTime * executionScore +
        w.stability * (1 - stability)
      ) * 100;
      
      let recommendation = 'Run normally';
      if (priorityScore > 70) recommendation = 'Run first - high failure risk';
      else if (priorityScore > 50) recommendation = 'Run early - moderate risk';
      else if (priorityScore < 20) recommendation = 'Can defer - stable';
      
      prioritized.push({
        testId: test.testId,
        testName: test.testName,
        priorityScore,
        factors: { failureRate, recentFailures, executionTime: executionScore, stability },
        recommendation,
      });
    }
    
    prioritized.sort((a, b) => b.priorityScore - a.priorityScore);
    
    let output = `Test Priority Ranking\n\n`;
    for (let i = 0; i < Math.min(10, prioritized.length); i++) {
      const t = prioritized[i];
      output += `${i + 1}. ${t.testName} (score: ${t.priorityScore.toFixed(1)}) [${t.recommendation}]\n`;
      output += `   Failure rate: ${(t.factors.failureRate * 100).toFixed(1)}%\n`;
    }
    
    return { prioritized, output };
  },
};
