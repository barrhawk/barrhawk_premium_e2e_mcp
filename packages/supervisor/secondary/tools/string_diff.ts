/**
 * Dynamic Tool: string_diff
 * Created: 2026-01-23T14:32:19.105Z
 * Permissions: none
 *
 * Compare two strings and show differences line by line.
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'string_diff',
  description: "Compare two strings and show differences line by line.",
  schema: {
      "type": "object",
      "properties": {
          "expected": {
              "type": "string",
              "description": "Expected string"
          },
          "actual": {
              "type": "string",
              "description": "Actual string"
          },
          "context": {
              "type": "number",
              "description": "Lines of context around changes. Default: 3",
              "default": 3
          }
      },
      "required": [
          "expected",
          "actual"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const expected = (args.expected as string).split('\n');
    const actual = (args.actual as string).split('\n');
    const context = (args.context as number) || 3;
    
    const diff: Array<{line: number, type: 'same' | 'added' | 'removed', content: string}> = [];
    const maxLen = Math.max(expected.length, actual.length);
    
    for (let i = 0; i < maxLen; i++) {
      const exp = expected[i];
      const act = actual[i];
      
      if (exp === act) {
        diff.push({ line: i + 1, type: 'same', content: exp || '' });
      } else if (exp === undefined) {
        diff.push({ line: i + 1, type: 'added', content: act });
      } else if (act === undefined) {
        diff.push({ line: i + 1, type: 'removed', content: exp });
      } else {
        diff.push({ line: i + 1, type: 'removed', content: exp });
        diff.push({ line: i + 1, type: 'added', content: act });
      }
    }
    
    const changes = diff.filter(d => d.type !== 'same');
    const identical = changes.length === 0;
    
    let output = identical ? 'Strings are identical\n' : `Found ${changes.length} difference(s):\n\n`;
    
    if (!identical) {
      let lastPrinted = -context - 1;
      for (let i = 0; i < diff.length; i++) {
        const d = diff[i];
        if (d.type !== 'same') {
          // Print context before
          for (let j = Math.max(lastPrinted + 1, i - context); j < i; j++) {
            if (diff[j].type === 'same') output += `  ${diff[j].line}: ${diff[j].content}\n`;
          }
          // Print change
          const prefix = d.type === 'added' ? '+ ' : '- ';
          output += `${prefix}${d.line}: ${d.content}\n`;
          lastPrinted = i;
        } else if (i <= lastPrinted + context) {
          output += `  ${d.line}: ${d.content}\n`;
          lastPrinted = i;
        }
      }
    }
    
    return { identical, changeCount: changes.length, output };
  },
};
