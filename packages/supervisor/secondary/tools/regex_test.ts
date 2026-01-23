/**
 * Dynamic Tool: regex_test
 * Created: 2026-01-23T14:32:48.482Z
 * Permissions: none
 *
 * Test a regular expression against text and extract matches.
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'regex_test',
  description: "Test a regular expression against text and extract matches.",
  schema: {
      "type": "object",
      "properties": {
          "pattern": {
              "type": "string",
              "description": "Regular expression pattern"
          },
          "text": {
              "type": "string",
              "description": "Text to test against"
          },
          "flags": {
              "type": "string",
              "description": "Regex flags (g, i, m, etc). Default: g",
              "default": "g"
          }
      },
      "required": [
          "pattern",
          "text"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const pattern = args.pattern as string;
    const text = args.text as string;
    const flags = (args.flags as string) || 'g';
    
    let matches: string[] = [];
    let groups: Array<Record<string, string>> = [];
    let valid = true;
    let error: string | undefined;
    
    try {
      const regex = new RegExp(pattern, flags);
      const allMatches = [...text.matchAll(new RegExp(pattern, flags.includes('g') ? flags : flags + 'g'))];
      
      matches = allMatches.map(m => m[0]);
      groups = allMatches.map(m => {
        const g: Record<string, string> = { full: m[0] };
        if (m.groups) Object.assign(g, m.groups);
        for (let i = 1; i < m.length; i++) {
          g[`group${i}`] = m[i];
        }
        return g;
      });
    } catch (e) {
      valid = false;
      error = (e as Error).message;
    }
    
    const hasMatch = matches.length > 0;
    
    let output = valid 
      ? (hasMatch ? `Found ${matches.length} match(es):\n${matches.map((m, i) => `  ${i + 1}. "${m}"`).join('\n')}` : 'No matches found')
      : `Invalid regex: ${error}`;
    
    return { valid, hasMatch, matchCount: matches.length, matches, groups, output };
  },
};
