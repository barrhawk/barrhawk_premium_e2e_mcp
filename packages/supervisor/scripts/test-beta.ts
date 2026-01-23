#!/usr/bin/env bun
/**
 * Beta Test Script - Tests Primary/Secondary without MCP client
 *
 * Usage: bun run beta:test
 */

import { spawn, type Subprocess } from 'bun';
import { resolve } from 'path';

const SECONDARY_PORT = 3001;
const BASE_URL = `http://localhost:${SECONDARY_PORT}`;

let secondaryProcess: Subprocess | null = null;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForHealthy(timeout = 10000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`${BASE_URL}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) {
        const health = await res.json();
        if (health.status === 'healthy') return true;
      }
    } catch {
      // Not ready yet
    }
    await sleep(200);
  }
  return false;
}

async function startSecondary(): Promise<void> {
  console.log('Starting Secondary server...');

  const scriptPath = resolve(import.meta.dir, '../secondary/index.ts');

  secondaryProcess = spawn({
    cmd: ['bun', '--hot', 'run', scriptPath],
    env: {
      ...process.env,
      PORT: String(SECONDARY_PORT),
    },
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const ready = await waitForHealthy();
  if (!ready) {
    throw new Error('Secondary failed to start');
  }

  console.log('✓ Secondary is healthy\n');
}

async function stopSecondary(): Promise<void> {
  if (secondaryProcess) {
    try {
      await fetch(`${BASE_URL}/shutdown`, { method: 'POST' });
    } catch {
      secondaryProcess.kill();
    }
    secondaryProcess = null;
  }
}

async function testHealth(): Promise<boolean> {
  console.log('Testing /health endpoint...');
  const res = await fetch(`${BASE_URL}/health`);
  const health = await res.json();

  console.log(`  Status: ${health.status}`);
  console.log(`  Uptime: ${health.uptime}ms`);
  console.log(`  Tools: ${health.toolCount}`);
  console.log(`  Memory: ${(health.memoryUsage.heapUsed / 1024 / 1024).toFixed(1)}MB\n`);

  return health.status === 'healthy';
}

async function testTools(): Promise<boolean> {
  console.log('Testing /tools endpoint...');
  const res = await fetch(`${BASE_URL}/tools`);
  const tools = await res.json();

  console.log(`  Found ${tools.length} tools:`);
  for (const tool of tools) {
    console.log(`    - ${tool.name}: ${tool.description.slice(0, 50)}...`);
  }
  console.log('');

  return tools.length > 0;
}

async function testToolCall(): Promise<boolean> {
  console.log('Testing tool execution...');

  // Test hello_world
  const res = await fetch(`${BASE_URL}/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: 'hello_world',
      args: { name: 'BetaTest', excited: true },
    }),
  });

  const result = await res.json();

  if (result.content && result.content[0]) {
    const data = JSON.parse(result.content[0].text);
    console.log(`  hello_world returned: ${data.greeting}`);

    if (data.greeting.includes('BetaTest')) {
      console.log('  ✓ Tool execution works!\n');
      return true;
    }
  }

  console.log('  ✗ Tool execution failed\n');
  return false;
}

async function testDynamicToolCreate(): Promise<boolean> {
  console.log('Testing dynamic tool creation...');

  const res = await fetch(`${BASE_URL}/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: 'dynamic_tool_create',
      args: {
        name: 'beta_test_tool',
        description: 'A tool created during beta testing',
        schema: {
          type: 'object',
          properties: {
            value: { type: 'number', description: 'A number to double' },
          },
          required: ['value'],
        },
        code: 'return { doubled: (args.value as number) * 2 };',
      },
    }),
  });

  const result = await res.json();
  const data = JSON.parse(result.content[0].text);

  if (data.success) {
    console.log(`  ✓ Created tool: ${data.message}\n`);

    // Wait for hot reload
    await sleep(500);

    // Test the new tool
    console.log('Testing newly created tool...');
    const testRes = await fetch(`${BASE_URL}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'beta_test_tool',
        args: { value: 21 },
      }),
    });

    const testResult = await testRes.json();
    const testData = JSON.parse(testResult.content[0].text);

    if (testData.doubled === 42) {
      console.log(`  ✓ Dynamic tool works! 21 * 2 = ${testData.doubled}\n`);
      return true;
    }
  }

  console.log(`  ✗ Dynamic tool creation failed: ${data.error || 'unknown'}\n`);
  return false;
}

async function cleanup(): Promise<void> {
  // Delete the test tool we created
  console.log('Cleaning up test artifacts...');

  try {
    const { unlink } = await import('fs/promises');
    const toolPath = resolve(import.meta.dir, '../secondary/tools/beta_test_tool.ts');
    await unlink(toolPath);
    console.log('  ✓ Removed beta_test_tool.ts\n');
  } catch {
    // Tool might not exist
  }
}

async function main(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║         BarrHawk Supervisor - Beta Test Suite         ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  const results: { test: string; passed: boolean }[] = [];

  try {
    await startSecondary();

    results.push({ test: 'Health Check', passed: await testHealth() });
    results.push({ test: 'Tool Listing', passed: await testTools() });
    results.push({ test: 'Tool Execution', passed: await testToolCall() });
    results.push({ test: 'Dynamic Tool Creation', passed: await testDynamicToolCreate() });

    await cleanup();

  } finally {
    await stopSecondary();
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════');
  console.log('                    TEST RESULTS                        ');
  console.log('═══════════════════════════════════════════════════════');

  let allPassed = true;
  for (const { test, passed } of results) {
    const icon = passed ? '✓' : '✗';
    const status = passed ? 'PASS' : 'FAIL';
    console.log(`  ${icon} ${test.padEnd(25)} ${status}`);
    if (!passed) allPassed = false;
  }

  console.log('═══════════════════════════════════════════════════════');

  if (allPassed) {
    console.log('\n  🎉 All tests passed! Beta is ready.\n');
    process.exit(0);
  } else {
    console.log('\n  ⚠️  Some tests failed. Check output above.\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  stopSecondary();
  process.exit(1);
});
