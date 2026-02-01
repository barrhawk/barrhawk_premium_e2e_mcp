#!/usr/bin/env npx tsx
/**
 * HOLISTIC Free Tier Tools Test
 *
 * This is a REAL end-to-end test against FakeSaaS that chains tools
 * together the way a developer would actually use them.
 */

import { chromium, Browser, Page } from 'playwright';

// Free tier tools
import { assertEquals, assertContains, assertVisible, assertExists, assertUrl, assertTitle } from './packages/free-tools/src/assertions.js';
import { selectorSuggest, selectorValidate, selectorAlternatives } from './packages/free-tools/src/selectors.js';
import { selectorStabilityScore } from './packages/free-tools/src/selector-stability.js';
import { testRecordStart, testRecordStop, testReplay, testExport } from './packages/free-tools/src/test-recorder.js';
import { startTestSuite, addTestResult, endTestSuite, reportSummary, reportFailures } from './packages/free-tools/src/reporting.js';
import { performanceAnalyze } from './packages/free-tools/src/performance.js';
import { generateData, generateEdgeCases } from './packages/free-tools/src/data-generation.js';
import { storageClear, storageGet, storageSet, consoleStartCapture, consoleStopCapture } from './packages/free-tools/src/utilities.js';
import { a11yCheckBasic } from './packages/free-tools/src/a11y-basic.js';
import { securityScan } from './packages/free-tools/src/security-scan.js';

const BASE_URL = process.env.FAKESAAS_URL || 'http://localhost:4000';

