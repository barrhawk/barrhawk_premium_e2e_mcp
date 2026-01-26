/**
 * STABLE TOOLKIT - Igor's collection of proven tools
 *
 * These are tools that were:
 * 1. Created dynamically in Frankenstein
 * 2. Tested and proven reliable (10+ invocations, 90%+ success)
 * 3. Exported and "igorified" into stable code
 *
 * Igor can execute these directly without spawning a Frank.
 */

import { createLogger } from '../shared/logger.js';

const logger = createLogger({
  component: 'igor-toolkit',
  version: '1.0.0',
  minLevel: 'INFO',
  pretty: true,
});

// =============================================================================
// Types
// =============================================================================

export interface StableTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (params: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;

  // Metadata
  igorifiedAt: Date;
  sourceToolId: string;
  invocations: number;
  successRate: number;
}

export interface ToolContext {
  log: typeof logger;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  correlationId?: string;
  timeout: number;
}

// =============================================================================
// Built-in Tools (shipped with Igor)
// =============================================================================

const builtinTools: StableTool[] = [
  {
    name: 'wait',
    description: 'Wait for a specified duration',
    inputSchema: {
      type: 'object',
      properties: {
        ms: { type: 'number', description: 'Milliseconds to wait' },
      },
      required: ['ms'],
    },
    execute: async (params, ctx) => {
      const ms = params.ms as number;
      await ctx.sleep(ms);
      return { waited: ms };
    },
    igorifiedAt: new Date('2026-01-01'),
    sourceToolId: 'builtin',
    invocations: 0,
    successRate: 1,
  },
  {
    name: 'shell',
    description: 'Execute a shell command',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command to execute' },
      },
      required: ['command'],
    },
    execute: async (params, ctx) => {
      const command = params.command as string;
      const result = await ctx.exec(command);
      return result;
    },
    igorifiedAt: new Date('2026-01-01'),
    sourceToolId: 'builtin',
    invocations: 0,
    successRate: 1,
  },
  {
    name: 'http_request',
    description: 'Make an HTTP request',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to request' },
        method: { type: 'string', description: 'HTTP method', default: 'GET' },
        headers: { type: 'object', description: 'Request headers' },
        body: { type: 'string', description: 'Request body' },
      },
      required: ['url'],
    },
    execute: async (params, ctx) => {
      const { url, method = 'GET', headers = {}, body } = params as {
        url: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      };
      const response = await ctx.fetch(url, {
        method,
        headers,
        body: body || undefined,
      });
      const text = await response.text();
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: text,
      };
    },
    igorifiedAt: new Date('2026-01-01'),
    sourceToolId: 'builtin',
    invocations: 0,
    successRate: 1,
  },
];

// =============================================================================
// Stable Toolkit Registry
// =============================================================================

class StableToolkit {
  private tools = new Map<string, StableTool>();
  private invocationStats = new Map<string, { success: number; failure: number }>();

  constructor() {
    // Load built-in tools
    for (const tool of builtinTools) {
      this.tools.set(tool.name, tool);
      this.invocationStats.set(tool.name, { success: 0, failure: 0 });
    }
    logger.info(`Loaded ${builtinTools.length} built-in tools`);
  }

  /**
   * Register an igorified tool from Frankenstein export
   */
  registerIgorified(exported: {
    toolName: string;
    code: string;
    stats: { invocations: number; successRate: number };
  }): void {
    // For now, we'll store the code but not compile it
    // In production, this would write to disk and hot-reload
    logger.info(`Registered igorified tool: ${exported.toolName}`, {
      invocations: exported.stats.invocations,
      successRate: exported.stats.successRate,
    });

    // Create a placeholder that delegates to Frank
    // (In production, this would be compiled and run locally)
    const tool: StableTool = {
      name: exported.toolName,
      description: `Igorified tool (delegating to Frank)`,
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        throw new Error('Igorified tools not yet compiled - delegate to Frank');
      },
      igorifiedAt: new Date(),
      sourceToolId: 'igorified',
      invocations: exported.stats.invocations,
      successRate: exported.stats.successRate,
    };

    this.tools.set(tool.name, tool);
    this.invocationStats.set(tool.name, { success: 0, failure: 0 });
  }

  /**
   * Check if a tool exists in the stable toolkit
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get a tool by name
   */
  get(name: string): StableTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Execute a stable tool
   */
  async execute(
    name: string,
    params: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<{ success: boolean; result?: unknown; error?: string; duration: number }> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `Tool not found: ${name}`, duration: 0 };
    }

    const stats = this.invocationStats.get(name)!;
    const startTime = Date.now();

    try {
      const result = await Promise.race([
        tool.execute(params, ctx),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Tool timeout')), ctx.timeout)
        ),
      ]);

      stats.success++;
      const duration = Date.now() - startTime;
      return { success: true, result, duration };
    } catch (err) {
      stats.failure++;
      const duration = Date.now() - startTime;
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, duration };
    }
  }

  /**
   * List all stable tools
   */
  list(): Array<{
    name: string;
    description: string;
    isBuiltin: boolean;
    invocations: number;
    successRate: number;
  }> {
    return Array.from(this.tools.values()).map(tool => {
      const stats = this.invocationStats.get(tool.name)!;
      const total = stats.success + stats.failure;
      return {
        name: tool.name,
        description: tool.description,
        isBuiltin: tool.sourceToolId === 'builtin',
        invocations: total,
        successRate: total > 0 ? stats.success / total : 1,
      };
    });
  }

  /**
   * Get stats
   */
  getStats(): {
    totalTools: number;
    builtinTools: number;
    igorifiedTools: number;
    totalInvocations: number;
  } {
    const tools = Array.from(this.tools.values());
    let totalInvocations = 0;
    for (const stats of this.invocationStats.values()) {
      totalInvocations += stats.success + stats.failure;
    }

    return {
      totalTools: tools.length,
      builtinTools: tools.filter(t => t.sourceToolId === 'builtin').length,
      igorifiedTools: tools.filter(t => t.sourceToolId !== 'builtin').length,
      totalInvocations,
    };
  }
}

// =============================================================================
// Context Factory
// =============================================================================

export function createToolContext(options: {
  correlationId?: string;
  timeout?: number;
}): ToolContext {
  return {
    log: logger,
    fetch: globalThis.fetch,
    sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
    exec: async (cmd: string) => {
      const proc = Bun.spawn(['sh', '-c', cmd], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      return { stdout, stderr, exitCode };
    },
    correlationId: options.correlationId,
    timeout: options.timeout || 30000,
  };
}

// =============================================================================
// Singleton Export
// =============================================================================

export const stableToolkit = new StableToolkit();
