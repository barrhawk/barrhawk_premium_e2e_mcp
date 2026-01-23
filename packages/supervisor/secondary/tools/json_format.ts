/**
 * Dynamic Tool: json_format
 * Created: 2026-01-23T14:32:20.884Z
 * Permissions: none
 *
 * Format, minify, or validate JSON strings.
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'json_format',
  description: "Format, minify, or validate JSON strings.",
  schema: {
      "type": "object",
      "properties": {
          "json": {
              "type": "string",
              "description": "JSON string to process"
          },
          "action": {
              "type": "string",
              "enum": [
                  "format",
                  "minify",
                  "validate"
              ],
              "description": "Action to perform. Default: format",
              "default": "format"
          },
          "indent": {
              "type": "number",
              "description": "Indent spaces for formatting. Default: 2",
              "default": 2
          }
      },
      "required": [
          "json"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const json = args.json as string;
    const action = (args.action as string) || 'format';
    const indent = (args.indent as number) || 2;
    
    let result: string = '';
    let valid = false;
    let error: string | undefined;
    let parsed: unknown;
    
    try {
      parsed = JSON.parse(json);
      valid = true;
      
      if (action === 'format') {
        result = JSON.stringify(parsed, null, indent);
      } else if (action === 'minify') {
        result = JSON.stringify(parsed);
      } else {
        result = 'Valid JSON';
      }
    } catch (e) {
      error = (e as Error).message;
      result = action === 'validate' ? `Invalid JSON: ${error}` : '';
    }
    
    return { 
      valid, 
      action, 
      result, 
      error,
      stats: valid ? {
        inputLength: json.length,
        outputLength: result.length,
        type: Array.isArray(parsed) ? 'array' : typeof parsed,
        keys: typeof parsed === 'object' && parsed !== null ? Object.keys(parsed as object).length : undefined,
      } : undefined
    };
  },
};
