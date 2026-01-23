/**
 * Dynamic Tool: env_info
 * Created: 2026-01-23T14:32:50.328Z
 * Permissions: none
 *
 * Get environment information (OS, runtime, memory, uptime).
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'env_info',
  description: "Get environment information (OS, runtime, memory, uptime).",
  schema: {
      "type": "object",
      "properties": {},
      "required": []
  },

  async handler(args: Record<string, unknown>) {
    const mem = process.memoryUsage();
    
    return {
      runtime: {
        name: typeof Bun !== 'undefined' ? 'Bun' : 'Node.js',
        version: typeof Bun !== 'undefined' ? Bun.version : process.version,
      },
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      uptime: Math.floor(process.uptime()),
      cwd: process.cwd(),
      memory: {
        heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        rss: `${(mem.rss / 1024 / 1024).toFixed(2)} MB`,
      },
      timestamp: new Date().toISOString(),
    };
  },
};
