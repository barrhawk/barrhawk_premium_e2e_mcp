/**
 * Dynamic Tool: template_render
 * Created: 2026-01-23T14:34:34.795Z
 * Permissions: none
 *
 * Render a template string with variable substitution using {{variable}} syntax.
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'template_render',
  description: "Render a template string with variable substitution using {{variable}} syntax.",
  schema: {
      "type": "object",
      "properties": {
          "template": {
              "type": "string",
              "description": "Template string with {{variable}} placeholders"
          },
          "variables": {
              "type": "object",
              "description": "Key-value pairs for substitution"
          }
      },
      "required": [
          "template",
          "variables"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const template = args.template as string;
    const variables = (args.variables as Record<string, unknown>) || {};
    
    let result = template;
    const used: string[] = [];
    const missing: string[] = [];
    
    // Find all placeholders
    const placeholders = template.match(/\{\{(\w+)\}\}/g) || [];
    const uniquePlaceholders = [...new Set(placeholders.map(p => p.slice(2, -2)))];
    
    for (const key of uniquePlaceholders) {
      if (key in variables) {
        result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(variables[key]));
        used.push(key);
      } else {
        missing.push(key);
      }
    }
    
    const unusedVars = Object.keys(variables).filter(k => !used.includes(k));
    
    return {
      result,
      stats: {
        placeholdersFound: uniquePlaceholders.length,
        variablesUsed: used.length,
        missingVariables: missing,
        unusedVariables: unusedVars,
      },
    };
  },
};
