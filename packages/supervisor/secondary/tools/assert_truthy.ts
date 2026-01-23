/**
 * Dynamic Tool: assert_truthy
 * Created: 2026-01-23T14:29:22.945Z
 * Permissions: none
 *
 * Assert that a value is truthy (not null, undefined, 0, empty string, or false).
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'assert_truthy',
  description: "Assert that a value is truthy (not null, undefined, 0, empty string, or false).",
  schema: {
      "type": "object",
      "properties": {
          "value": {
              "description": "The value to check"
          },
          "message": {
              "type": "string",
              "description": "Optional custom message"
          }
      },
      "required": [
          "value"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const value = args.value;
    const message = args.message as string | undefined;
    const passed = !!value;
    
    const icon = passed ? '✅' : '❌';
    const status = passed ? 'PASSED' : 'FAILED';
    
    let result = `${icon} Assert Truthy: ${status}`;
    if (message) result += `\n   ${message}`;
    if (!passed) {
      result += `\n   Value: ${JSON.stringify(value)} (${typeof value})`;
    }
    
    return { passed, message: result };
  },
};
