/**
 * Dynamic Tool: random_choice
 * Created: 2026-01-23T14:34:02.830Z
 * Permissions: none
 *
 * Randomly select one or more items from an array.
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'random_choice',
  description: "Randomly select one or more items from an array.",
  schema: {
      "type": "object",
      "properties": {
          "items": {
              "type": "array",
              "description": "Array of items to choose from"
          },
          "count": {
              "type": "number",
              "description": "Number of items to select. Default: 1",
              "default": 1
          },
          "unique": {
              "type": "boolean",
              "description": "Ensure unique selections. Default: true",
              "default": true
          }
      },
      "required": [
          "items"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const items = args.items as unknown[];
    const count = Math.min((args.count as number) || 1, items.length);
    const unique = args.unique !== false;
    
    if (items.length === 0) return { error: 'Items array is empty', selected: [] };
    
    let selected: unknown[];
    
    if (unique) {
      const shuffled = [...items].sort(() => Math.random() - 0.5);
      selected = shuffled.slice(0, count);
    } else {
      selected = Array.from({ length: count }, () => items[Math.floor(Math.random() * items.length)]);
    }
    
    return { 
      selected: count === 1 ? selected[0] : selected,
      count: selected.length,
      fromTotal: items.length,
    };
  },
};
