/**
 * Dynamic Tool: array_operations
 * Created: 2026-01-23T14:34:36.481Z
 * Permissions: none
 *
 * Perform common array operations (unique, flatten, chunk, intersection, difference, union).
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'array_operations',
  description: "Perform common array operations (unique, flatten, chunk, intersection, difference, union).",
  schema: {
      "type": "object",
      "properties": {
          "operation": {
              "type": "string",
              "enum": [
                  "unique",
                  "flatten",
                  "chunk",
                  "intersection",
                  "difference",
                  "union",
                  "shuffle",
                  "reverse",
                  "sort"
              ],
              "description": "Operation to perform"
          },
          "array": {
              "type": "array",
              "description": "Primary array"
          },
          "array2": {
              "type": "array",
              "description": "Second array (for intersection, difference, union)"
          },
          "chunkSize": {
              "type": "number",
              "description": "Size for chunk operation. Default: 2",
              "default": 2
          }
      },
      "required": [
          "operation",
          "array"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const op = args.operation as string;
    const arr = args.array as unknown[];
    const arr2 = (args.array2 as unknown[]) || [];
    const chunkSize = (args.chunkSize as number) || 2;
    
    let result: unknown;
    
    switch (op) {
      case 'unique':
        result = [...new Set(arr)];
        break;
      case 'flatten':
        result = arr.flat(Infinity);
        break;
      case 'chunk':
        result = [];
        for (let i = 0; i < arr.length; i += chunkSize) {
          (result as unknown[]).push(arr.slice(i, i + chunkSize));
        }
        break;
      case 'intersection':
        const set2 = new Set(arr2.map(x => JSON.stringify(x)));
        result = arr.filter(x => set2.has(JSON.stringify(x)));
        break;
      case 'difference':
        const diffSet = new Set(arr2.map(x => JSON.stringify(x)));
        result = arr.filter(x => !diffSet.has(JSON.stringify(x)));
        break;
      case 'union':
        result = [...new Set([...arr, ...arr2].map(x => JSON.stringify(x)))].map(x => JSON.parse(x));
        break;
      case 'shuffle':
        result = [...arr].sort(() => Math.random() - 0.5);
        break;
      case 'reverse':
        result = [...arr].reverse();
        break;
      case 'sort':
        result = [...arr].sort((a, b) => String(a).localeCompare(String(b)));
        break;
      default:
        return { error: `Unknown operation: ${op}` };
    }
    
    return { operation: op, inputLength: arr.length, outputLength: Array.isArray(result) ? result.length : 1, result };
  },
};
