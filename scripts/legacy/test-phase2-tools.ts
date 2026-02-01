/**
 * Phase 2 AI Tools Test Suite
 *
 * Tests all new Phase 2 AI tools using the FakeSaaS application.
 * Uses ModelContextVerify to validate MCP tool functionality.
 */

import {
  ModelContextVerify,
  validators,
  createTestSuite,
  type ToolResult,
  type TestSuiteResult,
} from './packages/testing/src/model-context-verify.js';

// Import tool handlers directly for testing
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
  type GeneratedTest,
  type TestRunData,
  type A11yAuditResult,
  type A11yIssue,
} from './packages/ai-tools/src/index.js';

import { chromium, type Browser, type Page, type BrowserContext } from 'playwright';

const FAKESAAS_URL = process.env.FAKESAAS_URL || 'http://localhost:4000';

// Test results storage
const testResults: Array<{
  tool: string;
  passed: boolean;
  message: string;
  duration: number;
  output?: string;
}> = [];

/**
 * Run a test and record the result
 */
async function runTest<T>(
  toolName: string,
  testFn: () => Promise<T>,
  validate: (result: T) => { passed: boolean; message: string }
): Promise<T | null> {
  const startTime = Date.now();
  console.log(`\n🧪 Testing: ${toolName}`);

  try {
    const result = await testFn();
    const validation = validate(result);
    const duration = Date.now() - startTime;

    testResults.push({
      tool: toolName,
      passed: validation.passed,
      message: validation.message,
      duration,
      output: typeof result === 'string' ? result.substring(0, 500) : JSON.stringify(result).substring(0, 500),
    });

    if (validation.passed) {
      console.log(`   ✅ PASSED: ${validation.message} (${duration}ms)`);
    } else {
      console.log(`   ❌ FAILED: ${validation.message} (${duration}ms)`);
    }

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    testResults.push({
      tool: toolName,
      passed: false,
      message: `Error: ${errorMsg}`,
      duration,
    });

    console.log(`   💥 ERROR: ${errorMsg} (${duration}ms)`);
    return null;
  }
}

/**
 * Main test runner
 */
