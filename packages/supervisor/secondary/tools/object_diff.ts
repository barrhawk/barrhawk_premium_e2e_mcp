/**
 * Dynamic Tool: object_diff
 * Created: 2026-01-23T14:34:02.033Z
 * Permissions: none
 *
 * Compare two objects and show differences (added, removed, changed keys).
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'object_diff',
  description: "Compare two objects and show differences (added, removed, changed keys).",
  schema: {
      "type": "object",
      "properties": {
          "expected": {
              "type": "object",
              "description": "Expected object"
          },
          "actual": {
              "type": "object",
              "description": "Actual object"
          },
          "deep": {
              "type": "boolean",
              "description": "Deep comparison. Default: true",
              "default": true
          }
      },
      "required": [
          "expected",
          "actual"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const expected = args.expected as Record<string, unknown>;
    const actual = args.actual as Record<string, unknown>;
    const deep = args.deep !== false;
    
    interface Diff {
      path: string;
      type: 'added' | 'removed' | 'changed';
      expected?: unknown;
      actual?: unknown;
    }
    
    const diffs: Diff[] = [];
    
    function compare(exp: unknown, act: unknown, path: string): void {
      if (exp === act) return;
      
      if (typeof exp !== typeof act || exp === null || act === null) {
        diffs.push({ path, type: 'changed', expected: exp, actual: act });
        return;
      }
      
      if (typeof exp !== 'object') {
        diffs.push({ path, type: 'changed', expected: exp, actual: act });
        return;
      }
      
      if (Array.isArray(exp) !== Array.isArray(act)) {
        diffs.push({ path, type: 'changed', expected: exp, actual: act });
        return;
      }
      
      const expObj = exp as Record<string, unknown>;
      const actObj = act as Record<string, unknown>;
      const allKeys = new Set([...Object.keys(expObj), ...Object.keys(actObj)]);
      
      for (const key of allKeys) {
        const newPath = path ? `${path}.${key}` : key;
        
        if (!(key in expObj)) {
          diffs.push({ path: newPath, type: 'added', actual: actObj[key] });
        } else if (!(key in actObj)) {
          diffs.push({ path: newPath, type: 'removed', expected: expObj[key] });
        } else if (deep) {
          compare(expObj[key], actObj[key], newPath);
        } else if (expObj[key] !== actObj[key]) {
          diffs.push({ path: newPath, type: 'changed', expected: expObj[key], actual: actObj[key] });
        }
      }
    }
    
    compare(expected, actual, '');
    
    const identical = diffs.length === 0;
    const added = diffs.filter(d => d.type === 'added');
    const removed = diffs.filter(d => d.type === 'removed');
    const changed = diffs.filter(d => d.type === 'changed');
    
    let output = identical ? 'Objects are identical' : `Found ${diffs.length} difference(s):\n`;
    if (added.length) output += `\nAdded (${added.length}):\n${added.map(d => `  + ${d.path}: ${JSON.stringify(d.actual)}`).join('\n')}`;
    if (removed.length) output += `\nRemoved (${removed.length}):\n${removed.map(d => `  - ${d.path}: ${JSON.stringify(d.expected)}`).join('\n')}`;
    if (changed.length) output += `\nChanged (${changed.length}):\n${changed.map(d => `  ~ ${d.path}: ${JSON.stringify(d.expected)} -> ${JSON.stringify(d.actual)}`).join('\n')}`;
    
    return { identical, diffs, added: added.length, removed: removed.length, changed: changed.length, output };
  },
};
