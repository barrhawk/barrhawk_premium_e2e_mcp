/**
 * Dynamic Tool: report_timing
 * Created: 2026-01-23T14:31:51.534Z
 * Permissions: none
 *
 * Generate a timing analysis report showing slowest/fastest tests.
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'report_timing',
  description: "Generate a timing analysis report showing slowest/fastest tests.",
  schema: {
      "type": "object",
      "properties": {
          "results": {
              "type": "object",
              "description": "Test suite results"
          },
          "sortBy": {
              "type": "string",
              "enum": [
                  "name",
                  "duration",
                  "status"
              ],
              "default": "duration"
          },
          "showSlowest": {
              "type": "number",
              "description": "Number of slowest tests to show. Default: 5",
              "default": 5
          }
      },
      "required": [
          "results"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const results = args.results as {tests: Array<{name: string, status: string, duration: number}>};
    const sortBy = (args.sortBy as string) || 'duration';
    const showSlowest = (args.showSlowest as number) || 5;
    
    const tests = [...(results.tests || [])];
    const totalDuration = tests.reduce((sum, t) => sum + (t.duration || 0), 0);
    const avgDuration = tests.length > 0 ? totalDuration / tests.length : 0;
    
    // Sort
    if (sortBy === 'duration') tests.sort((a, b) => (b.duration || 0) - (a.duration || 0));
    else if (sortBy === 'name') tests.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'status') tests.sort((a, b) => a.status.localeCompare(b.status));
    
    const slowest = tests.slice(0, showSlowest);
    const fastest = [...tests].sort((a, b) => (a.duration || 0) - (b.duration || 0)).slice(0, 3);
    
    let output = `Timing Analysis\n${'='.repeat(40)}\n\n`;
    output += `Total Duration: ${(totalDuration / 1000).toFixed(2)}s\n`;
    output += `Average Duration: ${avgDuration.toFixed(0)}ms\n`;
    output += `Test Count: ${tests.length}\n\n`;
    
    output += `Slowest ${showSlowest} Tests:\n`;
    for (let i = 0; i < slowest.length; i++) {
      const t = slowest[i];
      const pct = totalDuration > 0 ? ((t.duration / totalDuration) * 100).toFixed(1) : '0';
      output += `  ${i + 1}. ${t.name}: ${t.duration}ms (${pct}% of total)\n`;
    }
    
    output += `\nFastest 3 Tests:\n`;
    for (let i = 0; i < fastest.length; i++) {
      const t = fastest[i];
      output += `  ${i + 1}. ${t.name}: ${t.duration}ms\n`;
    }
    
    return { output, totalDuration, avgDuration, slowest, fastest };
  },
};
