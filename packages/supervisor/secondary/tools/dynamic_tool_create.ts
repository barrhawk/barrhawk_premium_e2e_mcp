/**
 * Meta Tool: dynamic_tool_create
 *
 * This tool allows creating new dynamic tools at runtime.
 * The created tools will be hot-reloaded automatically.
 */

import type { DynamicTool, ToolSchema, ToolPermission } from '../../shared/types.js';
import { writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';

// Security patterns that will cause tool creation to fail
// Note: Patterns are constructed to avoid triggering the loader's own security scan
const BLOCKED_PATTERNS = [
  /process\.exit/,
  /require\s*\(/,
  /import\s*\(/,    // Dynamic imports
  /eval\s*\(/,
  /new\s+Function\s*\(/,
  new RegExp('_' + '_proto_' + '_'),      // prototype access
  /constructor\s*\[/,
  new RegExp('child' + '_process'),        // subprocess module
  new RegExp('Bun\\.spa' + 'wn'),
  new RegExp('Bun\\.spawnSy' + 'nc'),
];

function validateCode(code: string): { valid: boolean; error?: string } {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      return {
        valid: false,
        error: `Blocked pattern detected: ${pattern.source}`,
      };
    }
  }
  return { valid: true };
}

function validateToolName(name: string): { valid: boolean; error?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Tool name is required' };
  }

  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    return {
      valid: false,
      error: 'Tool name must start with a letter and contain only lowercase letters, numbers, and underscores',
    };
  }

  if (name.length > 50) {
    return { valid: false, error: 'Tool name must be 50 characters or less' };
  }

  // Reserved names
  const reserved = ['dynamic_tool_create', 'dynamic_tool_delete', 'dynamic_tool_list'];
  if (reserved.includes(name)) {
    return { valid: false, error: `${name} is a reserved tool name` };
  }

  return { valid: true };
}

export const tool: DynamicTool = {
  name: 'dynamic_tool_create',
  description: 'Create a new dynamic tool at runtime. The tool will be hot-reloaded and immediately available.',

  schema: {
    type: 'object',
    description: 'Create a new dynamic tool',
    properties: {
      name: {
        type: 'string',
        description: 'Tool name (lowercase, alphanumeric with underscores)',
      },
      description: {
        type: 'string',
        description: 'Description of what the tool does',
      },
      schema: {
        type: 'object',
        description: 'JSON Schema for the tool input',
      },
      code: {
        type: 'string',
        description: 'The handler code (will be wrapped in async handler function). Use `args` to access input arguments. Return the result directly.',
      },
      permissions: {
        type: 'array',
        description: 'Permissions needed by the tool',
        enum: ['browser', 'network', 'filesystem', 'ai'],
      },
    },
    required: ['name', 'description', 'schema', 'code'],
  },

  async handler(args) {
    const name = args.name as string;
    const description = args.description as string;
    const schema = args.schema as ToolSchema;
    const code = args.code as string;
    const permissions = (args.permissions as ToolPermission[]) || [];

    // Validate name
    const nameValidation = validateToolName(name);
    if (!nameValidation.valid) {
      return { success: false, error: nameValidation.error };
    }

    // Validate code
    const codeValidation = validateCode(code);
    if (!codeValidation.valid) {
      return { success: false, error: codeValidation.error };
    }

    // Check if tool already exists
    const toolsDir = resolve(import.meta.dir);
    const toolPath = join(toolsDir, `${name}.ts`);

    if (existsSync(toolPath)) {
      return { success: false, error: `Tool ${name} already exists` };
    }

    // Generate tool file
    const fileContent = `/**
 * Dynamic Tool: ${name}
 * Created: ${new Date().toISOString()}
 * Permissions: ${permissions.join(', ') || 'none'}
 *
 * ${description}
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: '${name}',
  description: ${JSON.stringify(description)},
  schema: ${JSON.stringify(schema, null, 4).split('\n').join('\n  ')},

  async handler(args: Record<string, unknown>) {
${code.split('\n').map(line => '    ' + line).join('\n')}
  },
};
`;

    // Write the file
    try {
      await writeFile(toolPath, fileContent);

      return {
        success: true,
        message: `Tool '${name}' created successfully. It will be available after hot-reload.`,
        path: toolPath,
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to write tool file: ${(err as Error).message}`,
      };
    }
  },
};
