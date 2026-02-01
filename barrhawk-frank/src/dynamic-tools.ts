/**
 * FRANK DYNAMIC TOOLS - Runtime tool creation, hot reloading, and persistence
 *
 * The heart of Frankenstein - creates new tools on the fly that can be used
 * immediately in the same session. Successful tools can be saved for future use.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

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
  code: string;
  inputSchema: ToolSchema;
  compiledFn?: ToolFunction;

  // Metadata
  createdAt: string;
  updatedAt: string;
  author: string;

  // Stats for deciding if tool should be saved
  invocations: number;
  successes: number;
  failures: number;
  lastUsed?: string;
  lastError?: string;

  // Status
  status: 'experimental' | 'stable' | 'saved' | 'deprecated';
  savedAt?: string;
}

export interface ToolContext {
  log: (...args: unknown[]) => void;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  exec: (cmd: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
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
  toolId: string;
  toolName: string;
}

export interface SavedToolsManifest {
  version: string;
  tools: Array<{
    id: string;
    name: string;
    description: string;
    code: string;
    inputSchema: ToolSchema;
    savedAt: string;
    stats: {
      invocations: number;
      successRate: number;
    };
  }>;
}

// =============================================================================
// Tool Storage
// =============================================================================

const TOOLS_DIR = process.env.FRANK_TOOLS_DIR || join(process.env.HOME || '/tmp', '.frank-tools');
const MANIFEST_PATH = join(TOOLS_DIR, 'manifest.json');

function ensureToolsDir(): void {
  if (!existsSync(TOOLS_DIR)) {
    mkdirSync(TOOLS_DIR, { recursive: true });
  }
}

function loadSavedTools(): SavedToolsManifest {
  ensureToolsDir();
  if (existsSync(MANIFEST_PATH)) {
    try {
      return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    } catch {
      return { version: '1.0.0', tools: [] };
    }
  }
  return { version: '1.0.0', tools: [] };
}

function saveManifest(manifest: SavedToolsManifest): void {
  ensureToolsDir();
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

// =============================================================================
// Tool Registry
// =============================================================================

class DynamicToolRegistry {
  private tools = new Map<string, DynamicTool>();
  private durations = new Map<string, number[]>();
  private logs: string[] = [];

  constructor() {
    // Load saved tools on startup
    this.loadSaved();
  }

  private log(msg: string, data?: unknown): void {
    const entry = `[${new Date().toISOString()}] ${msg}${data ? ` ${JSON.stringify(data)}` : ''}`;
    this.logs.push(entry);
    if (this.logs.length > 1000) this.logs.shift();
    console.error(entry); // MCP uses stderr for logging
  }

  private loadSaved(): void {
    const manifest = loadSavedTools();
    for (const saved of manifest.tools) {
      try {
        const tool: DynamicTool = {
          id: saved.id,
          name: saved.name,
          description: saved.description,
          code: saved.code,
          inputSchema: saved.inputSchema,
          createdAt: saved.savedAt,
          updatedAt: saved.savedAt,
          author: 'saved',
          invocations: saved.stats.invocations,
          successes: Math.round(saved.stats.invocations * saved.stats.successRate),
          failures: Math.round(saved.stats.invocations * (1 - saved.stats.successRate)),
          status: 'saved',
          savedAt: saved.savedAt,
        };

        // Compile the tool
        tool.compiledFn = this.compile(saved.code, saved.name);
        this.tools.set(tool.id, tool);
        this.tools.set(tool.name, tool);
        this.durations.set(tool.id, []);
        this.log(`Loaded saved tool: ${saved.name}`);
      } catch (err) {
        this.log(`Failed to load saved tool ${saved.name}:`, err);
      }
    }
  }

  /**
   * Compile code into an executable function
   */
  private compile(code: string, name: string): ToolFunction {
    try {
      // Wrap the code in an async function
      const wrappedCode = `
        return async function ${name.replace(/[^a-zA-Z0-9_]/g, '_')}(params, ctx) {
          const { log, fetch, sleep, exec } = ctx;
          ${code}
        };
      `;

      const factory = new Function(wrappedCode);
      const fn = factory();

      if (typeof fn !== 'function') {
        throw new Error('Compiled code did not produce a function');
      }

      return fn as ToolFunction;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      throw new Error(`Compilation failed: ${error.message}`);
    }
  }

  /**
   * Create a new dynamic tool
   */
  async create(definition: {
    name: string;
    description: string;
    code: string;
    inputSchema: ToolSchema;
    author?: string;
  }): Promise<DynamicTool> {
    // Check if tool with same name exists
    const existing = this.tools.get(definition.name);
    if (existing) {
      throw new Error(`Tool with name '${definition.name}' already exists. Use update to modify it.`);
    }

    const id = `frank_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Compile the code first (fail fast)
    const compiledFn = this.compile(definition.code, definition.name);

    const tool: DynamicTool = {
      id,
      name: definition.name,
      description: definition.description,
      code: definition.code,
      inputSchema: definition.inputSchema,
      compiledFn,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: definition.author || 'dynamic',
      invocations: 0,
      successes: 0,
      failures: 0,
      status: 'experimental',
    };

    this.tools.set(id, tool);
    this.tools.set(definition.name, tool);
    this.durations.set(id, []);

    this.log(`Created tool: ${definition.name}`, { id });

    return tool;
  }

  /**
   * Update a tool's code (hot reload)
   */
  async update(idOrName: string, newCode: string): Promise<DynamicTool> {
    const tool = this.tools.get(idOrName);
    if (!tool) {
      throw new Error(`Tool not found: ${idOrName}`);
    }

    // Compile new code first
    const compiledFn = this.compile(newCode, tool.name);

    // Update tool
    tool.code = newCode;
    tool.compiledFn = compiledFn;
    tool.updatedAt = new Date().toISOString();

    this.log(`Updated tool: ${tool.name}`, { id: tool.id });

    return tool;
  }

  /**
   * Invoke a tool
   */
  async invoke(
    idOrName: string,
    params: Record<string, unknown>,
    timeout = 30000
  ): Promise<ToolResult> {
    const tool = this.tools.get(idOrName);
    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${idOrName}`,
        duration: 0,
        toolId: idOrName,
        toolName: idOrName,
      };
    }

    if (!tool.compiledFn) {
      return {
        success: false,
        error: `Tool not compiled: ${idOrName}`,
        duration: 0,
        toolId: tool.id,
        toolName: tool.name,
      };
    }

    const startTime = Date.now();
    tool.invocations++;
    tool.lastUsed = new Date().toISOString();

    // Create execution context
    const ctx: ToolContext = {
      log: (...args) => this.log(`[${tool.name}]`, args),
      fetch: globalThis.fetch,
      sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
      exec: async (cmd: string) => {
        const { spawn } = await import('child_process');
        return new Promise((resolve) => {
          const proc = spawn('sh', ['-c', cmd]);
          let stdout = '';
          let stderr = '';
          proc.stdout.on('data', (d) => { stdout += d; });
          proc.stderr.on('data', (d) => { stderr += d; });
          proc.on('close', (exitCode) => {
            resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
          });
        });
      },
      timeout,
    };

    try {
      // Execute with timeout
      const result = await Promise.race([
        tool.compiledFn(params, ctx),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Tool execution timeout')), timeout)
        ),
      ]);

      const duration = Date.now() - startTime;
      tool.successes++;

      // Track duration
      const durations = this.durations.get(tool.id) || [];
      durations.push(duration);
      if (durations.length > 100) durations.shift();

      // Auto-promote to stable after 5 successful invocations
      if (tool.status === 'experimental' && tool.successes >= 5 && tool.failures === 0) {
        tool.status = 'stable';
        this.log(`Tool promoted to stable: ${tool.name}`);
      }

      return {
        success: true,
        result,
        duration,
        toolId: tool.id,
        toolName: tool.name,
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      const error = err instanceof Error ? err.message : String(err);

      tool.failures++;
      tool.lastError = error;

      return {
        success: false,
        error,
        duration,
        toolId: tool.id,
        toolName: tool.name,
      };
    }
  }

  /**
   * Get a tool
   */
  get(idOrName: string): DynamicTool | undefined {
    return this.tools.get(idOrName);
  }

  /**
   * List all tools
   */
  list(): DynamicTool[] {
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
   * Delete a tool
   */
  delete(idOrName: string): boolean {
    const tool = this.tools.get(idOrName);
    if (!tool) return false;

    this.tools.delete(tool.id);
    this.tools.delete(tool.name);
    this.durations.delete(tool.id);

    // If it was saved, remove from manifest
    if (tool.status === 'saved') {
      const manifest = loadSavedTools();
      manifest.tools = manifest.tools.filter(t => t.id !== tool.id);
      saveManifest(manifest);
    }

    this.log(`Deleted tool: ${tool.name}`);
    return true;
  }

  /**
   * Save a tool for future sessions
   */
  save(idOrName: string): DynamicTool {
    const tool = this.tools.get(idOrName);
    if (!tool) {
      throw new Error(`Tool not found: ${idOrName}`);
    }

    const manifest = loadSavedTools();

    // Remove if already exists
    manifest.tools = manifest.tools.filter(t => t.id !== tool.id && t.name !== tool.name);

    // Add updated version
    manifest.tools.push({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      code: tool.code,
      inputSchema: tool.inputSchema,
      savedAt: new Date().toISOString(),
      stats: {
        invocations: tool.invocations,
        successRate: tool.invocations > 0 ? tool.successes / tool.invocations : 0,
      },
    });

    saveManifest(manifest);

    tool.status = 'saved';
    tool.savedAt = new Date().toISOString();

    this.log(`Saved tool: ${tool.name}`);
    return tool;
  }

  /**
   * Get stats
   */
  getStats(): {
    totalTools: number;
    experimental: number;
    stable: number;
    saved: number;
    totalInvocations: number;
    overallSuccessRate: number;
    toolsDir: string;
  } {
    const tools = this.list();
    const totalInvocations = tools.reduce((sum, t) => sum + t.invocations, 0);
    const totalSuccesses = tools.reduce((sum, t) => sum + t.successes, 0);

    return {
      totalTools: tools.length,
      experimental: tools.filter(t => t.status === 'experimental').length,
      stable: tools.filter(t => t.status === 'stable').length,
      saved: tools.filter(t => t.status === 'saved').length,
      totalInvocations,
      overallSuccessRate: totalInvocations > 0 ? totalSuccesses / totalInvocations : 0,
      toolsDir: TOOLS_DIR,
    };
  }

  /**
   * Get recent logs
   */
  getLogs(count = 50): string[] {
    return this.logs.slice(-count);
  }

  /**
   * Get tools that are candidates for saving (stable, used frequently)
   */
  getSaveCandidates(): DynamicTool[] {
    return this.list().filter(t =>
      t.status === 'stable' &&
      t.invocations >= 3 &&
      (t.successes / t.invocations) >= 0.8
    );
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const toolRegistry = new DynamicToolRegistry();
