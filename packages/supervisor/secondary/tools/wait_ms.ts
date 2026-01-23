/**
 * Dynamic Tool: wait_ms
 * Created: 2026-01-23T14:33:59.208Z
 * Permissions: none
 *
 * Wait for a specified number of milliseconds. Useful for timing tests.
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'wait_ms',
  description: "Wait for a specified number of milliseconds. Useful for timing tests.",
  schema: {
      "type": "object",
      "properties": {
          "ms": {
              "type": "number",
              "description": "Milliseconds to wait. Max: 30000",
              "default": 1000
          }
      },
      "required": [
          "ms"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const ms = Math.min(Math.max((args.ms as number) || 1000, 0), 30000);
    const start = Date.now();
    await new Promise(resolve => setTimeout(resolve, ms));
    const actual = Date.now() - start;
    
    return { requested: ms, actual, drift: actual - ms };
  },
};
