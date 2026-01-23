/**
 * Dynamic Tool: timestamp_now
 * Created: 2026-01-23T14:26:35.014Z
 * Permissions: none
 *
 * Returns the current timestamp in various formats (ISO, Unix, human-readable)
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'timestamp_now',
  description: "Returns the current timestamp in various formats (ISO, Unix, human-readable)",
  schema: {
      "type": "object",
      "description": "Get current timestamp",
      "properties": {
          "format": {
              "type": "string",
              "description": "Output format: iso, unix, human, or all",
              "default": "all"
          }
      }
  },

  async handler(args: Record<string, unknown>) {
    const now = new Date();
    const format = (args.format as string) || 'all';
    
    const formats = {
      iso: now.toISOString(),
      unix: Math.floor(now.getTime() / 1000),
      human: now.toLocaleString(),
    };
    
    if (format === 'all') {
      return formats;
    }
    return { [format]: formats[format as keyof typeof formats] };
  },
};
