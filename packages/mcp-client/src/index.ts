import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

// =============================================================================
// State Management (Persistent Connections)
// =============================================================================

const activeClients = new Map<string, Client>();

export interface ConnectOptions {
  id: string; // Unique ID for this connection
  type: 'stdio' | 'sse';
  command?: string; // For stdio
  args?: string[];  // For stdio
  url?: string;     // For sse
  env?: Record<string, string>;
}

// =============================================================================
// Core Logic
// =============================================================================

/**
 * Connect to an external MCP server
 */
export async function connect(options: ConnectOptions): Promise<{ success: boolean; error?: string }> {
  try {
    let transport: Transport;

    if (options.type === 'stdio') {
      if (!options.command) throw new Error('Command required for stdio transport');
      transport = new StdioClientTransport({
        command: options.command,
        args: options.args || [],
        env: { ...process.env, ...options.env },
      });
    } else {
      if (!options.url) throw new Error('URL required for SSE transport');
      transport = new SSEClientTransport(new URL(options.url));
    }

    const client = new Client({
      name: 'barrhawk-tester',
      version: '1.0.0',
    }, {
      capabilities: {},
    });

    await client.connect(transport);
    activeClients.set(options.id, client);

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * List tools on a connected server
 */
export async function listTools(clientId: string) {
  const client = activeClients.get(clientId);
  if (!client) throw new Error(`Client ${clientId} not connected`);

  const result = await client.listTools();
  return {
    tools: result.tools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  };
}

/**
 * Call a tool on a connected server
 */
export async function callTool(clientId: string, toolName: string, args: Record<string, unknown>) {
  const client = activeClients.get(clientId);
  if (!client) throw new Error(`Client ${clientId} not connected`);

  const result = await client.callTool({
    name: toolName,
    arguments: args,
  });

  return {
    content: result.content,
    isError: result.isError,
  };
}

/**
 * List resources on a connected server
 */
export async function listResources(clientId: string) {
  const client = activeClients.get(clientId);
  if (!client) throw new Error(`Client ${clientId} not connected`);

  const result = await client.listResources();
  return { resources: result.resources };
}

/**
 * Read a specific resource
 */
export async function readResource(clientId: string, uri: string) {
  const client = activeClients.get(clientId);
  if (!client) throw new Error(`Client ${clientId} not connected`);

  const result = await client.readResource({ uri });
  return { contents: result.contents };
}

/**
 * Disconnect and cleanup
 */
export async function disconnect(clientId: string) {
  const client = activeClients.get(clientId);
  if (client) {
    try {
      await client.close();
    } catch {}
    activeClients.delete(clientId);
    return { success: true };
  }
  return { success: false, error: 'Client not found' };
}
