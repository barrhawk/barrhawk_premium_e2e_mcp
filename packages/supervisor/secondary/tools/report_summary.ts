/**
 * Dynamic Tool: report_summary
 * Created: 2026-01-23T14:31:49.845Z
 * Permissions: none
 *
 * Generate a test summary report with pass/fail stats.
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'report_summary',
  description: "Generate a test summary report with pass/fail stats.",
  schema: {
      "type": "object",
      "properties": {
          "results": {
              "type": "object",
              "description": "Test suite results with name, tests array, startTime, endTime"
          },
          "format": {
              "type": "string",
              "enum": [
                  "text",
                  "markdown",
                  "json"
              ],
              "description": "Output format. Default: text",
              "default": "text"
          }
      },
      "required": [
          "results"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const results = args.results as {name?: string, tests: Array<{name: string, status: string, duration: number, error?: string}>, startTime?: string, endTime?: string};
    const format = (args.format as string) || 'text';
    
    const tests = results.tests || [];
    const passed = tests.filter(t => t.status === 'passed').length;
    const failed = tests.filter(t => t.status === 'failed').length;
    const skipped = tests.filter(t => t.status === 'skipped').length;
    const total = tests.length;
    const totalDuration = tests.reduce((sum, t) => sum + (t.duration || 0), 0);
    const passRate = total > 0 ? (passed / total * 100).toFixed(1) : '0';
    
    let output: string;
    
    if (format === 'json') {
      output = JSON.stringify({ name: results.name, total, passed, failed, skipped, passRate: parseFloat(passRate), totalDuration }, null, 2);
    } else if (format === 'markdown') {
      output = `# Test Report: ${results.name || 'Unnamed Suite'}\n\n`;
      output += `| Metric | Value |\n|--------|-------|\n`;
      output += `| Total | ${total} |\n`;
      output += `| Passed | ${passed} |\n`;
      output += `| Failed | ${failed} |\n`;
      output += `| Skipped | ${skipped} |\n`;
      output += `| Pass Rate | ${passRate}% |\n`;
      output += `| Duration | ${(totalDuration / 1000).toFixed(2)}s |\n`;
    } else {
      output = `Test Report: ${results.name || 'Unnamed Suite'}\n`;
      output += `${'='.repeat(40)}\n`;
      output += `Total:     ${total}\n`;
      output += `Passed:    ${passed}\n`;
      output += `Failed:    ${failed}\n`;
      output += `Skipped:   ${skipped}\n`;
      output += `Pass Rate: ${passRate}%\n`;
      output += `Duration:  ${(totalDuration / 1000).toFixed(2)}s\n`;
      output += `${'='.repeat(40)}\n`;
      output += failed > 0 ? `Status: FAILED` : `Status: PASSED`;
    }
    
    return { output, summary: { total, passed, failed, skipped, passRate: parseFloat(passRate), totalDuration } };
  },
};
