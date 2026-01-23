/**
 * Dynamic Tool Loader - Hot-reload tools with security scanning
 */

import { readdir, readFile, writeFile, unlink, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import type {
  DynamicTool,
  ToolFile,
  ToolSchema,
  SecurityScanResult,
  ToolPermission,
} from '../shared/types.js';

// Dangerous patterns to scan for
const SECURITY_PATTERNS = [
  { pattern: /process\.exit/g, message: 'process.exit is not allowed', severity: 'error' as const },
  { pattern: /process\.env\[/g, message: 'Dynamic env access detected', severity: 'warning' as const },
  { pattern: /require\s*\(/g, message: 'require() is not allowed, use import', severity: 'error' as const },
  { pattern: /eval\s*\(/g, message: 'eval() is not allowed', severity: 'error' as const },
  { pattern: /new\s+Function\s*\(/g, message: 'Function constructor is not allowed', severity: 'error' as const },
  { pattern: /__proto__/g, message: 'Prototype access is not allowed', severity: 'error' as const },
  { pattern: /constructor\s*\[/g, message: 'Constructor access is not allowed', severity: 'error' as const },
  { pattern: /child_process/g, message: 'child_process is not allowed', severity: 'error' as const },
  { pattern: /fs\.rm|fs\.unlink|fs\.rmdir/g, message: 'Destructive fs operations need review', severity: 'warning' as const },
  { pattern: /while\s*\(\s*true\s*\)/g, message: 'Infinite loop detected', severity: 'warning' as const },
  { pattern: /for\s*\(\s*;\s*;\s*\)/g, message: 'Infinite loop detected', severity: 'warning' as const },
];

export class ToolLoader {
  private toolsDir: string;
  private tools = new Map<string, DynamicTool>();
  private fileCache = new Map<string, ToolFile>();
  private watchDebounce: number;
  private reloadTimeout: Timer | null = null;

  constructor(toolsDir: string, watchDebounce = 100) {
    this.toolsDir = toolsDir;
    this.watchDebounce = watchDebounce;
  }

  /**
   * Load all tools from the tools directory
   */
  async loadAll(): Promise<string[]> {
    if (!existsSync(this.toolsDir)) {
      console.log('[Loader] Tools directory does not exist, creating...');
      await Bun.write(join(this.toolsDir, '.gitkeep'), '');
    }

    const files = await readdir(this.toolsDir);
    const loaded: string[] = [];

    for (const file of files) {
      if (!file.endsWith('.ts') || file.startsWith('_')) {
        continue;
      }

      try {
        const toolPath = join(this.toolsDir, file);
        await this.loadTool(toolPath);
        loaded.push(file);
      } catch (err) {
        console.error(`[Loader] Failed to load ${file}:`, err);
      }
    }

    console.log(`[Loader] Loaded ${loaded.length} tools`);
    return loaded;
  }

  /**
   * Load a single tool from file
   */
  async loadTool(toolPath: string): Promise<void> {
    const content = await readFile(toolPath, 'utf-8');
    const hash = this.hashContent(content);

    // Check if unchanged
    const cached = this.fileCache.get(toolPath);
    if (cached && cached.hash === hash) {
      return;
    }

    // Security scan
    const scanResult = this.securityScan(content);
    if (!scanResult.safe) {
      const errors = scanResult.issues.filter(i => i.severity === 'error');
      if (errors.length > 0) {
        throw new Error(
          `Security scan failed:\n${errors.map(e => `  - ${e.message}`).join('\n')}`
        );
      }

      // Log warnings
      const warnings = scanResult.issues.filter(i => i.severity === 'warning');
      for (const warning of warnings) {
        console.warn(`[Loader] Warning in ${toolPath}: ${warning.message}`);
      }
    }

    // Dynamic import with cache busting
    const mod = await import(`${toolPath}?t=${Date.now()}`);

    if (!mod.tool || typeof mod.tool !== 'object') {
      throw new Error(`Tool file must export a 'tool' object`);
    }

    const tool = mod.tool as DynamicTool;

    // Validate tool structure
    this.validateTool(tool);

    // Register
    this.tools.set(tool.name, tool);
    this.fileCache.set(toolPath, {
      name: tool.name,
      path: toolPath,
      loadedAt: new Date(),
      hash,
    });

    console.log(`[Loader] Loaded tool: ${tool.name}`);
  }

  /**
   * Validate tool structure
   */
  private validateTool(tool: DynamicTool): void {
    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('Tool must have a name');
    }

    if (!/^[a-z][a-z0-9_]*$/.test(tool.name)) {
      throw new Error('Tool name must be lowercase alphanumeric with underscores');
    }

    if (!tool.description || typeof tool.description !== 'string') {
      throw new Error('Tool must have a description');
    }

    if (!tool.schema || typeof tool.schema !== 'object') {
      throw new Error('Tool must have a schema');
    }

    if (typeof tool.handler !== 'function') {
      throw new Error('Tool must have a handler function');
    }
  }

  /**
   * Security scan code for dangerous patterns
   */
  securityScan(code: string): SecurityScanResult {
    const issues: SecurityScanResult['issues'] = [];

    for (const { pattern, message, severity } of SECURITY_PATTERNS) {
      const matches = code.match(pattern);
      if (matches) {
        issues.push({
          severity,
          message,
          pattern: pattern.source,
        });
      }
    }

    return {
      safe: !issues.some(i => i.severity === 'error'),
      issues,
    };
  }

  /**
   * Create a new tool from code
   */
  async createTool(
    name: string,
    description: string,
    schema: ToolSchema,
    code: string,
    permissions: ToolPermission[] = []
  ): Promise<void> {
    // Security scan the code
    const scanResult = this.securityScan(code);
    if (!scanResult.safe) {
      const errors = scanResult.issues.filter(i => i.severity === 'error');
      throw new Error(
        `Security scan failed:\n${errors.map(e => `  - ${e.message}`).join('\n')}`
      );
    }

    // Generate tool file content
    const fileContent = this.generateToolFile(name, description, schema, code, permissions);

    // Write to file
    const toolPath = join(this.toolsDir, `${name}.ts`);

    if (existsSync(toolPath)) {
      throw new Error(`Tool ${name} already exists`);
    }

    await writeFile(toolPath, fileContent);

    // Load it
    await this.loadTool(toolPath);

    console.log(`[Loader] Created tool: ${name}`);
  }

  /**
   * Generate tool file content
   */
  private generateToolFile(
    name: string,
    description: string,
    schema: ToolSchema,
    code: string,
    permissions: ToolPermission[]
  ): string {
    return `/**
 * Dynamic Tool: ${name}
 * Created: ${new Date().toISOString()}
 * Permissions: ${permissions.join(', ') || 'none'}
 *
 * ${description}
 */

import type { DynamicTool } from '../shared/types.js';

export const tool: DynamicTool = {
  name: '${name}',
  description: ${JSON.stringify(description)},
  schema: ${JSON.stringify(schema, null, 2)},

  async handler(args: Record<string, unknown>) {
${code.split('\n').map(line => '    ' + line).join('\n')}
  },
};
`;
  }

  /**
   * Delete a tool
   */
  async deleteTool(name: string): Promise<void> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }

    // Find the file
    for (const [path, file] of this.fileCache) {
      if (file.name === name) {
        await unlink(path);
        this.fileCache.delete(path);
        break;
      }
    }

    this.tools.delete(name);
    console.log(`[Loader] Deleted tool: ${name}`);
  }

  /**
   * Get a tool by name
   */
  getTool(name: string): DynamicTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all tools
   */
  getAllTools(): DynamicTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Check if tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Execute a tool
   */
  async execute(name: string, args: unknown): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    return await tool.handler(args as Record<string, unknown>);
  }

  /**
   * Watch for file changes (debounced)
   */
  scheduleReload(file?: string): void {
    if (this.reloadTimeout) {
      clearTimeout(this.reloadTimeout);
    }

    this.reloadTimeout = setTimeout(async () => {
      console.log(`[Loader] Reloading${file ? `: ${file}` : ' all'}...`);

      if (file) {
        const toolPath = join(this.toolsDir, file);
        if (existsSync(toolPath)) {
          try {
            await this.loadTool(toolPath);
          } catch (err) {
            console.error(`[Loader] Reload failed for ${file}:`, err);
          }
        } else {
          // File deleted - remove from registry
          for (const [path, meta] of this.fileCache) {
            if (path.endsWith(file)) {
              this.tools.delete(meta.name);
              this.fileCache.delete(path);
              console.log(`[Loader] Unloaded tool: ${meta.name}`);
              break;
            }
          }
        }
      } else {
        await this.loadAll();
      }
    }, this.watchDebounce);
  }

  /**
   * Hash content for change detection
   */
  private hashContent(content: string): string {
    return createHash('md5').update(content).digest('hex');
  }
}
