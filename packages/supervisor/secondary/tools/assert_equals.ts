/**
 * Dynamic Tool: assert_equals
 * Created: 2026-01-23T14:29:22.222Z
 * Permissions: none
 *
 * Assert that two values are equal. Supports strict/loose equality and deep object comparison.
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'assert_equals',
  description: "Assert that two values are equal. Supports strict/loose equality and deep object comparison.",
  schema: {
      "type": "object",
      "properties": {
          "actual": {
              "description": "The actual value to compare"
          },
          "expected": {
              "description": "The expected value"
          },
          "message": {
              "type": "string",
              "description": "Optional custom message"
          },
          "strict": {
              "type": "boolean",
              "description": "Use strict equality (===) instead of loose (==). Default: true",
              "default": true
          }
      },
      "required": [
          "actual",
          "expected"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const actual = args.actual;
    const expected = args.expected;
    const message = args.message as string | undefined;
    const strict = args.strict !== false;
    
    function deepEqual(a: unknown, b: unknown): boolean {
      if (a === b) return true;
      if (typeof a !== typeof b) return false;
      if (a === null || b === null) return a === b;
      if (typeof a !== 'object') return strict ? a === b : a == b;
      
      const aObj = a as Record<string, unknown>;
      const bObj = b as Record<string, unknown>;
      const aKeys = Object.keys(aObj);
      const bKeys = Object.keys(bObj);
      
      if (aKeys.length !== bKeys.length) return false;
      return aKeys.every(key => deepEqual(aObj[key], bObj[key]));
    }
    
    const passed = deepEqual(actual, expected);
    const icon = passed ? '✅' : '❌';
    const status = passed ? 'PASSED' : 'FAILED';
    
    let result = `${icon} Assert Equals: ${status}`;
    if (message) result += `\n   ${message}`;
    if (!passed) {
      result += `\n   Expected: ${JSON.stringify(expected)}`;
      result += `\n   Actual:   ${JSON.stringify(actual)}`;
    }
    
    return { passed, message: result };
  },
};
