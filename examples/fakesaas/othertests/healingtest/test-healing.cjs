/**
 * Healing Test - Tests self-healing selector functionality
 *
 * Uses BarrHawk MCP tools to verify that when a selector fails,
 * the self-healing mechanism finds an alternative.
 *
 * Test Plan:
 * 1. V1 (original): #login-btn should work directly
 * 2. V2 (ID removed): #login-btn fails, should heal to .btn-login or text
 * 3. V3 (data-testid): #login-btn fails, should heal to [data-testid="login-button"]
 * 4. V4 (aria-label): #login-btn fails, should heal to [aria-label="Log in to your account"]
 * 5. V5 (text only): #login-btn fails, should heal to text match "Login"
 */

const { spawn } = require('child_process');
const path = require('path');

const SERVER_PORT = 6700;
const MCP_PATH = path.resolve(__dirname, '../../../dist/index.js');

// Test versions and expected healing
const testCases = [
  {
    version: 'v1',
    description: 'Original - has #login-btn',
    selector: '#login-btn',
    shouldHeal: false,
    expectedStrategy: 'none (direct match)'
  },
  {
    version: 'v2',
    description: 'ID Removed - only class',
    selector: '#login-btn',
    shouldHeal: true,
    expectedStrategy: 'text-content or css-path'
  },
  {
    version: 'v3',
    description: 'data-testid added',
    selector: '#login-btn',
    shouldHeal: true,
    expectedStrategy: 'data-testid'
  },
  {
    version: 'v4',
    description: 'aria-label only',
    selector: '#login-btn',
    shouldHeal: true,
    expectedStrategy: 'aria-label'
  },
  {
    version: 'v5',
    description: 'Text content only',
    selector: '#login-btn',
    shouldHeal: true,
    expectedStrategy: 'text-content'
  }
];

// MCP JSON-RPC helper
let requestId = 0;
function mcpCall(method, params = {}) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: ++requestId,
    method: 'tools/call',
    params: {
      name: method,
      arguments: params
    }
  });
}

async function runTest() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║          SELF-HEALING SELECTOR TEST                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Start MCP server
  console.log('Starting MCP server...');
  const mcp = spawn('node', [MCP_PATH], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let outputBuffer = '';
  const results = [];

  mcp.stdout.on('data', (data) => {
    outputBuffer += data.toString();
  });

  mcp.stderr.on('data', (data) => {
    console.error('MCP stderr:', data.toString());
  });

  // Helper to send command and wait for response
  async function sendCommand(command) {
    return new Promise((resolve) => {
      outputBuffer = '';
      mcp.stdin.write(command + '\n');

      setTimeout(() => {
        try {
          // Find last complete JSON object
          const lines = outputBuffer.split('\n').filter(l => l.trim());
          for (let i = lines.length - 1; i >= 0; i--) {
            try {
              const parsed = JSON.parse(lines[i]);
              resolve(parsed);
              return;
            } catch {}
          }
          resolve({ error: 'No valid JSON response', raw: outputBuffer });
        } catch (e) {
          resolve({ error: e.message, raw: outputBuffer });
        }
      }, 2000);
    });
  }

  try {
    // Initialize
    console.log('Initializing MCP...');
    await sendCommand(JSON.stringify({
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'healing-test', version: '1.0.0' }
      }
    }));

    // Launch browser
    console.log('\n📱 Launching browser...');
    const launchResult = await sendCommand(mcpCall('browser_launch', { headless: false }));
    console.log('Launch result:', JSON.stringify(launchResult).substring(0, 200));

    // Enable self-healing
    console.log('\n🔧 Enabling self-healing...');
    await sendCommand(mcpCall('self_heal_enable', { enabled: true }));

    // Run each test case
    for (const tc of testCases) {
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`📝 Testing ${tc.version}: ${tc.description}`);
      console.log(`   Selector: ${tc.selector}`);
      console.log(`   Should heal: ${tc.shouldHeal}`);
      console.log(`   Expected strategy: ${tc.expectedStrategy}`);

      // Navigate to test page
      const url = `http://localhost:${SERVER_PORT}/${tc.version}`;
      console.log(`\n   🌐 Navigating to ${url}`);
      const navResult = await sendCommand(mcpCall('browser_navigate', { url }));

      // Wait for page load
      await new Promise(r => setTimeout(r, 500));

      // Try to click the button
      console.log(`   🖱️ Clicking ${tc.selector}...`);
      const clickResult = await sendCommand(mcpCall('browser_click', {
        selector: tc.selector,
        self_heal: true
      }));

      // Parse result
      let healed = false;
      let strategy = 'unknown';
      let success = false;

      if (clickResult.result?.content) {
        const content = clickResult.result.content;
        if (Array.isArray(content)) {
          for (const item of content) {
            if (item.text) {
              success = item.text.includes('success') || item.text.includes('clicked');
              if (item.text.includes('healed')) {
                healed = true;
                // Try to extract strategy
                const strategyMatch = item.text.match(/strategy[:\s]+(\w+)/i);
                if (strategyMatch) strategy = strategyMatch[1];
              }
            }
          }
        }
      }

      // Check if result element is visible (login success)
      const textResult = await sendCommand(mcpCall('browser_get_text', { selector: '#result' }));
      const resultVisible = textResult.result?.content?.[0]?.text?.includes('Login successful');

      results.push({
        version: tc.version,
        description: tc.description,
        selectorWorked: success || resultVisible,
        healed: healed,
        strategy: strategy,
        expectedHeal: tc.shouldHeal,
        passed: (tc.shouldHeal === healed) || (!tc.shouldHeal && (success || resultVisible))
      });

      console.log(`   Result: ${success || resultVisible ? '✅' : '❌'} Click ${success || resultVisible ? 'succeeded' : 'failed'}`);
      console.log(`   Healed: ${healed ? '🔄 Yes' : '➡️ No'}`);
      if (healed) console.log(`   Strategy: ${strategy}`);
    }

    // Close browser
    console.log('\n📴 Closing browser...');
    await sendCommand(mcpCall('browser_close'));

    // Get healing report
    console.log('\n📊 Getting healing report...');
    const report = await sendCommand(mcpCall('self_heal_report', { format: 'detailed' }));
    console.log('Healing report:', JSON.stringify(report, null, 2).substring(0, 500));

  } catch (e) {
    console.error('Test error:', e);
  } finally {
    mcp.kill();
  }

  // Print summary
  console.log('\n\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    TEST RESULTS                            ║');
  console.log('╠════════════════════════════════════════════════════════════╣');

  for (const r of results) {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`║ ${r.version}: ${r.description.padEnd(30)} ${status.padEnd(10)} ║`);
    console.log(`║   Healed: ${r.healed ? 'Yes' : 'No'} | Strategy: ${r.strategy.padEnd(15)}       ║`);
  }

  const passCount = results.filter(r => r.passed).length;
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║ Total: ${passCount}/${results.length} passed                                       ║`);
  console.log('╚════════════════════════════════════════════════════════════╝');

  return results;
}

// Run if called directly
if (require.main === module) {
  runTest().then(() => {
    process.exit(0);
  }).catch(e => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { runTest, testCases };
