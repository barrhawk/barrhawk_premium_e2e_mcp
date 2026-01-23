/**
 * Dynamic Tool: assert_contains
 * Created: 2026-01-23T14:29:22.607Z
 * Permissions: none
 *
 * Assert that a string contains a substring.
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'assert_contains',
  description: "Assert that a string contains a substring.",
  schema: {
      "type": "object",
      "properties": {
          "text": {
              "type": "string",
              "description": "The text to search in"
          },
          "substring": {
              "type": "string",
              "description": "The substring to find"
          },
          "caseSensitive": {
              "type": "boolean",
              "description": "Case sensitive search. Default: false",
              "default": false
          },
          "message": {
              "type": "string",
              "description": "Optional custom message"
          }
      },
      "required": [
          "text",
          "substring"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const text = args.text as string;
    const substring = args.substring as string;
    const caseSensitive = args.caseSensitive === true;
    const message = args.message as string | undefined;
    
    const searchText = caseSensitive ? text : text.toLowerCase();
    const searchSubstring = caseSensitive ? substring : substring.toLowerCase();
    const passed = searchText.includes(searchSubstring);
    
    const icon = passed ? '✅' : '❌';
    const status = passed ? 'PASSED' : 'FAILED';
    
    let result = `${icon} Assert Contains: ${status}`;
    if (message) result += `\n   ${message}`;
    if (!passed) {
      result += `\n   Text: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`;
      result += `\n   Expected to contain: "${substring}"`;
    }
    
    return { passed, message: result };
  },
};
