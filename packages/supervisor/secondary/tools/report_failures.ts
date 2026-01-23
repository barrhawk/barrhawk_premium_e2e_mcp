/**
 * Dynamic Tool: report_failures
 * Created: 2026-01-23T14:31:50.955Z
 * Permissions: none
 *
 * Generate a detailed failure report.
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'report_failures',
  description: "Generate a detailed failure report.",
  schema: {
      "type": "object",
      "properties": {
          "results": {
              "type": "object",
              "description": "Test suite results"
          },
          "includeScreenshots": {
              "type": "boolean",
              "description": "Include screenshot paths. Default: false",
              "default": false
          },
          "format": {
              "type": "string",
              "enum": [
                  "text",
                  "markdown",
                  "json"
              ],
              "default": "text"
          }
      },
      "required": [
          "results"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const results = args.results as {tests: Array<{name: string, status: string, duration: number, error?: string, screenshot?: string}>};
    const includeScreenshots = args.includeScreenshots === true;
    const format = (args.format as string) || 'text';
    
    const failures = (results.tests || []).filter(t => t.status === 'failed');
    
    if (failures.length === 0) {
      return { output: 'No failures to report!', failures: [] };
    }
    
    let output: string;
    
    if (format === 'json') {
      output = JSON.stringify({ failureCount: failures.length, failures: failures.map(f => ({
        name: f.name,
        error: f.error,
        duration: f.duration,
        screenshot: includeScreenshots ? f.screenshot : undefined,
      })) }, null, 2);
    } else if (format === 'markdown') {
      output = `# Failure Report\n\n`;
      output += `**${failures.length} test(s) failed**\n\n`;
      for (const f of failures) {
        output += `## ${f.name}\n\n`;
        output += `- **Duration:** ${f.duration}ms\n`;
        output += `- **Error:** \`${f.error || 'Unknown error'}\`\n`;
        if (includeScreenshots && f.screenshot) output += `- **Screenshot:** ${f.screenshot}\n`;
        output += '\n';
      }
    } else {
      output = `Failure Report\n${'='.repeat(40)}\n\n`;
      output += `${failures.length} test(s) failed:\n\n`;
      for (const f of failures) {
        output += `[FAILED] ${f.name}\n`;
        output += `  Duration: ${f.duration}ms\n`;
        output += `  Error: ${f.error || 'Unknown error'}\n`;
        if (includeScreenshots && f.screenshot) output += `  Screenshot: ${f.screenshot}\n`;
        output += '\n';
      }
    }
    
    return { output, failureCount: failures.length, failures };
  },
};
