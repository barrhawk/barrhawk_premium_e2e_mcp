/**
 * BarrHawk AI Tools
 *
 * AI-powered testing tools for smart assertions, failure analysis,
 * and accessibility auditing.
 *
 * @packageDocumentation
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // Smart Assert
  SmartAssertOptions,
  SmartAssertResult,

  // Failure Analysis
  FailureContext,
  FailureAnalysisResult,
  FailureType,
  FixSuggestion,

  // Accessibility
  A11yAuditOptions,
  A11yAuditResult,
  A11yIssue,
  A11yRule,

  // Natural Language Selector
  NLSelectorOptions,
  NLSelectorResult,
} from './types.js';

// =============================================================================
// Smart Assertions
// =============================================================================

export {
  smartAssert,
  assert,
} from './smart-assert.js';

// =============================================================================
// Failure Analysis
// =============================================================================

export {
  analyzeFailure,
  formatAnalysisResult,
} from './analyze-failure.js';

// =============================================================================
// Accessibility
// =============================================================================

export {
  accessibilityAudit,
  formatAuditResult,
} from './accessibility-audit.js';

// =============================================================================
// Test From Description
// =============================================================================

export type {
  TestFromDescriptionOptions,
  GeneratedTest,
  TestStep as GeneratedTestStep,
  TestAssertion as GeneratedTestAssertion,
} from './test-from-description.js';

export {
  testFromDescription,
  formatTestAsCode,
  formatTestAsMCPCalls,
} from './test-from-description.js';

// =============================================================================
// Generate Tests
// =============================================================================

export type {
  GenerateTestsOptions,
  GenerateFromFlowOptions,
  PageAnalysis,
} from './generate-tests.js';

export {
  generateTestsFromUrl,
  generateTestsFromFlow,
  formatTestSuite,
} from './generate-tests.js';

// =============================================================================
// Test Explain
// =============================================================================

export type {
  TestExplainOptions,
  TestExplainResult,
  TestStep,
} from './test-explain.js';

export {
  explainTest,
  formatTestExplanation,
} from './test-explain.js';

// =============================================================================
// Suggest Fix
// =============================================================================

export type {
  SuggestFixOptions,
  SuggestFixResult,
  CodeFix,
} from './suggest-fix.js';

export {
  suggestFix,
  formatFixSuggestions,
} from './suggest-fix.js';

// =============================================================================
// Compare Runs
// =============================================================================

export type {
  CompareRunsOptions,
  CompareRunsResult,
  TestRunData,
  RunStep,
  Difference,
} from './compare-runs.js';

export {
  compareRuns,
  formatCompareResults,
} from './compare-runs.js';

// =============================================================================
// Accessibility Fix
// =============================================================================

export type {
  AccessibilityFixOptions,
  AccessibilityFixResult,
  AccessibilityFix,
} from './accessibility-fix.js';

export {
  generateAccessibilityFix,
  formatAccessibilityFix,
} from './accessibility-fix.js';

// =============================================================================
// Accessibility Report
// =============================================================================

export type {
  AccessibilityReportOptions,
  AccessibilityReport,
  ReportSummary,
} from './accessibility-report.js';

export {
  generateAccessibilityReport,
  getReportFilename,
} from './accessibility-report.js';
