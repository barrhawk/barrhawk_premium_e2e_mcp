#!/usr/bin/env node
/**
 * Test script for barrhawk-frank MCP server
 *
 * Sends MCP protocol messages via stdin and reads responses from stdout
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';

const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

let messageId = 0;

function sendMessage(method, params = {}) {
  const msg = {
    jsonrpc: '2.0',
    id: ++messageId,
    method,
    params,
  };
  const json = JSON.stringify(msg);
  const header = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n`;
  server.stdin.write(header + json);
  console.error(`\n>>> Sent: ${method}`);
}

// Read responses
let buffer = '';
server.stdout.on('data', (data) => {
  buffer += data.toString();

  // Parse Content-Length header
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;

    const header = buffer.slice(0, headerEnd);
    const match = header.match(/Content-Length: (\d+)/);
    if (!match) break;

    const length = parseInt(match[1]);
    const bodyStart = headerEnd + 4;

    if (buffer.length < bodyStart + length) break;

    const body = buffer.slice(bodyStart, bodyStart + length);
    buffer = buffer.slice(bodyStart + length);

    try {
      const msg = JSON.parse(body);
      console.error(`<<< Response (id=${msg.id}):`);
      console.error(JSON.stringify(msg.result || msg.error, null, 2));
    } catch (e) {
      console.error('Parse error:', e.message);
    }
  }
});

// Test sequence
async function runTests() {
  console.error('='.repeat(60));
  console.error('Testing barrhawk-frank MCP server');
  console.error('='.repeat(60));

  // Initialize
  sendMessage('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' },
  });

  await new Promise(r => setTimeout(r, 500));

  // List tools
  sendMessage('tools/list', {});

  await new Promise(r => setTimeout(r, 500));

  // Create a test tool
  sendMessage('tools/call', {
    name: 'frank_create_tool',
    arguments: {
      name: 'test_echo',
      description: 'Echo the input back',
      code: 'return { echo: params.message, timestamp: Date.now() };',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Message to echo' }
        },
        required: ['message']
      }
    }
  });

  await new Promise(r => setTimeout(r, 500));

  // Invoke the tool
  sendMessage('tools/call', {
    name: 'frank_invoke_tool',
    arguments: {
      tool: 'test_echo',
      params: { message: 'Hello from test!' }
    }
  });

  await new Promise(r => setTimeout(r, 500));

  // Get stats
  sendMessage('tools/call', {
    name: 'frank_stats',
    arguments: {}
  });

  await new Promise(r => setTimeout(r, 500));

  // List tools to see the one we created
  sendMessage('tools/call', {
    name: 'frank_list_tools',
    arguments: {}
  });

  await new Promise(r => setTimeout(r, 500));

  console.error('\n' + '='.repeat(60));
  console.error('Tests complete!');
  console.error('='.repeat(60));

  server.kill();
  process.exit(0);
}

runTests().catch(console.error);
