/**
 * Dynamic Tool: assert_range
 * Created: 2026-01-23T14:33:28.018Z
 * Permissions: none
 *
 * Assert that a number is within a specified range.
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'assert_range',
  description: "Assert that a number is within a specified range.",
  schema: {
      "type": "object",
      "properties": {
          "value": {
              "type": "number",
              "description": "Number to check"
          },
          "min": {
              "type": "number",
              "description": "Minimum value (inclusive)"
          },
          "max": {
              "type": "number",
              "description": "Maximum value (inclusive)"
          },
          "message": {
              "type": "string",
              "description": "Optional custom message"
          }
      },
      "required": [
          "value",
          "min",
          "max"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const value = args.value as number;
    const min = args.min as number;
    const max = args.max as number;
    const message = args.message as string | undefined;
    
    const passed = value >= min && value <= max;
    const icon = passed ? '✅' : '❌';
    
    let output = `${icon} Assert Range: ${passed ? 'PASSED' : 'FAILED'}`;
    if (message) output += `\n   ${message}`;
    output += `\n   Value: ${value}`;
    output += `\n   Range: [${min}, ${max}]`;
    if (!passed) {
      if (value < min) output += `\n   ${value} is below minimum ${min}`;
      if (value > max) output += `\n   ${value} is above maximum ${max}`;
    }
    
    return { passed, value, min, max, output };
  },
};
