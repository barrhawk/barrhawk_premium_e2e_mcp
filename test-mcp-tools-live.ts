/**
 * Live MCP Tools Test
 *
 * Tests the MCP tools end-to-end using the browser automation tools
 * combined with the new Phase 2 AI tools against FakeSaaS.
 */

import { chromium, type Browser, type Page, type BrowserContext } from 'playwright';

// Import all AI tools
import {
  testFromDescription,
  formatTestAsCode,
  formatTestAsMCPCalls,
  generateTestsFromUrl,
  generateTestsFromFlow,
  formatTestSuite,
  explainTest,
  formatTestExplanation,
  suggestFix,
  formatFixSuggestions,
  compareRuns,
  formatCompareResults,
  generateAccessibilityFix,
  formatAccessibilityFix,
  generateAccessibilityReport,
  accessibilityAudit,
  formatAuditResult,
  smartAssert,
  analyzeFailure,
  formatAnalysisResult,
  type TestRunData,
} from './packages/ai-tools/src/index.js';

const FAKESAAS_URL = process.env.FAKESAAS_URL || 'http://localhost:4000';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  output?: string;
  error?: string;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<any>): Promise<void> {
  const start = Date.now();
  console.log(`\n🧪 ${name}`);

  try {
    const output = await fn();
    results.push({
      name,
      passed: true,
      duration: Date.now() - start,
      output: typeof output === 'string' ? output.substring(0, 300) : JSON.stringify(output).substring(0, 300),
    });
    console.log(`   ✅ PASSED (${Date.now() - start}ms)`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    results.push({
      name,
      passed: false,
      duration: Date.now() - start,
      error: msg,
    });
    console.log(`   ❌ FAILED: ${msg}`);
  }
}

async function main() {
  console.log('═'.repeat(70));
  console.log('Live MCP Tools E2E Test');
  console.log('Testing all tools against FakeSaaS');
  console.log('═'.repeat(70));

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    // Setup
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await context.newPage();

    console.log('\n📦 Browser launched');

    // =========================================================================
    // SECTION 1: Browser Automation Tools
    // =========================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('SECTION 1: Browser Automation');
    console.log('─'.repeat(70));

    await test('Navigate to FakeSaaS', async () => {
      await page!.goto(FAKESAAS_URL);
      const title = await page!.title();
      if (!title) throw new Error('Page has no title');
      return `Title: ${title}`;
    });

    await test('Take screenshot', async () => {
      const screenshot = await page!.screenshot({ type: 'png' });
      if (screenshot.length < 1000) throw new Error('Screenshot too small');
      return `Screenshot size: ${screenshot.length} bytes`;
    });

    await test('Get page text', async () => {
      const text = await page!.textContent('body');
      if (!text || text.length < 10) throw new Error('No page text');
      return `Text length: ${text.length}`;
    });

    await test('Find form elements', async () => {
      const inputs = await page!.$$('input');
      const buttons = await page!.$$('button');
      return `Found ${inputs.length} inputs, ${buttons.length} buttons`;
    });

    await test('Type into email field', async () => {
      await page!.fill('#email', 'demo@example.com');
      const value = await page!.$eval('#email', (el: any) => el.value);
      if (value !== 'demo@example.com') throw new Error('Value not set');
      return 'Email field filled';
    });

    await test('Type into password field', async () => {
      await page!.fill('#password', 'demo123');
      const value = await page!.$eval('#password', (el: any) => el.value);
      if (value !== 'demo123') throw new Error('Value not set');
      return 'Password field filled';
    });

    await test('Click login button', async () => {
      await page!.click('button[type="submit"]');
      await page!.waitForURL('**/dashboard', { timeout: 5000 });
      return `URL: ${page!.url()}`;
    });

    await test('Verify dashboard loaded', async () => {
      const heading = await page!.textContent('h1');
      if (!heading?.includes('Dashboard')) throw new Error('Dashboard not loaded');
      return `Heading: ${heading}`;
    });

    // =========================================================================
    // SECTION 2: AI-Powered Test Generation
    // =========================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('SECTION 2: AI Test Generation Tools');
    console.log('─'.repeat(70));

    await test('test_from_description - Login flow', async () => {
      const result = await testFromDescription({
        description: 'Login to the app with valid credentials and verify success message',
        baseUrl: FAKESAAS_URL,
      });
      if (result.steps.length === 0) throw new Error('No steps generated');
      return `Generated ${result.steps.length} steps, ${result.assertions.length} assertions`;
    });

    await test('test_from_description - Search flow', async () => {
      const result = await testFromDescription({
        description: 'Search for "test" and verify results are displayed',
        baseUrl: FAKESAAS_URL,
      });
      return `Generated ${result.steps.length} steps`;
    });

    await test('generate_tests_from_url - Dashboard', async () => {
      const tests = await generateTestsFromUrl({
        page,
        url: `${FAKESAAS_URL}/dashboard`,
        focus: ['buttons', 'navigation'],
        maxTests: 5,
      });
      if (tests.length === 0) throw new Error('No tests generated');
      return `Generated ${tests.length} tests`;
    });

    await test('generate_tests_from_flow - Settings flow', async () => {
      const tests = await generateTestsFromFlow({
        flow: 'User settings update flow - change name and save',
        baseUrl: FAKESAAS_URL,
      });
      if (tests.length === 0) throw new Error('No tests generated');
      return `Generated ${tests.length} tests`;
    });

    await test('formatTestSuite', async () => {
      const tests = await generateTestsFromFlow({
        flow: 'Simple navigation test',
      });
      const formatted = formatTestSuite(tests);
      if (formatted.length < 50) throw new Error('Formatted output too short');
      return `Formatted ${formatted.length} chars`;
    });

    // =========================================================================
    // SECTION 3: Test Analysis Tools
    // =========================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('SECTION 3: Test Analysis Tools');
    console.log('─'.repeat(70));

    const testCode = `
test('dashboard loads', async ({ page }) => {
  await page.goto('http://localhost:3333/dashboard');
  await page.waitForSelector('.stats-grid');
  expect(await page.textContent('h1')).toContain('Dashboard');
  const stats = await page.$$('.stat-card');
  expect(stats.length).toBeGreaterThan(0);
});`;

    await test('test_explain', async () => {
      const explanation = explainTest({
        testCode,
        testName: 'Dashboard Test',
        format: 'detailed',
      });
      if (!explanation.summary) throw new Error('No summary');
      return `${explanation.steps.length} steps explained`;
    });

    await test('formatTestExplanation', async () => {
      const explanation = explainTest({ testCode });
      const formatted = formatTestExplanation(explanation);
      if (!formatted.includes('Steps')) throw new Error('Missing steps section');
      return 'Explanation formatted';
    });

    // =========================================================================
    // SECTION 4: Failure Analysis Tools
    // =========================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('SECTION 4: Failure Analysis Tools');
    console.log('─'.repeat(70));

    await test('suggest_fix - Timeout error', async () => {
      const result = suggestFix({
        errorMessage: 'TimeoutError: Waiting for selector "#nonexistent" failed',
        testCode: 'await page.click("#nonexistent");',
        html: '<div id="existing-button">Click me</div>',
      });
      if (result.fixes.length === 0) throw new Error('No fixes suggested');
      return `${result.fixes.length} fixes suggested (${Math.round(result.confidence * 100)}% confidence)`;
    });

    await test('suggest_fix - Assertion failure', async () => {
      const result = suggestFix({
        errorMessage: 'Expected "Dashboard" to equal "Home"',
        testCode: 'expect(title).toBe("Home")',
      });
      return `${result.fixes.length} fixes, diagnosis: ${result.diagnosis.substring(0, 50)}`;
    });

    await test('analyze_failure', async () => {
      const result = await analyzeFailure({
        error: 'Element not found: #submit-btn',
        selector: '#submit-btn',
        action: 'click',
        htmlSnapshot: '<button id="submitBtn">Submit</button>',
      });
      return `Root cause: ${result.rootCause.type} (${Math.round(result.rootCause.confidence * 100)}%)`;
    });

    await test('compare_runs', async () => {
      const passingRun: TestRunData = {
        id: 'pass-1',
        status: 'passed',
        timestamp: new Date().toISOString(),
        duration: 3000,
        steps: [
          { name: 'Navigate', action: 'goto', duration: 500, status: 'passed' },
          { name: 'Click', action: 'click', selector: '#btn', duration: 100, status: 'passed' },
        ],
      };

      const failingRun: TestRunData = {
        id: 'fail-1',
        status: 'failed',
        timestamp: new Date().toISOString(),
        duration: 35000,
        steps: [
          { name: 'Navigate', action: 'goto', duration: 500, status: 'passed' },
          { name: 'Click', action: 'click', selector: '#btn', duration: 30000, status: 'failed', error: 'Timeout' },
        ],
        errorMessage: 'Timeout clicking button',
      };

      const comparison = compareRuns({ passingRun, failingRun });
      return `${comparison.differences.length} differences found`;
    });

    // =========================================================================
    // SECTION 5: Smart Assertions
    // =========================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('SECTION 5: Smart Assertions');
    console.log('─'.repeat(70));

    await test('smart_assert - Valid assertion', async () => {
      const dashboardText = await page!.textContent('body') || '';
      const result = await smartAssert({
        actual: dashboardText,
        expected: 'should contain dashboard content with stats',
      });
      return `Passed: ${result.passed}, Confidence: ${Math.round(result.confidence * 100)}%`;
    });

    await test('smart_assert - Array check', async () => {
      const buttons = await page!.$$('button');
      const result = await smartAssert({
        actual: buttons.length,
        expected: 'should have at least one button',
      });
      return `Passed: ${result.passed}, Reason: ${result.reason}`;
    });

    await test('smart_assert - Object check', async () => {
      const result = await smartAssert({
        actual: { status: 'success', count: 5 },
        expected: 'should be an object with success status',
      });
      return `Passed: ${result.passed}`;
    });

    // =========================================================================
    // SECTION 6: Accessibility Tools
    // =========================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('SECTION 6: Accessibility Tools');
    console.log('─'.repeat(70));

    await test('accessibility_audit', async () => {
      const result = await accessibilityAudit({
        page,
        level: 'AA',
        includeWarnings: true,
      });
      return `Score: ${result.score}, Issues: ${result.issues.length}`;
    });

    await test('formatAuditResult', async () => {
      const audit = await accessibilityAudit({ page, level: 'AA' });
      const formatted = formatAuditResult(audit);
      return `Formatted ${formatted.length} chars`;
    });

    await test('accessibility_fix', async () => {
      const fix = generateAccessibilityFix({
        issue: {
          rule: 'button-name',
          severity: 'error',
          element: 'button.icon-btn',
          message: 'Button has no accessible name',
          suggestion: 'Add aria-label',
          impact: 'critical',
          html: '<button class="icon-btn"><svg>...</svg></button>',
        },
        framework: 'react',
      });
      return `Fix generated with ${fix.testingTips.length} tips`;
    });

    await test('accessibility_report (HTML)', async () => {
      const audit = await accessibilityAudit({ page });
      const report = generateAccessibilityReport({
        auditResult: audit,
        pageTitle: 'FakeSaaS Dashboard',
        pageUrl: `${FAKESAAS_URL}/dashboard`,
        format: 'html',
      });
      if (!report.content.includes('<!DOCTYPE')) throw new Error('Invalid HTML');
      return `Generated ${report.content.length} char HTML report`;
    });

    await test('accessibility_report (Markdown)', async () => {
      const audit = await accessibilityAudit({ page });
      const report = generateAccessibilityReport({
        auditResult: audit,
        pageTitle: 'FakeSaaS Dashboard',
        format: 'markdown',
      });
      if (!report.content.includes('#')) throw new Error('Invalid Markdown');
      return `Generated ${report.content.length} char MD report`;
    });

    // =========================================================================
    // SECTION 7: Navigation Tests
    // =========================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('SECTION 7: Additional Navigation Tests');
    console.log('─'.repeat(70));

    await test('Navigate to Settings', async () => {
      await page!.click('a[href="/settings"]');
      await page!.waitForURL('**/settings');
      const heading = await page!.textContent('h1');
      return `Settings page: ${heading}`;
    });

    await test('Generate tests for Settings page', async () => {
      const tests = await generateTestsFromUrl({
        page,
        focus: ['forms', 'inputs'],
        maxTests: 3,
      });
      return `Generated ${tests.length} tests for settings`;
    });

    await test('Logout', async () => {
      const logoutBtn = await page!.$('a[href="/api/logout"], button:has-text("Logout")');
      if (logoutBtn) {
        await logoutBtn.click();
      } else {
        await page!.goto(`${FAKESAAS_URL}/api/logout`);
      }
      await page!.waitForURL('**/', { timeout: 5000 });
      return 'Logged out successfully';
    });

  } catch (error) {
    console.error('\n💥 Test suite error:', error);
  } finally {
    if (page) await page.close();
    if (context) await context.close();
    if (browser) await browser.close();
  }

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('TEST SUMMARY');
  console.log('═'.repeat(70));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\n📊 Total: ${results.length} tests`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`\n📈 Pass Rate: ${((passed / results.length) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log('\n' + '─'.repeat(70));
    console.log('FAILED TESTS:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`\n❌ ${r.name}`);
      console.log(`   Error: ${r.error}`);
    }
  }

  console.log('\n' + '─'.repeat(70));
  console.log('ALL RESULTS:');
  console.log('─'.repeat(70));

  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} ${r.name.padEnd(40)} ${r.duration.toString().padStart(5)}ms`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
