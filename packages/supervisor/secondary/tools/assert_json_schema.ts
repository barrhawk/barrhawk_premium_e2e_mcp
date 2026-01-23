/**
 * Dynamic Tool: assert_json_schema
 * Created: 2026-01-23T14:33:26.639Z
 * Permissions: none
 *
 * Assert that JSON data matches a JSON Schema structure.
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'assert_json_schema',
  description: "Assert that JSON data matches a JSON Schema structure.",
  schema: {
      "type": "object",
      "properties": {
          "data": {
              "description": "JSON data to validate"
          },
          "schema": {
              "type": "object",
              "description": "JSON Schema to validate against"
          },
          "message": {
              "type": "string",
              "description": "Optional custom message"
          }
      },
      "required": [
          "data",
          "schema"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const data = args.data;
    const schema = args.schema as Record<string, unknown>;
    const message = args.message as string | undefined;
    
    const errors: string[] = [];
    
    function validate(value: unknown, sch: Record<string, unknown>, path: string): void {
      if (sch.type) {
        const type = sch.type as string;
        const actualType = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
        if (type !== actualType) {
          errors.push(`${path}: expected ${type}, got ${actualType}`);
          return;
        }
      }
      
      if (sch.enum && !((sch.enum as unknown[]).includes(value))) {
        errors.push(`${path}: value not in enum [${(sch.enum as unknown[]).join(', ')}]`);
      }
      
      if (sch.type === 'object' && typeof value === 'object' && value !== null) {
        const obj = value as Record<string, unknown>;
        const props = (sch.properties as Record<string, Record<string, unknown>>) || {};
        const required = (sch.required as string[]) || [];
        
        for (const req of required) {
          if (!(req in obj)) errors.push(`${path}.${req}: required field missing`);
        }
        
        for (const [key, propSchema] of Object.entries(props)) {
          if (key in obj) validate(obj[key], propSchema, `${path}.${key}`);
        }
      }
      
      if (sch.type === 'array' && Array.isArray(value)) {
        const items = sch.items as Record<string, unknown> | undefined;
        if (items) {
          value.forEach((item, i) => validate(item, items, `${path}[${i}]`));
        }
        if (sch.minItems && value.length < (sch.minItems as number)) {
          errors.push(`${path}: array length ${value.length} < minItems ${sch.minItems}`);
        }
        if (sch.maxItems && value.length > (sch.maxItems as number)) {
          errors.push(`${path}: array length ${value.length} > maxItems ${sch.maxItems}`);
        }
      }
      
      if (sch.type === 'string' && typeof value === 'string') {
        if (sch.minLength && value.length < (sch.minLength as number)) {
          errors.push(`${path}: string length ${value.length} < minLength ${sch.minLength}`);
        }
        if (sch.pattern && !new RegExp(sch.pattern as string).test(value)) {
          errors.push(`${path}: string doesn't match pattern ${sch.pattern}`);
        }
      }
    }
    
    validate(data, schema, '$');
    const passed = errors.length === 0;
    const icon = passed ? '✅' : '❌';
    
    let output = `${icon} JSON Schema Validation: ${passed ? 'PASSED' : 'FAILED'}`;
    if (message) output += `\n   ${message}`;
    if (!passed) output += `\n   Errors:\n${errors.map(e => `   - ${e}`).join('\n')}`;
    
    return { passed, errors, output };
  },
};
