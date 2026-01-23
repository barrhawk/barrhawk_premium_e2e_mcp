/**
 * Dynamic Tool: hash_text
 * Created: 2026-01-23T14:32:19.675Z
 * Permissions: none
 *
 * Generate hash of text using various algorithms (md5, sha1, sha256, sha512).
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'hash_text',
  description: "Generate hash of text using various algorithms (md5, sha1, sha256, sha512).",
  schema: {
      "type": "object",
      "properties": {
          "text": {
              "type": "string",
              "description": "Text to hash"
          },
          "algorithm": {
              "type": "string",
              "enum": [
                  "md5",
                  "sha1",
                  "sha256",
                  "sha512"
              ],
              "description": "Hash algorithm. Default: sha256",
              "default": "sha256"
          }
      },
      "required": [
          "text"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const text = args.text as string;
    const algorithm = (args.algorithm as string) || 'sha256';
    
    // Use Bun's native crypto
    const hasher = new Bun.CryptoHasher(algorithm as 'md5' | 'sha1' | 'sha256' | 'sha512');
    hasher.update(text);
    const hash = hasher.digest('hex');
    
    return { algorithm, hash, length: hash.length, inputLength: text.length };
  },
};
