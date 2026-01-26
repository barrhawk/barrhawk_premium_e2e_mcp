/**
 * DYNAMIC TOOLS - Frankenstein's programmable capability system
 *
 * Tools can be:
 * 1. Created at runtime from code
 * 2. Debugged live via REPL
 * 3. Igorified (promoted to stable Igor toolkit) when proven useful
 */

import { createLogger } from '../shared/logger.js';

const logger = createLogger({
  component: 'frank-tools',
  version: '1.0.0',
  minLevel: 'DEBUG',
  pretty: true,
});

// =============================================================================
// Types
// =============================================================================

export interface ToolSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description?: string;
    default?: unknown;
    enum?: unknown[];
  }>;
  required?: string[];
}

export interface DynamicTool {
  id: string;
  name: string;
  description: string;
  code: string;           // TypeScript/JavaScript source
  inputSchema: ToolSchema;
  compiledFn?: ToolFunction;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  author: string;         // Who/what created it

  // Tracking for igorification
  invocations: number;
  successes: number;
  failures: number;
  lastUsed?: Date;
  lastError?: string;

  // Igorification status
  status: 'experimental' | 'stable' | 'igorified' | 'deprecated';
  igorifiedAt?: Date;
}

export interface ToolContext {
  // Available helpers for dynamic tools
  log: typeof logger;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  screenshot: () => Promise<string>;  // base64

  // State from parent
  correlationId?: string;
  timeout: number;
}

export type ToolFunction = (
  params: Record<string, unknown>,
  ctx: ToolContext
) => Promise<unknown>;

export interface ToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
  duration: number;
}

export interface IgorExport {
  toolName: string;
  code: string;
  testCases: Array<{ input: Record<string, unknown>; expectedOutput?: unknown }>;
  stats: {
    invocations: number;
    successRate: number;
    avgDuration: number;
  };
}

// =============================================================================
// Tool Registry
// =============================================================================

class DynamicToolRegistry {
  private tools = new Map<string, DynamicTool>();
  private durations = new Map<string, number[]>();  // Track timing for stats

  /**
   * Register a new dynamic tool from source code
   */
  async register(definition: {
    name: string;
    description: string;
    code: string;
    inputSchema: ToolSchema;
    author?: string;
  }): Promise<DynamicTool> {
    const id = `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Compile the code
    const compiledFn = await this.compile(definition.code, definition.name);

    const tool: DynamicTool = {
      id,
      name: definition.name,
      description: definition.description,
      code: definition.code,
      inputSchema: definition.inputSchema,
      compiledFn,
      createdAt: new Date(),
      updatedAt: new Date(),
      author: definition.author || 'unknown',
      invocations: 0,
      successes: 0,
      failures: 0,
      status: 'experimental',
    };

    this.tools.set(id, tool);
    this.tools.set(definition.name, tool);  // Also index by name
    this.durations.set(id, []);

    logger.info(`Registered dynamic tool: ${definition.name}`, { id });

    return tool;
  }

  /**
   * Compile TypeScript/JavaScript code into an executable function
   */
  private async compile(code: string, name: string): Promise<ToolFunction> {
    try {
      // Wrap the code in an async function that receives params and ctx
      const wrappedCode = `
        return async function ${name.replace(/[^a-zA-Z0-9_]/g, '_')}(params, ctx) {
          const { log, fetch, sleep, exec, screenshot } = ctx;
          ${code}
        };
      `;

      // Use Function constructor to create the function
      const factory = new Function(wrappedCode);
      const fn = factory();

      // Validate it's callable
      if (typeof fn !== 'function') {
        throw new Error('Compiled code did not produce a function');
      }

      return fn as ToolFunction;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(`Failed to compile tool ${name}:`, { error: error.message });
      throw new Error(`Compilation failed: ${error.message}`);
    }
  }

  /**
   * Update a tool's code (hot reload)
   */
  async update(idOrName: string, newCode: string): Promise<DynamicTool> {
    const tool = this.tools.get(idOrName);
    if (!tool) {
      throw new Error(`Tool not found: ${idOrName}`);
    }

    // Compile new code first (fail fast if invalid)
    const compiledFn = await this.compile(newCode, tool.name);

    // Update tool
    tool.code = newCode;
    tool.compiledFn = compiledFn;
    tool.updatedAt = new Date();

    logger.info(`Updated dynamic tool: ${tool.name}`, { id: tool.id });

    return tool;
  }

  /**
   * Invoke a dynamic tool
   */
  async invoke(
    idOrName: string,
    params: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(idOrName);
    if (!tool) {
      return { success: false, error: `Tool not found: ${idOrName}`, duration: 0 };
    }

    if (!tool.compiledFn) {
      return { success: false, error: `Tool not compiled: ${idOrName}`, duration: 0 };
    }

    const startTime = Date.now();
    tool.invocations++;
    tool.lastUsed = new Date();

    try {
      // Execute with timeout
      const result = await Promise.race([
        tool.compiledFn(params, ctx),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Tool timeout')), ctx.timeout)
        ),
      ]);

      const duration = Date.now() - startTime;
      tool.successes++;

      // Track duration for stats
      const durations = this.durations.get(tool.id) || [];
      durations.push(duration);
      if (durations.length > 100) durations.shift();  // Keep last 100

      logger.debug(`Tool ${tool.name} succeeded`, { duration, params });

      return { success: true, result, duration };
    } catch (err) {
      const duration = Date.now() - startTime;
      const error = err instanceof Error ? err.message : String(err);

      tool.failures++;
      tool.lastError = error;

      logger.warn(`Tool ${tool.name} failed`, { error, duration, params });

      return { success: false, error, duration };
    }
  }

  /**
   * Get tool by ID or name
   */
  get(idOrName: string): DynamicTool | undefined {
    return this.tools.get(idOrName);
  }

  /**
   * List all tools
   */
  list(): DynamicTool[] {
    // Dedupe (since we index by both id and name)
    const seen = new Set<string>();
    const result: DynamicTool[] = [];

    for (const tool of this.tools.values()) {
      if (!seen.has(tool.id)) {
        seen.add(tool.id);
        result.push(tool);
      }
    }

    return result;
  }

  /**
   * Get candidates for igorification (frequently used, high success rate)
   */
  getIgorificationCandidates(minInvocations = 10, minSuccessRate = 0.9): DynamicTool[] {
    return this.list().filter(tool => {
      if (tool.status !== 'experimental') return false;
      if (tool.invocations < minInvocations) return false;

      const successRate = tool.successes / tool.invocations;
      return successRate >= minSuccessRate;
    });
  }

  /**
   * Export a tool for igorification
   */
  export(idOrName: string): IgorExport {
    const tool = this.tools.get(idOrName);
    if (!tool) {
      throw new Error(`Tool not found: ${idOrName}`);
    }

    const durations = this.durations.get(tool.id) || [];
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    // Generate Igor-compatible tool code
    const igorCode = this.generateIgorCode(tool);

    return {
      toolName: tool.name,
      code: igorCode,
      testCases: [],  // TODO: Capture sample invocations as test cases
      stats: {
        invocations: tool.invocations,
        successRate: tool.invocations > 0 ? tool.successes / tool.invocations : 0,
        avgDuration,
      },
    };
  }

  /**
   * Generate Igor-compatible tool code from a dynamic tool
   */
  private generateIgorCode(tool: DynamicTool): string {
    return `/**
 * ${tool.name}
 * ${tool.description}
 *
 * Auto-generated from Frankenstein dynamic tool
 * Original ID: ${tool.id}
 * Created: ${tool.createdAt.toISOString()}
 * Igorified: ${new Date().toISOString()}
 * Stats: ${tool.invocations} invocations, ${((tool.successes / tool.invocations) * 100).toFixed(1)}% success rate
 */

import { ToolContext } from '../shared/tool-types.js';

export const ${tool.name.replace(/[^a-zA-Z0-9_]/g, '_')} = {
  name: '${tool.name}',
  description: '${tool.description.replace(/'/g, "\\'")}',
  inputSchema: ${JSON.stringify(tool.inputSchema, null, 2)},

