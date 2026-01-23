/**
 * Dynamic Tool: data_from_schema
 * Created: 2026-01-23T14:30:11.642Z
 * Permissions: none
 *
 * Generate test data from a JSON Schema definition.
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'data_from_schema',
  description: "Generate test data from a JSON Schema definition.",
  schema: {
      "type": "object",
      "properties": {
          "schema": {
              "type": "object",
              "description": "JSON Schema object defining the data structure"
          },
          "count": {
              "type": "number",
              "description": "Number of instances to generate. Default: 1",
              "default": 1
          }
      },
      "required": [
          "schema"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const schema = args.schema as Record<string, unknown>;
    const count = Math.min((args.count as number) || 1, 100);
    
    const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
    const randStr = (len: number) => Array.from({ length: len }, () => 
      'abcdefghijklmnopqrstuvwxyz'[randInt(0, 25)]
    ).join('');
    
    function generateFromSchema(s: Record<string, unknown>): unknown {
      const type = s.type as string;
      
      if (s.enum) {
        const vals = s.enum as unknown[];
        return vals[randInt(0, vals.length - 1)];
      }
      
      if (s.const !== undefined) return s.const;
      
      switch (type) {
        case 'string': {
          const minLen = (s.minLength as number) || 5;
          const maxLen = (s.maxLength as number) || 20;
          if (s.format === 'email') return `${randStr(8)}@example.com`;
          if (s.format === 'date') return new Date().toISOString().split('T')[0];
          if (s.format === 'uri') return `https://example.com/${randStr(6)}`;
          if (s.format === 'uuid') return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
          });
          return randStr(randInt(minLen, maxLen));
        }
        case 'number':
        case 'integer': {
          const min = (s.minimum as number) ?? 0;
          const max = (s.maximum as number) ?? 1000;
          const val = randInt(min, max);
          return type === 'integer' ? Math.floor(val) : val + Math.random();
        }
        case 'boolean':
          return Math.random() > 0.5;
        case 'array': {
          const minItems = (s.minItems as number) || 1;
          const maxItems = (s.maxItems as number) || 5;
          const items = s.items as Record<string, unknown> || { type: 'string' };
          return Array.from({ length: randInt(minItems, maxItems) }, () => generateFromSchema(items));
        }
        case 'object': {
          const props = (s.properties as Record<string, Record<string, unknown>>) || {};
          const required = (s.required as string[]) || Object.keys(props);
          const result: Record<string, unknown> = {};
          for (const [key, propSchema] of Object.entries(props)) {
            if (required.includes(key) || Math.random() > 0.3) {
              result[key] = generateFromSchema(propSchema);
            }
          }
          return result;
        }
        case 'null':
          return null;
        default:
          return randStr(10);
      }
    }
    
    const data = count === 1 ? generateFromSchema(schema) : Array.from({ length: count }, () => generateFromSchema(schema));
    return { count, data };
  },
};
