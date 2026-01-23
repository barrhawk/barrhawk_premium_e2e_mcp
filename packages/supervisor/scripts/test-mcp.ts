#!/usr/bin/env bun
/**
 * MCP Protocol Test - Tests Primary as a real MCP server
 *
 * Uses BarrHawk's mcp-tester module to verify:
 * - MCP initialization handshake
 * - tools/list response
 * - tools/call execution
 * - Schema validation
 *
 * Usage: bun run mcp:test
 */

import { resolve } from 'path';

// Import mcp-tester functions
import {
  mcpStart,
  mcpStop,
  mcpListTools,
  mcpInvoke,
  mcpValidateSchema,
  mcpRunTests,
} from '../../../mcp-tester.js';

const PRIMARY_SCRIPT = resolve(import.meta.dir, '../primary/index.ts');

async function main(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║      BarrHawk Supervisor - MCP Protocol Test          ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  let mcpId: string | null = null;

  try {
    // Start Primary as MCP server
    console.log('Starting Primary MCP server...');
    console.log(`  Command: bun run ${PRIMARY_SCRIPT}\n`);

    const startResult = await mcpStart('bun', ['run', PRIMARY_SCRIPT], {
      cwd: resolve(import.meta.dir, '..'),
      timeout: 15000,
    });

    if (startResult.status !== 'running') {
      console.error(`✗ Failed to start MCP server: ${startResult.error}`);

      // Try to get debug info
      const { mcpGetInstance } = await import('../../../mcp-tester.js');
      const info = mcpGetInstance(startResult.id);
      if (info.found && info.instance) {
        console.error('\nRecent stderr:');
        for (const line of info.instance.recentStderr) {
          console.error(`  ${line}`);
        }
        console.error('\nRecent stdout:');
        for (const line of info.instance.recentStdout) {
          console.error(`  ${line}`);
        }
      }

      process.exit(1);
    }

    mcpId = startResult.id;
    console.log(`✓ MCP server started (ID: ${mcpId})\n`);

    // List tools
    console.log('Testing tools/list...');
    const toolsResult = await mcpListTools(mcpId);

    if (!toolsResult.success || !toolsResult.tools) {
      console.error(`✗ Failed to list tools: ${toolsResult.error}`);
      process.exit(1);
    }

    console.log(`✓ Found ${toolsResult.tools.length} tools:`);
    for (const tool of toolsResult.tools) {
      console.log(`    - ${tool.name}`);
    }
    console.log('');

    // Validate schemas
    console.log('Validating tool schemas...');
    const schemaValidation = mcpValidateSchema(toolsResult.tools);

    if (!schemaValidation.valid) {
      console.log('⚠ Schema validation issues:');
      for (const err of schemaValidation.errors) {
        console.log(`    - ${err.tool}: ${err.error}`);
      }
    } else {
      console.log('✓ All tool schemas valid\n');
    }

    // Test worker_status (primary-only tool)
    console.log('Testing worker_status tool...');
    const statusResult = await mcpInvoke(mcpId, 'worker_status', {});

    if (statusResult.success) {
      console.log(`✓ worker_status returned in ${statusResult.duration}ms`);
      const content = (statusResult.result as any)?.content?.[0]?.text;
      if (content) {
        const status = JSON.parse(content);
        console.log(`    Status: ${status.status}`);
        console.log(`    Healthy: ${status.healthy}`);
        console.log(`    Restart Count: ${status.restartCount}\n`);
      }
    } else {
      console.error(`✗ worker_status failed: ${statusResult.error}\n`);
    }

    // Test hello_world (secondary tool)
    console.log('Testing hello_world tool (routed to Secondary)...');
    const helloResult = await mcpInvoke(mcpId, 'hello_world', {
      name: 'MCP Test',
      excited: true,
    });

    if (helloResult.success) {
      console.log(`✓ hello_world returned in ${helloResult.duration}ms`);
      const content = (helloResult.result as any)?.content?.[0]?.text;
      if (content) {
        const greeting = JSON.parse(content);
        console.log(`    Greeting: ${greeting.greeting}\n`);
      }
    } else {
      console.error(`✗ hello_world failed: ${helloResult.error}\n`);
    }

    // Test dynamic_tool_create
    console.log('Testing dynamic_tool_create...');
    const createResult = await mcpInvoke(mcpId, 'dynamic_tool_create', {
      name: 'mcp_test_tool',
      description: 'A tool created via MCP protocol test',
      schema: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'First number' },
          y: { type: 'number', description: 'Second number' },
        },
        required: ['x', 'y'],
      },
      code: 'return { sum: (args.x as number) + (args.y as number) };',
    });

    if (createResult.success) {
      console.log(`✓ dynamic_tool_create succeeded in ${createResult.duration}ms`);

      // Wait for hot reload
      await new Promise(r => setTimeout(r, 1000));

      // Test the newly created tool
      console.log('Testing newly created mcp_test_tool...');
      const sumResult = await mcpInvoke(mcpId, 'mcp_test_tool', { x: 10, y: 32 });

      if (sumResult.success) {
        const content = (sumResult.result as any)?.content?.[0]?.text;
        if (content) {
          const result = JSON.parse(content);
          if (result.sum === 42) {
            console.log(`✓ mcp_test_tool works! 10 + 32 = ${result.sum}\n`);
          } else {
            console.log(`⚠ mcp_test_tool returned wrong result: ${result.sum}\n`);
          }
        }
      } else {
        console.log(`⚠ mcp_test_tool not yet available (hot reload may need more time)\n`);
      }
    } else {
      console.error(`✗ dynamic_tool_create failed: ${createResult.error}\n`);
    }

    // Run full test suite
    console.log('Running full test suite...');
    const testSuite = await mcpRunTests(mcpId);

    if ('error' in testSuite) {
      console.error(`✗ Test suite failed: ${testSuite.error}\n`);
    } else {
      console.log('═══════════════════════════════════════════════════════');
      console.log('                  MCP TEST RESULTS                      ');
      console.log('═══════════════════════════════════════════════════════');
      console.log(`  Server: ${testSuite.serverInfo.name} v${testSuite.serverInfo.version}`);
      console.log(`  Tools tested: ${testSuite.summary.total}`);
      console.log(`  Passed: ${testSuite.summary.passed}`);
      console.log(`  Failed: ${testSuite.summary.failed}`);
      console.log(`  Duration: ${testSuite.summary.duration}ms`);
      console.log('═══════════════════════════════════════════════════════');

      if (testSuite.summary.failed > 0) {
        console.log('\nFailed tools:');
        for (const result of testSuite.results) {
          if (!result.success) {
            console.log(`  - ${result.tool}: ${result.error}`);
          }
        }
      }

      if (testSuite.summary.failed === 0) {
        console.log('\n  🎉 All MCP protocol tests passed!\n');
      } else {
        console.log('\n  ⚠️  Some tests failed. Check output above.\n');
      }
    }

  } finally {
    // Cleanup
    if (mcpId) {
      console.log('Stopping MCP server...');
      await mcpStop(mcpId);
      console.log('✓ Stopped\n');
    }

    // Clean up test tool
    try {
      const { unlink } = await import('fs/promises');
      const toolPath = resolve(import.meta.dir, '../secondary/tools/mcp_test_tool.ts');
      await unlink(toolPath);
      console.log('✓ Cleaned up mcp_test_tool.ts');
    } catch {
      // Tool might not exist
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