  async execute(params: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
    const { log, fetch, sleep, exec, screenshot } = ctx;
    ${tool.code}
  },
};
`;
  }

  /**
   * Mark a tool as igorified
   */
  markIgorified(idOrName: string): void {
    const tool = this.tools.get(idOrName);
    if (tool) {
      tool.status = 'igorified';
      tool.igorifiedAt = new Date();
      logger.info(`Tool igorified: ${tool.name}`, { id: tool.id });
    }
  }

  /**
   * Delete a tool
   */
  delete(idOrName: string): boolean {
    const tool = this.tools.get(idOrName);
    if (!tool) return false;

    this.tools.delete(tool.id);
    this.tools.delete(tool.name);
    this.durations.delete(tool.id);

    logger.info(`Deleted dynamic tool: ${tool.name}`, { id: tool.id });
    return true;
  }

  /**
   * Get stats for all tools
   */
  getStats(): {
    totalTools: number;
    experimental: number;
    stable: number;
    igorified: number;
    totalInvocations: number;
    overallSuccessRate: number;
  } {
    const tools = this.list();
    const totalInvocations = tools.reduce((sum, t) => sum + t.invocations, 0);
    const totalSuccesses = tools.reduce((sum, t) => sum + t.successes, 0);

    return {
      totalTools: tools.length,
      experimental: tools.filter(t => t.status === 'experimental').length,
      stable: tools.filter(t => t.status === 'stable').length,
      igorified: tools.filter(t => t.status === 'igorified').length,
      totalInvocations,
      overallSuccessRate: totalInvocations > 0 ? totalSuccesses / totalInvocations : 0,
    };
  }
}

// =============================================================================
// Context Factory
// =============================================================================

export function createToolContext(options: {
  correlationId?: string;
  timeout?: number;
  execFn?: (cmd: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  screenshotFn?: () => Promise<string>;
}): ToolContext {
  return {
    log: logger,
    fetch: globalThis.fetch,
    sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
    exec: options.execFn || (async (cmd: string) => {
      const proc = Bun.spawn(['sh', '-c', cmd], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      return { stdout, stderr, exitCode };
    }),
    screenshot: options.screenshotFn || (async () => {
      // Default: use grim for Wayland screenshot
      const proc = Bun.spawn(['grim', '-'], { stdout: 'pipe' });
      const buffer = await new Response(proc.stdout).arrayBuffer();
      return Buffer.from(buffer).toString('base64');
    }),
    correlationId: options.correlationId,
    timeout: options.timeout || 30000,
  };
}

// =============================================================================
// Singleton Export
// =============================================================================

export const toolRegistry = new DynamicToolRegistry();
