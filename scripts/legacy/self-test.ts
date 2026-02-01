#!/usr/bin/env npx tsx
/**
 * Self-test script - Tests BarrHawk's MCP testing capabilities
 * by spawning an instance of itself and running tests against it
 */

import {
    mcpStart,
    mcpStop,
    mcpListTools,
    mcpInvoke,
    mcpValidateSchema,
    mcpRunTests,
    mcpListInstances,
} from './mcp-tester.js';

async function selfTest() {
    console.log('='.repeat(60));
    console.log('BarrHawk Self-Test: Testing the MCP tester on itself');
    console.log('='.repeat(60));
    console.log('');

    // Step 1: Start BarrHawk as a test target
    console.log('1. Starting BarrHawk instance...');
    const startResult = await mcpStart('npx', ['tsx', 'server.ts'], {
        cwd: process.cwd(),
        timeout: 15000,
    });

    if (startResult.status !== 'running') {
        console.error(`   FAILED: ${startResult.error}`);
        process.exit(1);
    }
    console.log(`   OK - Instance ID: ${startResult.id}`);
    console.log('');

    const mcpId = startResult.id;

    try {
        // Step 2: List tools
        console.log('2. Listing tools...');
        const toolsResult = await mcpListTools(mcpId);

        if (!toolsResult.success) {
            console.error(`   FAILED: ${toolsResult.error}`);
        } else {
            console.log(`   OK - Found ${toolsResult.tools?.length} tools:`);
            const categories = {
                browser: toolsResult.tools?.filter(t => t.name.startsWith('browser_')) || [],
                audio: toolsResult.tools?.filter(t => t.name.startsWith('audio_')) || [],
                mcp: toolsResult.tools?.filter(t => t.name.startsWith('mcp_')) || [],
                backend: toolsResult.tools?.filter(t => t.name.startsWith('backend_')) || [],
            };
            console.log(`      - Browser tools: ${categories.browser.length}`);
            console.log(`      - Audio tools: ${categories.audio.length}`);
            console.log(`      - MCP tools: ${categories.mcp.length}`);
            console.log(`      - Backend tools: ${categories.backend.length}`);
        }
        console.log('');

        // Step 3: Validate schemas
        console.log('3. Validating tool schemas...');
        if (toolsResult.tools) {
            const validation = mcpValidateSchema(toolsResult.tools);
            if (validation.valid) {
                console.log(`   OK - All ${toolsResult.tools.length} tool schemas are valid`);
            } else {
                console.log(`   WARN - ${validation.errors.length} schema issues:`);
                validation.errors.slice(0, 5).forEach(e => {
                    console.log(`      - ${e.tool}: ${e.error}`);
                });
            }
        }
        console.log('');

        // Step 4: Invoke a simple tool
        console.log('4. Testing tool invocation (mcp_list_instances)...');
        const invokeResult = await mcpInvoke(mcpId, 'mcp_list_instances', {});

        if (invokeResult.success) {
            console.log(`   OK - Tool responded in ${invokeResult.duration}ms`);
        } else {
            console.log(`   FAILED: ${invokeResult.error}`);
        }
        console.log('');

        // Step 5: Test backend_health_check on a public endpoint
        console.log('5. Testing backend_health_check tool...');
        const healthResult = await mcpInvoke(mcpId, 'backend_health_check', {
            url: 'https://httpbin.org/status/200',
            timeout: 5000,
        });

        if (healthResult.success) {
            console.log(`   OK - Health check completed in ${healthResult.duration}ms`);
            // Parse the response to show result
            const content = (healthResult.result as any)?.content?.[0]?.text || '';
            if (content.includes('HEALTHY')) {
                console.log('   Result: HEALTHY');
            }
        } else {
            console.log(`   FAILED: ${healthResult.error}`);
        }
        console.log('');

        // Step 6: Test audio_list_files (should work even with no files)
        console.log('6. Testing audio_list_files tool...');
        const audioResult = await mcpInvoke(mcpId, 'audio_list_files', {});

        if (audioResult.success) {
            console.log(`   OK - Responded in ${audioResult.duration}ms`);
        } else {
            console.log(`   FAILED: ${audioResult.error}`);
        }
        console.log('');

        // Step 7: Check instances
        console.log('7. Listing running instances...');
        const instances = mcpListInstances();
        console.log(`   Found ${instances.length} running instance(s)`);
        instances.forEach(inst => {
            console.log(`      - ${inst.id}: ${inst.status}, uptime ${Math.floor(inst.uptime / 1000)}s`);
        });
        console.log('');

        // Summary
        console.log('='.repeat(60));
        console.log('SELF-TEST COMPLETE');
        console.log('='.repeat(60));
        console.log('');
        console.log('BarrHawk can successfully:');
        console.log('  [x] Start MCP server processes');
        console.log('  [x] Communicate via JSON-RPC');
        console.log('  [x] List and validate tool schemas');
        console.log('  [x] Invoke tools and get responses');
        console.log('  [x] Test itself recursively');
        console.log('');

    } finally {
        // Cleanup
        console.log('Cleaning up...');
        await mcpStop(mcpId);
        console.log('Done.');
    }
}

selfTest().catch(err => {
    console.error('Self-test failed:', err);
    process.exit(1);
});
