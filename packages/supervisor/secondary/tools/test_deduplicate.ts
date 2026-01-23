/**
 * Dynamic Tool: test_deduplicate
 * Created: 2026-01-23T14:31:07.975Z
 * Permissions: none
 *
 * Find potentially redundant tests based on action similarity using Jaccard similarity.
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'test_deduplicate',
  description: "Find potentially redundant tests based on action similarity using Jaccard similarity.",
  schema: {
      "type": "object",
      "properties": {
          "tests": {
              "type": "array",
              "description": "Array of tests with id, name, and steps array"
          },
          "similarityThreshold": {
              "type": "number",
              "description": "Jaccard similarity threshold (0-1). Default: 0.8",
              "default": 0.8
          }
      },
      "required": [
          "tests"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const tests = args.tests as Array<{id: string, name: string, steps: Array<{action: string, selector?: string, value?: string}>}>;
    const threshold = (args.similarityThreshold as number) || 0.8;
    
    // Convert steps to fingerprints
    const fingerprints = new Map<string, Set<string>>();
    for (const test of tests) {
      const fp = new Set<string>();
      for (const step of test.steps || []) {
        fp.add(`${step.action}:${step.selector || ''}:${step.value || ''}`);
      }
      fingerprints.set(test.id, fp);
    }
    
    // Calculate Jaccard similarity
    const jaccard = (a: Set<string>, b: Set<string>): number => {
      const intersection = new Set([...a].filter(x => b.has(x)));
      const union = new Set([...a, ...b]);
      return union.size === 0 ? 0 : intersection.size / union.size;
    };
    
    const duplicates: Array<{
      testId1: string;
      testName1: string;
      testId2: string;
      testName2: string;
      similarityScore: number;
      recommendation: string;
    }> = [];
    
    const seen = new Set<string>();
    for (let i = 0; i < tests.length; i++) {
      for (let j = i + 1; j < tests.length; j++) {
        const key = `${tests[i].id}-${tests[j].id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        
        const fp1 = fingerprints.get(tests[i].id)!;
        const fp2 = fingerprints.get(tests[j].id)!;
        const similarity = jaccard(fp1, fp2) * 100;
        
        if (similarity >= threshold * 100) {
          let recommendation = 'Review for consolidation';
          if (similarity > 95) recommendation = 'Likely duplicate - consider removing one';
          else if (similarity > 85) recommendation = 'High overlap - consider merging';
          
          duplicates.push({
            testId1: tests[i].id,
            testName1: tests[i].name,
            testId2: tests[j].id,
            testName2: tests[j].name,
            similarityScore: similarity,
            recommendation,
          });
        }
      }
    }
    
    duplicates.sort((a, b) => b.similarityScore - a.similarityScore);
    
    let output = `Test Deduplication Analysis\n\n`;
    output += `Unique tests: ${tests.length - duplicates.length}\n`;
    output += `Potential duplicates: ${duplicates.length} pairs\n\n`;
    if (duplicates.length > 0) {
      output += `Similar Test Pairs:\n`;
      for (const pair of duplicates) {
        output += `- "${pair.testName1}" <-> "${pair.testName2}" (${pair.similarityScore.toFixed(0)}% similar) [${pair.recommendation}]\n`;
      }
    }
    
    return { uniqueTests: tests.length, duplicates, output };
  },
};
