/**
 * Dynamic Tool: mcp_test_tool
 * Created: 2026-01-24T10:13:08.710Z
 * Permissions: none
 *
 * A tool created via MCP protocol test
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'mcp_test_tool',
  description: "A tool created via MCP protocol test",
  schema: {
      "type": "object",
      "properties": {
          "x": {
              "type": "number",
              "description": "First number"
          },
          "y": {
              "type": "number",
              "description": "Second number"
          }
      },
      "required": [
          "x",
          "y"
      ]
  },

  async handler(args: Record<string, unknown>) {
    return { sum: (args.x as number) + (args.y as number) };
  },
};
