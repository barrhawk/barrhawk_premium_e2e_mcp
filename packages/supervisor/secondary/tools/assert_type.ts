/**
 * Dynamic Tool: assert_type
 * Created: 2026-01-23T14:33:27.329Z
 * Permissions: none
 *
 * Assert that a value is of a specific type.
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'assert_type',
  description: "Assert that a value is of a specific type.",
  schema: {
      "type": "object",
      "properties": {
          "value": {
              "description": "Value to check"
          },
          "expectedType": {
              "type": "string",
              "enum": [
                  "string",
                  "number",
                  "boolean",
                  "object",
                  "array",
                  "null",
                  "undefined",
                  "function"
              ],
              "description": "Expected type"
          },
          "message": {
              "type": "string",
              "description": "Optional custom message"
          }
      },
      "required": [
          "value",
          "expectedType"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const value = args.value;
    const expectedType = args.expectedType as string;
    const message = args.message as string | undefined;
    
    let actualType: string;
    if (value === null) actualType = 'null';
    else if (value === undefined) actualType = 'undefined';
    else if (Array.isArray(value)) actualType = 'array';
    else actualType = typeof value;
    
    const passed = actualType === expectedType;
    const icon = passed ? '✅' : '❌';
    
    let output = `${icon} Assert Type: ${passed ? 'PASSED' : 'FAILED'}`;
    if (message) output += `\n   ${message}`;
    if (!passed) output += `\n   Expected: ${expectedType}\n   Actual: ${actualType}`;
    
    return { passed, expectedType, actualType, output };
  },
};
