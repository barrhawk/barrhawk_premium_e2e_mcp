/**
 * MCP Orchestration Tools
 *
 * Hub capabilities for routing, aggregating, and coordinating MCPs
 */

import { spawn, ChildProcess } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface MCPInstance {
  id: string;
  name: string;
  command: string;
  args: string[];
  process?: ChildProcess;
  client?: Client;
  tools: string[];
  status: 'starting' | 'ready' | 'error' | 'stopped';
  registeredAt: Date;
  lastHealthCheck?: Date;
  healthStatus?: 'healthy' | 'unhealthy' | 'unknown';
  metadata?: Record<string, any>;
}

// Registry of connected MCPs
const mcpRegistry: Map<string, MCPInstance> = new Map();

// Route cache for intent → MCP mapping
const routeCache: Map<string, string[]> = new Map();

// =============================================================================
// MCP DISCOVERY & REGISTRATION
// =============================================================================

export async function handleMcpDiscover(args: {
  searchPaths?: string[];
  configFile?: string;
}): Promise<object> {
  const discovered: any[] = [];

  try {
    // Check common MCP config locations
    const configPaths = args.searchPaths || [
      `${process.env.HOME}/.config/claude/claude_desktop_config.json`,
      `${process.env.HOME}/.mcp/config.json`,
      './mcp.json',
    ];

    for (const configPath of configPaths) {
      try {
        const fs = await import('fs/promises');
        const content = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(content);

        if (config.mcpServers) {
          for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
            discovered.push({
              name,
              config: serverConfig,
              source: configPath,
            });
          }
        }
      } catch {
        // File doesn't exist or isn't valid, skip
      }
    }

    return {
      success: true,
      discovered,
      count: discovered.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleMcpRegister(args: {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  metadata?: Record<string, any>;
  autoStart?: boolean;
}): Promise<object> {
  const id = `mcp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  try {
    const instance: MCPInstance = {
      id,
      name: args.name,
      command: args.command,
      args: args.args || [],
      tools: [],
      status: 'starting',
      registeredAt: new Date(),
      metadata: args.metadata,
    };

    if (args.autoStart !== false) {
      // Start the MCP process
      const proc = spawn(args.command, args.args || [], {
        env: { ...process.env, ...args.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      instance.process = proc;

      // Connect via MCP SDK
      const transport = new StdioClientTransport({
        command: args.command,
        args: args.args,
        env: args.env,
      });

      const client = new Client({
        name: `barrhawk-hub-${args.name}`,
        version: '1.0.0',
      }, {
        capabilities: {},
      });

      await client.connect(transport);
      instance.client = client;

      // Get available tools
      const toolsResult = await client.listTools();
      instance.tools = toolsResult.tools.map(t => t.name);
      instance.status = 'ready';
    }

    mcpRegistry.set(id, instance);

    return {
      success: true,
      id,
      name: args.name,
      tools: instance.tools,
      status: instance.status,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleMcpUnregister(args: {
  id: string;
}): Promise<object> {
  try {
    const instance = mcpRegistry.get(args.id);
    if (!instance) {
      throw new Error(`No MCP registered with id: ${args.id}`);
    }

    // Stop process if running
    if (instance.process) {
      instance.process.kill();
    }

    // Close client connection
    if (instance.client) {
      await instance.client.close();
    }

    mcpRegistry.delete(args.id);

    return {
      success: true,
      id: args.id,
      name: instance.name,
      unregistered: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleMcpList(args: {}): Promise<object> {
  const instances = Array.from(mcpRegistry.values()).map(inst => ({
    id: inst.id,
    name: inst.name,
    status: inst.status,
    tools: inst.tools.length,
    healthStatus: inst.healthStatus,
    registeredAt: inst.registeredAt.toISOString(),
    lastHealthCheck: inst.lastHealthCheck?.toISOString(),
  }));

  return {
    success: true,
    instances,
    count: instances.length,
  };
}

// =============================================================================
// ROUTING
// =============================================================================

export async function handleMcpRoute(args: {
  intent: string;
  tool?: string;
  preferredMcp?: string;
}): Promise<object> {
  try {
    // If specific tool requested, find MCPs that have it
    if (args.tool) {
      const matchingMcps: string[] = [];

      for (const [id, instance] of mcpRegistry) {
        if (instance.status === 'ready' && instance.tools.includes(args.tool)) {
          matchingMcps.push(id);
        }
      }

      // Prefer specified MCP if available
      if (args.preferredMcp && matchingMcps.includes(args.preferredMcp)) {
        return {
          success: true,
          routed: args.preferredMcp,
          tool: args.tool,
          alternatives: matchingMcps.filter(id => id !== args.preferredMcp),
        };
      }

      if (matchingMcps.length > 0) {
        return {
          success: true,
          routed: matchingMcps[0],
          tool: args.tool,
          alternatives: matchingMcps.slice(1),
        };
      }

      throw new Error(`No MCP found with tool: ${args.tool}`);
    }

    // Intent-based routing
    const intent = args.intent.toLowerCase();

    // Check cache first
    const cached = routeCache.get(intent);
    if (cached && cached.length > 0) {
      const validMcps = cached.filter(id => {
        const inst = mcpRegistry.get(id);
        return inst && inst.status === 'ready';
      });

      if (validMcps.length > 0) {
        return {
          success: true,
          routed: validMcps[0],
          fromCache: true,
          alternatives: validMcps.slice(1),
        };
      }
    }

    // Simple keyword-based routing
    const routeMap: Record<string, string[]> = {
      browser: ['playwright', 'puppeteer', 'selenium'],
      database: ['postgres', 'mysql', 'sqlite', 'redis', 'mongodb'],
      github: ['github', 'git'],
      docker: ['docker', 'container', 'kubernetes'],
      file: ['filesystem', 'fs'],
    };

    for (const [category, keywords] of Object.entries(routeMap)) {
      if (keywords.some(kw => intent.includes(kw))) {
        // Find MCPs matching this category
        const matches: string[] = [];

        for (const [id, instance] of mcpRegistry) {
          if (instance.status === 'ready') {
            if (instance.name.toLowerCase().includes(category) ||
                instance.tools.some(t => keywords.some(kw => t.toLowerCase().includes(kw)))) {
              matches.push(id);
            }
          }
        }

        if (matches.length > 0) {
          routeCache.set(intent, matches);
          return {
            success: true,
            routed: matches[0],
            category,
            alternatives: matches.slice(1),
          };
        }
      }
    }

    throw new Error(`No MCP found for intent: ${args.intent}`);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// AGGREGATION
// =============================================================================

export async function handleMcpAggregate(args: {
  tool: string;
  args: Record<string, any>;
  mcpIds?: string[];
  mode?: 'first' | 'all' | 'fastest';
}): Promise<object> {
  try {
    const mode = args.mode || 'first';
    let targetMcps: MCPInstance[] = [];

    // Get target MCPs
    if (args.mcpIds) {
      targetMcps = args.mcpIds
        .map(id => mcpRegistry.get(id))
        .filter((m): m is MCPInstance => !!m && m.status === 'ready' && m.tools.includes(args.tool));
    } else {
      // Find all MCPs with this tool
      targetMcps = Array.from(mcpRegistry.values())
        .filter(m => m.status === 'ready' && m.tools.includes(args.tool));
    }

    if (targetMcps.length === 0) {
      throw new Error(`No MCPs available with tool: ${args.tool}`);
    }

    switch (mode) {
      case 'first': {
        const mcp = targetMcps[0];
        if (!mcp.client) throw new Error('MCP not connected');

        const result = await mcp.client.callTool({
          name: args.tool,
          arguments: args.args,
        });

        return {
          success: true,
          mode: 'first',
          from: mcp.id,
          result: result.content,
        };
      }

      case 'all': {
        const results = await Promise.allSettled(
          targetMcps.map(async mcp => {
            if (!mcp.client) throw new Error('MCP not connected');
            const result = await mcp.client.callTool({
              name: args.tool,
              arguments: args.args,
            });
            return { mcpId: mcp.id, result: result.content };
          })
        );

        return {
          success: true,
          mode: 'all',
          results: results.map((r, i) => ({
            mcpId: targetMcps[i].id,
            status: r.status,
            result: r.status === 'fulfilled' ? r.value.result : undefined,
            error: r.status === 'rejected' ? r.reason.message : undefined,
          })),
        };
      }

      case 'fastest': {
        const result = await Promise.race(
          targetMcps.map(async mcp => {
            if (!mcp.client) throw new Error('MCP not connected');
            const result = await mcp.client.callTool({
              name: args.tool,
              arguments: args.args,
            });
            return { mcpId: mcp.id, result: result.content };
          })
        );

        return {
          success: true,
          mode: 'fastest',
          from: result.mcpId,
          result: result.result,
        };
      }

      default:
        throw new Error(`Unknown mode: ${mode}`);
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// HEALTH & MONITORING
// =============================================================================

export async function handleMcpHealth(args: {
  id?: string;
}): Promise<object> {
  try {
    const checkHealth = async (instance: MCPInstance): Promise<any> => {
      const health: any = {
        id: instance.id,
        name: instance.name,
        status: instance.status,
      };

      if (instance.client && instance.status === 'ready') {
        try {
          const start = Date.now();
          await instance.client.listTools();
          health.responseTime = Date.now() - start;
          health.healthStatus = 'healthy';
        } catch {
          health.healthStatus = 'unhealthy';
        }
      } else {
        health.healthStatus = 'unknown';
      }

      instance.lastHealthCheck = new Date();
      instance.healthStatus = health.healthStatus;

      return health;
    };

    if (args.id) {
      const instance = mcpRegistry.get(args.id);
      if (!instance) {
        throw new Error(`No MCP with id: ${args.id}`);
      }
      return {
        success: true,
        health: await checkHealth(instance),
      };
    }

    // Check all MCPs
    const healthResults = await Promise.all(
      Array.from(mcpRegistry.values()).map(checkHealth)
    );

    return {
      success: true,
      health: healthResults,
      summary: {
        total: healthResults.length,
        healthy: healthResults.filter(h => h.healthStatus === 'healthy').length,
        unhealthy: healthResults.filter(h => h.healthStatus === 'unhealthy').length,
        unknown: healthResults.filter(h => h.healthStatus === 'unknown').length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// FAILOVER
// =============================================================================

export async function handleMcpFailover(args: {
  tool: string;
  args: Record<string, any>;
  maxRetries?: number;
}): Promise<object> {
  const maxRetries = args.maxRetries || 3;
  const errors: string[] = [];

  try {
    // Get all MCPs with this tool, sorted by health
    const candidates = Array.from(mcpRegistry.values())
      .filter(m => m.status === 'ready' && m.tools.includes(args.tool))
      .sort((a, b) => {
        if (a.healthStatus === 'healthy' && b.healthStatus !== 'healthy') return -1;
        if (b.healthStatus === 'healthy' && a.healthStatus !== 'healthy') return 1;
        return 0;
      });

    for (let i = 0; i < Math.min(maxRetries, candidates.length); i++) {
      const mcp = candidates[i];

      try {
        if (!mcp.client) continue;

        const result = await mcp.client.callTool({
          name: args.tool,
          arguments: args.args,
        });

        return {
          success: true,
          from: mcp.id,
          attempt: i + 1,
          result: result.content,
          failedAttempts: errors,
        };
      } catch (e) {
        errors.push(`${mcp.id}: ${e instanceof Error ? e.message : String(e)}`);
        mcp.healthStatus = 'unhealthy';
      }
    }

    throw new Error(`All ${errors.length} attempts failed`);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      failedAttempts: errors,
    };
  }
}

// =============================================================================
// LOAD BALANCING
// =============================================================================

let roundRobinIndex: Record<string, number> = {};

export async function handleMcpLoadBalance(args: {
  tool: string;
  args: Record<string, any>;
  strategy?: 'round-robin' | 'least-loaded' | 'random';
}): Promise<object> {
  const strategy = args.strategy || 'round-robin';

  try {
    const candidates = Array.from(mcpRegistry.values())
      .filter(m => m.status === 'ready' && m.tools.includes(args.tool) && m.healthStatus !== 'unhealthy');

    if (candidates.length === 0) {
      throw new Error(`No healthy MCPs available with tool: ${args.tool}`);
    }

    let selected: MCPInstance;

    switch (strategy) {
      case 'round-robin': {
        const key = args.tool;
        roundRobinIndex[key] = ((roundRobinIndex[key] || 0) + 1) % candidates.length;
        selected = candidates[roundRobinIndex[key]];
        break;
      }

      case 'random': {
        selected = candidates[Math.floor(Math.random() * candidates.length)];
        break;
      }

      case 'least-loaded': {
        // For now, just pick first (would need metrics for real least-loaded)
        selected = candidates[0];
        break;
      }

      default:
        throw new Error(`Unknown strategy: ${strategy}`);
    }

    if (!selected.client) {
      throw new Error('Selected MCP not connected');
    }

    const result = await selected.client.callTool({
      name: args.tool,
      arguments: args.args,
    });

    return {
      success: true,
      strategy,
      from: selected.id,
      candidates: candidates.length,
      result: result.content,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// TOOL CATALOG
// =============================================================================

export async function handleMcpCatalog(args: {
  category?: string;
  search?: string;
}): Promise<object> {
  try {
    const catalog: any[] = [];

    for (const [id, instance] of mcpRegistry) {
      if (instance.status !== 'ready') continue;

      for (const tool of instance.tools) {
        const entry = {
          tool,
          mcpId: id,
          mcpName: instance.name,
        };

        if (args.search) {
          if (tool.toLowerCase().includes(args.search.toLowerCase())) {
            catalog.push(entry);
          }
        } else {
          catalog.push(entry);
        }
      }
    }

    return {
      success: true,
      catalog,
      count: catalog.length,
      mcpCount: mcpRegistry.size,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
