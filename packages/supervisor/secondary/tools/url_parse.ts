/**
 * Dynamic Tool: url_parse
 * Created: 2026-01-23T14:32:49.096Z
 * Permissions: none
 *
 * Parse a URL into its components (protocol, host, path, query params, etc).
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'url_parse',
  description: "Parse a URL into its components (protocol, host, path, query params, etc).",
  schema: {
      "type": "object",
      "properties": {
          "url": {
              "type": "string",
              "description": "URL to parse"
          }
      },
      "required": [
          "url"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const urlStr = args.url as string;
    
    let parsed: Record<string, unknown> = {};
    let valid = true;
    let error: string | undefined;
    
    try {
      const url = new URL(urlStr);
      const params: Record<string, string> = {};
      url.searchParams.forEach((v, k) => params[k] = v);
      
      parsed = {
        href: url.href,
        protocol: url.protocol.replace(':', ''),
        host: url.host,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? '443' : '80'),
        pathname: url.pathname,
        search: url.search,
        hash: url.hash,
        origin: url.origin,
        username: url.username || undefined,
        password: url.password || undefined,
        params: Object.keys(params).length > 0 ? params : undefined,
      };
    } catch (e) {
      valid = false;
      error = (e as Error).message;
    }
    
    return { valid, error, ...parsed };
  },
};