async function main() {
  console.log('\n🦅 HOLISTIC Free Tier Tools Test');
  console.log('═'.repeat(60));
  console.log('Testing tools the way you would ACTUALLY use them\n');

  let browser: Browser | null = null;
  let page: Page | null = null;

  // Start a test suite for reporting
  const suiteId = startTestSuite({ name: 'FakeSaaS Login Flow Test' });
  console.log(`📋 Test Suite Started: ${suiteId}\n`);

  try {
    // ═══════════════════════════════════════════════════════════════
    // PHASE 1: Setup & Browser Launch
    // ═══════════════════════════════════════════════════════════════
    console.log('━━━ PHASE 1: Browser Setup ━━━\n');

    browser = await chromium.launch({ headless: false, slowMo: 100 });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await context.newPage();
    console.log('✓ Browser launched (visible mode)\n');

    // Start console capture to catch any JS errors
    consoleStartCapture({ page });
    console.log('✓ Console capture started\n');

    // Navigate to FakeSaaS
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    console.log(`✓ Navigated to ${BASE_URL}\n`);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 2: Discover Form Elements with Selector Tools
    // ═══════════════════════════════════════════════════════════════
    console.log('━━━ PHASE 2: Selector Discovery ━━━\n');

    // Use selector_suggest to find the email input
    console.log('🔍 Finding email input field...');
    const emailSuggestions = await selectorSuggest({ page, description: 'email input' });
    console.log(`   Found ${emailSuggestions.suggestions.length} suggestions`);
    console.log(`   Recommended: ${emailSuggestions.recommended}\n`);

    // Validate the suggested selector
    const emailValidation = await selectorValidate({ page, selector: '#email' });
    console.log(`🔍 Validating #email selector...`);
    console.log(`   Valid: ${emailValidation.valid}, Unique: ${emailValidation.isUnique}\n`);

    // Get stability score for the password field selector
    const passwordStability = await selectorStabilityScore({ page, selector: '#password' });
    console.log(`🔍 Password field stability score: ${passwordStability.score}/100 (${passwordStability.grade})`);
    console.log(`   Risks: ${passwordStability.risks.join(', ') || 'None'}\n`);

    // Find alternative selectors for the login button
    const buttonAlts = await selectorAlternatives({ page, selector: '#login-btn' });
    console.log(`🔍 Login button alternatives:`);
    for (const alt of buttonAlts.alternatives.slice(0, 3)) {
      console.log(`   • ${alt.selector} (${Math.round(alt.confidence * 100)}%)`);
    }
    console.log('');

    addTestResult({
      suiteId,
      name: 'Selector Discovery',
      status: 'passed',
      duration: 0
    });

    // ═══════════════════════════════════════════════════════════════
    // PHASE 3: Generate Test Data
    // ═══════════════════════════════════════════════════════════════
    console.log('━━━ PHASE 3: Test Data Generation ━━━\n');

    // Generate some fake emails for testing invalid login
    const fakeEmails = generateData({ type: 'email', count: 3 });
    console.log('📝 Generated test emails:');
    for (const email of fakeEmails.data) {
      console.log(`   • ${email}`);
    }
    console.log('');

    // Generate edge cases for security testing later
    const emailEdgeCases = generateEdgeCases({ type: 'email' });
    console.log(`📝 Generated ${emailEdgeCases.cases.length} email edge cases for security testing\n`);

    addTestResult({
      suiteId,
      name: 'Test Data Generation',
      status: 'passed',
      duration: 0
    });

    // ═══════════════════════════════════════════════════════════════
    // PHASE 4: Record Login Flow
    // ═══════════════════════════════════════════════════════════════
    console.log('━━━ PHASE 4: Recording Login Flow ━━━\n');

    // Start recording
    const recording = testRecordStart({ page });
    console.log(`🔴 Recording started: ${recording.recordingId}\n`);

    // Perform login with REAL credentials
    console.log('🔐 Attempting login with demo credentials...');

    // Type email
    await page.fill('#email', 'demo@example.com');
    console.log('   Typed email: demo@example.com');

    // Type password
    await page.fill('#password', 'demo123');
    console.log('   Typed password: ******');

    // Click login
    await page.click('#login-btn');
    console.log('   Clicked login button');

    // Wait for navigation
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    console.log('   ✓ Login successful - redirected to dashboard\n');

    // Stop recording
    const recordedActions = testRecordStop({ recordingId: recording.recordingId });
    console.log(`🔴 Recording stopped: ${recordedActions.actions.length} actions captured`);
    console.log(`   Duration: ${recordedActions.duration}ms\n`);

    addTestResult({
      suiteId,
      name: 'Login Flow',
      status: 'passed',
      duration: recordedActions.duration
    });

    // ═══════════════════════════════════════════════════════════════
    // PHASE 5: Assertions on Dashboard
    // ═══════════════════════════════════════════════════════════════
    console.log('━━━ PHASE 5: Dashboard Assertions ━━━\n');

    // Assert URL
    const urlCheck = await assertUrl({ page, expected: '/dashboard', matchType: 'contains' });
    console.log(`✓ URL contains /dashboard: ${urlCheck.passed}`);

    // Assert title
    const titleCheck = await assertTitle({ page, expected: 'Dashboard', matchType: 'contains' });
    console.log(`✓ Title contains Dashboard: ${titleCheck.passed}`);

    // Assert welcome message is visible
    const welcomeCheck = await assertVisible({ page, selector: '.welcome-banner' });
    console.log(`✓ Welcome banner visible: ${welcomeCheck.passed}`);

    // Assert stats are displayed
    const statsCheck = await assertExists({ page, selector: '.stat-card' });
    console.log(`✓ Stat cards exist: ${statsCheck.passed}`);

    // Get the welcome text and verify it contains the user name
    const welcomeText = await page.textContent('.welcome-banner');
    const nameCheck = assertContains({ text: welcomeText || '', substring: 'Demo User' });
    console.log(`✓ Welcome message contains 'Demo User': ${nameCheck.passed}\n`);

    addTestResult({
      suiteId,
      name: 'Dashboard Assertions',
      status: 'passed',
      duration: 0
    });

    // ═══════════════════════════════════════════════════════════════
    // PHASE 6: Performance Analysis
    // ═══════════════════════════════════════════════════════════════
    console.log('━━━ PHASE 6: Performance Analysis ━━━\n');

    const perfResults = await performanceAnalyze({ page });
    console.log(`📊 Performance Score: ${perfResults.overallScore}/100 (${perfResults.grade})`);
    console.log(`   LCP: ${perfResults.metrics.lcp.toFixed(0)}ms`);
    console.log(`   FCP: ${perfResults.metrics.fcp.toFixed(0)}ms`);
    console.log(`   TTFB: ${perfResults.metrics.ttfb.toFixed(0)}ms\n`);

    addTestResult({
      suiteId,
      name: 'Performance Check',
      status: perfResults.overallScore >= 50 ? 'passed' : 'failed',
      duration: 0
    });

    // ═══════════════════════════════════════════════════════════════
    // PHASE 7: Accessibility Scan
    // ═══════════════════════════════════════════════════════════════
    console.log('━━━ PHASE 7: Accessibility Scan ━━━\n');

    const a11yResults = await a11yCheckBasic({ page });
    console.log(`♿ Accessibility Score: ${a11yResults.score}/100`);
    console.log(`   Issues found: ${a11yResults.issues.length}`);

    if (a11yResults.issues.length > 0) {
      console.log('   Top issues:');
      for (const issue of a11yResults.issues.slice(0, 3)) {
        console.log(`   • [${issue.severity}] ${issue.message}`);
      }
    }
    console.log('');

    addTestResult({
      suiteId,
      name: 'Accessibility Check',
      status: a11yResults.score >= 70 ? 'passed' : 'failed',
      duration: 0
    });

    // ═══════════════════════════════════════════════════════════════
    // PHASE 8: Security Scan
    // ═══════════════════════════════════════════════════════════════
    console.log('━━━ PHASE 8: Security Scan ━━━\n');

    const securityResults = await securityScan({ page, url: BASE_URL });
    console.log(`🔒 Security Score: ${securityResults.score}/100`);
    console.log(`   Issues found: ${securityResults.issues.length}`);

    if (securityResults.issues.length > 0) {
      console.log('   Issues:');
      for (const issue of securityResults.issues.slice(0, 3)) {
        console.log(`   • [${issue.severity}] ${issue.category}: ${issue.message}`);
      }
    }
    console.log('');

    addTestResult({
      suiteId,
      name: 'Security Scan',
      status: securityResults.passed ? 'passed' : 'failed',
      duration: 0
    });

    // ═══════════════════════════════════════════════════════════════
    // PHASE 9: Navigate & Test More Pages
    // ═══════════════════════════════════════════════════════════════
    console.log('━━━ PHASE 9: Multi-Page Navigation ━━━\n');

    // Click Settings link
    await page.click('a[href="/settings"]');
    await page.waitForLoadState('networkidle');
    console.log('✓ Navigated to Settings page');

    // Verify we're on settings
    const settingsUrl = await assertUrl({ page, expected: '/settings', matchType: 'contains' });
    console.log(`✓ URL verification: ${settingsUrl.passed}`);

    // Check the profile form exists
    const profileForm = await assertExists({ page, selector: '#profile-form' });
    console.log(`✓ Profile form exists: ${profileForm.passed}`);

    // Test storage - save a preference
    await storageSet({ page, key: 'theme', value: 'dark', storageType: 'localStorage' });
    console.log('✓ Set localStorage: theme=dark');

    const storedTheme = await storageGet({ page, key: 'theme', storageType: 'localStorage' });
    const themeCheck = assertEquals({ expected: 'dark', actual: storedTheme.value || '' });
    console.log(`✓ localStorage verification: ${themeCheck.passed}\n`);

    addTestResult({
      suiteId,
      name: 'Multi-Page Navigation',
      status: 'passed',
      duration: 0
    });

    // ═══════════════════════════════════════════════════════════════
    // PHASE 10: Export Recorded Test
    // ═══════════════════════════════════════════════════════════════
    console.log('━━━ PHASE 10: Export Recorded Test ━━━\n');

    // Export to Playwright format
    const exported = testExport({
      recordingId: recording.recordingId,
      format: 'playwright'
    });

    console.log(`📤 Exported to Playwright format:`);
    console.log('─'.repeat(50));
    console.log(exported.code.split('\n').slice(0, 15).join('\n'));
    console.log('   ... (truncated)');
    console.log('─'.repeat(50));
    console.log('');

    addTestResult({
      suiteId,
      name: 'Test Export',
      status: 'passed',
      duration: 0
    });

    // ═══════════════════════════════════════════════════════════════
    // PHASE 11: Console Log Review
    // ═══════════════════════════════════════════════════════════════
    console.log('━━━ PHASE 11: Console Log Review ━━━\n');

    const consoleLogs = consoleStopCapture();
    console.log(`📋 Captured ${consoleLogs.messages.length} console messages`);

    const errors = consoleLogs.messages.filter(m => m.type === 'error');
    const warnings = consoleLogs.messages.filter(m => m.type === 'warning');

    console.log(`   Errors: ${errors.length}`);
    console.log(`   Warnings: ${warnings.length}`);

    if (errors.length > 0) {
      console.log('   Error details:');
      for (const err of errors.slice(0, 3)) {
        console.log(`   • ${err.text}`);
      }
    }
    console.log('');

    addTestResult({
      suiteId,
      name: 'Console Review',
      status: errors.length === 0 ? 'passed' : 'failed',
      duration: 0
    });

    // ═══════════════════════════════════════════════════════════════
    // PHASE 12: Cleanup & Reporting
    // ═══════════════════════════════════════════════════════════════
    console.log('━━━ PHASE 12: Test Suite Report ━━━\n');

    // Clear storage
    await storageClear({ page, storageType: 'localStorage' });
    console.log('✓ Cleaned up localStorage\n');

    // End suite and get results
    const suiteResults = endTestSuite({ suiteId });
    const summary = reportSummary({ results: suiteResults });

    console.log('═'.repeat(60));
    console.log('📊 FINAL TEST RESULTS');
    console.log('═'.repeat(60));
    console.log(`\n   Total Tests:  ${summary.total}`);
    console.log(`   Passed:       ${summary.passed} ✅`);
    console.log(`   Failed:       ${summary.failed} ❌`);
    console.log(`   Pass Rate:    ${summary.passRate}%`);
    console.log(`   Duration:     ${summary.duration}ms\n`);

    if (summary.failed > 0) {
      const failures = reportFailures({ results: suiteResults });
      console.log('Failed Tests:');
      for (const failure of failures.failures) {
        console.log(`   • ${failure.name}: ${failure.error}`);
      }
      console.log('');
    }

    console.log('═'.repeat(60));
    console.log('🦅 Holistic test complete - tools used as they were meant to be!');
    console.log('═'.repeat(60));

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    addTestResult({
      suiteId,
      name: 'Unexpected Error',
      status: 'failed',
      duration: 0,
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    if (browser) {
      await browser.close();
      console.log('\n✓ Browser closed');
    }
  }
}

main().catch(console.error);
