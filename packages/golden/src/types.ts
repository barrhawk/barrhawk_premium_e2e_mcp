/**
 * Golden Girl Types
 *
 * Type definitions for AI/ML quality validation.
 */

// =============================================================================
// Match Modes
// =============================================================================

export type MatchMode = 'exact' | 'semantic' | 'contains' | 'structure';

// =============================================================================
// Golden Test Case
// =============================================================================

export interface GoldenTestCase {
  id: string;
  name: string;
  description: string;
  suite: string;

  // What to send to the AI tool
  input: GoldenInput;

  // What we expect back
  expected: GoldenExpected;

  // How to compare
  matchMode: MatchMode;

  // Minimum score to pass (0-1)
  threshold: number;

  // Tags for filtering
  tags: string[];

  // Optional fixture to use
  fixture?: string;

  // Created timestamp
  createdAt?: string;
}

export interface GoldenInput {
  tool: string;
  args: Record<string, unknown>;
  fixture?: string;
}

export interface GoldenExpected {
  // For exact/structure matching
  output?: unknown;

  // For semantic matching
  mustContain?: string[];
  mustNotContain?: string[];

  // For step-based outputs
  steps?: ExpectedStep[];

  // For scoring
  assertions?: Assertion[];
}

export interface ExpectedStep {
  action: string;
  target?: string;
  value?: string;
  required: boolean;
  order?: 'strict' | 'any';
}

export interface Assertion {
  path: string;           // JSONPath to value
  operator: AssertionOperator;
  expected: unknown;
  weight: number;         // How much this assertion affects score
}

export type AssertionOperator =
  | 'equals'
  | 'contains'
  | 'matches'
  | 'exists'
  | 'type'
  | 'in'
  | '>='
  | '<='
  | '>'
  | '<';

// =============================================================================
// Scoring
// =============================================================================

export interface ScoreResult {
  score: number;           // 0-1
  passed: boolean;         // score >= threshold
  breakdown: ScoreBreakdown[];
}

export interface ScoreBreakdown {
  check: string;
  weight: number;
  score: number;
  details: string;
}

// =============================================================================
// Test Results
// =============================================================================

export interface GoldenRunResult {
  runId: string;
  suite: string;
  timestamp: string;
  duration: number;
  results: GoldenTestResult[];
  summary: RunSummary;
}

export interface GoldenTestResult {
  testCase: GoldenTestCase;
  actual: unknown;
  score: ScoreResult;
  error?: string;
  duration: number;
}

export interface RunSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  averageScore: number;
}

// =============================================================================
// Suite Definition
// =============================================================================

export interface GoldenSuite {
  id: string;
  name: string;
  description: string;
  cases: string[];  // Case IDs
  createdAt: string;
  updatedAt: string;
}

export interface SuitesConfig {
  suites: GoldenSuite[];
}

// =============================================================================
// Tool Options
// =============================================================================

export interface RunOptions {
  suite?: string;
  tool?: string;
  threshold?: number;
  verbose?: boolean;
  tags?: string[];
}

export interface CompareOptions {
  matchMode: MatchMode;
  threshold?: number;
}

export interface AddOptions {
  suite: string;
  name: string;
  description?: string;
  input: GoldenInput;
  expected: GoldenExpected;
  matchMode?: MatchMode;
  threshold?: number;
  tags?: string[];
}

export interface ListOptions {
  suite?: string;
  tags?: string[];
}

export interface ReportOptions {
  runId: string;
  format?: 'summary' | 'detailed' | 'html' | 'json';
}

// =============================================================================
// Default Configuration
// =============================================================================

export const DEFAULT_THRESHOLD = 0.8;

export const SUITE_NAMES = [
  'nl-authoring',
  'ai-generation',
  'rca',
  'healing',
  'a11y',
] as const;

export type SuiteName = typeof SUITE_NAMES[number];
