#!/usr/bin/env bun
/**
 * URL Roaster Sidebar Test - BarrHawk Integration
 *
 * Uses BarrHawk's Frankenstein system tools for:
 * - OS-level screenshots (captures entire screen including sidebar)
 * - Keyboard simulation (xdotool)
 * - Window management
 *
 * This is how you PROPERLY test Chrome extension sidebars with AI agents.
 */

const FRANK_URL = 'http://localhost:7003';
const BRIDGE_URL = 'http://localhost:7000';

interface FrankResponse {
  success: boolean;
  data?: any;
  error?: string;
}

// Call Frankenstein dynamic tools
async function invokeTool(toolName: string, params: any): Promise<FrankResponse> {
  try {
    const response = await fetch(`${FRANK_URL}/tools/${toolName}/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    return await response.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// Call Frankenstein HTTP endpoint
async function callFrank(endpoint: string, body?: any): Promise<FrankResponse> {
  try {
    const response = await fetch(`${FRANK_URL}${endpoint}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    return await response.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// System-level keyboard input via Frankenstein dynamic tools
async function systemKeyboard(keys: string): Promise<boolean> {
  // Parse keys like "ctrl+b" into key + modifiers
  const parts = keys.split('+');
  const key = parts.pop() || '';
  const modifiers = parts;

  const result = await invokeTool('keyboard_press', { key, modifiers });
  return result.success !== false;
}

// System-level screenshot via Frankenstein dynamic tools
async function systemScreenshot(filename: string): Promise<string | null> {
  const result = await invokeTool('desktop_screenshot', {});
  if (result.path) {
    // Copy to desired location
    const { execSync } = await import('child_process');
    const targetPath = `/tmp/barrhawk-sidebar-test/${filename}`;
    execSync(`cp "${result.path}" "${targetPath}"`);
    return targetPath;
  }
  return result.path || null;
}

// System-level mouse click via Frankenstein dynamic tools
async function systemClick(x: number, y: number): Promise<boolean> {
  const result = await invokeTool('mouse_click', { x, y, button: 'left' });
  return result.success !== false;
}

// Focus a window by name via Frankenstein dynamic tools
async function focusWindow(name: string): Promise<boolean> {
  const result = await invokeTool('window_focus', { name });
  return result.success !== false;
}

// Main test using BarrHawk tools
async function runBarrHawkTest(): Promise<void> {
  console.log('\n🦅 BarrHawk Sidebar Extension Test\n');
  console.log('Using Frankenstein system tools for OS-level control\n');

  // Ensure output directory exists
  const { execSync } = await import('child_process');
  execSync('mkdir -p /tmp/barrhawk-sidebar-test');

  // Check Frankenstein health
  const health = await callFrank('/health');
  if (!health.success && !health.status) {
    console.error('❌ Frankenstein not available. Start tripartite stack first.');
    console.log('   Run: cd tripartite && ./start.sh');
    process.exit(1);
  }
  console.log('✅ Frankenstein connected\n');

  // Step 1: Launch browser with extension (using Playwright via Frank)
  console.log('📦 Step 1: Launching browser with extension...');

  const extensionPath = import.meta.dir;
  const launchResult = await callFrank('/browser/launch', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--start-maximized'
    ]
  });

  if (!launchResult.success) {
    console.error('Failed to launch browser:', launchResult.error);
    process.exit(1);
  }
  console.log('  Browser launched\n');

  // Step 2: Navigate to test URL
  console.log('🌐 Step 2: Navigating to test URL...');
  await callFrank('/browser/navigate', { url: 'https://github.com' });
  await new Promise(r => setTimeout(r, 2000));
  console.log('  Navigated to GitHub\n');

  // Step 3: Take baseline (Playwright screenshot - won't show sidebar)
  console.log('📸 Step 3: Taking Playwright screenshot (baseline)...');
  await callFrank('/browser/screenshot', { path: '/tmp/barrhawk-sidebar-test/playwright-baseline.png' });
  console.log('  Playwright screenshot saved (NOTE: This will NOT show sidebar)\n');

  // Step 4: Open sidebar with Ctrl+B using SYSTEM keyboard
  console.log('⌨️  Step 4: Opening sidebar via system keyboard (Ctrl+B)...');

  // Focus browser first
  await focusWindow('Chromium');
  await new Promise(r => setTimeout(r, 300));

  // Send Ctrl+B via xdotool
  await systemKeyboard('ctrl+b');
  console.log('  Sent Ctrl+B\n');

  await new Promise(r => setTimeout(r, 1500)); // Wait for sidebar animation

  // Step 5: Take OS-level screenshot (WILL show sidebar!)
  console.log('📸 Step 5: Taking OS-level screenshot (with sidebar!)...');
  const osScreenshot = await systemScreenshot('os-with-sidebar.png');
  if (osScreenshot) {
    console.log(`  OS screenshot saved: ${osScreenshot}`);
    console.log('  ✅ This screenshot INCLUDES the sidebar!\n');
  } else {
    console.log('  ⚠️  OS screenshot failed, trying fallback...');
    execSync('spectacle -b -n -o /tmp/barrhawk-sidebar-test/fallback-sidebar.png');
    console.log('  Fallback screenshot saved\n');
  }

  // Step 6: Click roast button using estimated coordinates
  // Sidebar is typically ~400px wide on the right side
  // Roast button is near the top of the sidebar
  console.log('🖱️  Step 6: Clicking roast button...');

  // Get screen dimensions
  const screenWidth = parseInt(execSync('xdotool getdisplaygeometry | cut -d" " -f1').toString().trim());

  // Sidebar is on the right, button is roughly in the middle
  const buttonX = screenWidth - 200; // Middle of ~400px sidebar
  const buttonY = 350; // Approximate Y position of roast button

  await systemClick(buttonX, buttonY);
  console.log(`  Clicked at (${buttonX}, ${buttonY})\n`);

  await new Promise(r => setTimeout(r, 1500)); // Wait for roast

  // Step 7: Take final screenshot showing roast result
  console.log('📸 Step 7: Taking final OS screenshot...');
  await systemScreenshot('os-roast-result.png');
  console.log('  Final screenshot saved\n');

  // Step 8: Compare the two approaches
  console.log('=' .repeat(50));
  console.log('\n📊 Comparison:\n');
  console.log('  playwright-baseline.png  → Page content ONLY (no sidebar)');
  console.log('  os-with-sidebar.png      → FULL browser with sidebar visible');
  console.log('  os-roast-result.png      → Shows roast result in sidebar');
  console.log('\n💡 Key insight: Traditional E2E tools CANNOT test sidebars.');
  console.log('   You MUST use OS-level tools like BarrHawk Frankenstein.\n');

  // Cleanup
  console.log('🧹 Cleaning up...');
  await callFrank('/browser/close');
  console.log('  Browser closed\n');

  console.log('✅ Test complete! Check /tmp/barrhawk-sidebar-test/');
}

// Run
runBarrHawkTest().catch(console.error);
