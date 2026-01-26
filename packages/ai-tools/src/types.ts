/**
 * AI Tools Types
 *
 * Type definitions for AI-powered testing tools.
 */

// =============================================================================
// Smart Assertion Types
// =============================================================================

export interface SmartAssertOptions {
  actual: unknown;
  expected: string;         // Natural language description
  context?: string;         // Additional context
  strict?: boolean;         // Require exact semantic match
}

export interface SmartAssertResult {
  passed: boolean;
  confidence: number;       // 0-1
  reason: string;
  suggestion?: string;
  details: {
    actualSummary: string;
    expectedInterpretation: string;
    matchDetails: string[];
    mismatchDetails: string[];
  };
}

// =============================================================================
// Failure Analysis Types
// =============================================================================

export interface FailureContext {
  error: string;
  selector?: string;
  action?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  htmlSnapshot?: string;
  screenshotBase64?: string;
  networkErrors?: string[];
  consoleErrors?: string[];
  timing?: {
    actionTime?: number;
    pageLoadTime?: number;
    timeout?: number;
  };
}

export interface FailureAnalysisResult {
  rootCause: {
    type: FailureType;
    confidence: number;
    description: string;
  };
  suggestions: FixSuggestion[];
  relatedPatterns?: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export type FailureType =
  | 'selector_not_found'
  | 'selector_changed'
  | 'timeout'
  | 'network_error'
  | 'assertion_failed'
  | 'element_not_visible'
  | 'element_not_interactable'
  | 'page_crashed'
  | 'navigation_failed'
  | 'unknown';

export interface FixSuggestion {
  type: 'selector' | 'wait' | 'assertion' | 'flow' | 'environment';
  description: string;
  code?: string;
  confidence: number;
}

// =============================================================================
// Accessibility Types
// =============================================================================

export interface A11yAuditOptions {
  page: unknown;            // Playwright page
  rules?: A11yRule[];       // Specific rules to check
  level?: 'A' | 'AA' | 'AAA';
  includeWarnings?: boolean;
  selector?: string;        // Scope to specific element
}

export type A11yRule =
  | 'alt-text'
  | 'aria-labels'
  | 'color-contrast'
  | 'form-labels'
  | 'heading-order'
  | 'link-text'
  | 'keyboard-access'
  | 'focus-visible'
  | 'role-attributes'
  | 'lang-attribute'
  | string;  // Allow other rule IDs for extensibility

export interface A11yIssue {
  rule: string;             // Rule ID (flexible for various checkers)
  severity: 'error' | 'warning' | 'info';
  element: string;          // Selector or description
  message: string;
  impact?: 'critical' | 'serious' | 'moderate' | 'minor' | string;
  suggestion: string;
  wcag?: string;            // WCAG criterion reference
  // Extended properties for detailed reporting
  description?: string;     // Detailed description
  selector?: string;        // CSS selector of affected element
  html?: string;            // HTML snippet of affected element
  fix?: string;             // Suggested fix text
}

export interface A11yAuditResult {
  passed: boolean;
  score: number;            // 0-100
  issues: A11yIssue[];
  passes?: string[];        // List of passed rule IDs
  summary: {
    errors: number;
    warnings: number;
    passed: number;
    total: number;
  };
  level: 'A' | 'AA' | 'AAA';
}

// =============================================================================
// Natural Language Selector Types
// =============================================================================

export interface NLSelectorOptions {
  description: string;      // Natural language description
  page: unknown;            // Playwright page
  context?: string;         // Page context hint
  multiple?: boolean;       // Find multiple elements
}

export interface NLSelectorResult {
  found: boolean;
  selector?: string;
  confidence: number;
  alternatives?: Array<{
    selector: string;
    confidence: number;
    reason: string;
  }>;
  reasoning: string;
}
