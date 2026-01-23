/**
 * Example Tool: json_validator
 *
 * Validates JSON structure against expected schema.
 * Demonstrates more complex tool logic.
 */

import type { DynamicTool } from '../../shared/types.js';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  path?: string;
}

function validateValue(value: unknown, schema: unknown, path: string): string[] {
  const errors: string[] = [];
  const schemaObj = schema as Record<string, unknown>;

  if (!schemaObj || typeof schemaObj !== 'object') {
    return errors;
  }

  const expectedType = schemaObj.type as string;

  // Type check
  if (expectedType) {
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    if (expectedType === 'array' && !Array.isArray(value)) {
      errors.push(`${path}: expected array, got ${actualType}`);
    } else if (expectedType !== 'array' && actualType !== expectedType) {
      errors.push(`${path}: expected ${expectedType}, got ${actualType}`);
    }
  }

  // Enum check
  if (schemaObj.enum && Array.isArray(schemaObj.enum)) {
    if (!schemaObj.enum.includes(value)) {
      errors.push(`${path}: value must be one of [${schemaObj.enum.join(', ')}]`);
    }
  }

  // Object properties
  if (expectedType === 'object' && typeof value === 'object' && value !== null) {
    const properties = schemaObj.properties as Record<string, unknown>;
    const required = (schemaObj.required as string[]) || [];

    if (properties) {
      // Check required fields
      for (const req of required) {
        if (!(req in (value as Record<string, unknown>))) {
          errors.push(`${path}.${req}: required field missing`);
        }
      }

      // Validate each property
      for (const [key, propSchema] of Object.entries(properties)) {
        if (key in (value as Record<string, unknown>)) {
          const propErrors = validateValue(
            (value as Record<string, unknown>)[key],
            propSchema,
            `${path}.${key}`
          );
          errors.push(...propErrors);
        }
      }
    }
  }

  // Array items
  if (expectedType === 'array' && Array.isArray(value) && schemaObj.items) {
    for (let i = 0; i < value.length; i++) {
      const itemErrors = validateValue(value[i], schemaObj.items, `${path}[${i}]`);
      errors.push(...itemErrors);
    }
  }

  return errors;
}

export const tool: DynamicTool = {
  name: 'json_validator',
  description: 'Validate JSON data against a JSON Schema',

  schema: {
    type: 'object',
    description: 'Validate JSON against schema',
    properties: {
      data: {
        type: 'object',
        description: 'The JSON data to validate',
      },
      schema: {
        type: 'object',
        description: 'JSON Schema to validate against',
      },
    },
    required: ['data', 'schema'],
  },

  async handler(args) {
    const data = args.data;
    const schema = args.schema;

    const errors = validateValue(data, schema, 'root');

    return {
      valid: errors.length === 0,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      data: errors.length === 0 ? data : undefined,
    };
  },
};
