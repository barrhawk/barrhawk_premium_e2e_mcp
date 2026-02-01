/**
 * BarrHawk Golden Girl
 *
 * AI/ML Quality Validation for MCP Servers.
 * Validate AI-generated outputs against known-correct golden test cases.
 *
 * @packageDocumentation
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // Core types
  MatchMode,
  GoldenTestCase,
  GoldenInput,
  GoldenExpected,
  ExpectedStep,
  Assertion,
  AssertionOperator,

  // Scoring
  ScoreResult,
  ScoreBreakdown,

  // Results
  GoldenRunResult,
  GoldenTestResult,
  RunSummary,

  // Suite
  GoldenSuite,
  SuitesConfig,

  // Options
  RunOptions,
  CompareOptions,
  AddOptions,
  ListOptions,
  ReportOptions,

  // Constants
  SuiteName,
} from './types.js';

export { DEFAULT_THRESHOLD, SUITE_NAMES } from './types.js';

// =============================================================================
// Scoring
// =============================================================================

export {
  calculateScore,
  scoreExact,
  scoreSemantic,
  scoreStructure,
  scoreContains,
} from './scoring/index.js';

// =============================================================================
// Storage
// =============================================================================

export {
  loadSuites,
  saveSuites,
  getSuite,
  loadCase,
  loadSuiteCases,
  loadAllCases,
  saveCase,
  addCase,
  deleteCase,
  clearCache,
  getStats,
} from './storage/cases.js';

// =============================================================================
// Tools
// =============================================================================

// Run tool
export {
  runGoldenTests,
  getRunResult,
  formatRunResults,
} from './tools/run.js';

// Compare tool
export {
  compare,
  formatCompareResult,
  compareText,
  compareStructure,
} from './tools/compare.js';

// Add tool
export {
  addGoldenCase,
  formatAddResult,
  addGoldenCases,
} from './tools/add.js';

// List tool
export {
  listGolden,
  formatListResult,
  getSummary,
  type ListResult,
} from './tools/list.js';

// Report tool
export { generateReport } from './tools/report.js';

// =============================================================================
// Fixtures
// =============================================================================

export { startFixtureServer, app as fixtureApp } from './fixtures/server.js';