async function runPhase2Tests() {
  console.log('═'.repeat(60));
  console.log('Phase 2 AI Tools Test Suite');
  console.log('Testing against FakeSaaS at ' + FAKESAAS_URL);
  console.log('═'.repeat(60));

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    // Launch browser
    console.log('\n📦 Launching browser...');
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await context.newPage();

    // Navigate to FakeSaaS
    console.log('🌐 Navigating to FakeSaaS...');
    await page.goto(FAKESAAS_URL);
    await page.waitForLoadState('networkidle');

    // =========================================================================
    // TEST 1: test_from_description
    // =========================================================================
    const generatedTest = await runTest(
      'test_from_description',
      async () => {
        return await testFromDescription({
          description: 'Login to FakeSaaS with email demo@example.com and password demo123, then verify the dashboard loads with welcome message',
          baseUrl: FAKESAAS_URL,
        });
      },
      (result: GeneratedTest) => ({
        passed: result.steps.length > 0 && result.assertions.length > 0,
        message: `Generated ${result.steps.length} steps and ${result.assertions.length} assertions`,
      })
    );

    // Format as code
    if (generatedTest) {
      await runTest(
        'formatTestAsCode',
        async () => formatTestAsCode(generatedTest),
        (result: string) => ({
          passed: result.includes('async') || result.includes('await'),
          message: result.includes('async') ? 'Generated valid async test code' : 'Missing async keywords',
        })
      );

      // Format as MCP calls
      await runTest(
        'formatTestAsMCPCalls',
        async () => formatTestAsMCPCalls(generatedTest),
        (result: string) => ({
          passed: result.includes('browser_') || result.includes('mcp'),
          message: result.includes('browser_') ? 'Generated valid MCP tool calls' : 'Missing MCP tool references',
        })
      );
    }

    // =========================================================================
    // TEST 2: generate_tests_from_url (requires page)
    // =========================================================================
    await runTest(
      'generate_tests_from_url',
      async () => {
        return await generateTestsFromUrl({
          page,
          url: FAKESAAS_URL,
          focus: ['forms', 'buttons', 'inputs'],
          maxTests: 5,
        });
      },
      (result: GeneratedTest[]) => ({
        passed: result.length > 0,
        message: `Generated ${result.length} tests from page analysis`,
      })
    );

    // =========================================================================
    // TEST 3: generate_tests_from_flow
    // =========================================================================
    const flowTests = await runTest(
      'generate_tests_from_flow',
      async () => {
        return await generateTestsFromFlow({
          flow: 'User login flow with email and password authentication',
          baseUrl: FAKESAAS_URL,
          page,
        });
      },
      (result: GeneratedTest[]) => ({
        passed: result.length > 0,
        message: `Generated ${result.length} tests from flow description`,
      })
    );

    // Format test suite
    if (flowTests && flowTests.length > 0) {
      await runTest(
        'formatTestSuite',
        async () => formatTestSuite(flowTests),
        (result: string) => ({
          passed: result.length > 100,
          message: `Formatted test suite (${result.length} chars)`,
        })
      );
    }

    // =========================================================================
    // TEST 4: test_explain
    // =========================================================================
    const sampleTestCode = `
test('login flow', async ({ page }) => {
  await page.goto('http://localhost:3333');
  await page.fill('#email', 'demo@example.com');
  await page.fill('#password', 'demo123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard');
  expect(await page.textContent('h1')).toContain('Dashboard');
});
`;

    const explanation = await runTest(
      'test_explain',
      async () => {
        return explainTest({
          testCode: sampleTestCode,
          testName: 'Login Flow Test',
          format: 'detailed',
          includeAssertions: true,
          includeCoverage: true,
        });
      },
      (result) => ({
        passed: result.steps.length > 0 && result.summary.length > 0,
        message: `Explained test with ${result.steps.length} steps identified`,
      })
    );

    // Format explanation
    if (explanation) {
      await runTest(
        'formatTestExplanation',
        async () => formatTestExplanation(explanation),
        (result: string) => ({
          passed: result.includes('Summary') || result.includes('Steps'),
          message: 'Formatted test explanation with sections',
        })
      );
    }

    // =========================================================================
    // TEST 5: suggest_fix
    // =========================================================================
    const fixSuggestion = await runTest(
      'suggest_fix',
      async () => {
        return suggestFix({
          errorMessage: 'TimeoutError: locator.click: Timeout 30000ms exceeded. Waiting for locator("#submit-button")',
          testCode: 'await page.click("#submit-button");',
          stackTrace: 'at Object.click (test.spec.ts:15:12)',
          html: '<div class="container"><button id="submitBtn" type="submit">Submit</button></div>',
        });
      },
      (result) => ({
        passed: result.fixes.length > 0 && result.diagnosis.length > 0,
        message: `Suggested ${result.fixes.length} fixes with ${Math.round(result.confidence * 100)}% confidence`,
      })
    );

    // Format fix suggestions
    if (fixSuggestion) {
      await runTest(
        'formatFixSuggestions',
        async () => formatFixSuggestions(fixSuggestion),
        (result: string) => ({
          passed: result.includes('Fix') || result.includes('Suggestion'),
          message: 'Formatted fix suggestions with recommendations',
        })
      );
    }

    // =========================================================================
    // TEST 6: compare_runs
    // =========================================================================
    const passingRun: TestRunData = {
      id: 'run-001',
      status: 'passed',
      timestamp: new Date().toISOString(),
      duration: 5000,
      steps: [
        { name: 'Navigate', action: 'goto', duration: 1000, status: 'passed' },
        { name: 'Fill email', action: 'fill', selector: '#email', duration: 500, status: 'passed' },
        { name: 'Fill password', action: 'fill', selector: '#password', duration: 500, status: 'passed' },
        { name: 'Click login', action: 'click', selector: 'button[type=submit]', duration: 300, status: 'passed' },
        { name: 'Verify dashboard', action: 'assert', duration: 200, status: 'passed' },
      ],
      environment: {
        browser: 'chromium',
        viewport: { width: 1280, height: 800 },
        baseUrl: FAKESAAS_URL,
      },
      networkRequests: [
        { url: `${FAKESAAS_URL}/api/login`, method: 'POST', status: 200, duration: 150 },
      ],
    };

    const failingRun: TestRunData = {
      id: 'run-002',
      status: 'failed',
      timestamp: new Date().toISOString(),
      duration: 35000,
      steps: [
        { name: 'Navigate', action: 'goto', duration: 1000, status: 'passed' },
        { name: 'Fill email', action: 'fill', selector: '#email', duration: 500, status: 'passed' },
        { name: 'Fill password', action: 'fill', selector: '#password', duration: 500, status: 'passed' },
        { name: 'Click login', action: 'click', selector: 'button[type=submit]', duration: 300, status: 'passed' },
        { name: 'Verify dashboard', action: 'assert', duration: 30000, status: 'failed', error: 'Timeout waiting for dashboard' },
      ],
      environment: {
        browser: 'chromium',
        viewport: { width: 1280, height: 800 },
        baseUrl: FAKESAAS_URL,
      },
      networkRequests: [
        { url: `${FAKESAAS_URL}/api/login`, method: 'POST', status: 500, duration: 5000 },
      ],
      errorMessage: 'TimeoutError: Timeout 30000ms exceeded waiting for dashboard',
      consoleMessages: [
        { type: 'error', text: 'Failed to fetch: 500 Internal Server Error', timestamp: new Date().toISOString() },
      ],
    };

    const comparison = await runTest(
      'compare_runs',
      async () => {
        return compareRuns({
          passingRun,
          failingRun,
          focusAreas: ['timing', 'network', 'steps'],
        });
      },
      (result) => ({
        passed: result.differences.length > 0 && result.likelyRootCause.length > 0,
        message: `Found ${result.differences.length} differences, likely cause: ${result.likelyRootCause.substring(0, 50)}`,
      })
    );

    // Format comparison
    if (comparison) {
      await runTest(
        'formatCompareResults',
        async () => formatCompareResults(comparison),
        (result: string) => ({
          passed: result.includes('Difference') || result.includes('Root Cause'),
          message: 'Formatted comparison results',
        })
      );
    }

    // =========================================================================
    // TEST 7: accessibility_fix
    // =========================================================================
    const a11yIssue: A11yIssue = {
      rule: 'image-alt',
      severity: 'error',
      element: 'img.hero-image',
      message: 'Image missing alt text',
      impact: 'critical',
      suggestion: 'Add descriptive alt attribute',
      description: 'Images must have alt text for screen readers',
      selector: 'img.hero-image',
      html: '<img src="hero.jpg" class="hero-image">',
    };

    const a11yFix = await runTest(
      'accessibility_fix',
      async () => {
        return generateAccessibilityFix({
          issue: a11yIssue,
          elementHtml: '<img src="hero.jpg" class="hero-image">',
          framework: 'html',
        });
      },
      (result) => ({
        passed: result.fix.fixed.includes('alt') && result.testingTips.length > 0,
        message: `Generated fix with alt attribute and ${result.testingTips.length} testing tips`,
      })
    );

    // Format accessibility fix
    if (a11yFix) {
      await runTest(
        'formatAccessibilityFix',
        async () => formatAccessibilityFix(a11yFix),
        (result: string) => ({
          passed: result.includes('Before') && result.includes('After'),
          message: 'Formatted accessibility fix with before/after',
        })
      );
    }

    // =========================================================================
    // TEST 8: accessibility_report
    // =========================================================================
    const mockAuditResult: A11yAuditResult = {
      passed: false,
      score: 75,
      issues: [
        a11yIssue,
        {
          rule: 'label',
          severity: 'error',
          element: 'input#email',
          message: 'Form input missing label',
          impact: 'serious',
          suggestion: 'Add label element',
          description: 'Input must have associated label',
          selector: 'input#email',
          html: '<input type="email" id="email" placeholder="Email">',
        },
      ],
      passes: ['document-title', 'html-lang', 'viewport'],
      summary: {
        errors: 2,
        warnings: 0,
        passed: 3,
        total: 5,
      },
      level: 'AA',
    };

    // Generate HTML report
    const htmlReport = await runTest(
      'accessibility_report (HTML)',
      async () => {
        return generateAccessibilityReport({
          auditResult: mockAuditResult,
          pageTitle: 'FakeSaaS Login',
          pageUrl: FAKESAAS_URL,
          reportTitle: 'FakeSaaS Accessibility Audit',
          format: 'html',
          includeFixes: true,
        });
      },
      (result) => ({
        passed: result.content.includes('<!DOCTYPE html') && result.content.includes('FakeSaaS'),
        message: `Generated HTML report (${result.content.length} chars)`,
      })
    );

    // Generate Markdown report
    await runTest(
      'accessibility_report (Markdown)',
      async () => {
        return generateAccessibilityReport({
          auditResult: mockAuditResult,
          pageTitle: 'FakeSaaS Login',
          pageUrl: FAKESAAS_URL,
          format: 'markdown',
          includeFixes: true,
        });
      },
      (result) => ({
        passed: result.content.includes('# ') && result.content.includes('Executive Summary'),
        message: `Generated Markdown report (${result.content.length} chars)`,
      })
    );

    // Generate JSON report
    await runTest(
      'accessibility_report (JSON)',
      async () => {
        return generateAccessibilityReport({
          auditResult: mockAuditResult,
          pageTitle: 'FakeSaaS Login',
          pageUrl: FAKESAAS_URL,
          format: 'json',
        });
      },
      (result) => {
        try {
          JSON.parse(result.content);
          return { passed: true, message: 'Generated valid JSON report' };
        } catch {
          return { passed: false, message: 'Invalid JSON in report' };
        }
      }
    );

    // =========================================================================
    // LIVE BROWSER TEST: Actually test against FakeSaaS
    // =========================================================================
    console.log('\n' + '─'.repeat(60));
    console.log('🌐 Live Browser Tests Against FakeSaaS');
    console.log('─'.repeat(60));

    // Login to FakeSaaS
    await runTest(
      'Live: Login to FakeSaaS',
      async () => {
        await page!.goto(FAKESAAS_URL);
        await page!.fill('#email', 'demo@example.com');
        await page!.fill('#password', 'demo123');
        await page!.click('button[type="submit"]');
        await page!.waitForURL('**/dashboard', { timeout: 10000 });
        return await page!.url();
      },
      (result: string) => ({
        passed: result.includes('dashboard'),
        message: result.includes('dashboard') ? 'Successfully logged in and reached dashboard' : `Unexpected URL: ${result}`,
      })
    );

    // Get dashboard content for analysis
    const dashboardHtml = await page.content();

    // Generate tests from actual dashboard
    await runTest(
      'Live: Generate tests from dashboard',
      async () => {
        return await generateTestsFromUrl({
          page,
          url: `${FAKESAAS_URL}/dashboard`,
          focus: ['buttons', 'navigation'],
          maxTests: 3,
        });
      },
      (result: GeneratedTest[]) => ({
        passed: result.length > 0,
        message: `Generated ${result.length} tests from live dashboard`,
      })
    );

  } catch (error) {
    console.error('\n💥 Test suite error:', error);
  } finally {
    // Cleanup
    if (page) await page.close();
    if (context) await context.close();
    if (browser) await browser.close();
  }

  // =========================================================================
  // PRINT SUMMARY
  // =========================================================================
  console.log('\n' + '═'.repeat(60));
  console.log('TEST SUMMARY');
  console.log('═'.repeat(60));

  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;

  console.log(`\nTotal: ${testResults.length} tests`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`\nPass Rate: ${((passed / testResults.length) * 100).toFixed(1)}%`);

  console.log('\n' + '─'.repeat(60));
  console.log('Detailed Results:');
  console.log('─'.repeat(60));

  for (const result of testResults) {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.tool.padEnd(35)} ${result.duration.toString().padStart(5)}ms  ${result.message.substring(0, 40)}`);
  }

  if (failed > 0) {
    console.log('\n' + '─'.repeat(60));
    console.log('Failed Tests:');
    console.log('─'.repeat(60));

    for (const result of testResults.filter(r => !r.passed)) {
      console.log(`\n❌ ${result.tool}`);
      console.log(`   Message: ${result.message}`);
      if (result.output) {
        console.log(`   Output: ${result.output.substring(0, 200)}...`);
      }
    }
  }

  // Return exit code based on results
  process.exit(failed > 0 ? 1 : 0);
}

// Run the tests
runPhase2Tests().catch(console.error);
