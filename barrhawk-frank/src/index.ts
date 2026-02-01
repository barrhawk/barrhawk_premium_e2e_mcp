#!/usr/bin/env node
/**
 * BARRHAWK-FRANK - Dynamic Tool Creation MCP Server
 *
 * The Frankenstein of BarrHawk - creates new tools on the fly, hot reloads them,
 * and saves successful ones for future use. Used by Doctor to create tools
 * when Igor fails and needs new capabilities.
 *
 * Load this in Claude Code as barrhawk-frank to get dynamic tool creation.
 */

// Protocol safety: redirect console.log to stderr
const originalLog = console.log;
console.log = (...args) => console.error(...args);

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { toolRegistry, ToolSchema } from './dynamic-tools.js';

// =============================================================================
// MCP Tool Definitions
// =============================================================================

const FRANK_TOOLS: Tool[] = [
  {
    name: 'frank_create_tool',
    description: `Create a new dynamic tool at runtime. The tool will be immediately available for use.

IMPORTANT: The code you provide becomes the body of an async function with this signature:
  async function toolName(params, ctx) {
    const { log, fetch, sleep, exec } = ctx;
    // YOUR CODE HERE - must return a value
  }

Available in ctx:
- log(...args): Log messages (to stderr)
- fetch: Standard fetch API
- sleep(ms): Wait for milliseconds
- exec(cmd): Execute shell command, returns { stdout, stderr, exitCode }

Example code for a tool that fetches a URL:
  const response = await fetch(params.url);
  const text = await response.text();
  return { status: response.status, body: text.slice(0, 500) };

Example code for a tool that runs a shell command:
  const { stdout, stderr, exitCode } = await exec(params.command);
  return { stdout, stderr, exitCode };`,
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Unique name for the tool (alphanumeric and underscores only)',
        },
        description: {
          type: 'string',
          description: 'What the tool does - shown to users',
        },
        code: {
          type: 'string',
          description: 'JavaScript/TypeScript code - becomes body of async function with params and ctx',
        },
        inputSchema: {
          type: 'object',
          description: 'JSON Schema for tool parameters. Must have type: "object" and properties.',
        },
      },
      required: ['name', 'description', 'code', 'inputSchema'],
    },
  },
  {
    name: 'frank_invoke_tool',
    description: 'Invoke a dynamic tool by name or ID. Pass any parameters the tool requires.',
    inputSchema: {
      type: 'object',
      properties: {
        tool: {
          type: 'string',
          description: 'Tool name or ID to invoke',
        },
        params: {
          type: 'object',
          description: 'Parameters to pass to the tool',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 30000)',
        },
      },
      required: ['tool'],
    },
  },
  {
    name: 'frank_update_tool',
    description: 'Hot reload a tool with new code. The updated tool is immediately available.',
    inputSchema: {
      type: 'object',
      properties: {
        tool: {
          type: 'string',
          description: 'Tool name or ID to update',
        },
        code: {
          type: 'string',
          description: 'New code for the tool',
        },
      },
      required: ['tool', 'code'],
    },
  },
  {
    name: 'frank_delete_tool',
    description: 'Delete a dynamic tool. If it was saved, removes it from storage too.',
    inputSchema: {
      type: 'object',
      properties: {
        tool: {
          type: 'string',
          description: 'Tool name or ID to delete',
        },
      },
      required: ['tool'],
    },
  },
  {
    name: 'frank_list_tools',
    description: 'List all dynamic tools with their status and stats.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['all', 'experimental', 'stable', 'saved'],
          description: 'Filter by status (default: all)',
        },
      },
    },
  },
  {
    name: 'frank_save_tool',
    description: 'Save a tool permanently for use in future sessions. Saved tools are loaded automatically on startup.',
    inputSchema: {
      type: 'object',
      properties: {
        tool: {
          type: 'string',
          description: 'Tool name or ID to save',
        },
      },
      required: ['tool'],
    },
  },
  {
    name: 'frank_get_tool',
    description: 'Get detailed information about a specific tool including its code.',
    inputSchema: {
      type: 'object',
      properties: {
        tool: {
          type: 'string',
          description: 'Tool name or ID to get',
        },
      },
      required: ['tool'],
    },
  },
  {
    name: 'frank_stats',
    description: 'Get overall statistics about the dynamic tool system.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'frank_logs',
    description: 'Get recent logs from tool operations.',
    inputSchema: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Number of log entries to return (default: 50)',
        },
      },
    },
  },
  {
    name: 'frank_save_candidates',
    description: 'Get tools that are good candidates for saving (stable, frequently used, high success rate).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// =============================================================================
// Tool Handlers
// =============================================================================

async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    let result: unknown;

    switch (name) {
      case 'frank_create_tool': {
        const { name: toolName, description, code, inputSchema } = args as {
          name: string;
          description: string;
          code: string;
          inputSchema: ToolSchema;
        };

        // Validate name
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(toolName)) {
          throw new Error('Tool name must start with letter/underscore, contain only alphanumeric and underscores');
        }

        const tool = await toolRegistry.create({
          name: toolName,
          description,
          code,
          inputSchema,
          author: 'claude',
        });

        result = {
          success: true,
          message: `Tool '${tool.name}' created successfully`,
          tool: {
            id: tool.id,
            name: tool.name,
            status: tool.status,
          },
          hint: `Use frank_invoke_tool with tool: "${tool.name}" to test it`,
        };
        break;
      }

      case 'frank_invoke_tool': {
        const { tool, params = {}, timeout = 30000 } = args as {
          tool: string;
          params?: Record<string, unknown>;
          timeout?: number;
        };

        result = await toolRegistry.invoke(tool, params, timeout);
        break;
      }

      case 'frank_update_tool': {
        const { tool, code } = args as { tool: string; code: string };
        const updated = await toolRegistry.update(tool, code);

        result = {
          success: true,
          message: `Tool '${updated.name}' updated successfully`,
          tool: {
            id: updated.id,
            name: updated.name,
            updatedAt: updated.updatedAt,
          },
        };
        break;
      }

      case 'frank_delete_tool': {
        const { tool } = args as { tool: string };
        const deleted = toolRegistry.delete(tool);

        result = {
          success: deleted,
          message: deleted ? `Tool '${tool}' deleted` : `Tool '${tool}' not found`,
        };
        break;
      }

      case 'frank_list_tools': {
        const { status = 'all' } = args as { status?: string };
        let tools = toolRegistry.list();

        if (status !== 'all') {
          tools = tools.filter(t => t.status === status);
        }

        result = {
          tools: tools.map(t => ({
            id: t.id,
            name: t.name,
            description: t.description,
            status: t.status,
            invocations: t.invocations,
            successRate: t.invocations > 0
              ? `${((t.successes / t.invocations) * 100).toFixed(1)}%`
              : 'N/A',
            lastUsed: t.lastUsed || 'Never',
            lastError: t.lastError,
          })),
          count: tools.length,
        };
        break;
      }

      case 'frank_save_tool': {
        const { tool } = args as { tool: string };
        const saved = toolRegistry.save(tool);

        result = {
          success: true,
          message: `Tool '${saved.name}' saved permanently`,
          tool: {
            id: saved.id,
            name: saved.name,
            savedAt: saved.savedAt,
          },
        };
        break;
      }

      case 'frank_get_tool': {
        const { tool } = args as { tool: string };
        const found = toolRegistry.get(tool);

        if (!found) {
          result = { success: false, error: `Tool '${tool}' not found` };
        } else {
          result = {
            id: found.id,
            name: found.name,
            description: found.description,
            code: found.code,
            inputSchema: found.inputSchema,
            status: found.status,
            author: found.author,
            createdAt: found.createdAt,
            updatedAt: found.updatedAt,
            invocations: found.invocations,
            successes: found.successes,
            failures: found.failures,
            successRate: found.invocations > 0
              ? `${((found.successes / found.invocations) * 100).toFixed(1)}%`
              : 'N/A',
            lastUsed: found.lastUsed,
            lastError: found.lastError,
            savedAt: found.savedAt,
          };
        }
        break;
      }

      case 'frank_stats': {
        result = toolRegistry.getStats();
        break;
      }

      case 'frank_logs': {
        const { count = 50 } = args as { count?: number };
        result = {
          logs: toolRegistry.getLogs(count),
        };
        break;
      }

      case 'frank_save_candidates': {
        const candidates = toolRegistry.getSaveCandidates();
        result = {
          candidates: candidates.map(t => ({
            id: t.id,
            name: t.name,
            description: t.description,
            invocations: t.invocations,
            successRate: `${((t.successes / t.invocations) * 100).toFixed(1)}%`,
          })),
          count: candidates.length,
          hint: candidates.length > 0
            ? 'Use frank_save_tool to save these tools permanently'
            : 'No tools ready for saving yet. Tools need 3+ invocations with 80%+ success rate.',
        };
        break;
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: message }, null, 2),
      }],
    };
  }
}

// =============================================================================
// MCP Server Setup
// =============================================================================

async function main() {
  console.error('[barrhawk-frank] Starting MCP server...');

  const server = new Server(
    {
      name: 'barrhawk-frank',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: FRANK_TOOLS };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    return handleToolCall(name, args as Record<string, unknown>);
  });

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const stats = toolRegistry.getStats();
  console.error(`[barrhawk-frank] Ready. ${stats.totalTools} tools loaded (${stats.saved} saved)`);
  console.error(`[barrhawk-frank] Tools dir: ${stats.toolsDir}`);
}

main().catch((error) => {
  console.error('[barrhawk-frank] Fatal error:', error);
  process.exit(1);
});
