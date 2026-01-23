/**
 * Dynamic Tool: base64_encode
 * Created: 2026-01-23T14:32:20.242Z
 * Permissions: none
 *
 * Encode or decode base64 strings.
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'base64_encode',
  description: "Encode or decode base64 strings.",
  schema: {
      "type": "object",
      "properties": {
          "text": {
              "type": "string",
              "description": "Text to encode/decode"
          },
          "action": {
              "type": "string",
              "enum": [
                  "encode",
                  "decode"
              ],
              "description": "Action to perform. Default: encode",
              "default": "encode"
          }
      },
      "required": [
          "text"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const text = args.text as string;
    const action = (args.action as string) || 'encode';
    
    let result: string;
    let success = true;
    let error: string | undefined;
    
    try {
      if (action === 'encode') {
        result = Buffer.from(text, 'utf-8').toString('base64');
      } else {
        result = Buffer.from(text, 'base64').toString('utf-8');
      }
    } catch (e) {
      success = false;
      error = (e as Error).message;
      result = '';
    }
    
    return { success, action, result, inputLength: text.length, outputLength: result.length, error };
  },
};
