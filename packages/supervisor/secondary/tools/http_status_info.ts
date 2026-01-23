/**
 * Dynamic Tool: http_status_info
 * Created: 2026-01-23T14:33:25.347Z
 * Permissions: none
 *
 * Get information about HTTP status codes (name, description, category).
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'http_status_info',
  description: "Get information about HTTP status codes (name, description, category).",
  schema: {
      "type": "object",
      "properties": {
          "code": {
              "type": "number",
              "description": "HTTP status code"
          }
      },
      "required": [
          "code"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const code = args.code as number;
    
    const statuses: Record<number, {name: string, description: string}> = {
      100: { name: 'Continue', description: 'Server received request headers, client should proceed' },
      101: { name: 'Switching Protocols', description: 'Server switching to different protocol' },
      200: { name: 'OK', description: 'Request succeeded' },
      201: { name: 'Created', description: 'Request succeeded, new resource created' },
      204: { name: 'No Content', description: 'Request succeeded, no content to return' },
      301: { name: 'Moved Permanently', description: 'Resource permanently moved to new URL' },
      302: { name: 'Found', description: 'Resource temporarily at different URL' },
      304: { name: 'Not Modified', description: 'Resource not modified since last request' },
      307: { name: 'Temporary Redirect', description: 'Temporary redirect, same method' },
      308: { name: 'Permanent Redirect', description: 'Permanent redirect, same method' },
      400: { name: 'Bad Request', description: 'Server cannot process due to client error' },
      401: { name: 'Unauthorized', description: 'Authentication required' },
      403: { name: 'Forbidden', description: 'Server refuses to authorize request' },
      404: { name: 'Not Found', description: 'Resource not found' },
      405: { name: 'Method Not Allowed', description: 'HTTP method not allowed for resource' },
      408: { name: 'Request Timeout', description: 'Server timed out waiting for request' },
      409: { name: 'Conflict', description: 'Request conflicts with current state' },
      410: { name: 'Gone', description: 'Resource permanently removed' },
      422: { name: 'Unprocessable Entity', description: 'Request well-formed but semantically invalid' },
      429: { name: 'Too Many Requests', description: 'Rate limit exceeded' },
      500: { name: 'Internal Server Error', description: 'Server encountered unexpected error' },
      501: { name: 'Not Implemented', description: 'Server does not support functionality' },
      502: { name: 'Bad Gateway', description: 'Invalid response from upstream server' },
      503: { name: 'Service Unavailable', description: 'Server temporarily unavailable' },
      504: { name: 'Gateway Timeout', description: 'Upstream server timed out' },
    };
    
    const info = statuses[code];
    let category = 'Unknown';
    if (code >= 100 && code < 200) category = 'Informational';
    else if (code >= 200 && code < 300) category = 'Success';
    else if (code >= 300 && code < 400) category = 'Redirection';
    else if (code >= 400 && code < 500) category = 'Client Error';
    else if (code >= 500 && code < 600) category = 'Server Error';
    
    return {
      code,
      name: info?.name || 'Unknown',
      description: info?.description || 'No description available',
      category,
      isSuccess: code >= 200 && code < 300,
      isError: code >= 400,
    };
  },
};
