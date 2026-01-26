/**
 * BarrHawk E2E Free Tools
 *
 * Free tier testing tools - basic, deterministic functionality.
 * For AI-powered features, upgrade to Premium.
 */

// Assertions
export {
  assertEquals,
  assertContains,
  assertVisible,
  assertExists,
  assertCount,
  assertUrl,
  assertTitle,
  assertAttribute,
  formatAssertionResult,
  type AssertionResult,
  type AssertEqualsOptions,
  type AssertContainsOptions,
  type AssertVisibleOptions,
  type AssertExistsOptions,
  type AssertCountOptions,
  type AssertUrlOptions,
  type AssertTitleOptions,
  type AssertAttributeOptions,
} from './assertions.js';

// Selectors
export {
  selectorSuggest,
  selectorValidate,
  selectorAlternatives,
  formatSelectorResult,
  type SelectorSuggestion,
  type SelectorSuggestOptions,
  type SelectorSuggestResult,
  type SelectorValidateOptions,
  type SelectorValidateResult,
  type SelectorAlternativesOptions,
  type SelectorAlternativesResult,
} from './selectors.js';

// Test Recorder
export {
  testRecordStart,
  testRecordStop,
  recordAction,
  testReplay,
  testExport,
  getRecordingStatus,
  getLastRecording,
  type RecordedAction,
  type Recording,
  type RecordStartOptions,
  type RecordStartResult,
  type RecordStopResult,
  type ReplayOptions,
  type ReplayResult,
  type ExportOptions,
  type ExportResult,
} from './test-recorder.js';

// Reporting
export {
  startTestSuite,
  addTestResult,
  endTestSuite,
  getCurrentSuite,
  reportSummary,
  reportFailures,
  reportTiming,
  type TestResult,
  type TestSuiteResults,
  type ReportSummaryOptions,
  type ReportSummaryResult,
  type ReportFailuresOptions,
  type FailureReport,
  type ReportTimingOptions,
  type TimingReport,
} from './reporting.js';

// Utilities
export {
  storageClear,
  storageGet,
  storageSet,
  consoleStartCapture,
  consoleStopCapture,
  consoleGetMessages,
  networkWait,
  networkMock,
  networkUnmock,
  screenshotCompare,
  formatUtilityResult,
  type StorageClearOptions,
  type StorageClearResult,
  type StorageGetOptions,
  type StorageGetResult,
  type StorageSetOptions,
  type StorageSetResult,
  type ConsoleCaptureOptions,
  type ConsoleMessage,
  type ConsoleCaptureResult,
  type NetworkWaitOptions,
  type NetworkWaitResult,
  type NetworkMockOptions,
  type NetworkMockResult,
  type ScreenshotCompareOptions,
  type ScreenshotCompareResult,
} from './utilities.js';

// Accessibility
export {
  a11yCheckBasic,
  formatA11yResult,
  type A11yIssue,
  type A11yCheckOptions,
  type A11yRuleSet,
  type A11yCheckResult,
} from './a11y-basic.js';

// Selector Stability
export {
  selectorStabilityScore,
  formatStabilityResult,
  type StabilityScoreOptions,
  type StabilityFactors,
  type StabilityScoreResult,
} from './selector-stability.js';

// Test Analysis
export {
  detectFlakyTests,
  prioritizeTests,
  deduplicateTests,
  findCoverageGaps,
  type TestRunHistory,
  type FlakyTestResult,
  type TestPriority,
  type TestSimilarity,
  type CoverageGap,
  type CoverageGapsResult,
} from './test-analysis.js';

// Performance
export {
  performanceAnalyze,
  detectPerformanceRegression,
  checkPerformanceBudget,
  type PerformanceMetrics,
  type PerformanceAnalyzeResult,
  type RegressionResult,
  type PerformanceBudget,
  type BudgetCheckResult,
} from './performance.js';

// Data Generation
export {
  generateData,
  generateEdgeCases,
  generateFromSchema,
  type DataType,
  type GenerateDataOptions,
  type GenerateDataResult,
  type EdgeCaseType,
  type EdgeCaseOptions,
  type EdgeCaseResult,
  type FromSchemaOptions,
  type FromSchemaResult,
} from './data-generation.js';

// Security Scan
export {
  securityScan,
  formatSecurityResult,
  type SecurityCategory,
  type SecurityIssue,
  type SecurityScanOptions,
  type SecurityScanResult,
} from './security-scan.js';

// Thought Architect
export {
  runThoughtArchitect,
} from './thought-architect.js';
