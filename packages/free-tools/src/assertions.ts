/**
 * Basic Assertions - Free Tier
 *
 * Simple, deterministic assertions without AI.
 * For AI-powered assertions, upgrade to Premium.
 */

import type { Page } from 'playwright';

// ============================================================================
// Types
// ============================================================================

export interface AssertionResult {
  passed: boolean;
  message: string;
  actual?: unknown;
  expected?: unknown;
  details?: string;
}

export interface AssertEqualsOptions {
  actual: unknown;
  expected: unknown;
  message?: string;
  strict?: boolean;  // Use === instead of ==
}

export interface AssertContainsOptions {
  text: string;
  substring: string;
  caseSensitive?: boolean;
  message?: string;
}

export interface AssertVisibleOptions {
  page: Page;
  selector: string;
  timeout?: number;
  message?: string;
}

export interface AssertExistsOptions {
  page: Page;
  selector: string;
  timeout?: number;
  message?: string;
}

export interface AssertCountOptions {
  page: Page;
  selector: string;
  expected: number;
  operator?: 'equals' | 'greaterThan' | 'lessThan' | 'greaterOrEqual' | 'lessOrEqual';
  message?: string;
}

export interface AssertUrlOptions {
  page: Page;
  expected: string;
  matchType?: 'exact' | 'contains' | 'startsWith' | 'endsWith' | 'regex';
  message?: string;
}

export interface AssertTitleOptions {
  page: Page;
  expected: string;
  matchType?: 'exact' | 'contains' | 'startsWith' | 'endsWith' | 'regex';
  message?: string;
}

export interface AssertAttributeOptions {
  page: Page;
  selector: string;
  attribute: string;
  expected?: string;
  matchType?: 'exact' | 'contains' | 'exists';
  message?: string;
}

// ============================================================================
// Implementations
// ============================================================================

/**
 * Assert that two values are equal
 */
export function assertEquals(options: AssertEqualsOptions): AssertionResult {
  const { actual, expected, message, strict = true } = options;

  let passed: boolean;
  if (strict) {
    passed = actual === expected;
  } else {
    passed = actual == expected;
  }

  // Deep equality for objects/arrays
  if (!passed && typeof actual === 'object' && typeof expected === 'object') {
    try {
      passed = JSON.stringify(actual) === JSON.stringify(expected);
    } catch {
      // Keep original result if JSON fails
    }
  }

  return {
    passed,
    message: passed
      ? message || `Values are equal`
      : message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    actual,
    expected,
  };
}

/**
 * Assert that a string contains a substring
 */
export function assertContains(options: AssertContainsOptions): AssertionResult {
  const { text, substring, caseSensitive = false, message } = options;

  const searchText = caseSensitive ? text : text.toLowerCase();
  const searchSubstring = caseSensitive ? substring : substring.toLowerCase();

  const passed = searchText.includes(searchSubstring);

  return {
    passed,
    message: passed
      ? message || `Text contains "${substring}"`
      : message || `Text does not contain "${substring}"`,
    actual: text.length > 100 ? text.substring(0, 100) + '...' : text,
    expected: substring,
  };
}

/**
 * Assert that an element is visible on the page
 */
export async function assertVisible(options: AssertVisibleOptions): Promise<AssertionResult> {
  const { page, selector, timeout = 5000, message } = options;

  try {
    const element = await page.waitForSelector(selector, {
      state: 'visible',
      timeout,
    });

    const isVisible = element !== null;

    return {
      passed: isVisible,
      message: isVisible
        ? message || `Element "${selector}" is visible`
        : message || `Element "${selector}" is not visible`,
      actual: isVisible ? 'visible' : 'not visible',
      expected: 'visible',
    };
  } catch (error) {
    return {
      passed: false,
      message: message || `Element "${selector}" not found or not visible within ${timeout}ms`,
      actual: 'not found',
      expected: 'visible',
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Assert that an element exists in the DOM
 */
export async function assertExists(options: AssertExistsOptions): Promise<AssertionResult> {
  const { page, selector, timeout = 5000, message } = options;

  try {
    const element = await page.waitForSelector(selector, {
      state: 'attached',
      timeout,
    });

    const exists = element !== null;

    return {
      passed: exists,
      message: exists
        ? message || `Element "${selector}" exists`
        : message || `Element "${selector}" does not exist`,
      actual: exists ? 'exists' : 'not found',
      expected: 'exists',
    };
  } catch (error) {
    return {
      passed: false,
      message: message || `Element "${selector}" not found within ${timeout}ms`,
      actual: 'not found',
      expected: 'exists',
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Assert the count of elements matching a selector
 */
export async function assertCount(options: AssertCountOptions): Promise<AssertionResult> {
  const { page, selector, expected, operator = 'equals', message } = options;

  const elements = await page.$$(selector);
  const actual = elements.length;

  let passed: boolean;
  let operatorText: string;

  switch (operator) {
    case 'equals':
      passed = actual === expected;
      operatorText = 'equal to';
      break;
    case 'greaterThan':
      passed = actual > expected;
      operatorText = 'greater than';
      break;
    case 'lessThan':
      passed = actual < expected;
      operatorText = 'less than';
      break;
    case 'greaterOrEqual':
      passed = actual >= expected;
      operatorText = 'greater than or equal to';
      break;
    case 'lessOrEqual':
      passed = actual <= expected;
      operatorText = 'less than or equal to';
      break;
    default:
      passed = actual === expected;
      operatorText = 'equal to';
  }

  return {
    passed,
    message: passed
      ? message || `Element count (${actual}) is ${operatorText} ${expected}`
      : message || `Element count (${actual}) is not ${operatorText} ${expected}`,
    actual,
    expected: `${operatorText} ${expected}`,
  };
}

/**
 * Assert the current page URL
 */
export async function assertUrl(options: AssertUrlOptions): Promise<AssertionResult> {
  const { page, expected, matchType = 'exact', message } = options;

  const actual = page.url();
  let passed: boolean;

  switch (matchType) {
    case 'exact':
      passed = actual === expected;
      break;
    case 'contains':
      passed = actual.includes(expected);
      break;
    case 'startsWith':
      passed = actual.startsWith(expected);
      break;
    case 'endsWith':
      passed = actual.endsWith(expected);
      break;
    case 'regex':
      passed = new RegExp(expected).test(actual);
      break;
    default:
      passed = actual === expected;
  }

  return {
    passed,
    message: passed
      ? message || `URL matches (${matchType}): ${expected}`
      : message || `URL does not match. Expected (${matchType}): ${expected}, Actual: ${actual}`,
    actual,
    expected,
  };
}

/**
 * Assert the page title
 */
export async function assertTitle(options: AssertTitleOptions): Promise<AssertionResult> {
  const { page, expected, matchType = 'exact', message } = options;

  const actual = await page.title();
  let passed: boolean;

  switch (matchType) {
    case 'exact':
      passed = actual === expected;
      break;
    case 'contains':
      passed = actual.includes(expected);
      break;
    case 'startsWith':
      passed = actual.startsWith(expected);
      break;
    case 'endsWith':
      passed = actual.endsWith(expected);
      break;
    case 'regex':
      passed = new RegExp(expected).test(actual);
      break;
    default:
      passed = actual === expected;
  }

  return {
    passed,
    message: passed
      ? message || `Title matches (${matchType}): ${expected}`
      : message || `Title does not match. Expected (${matchType}): ${expected}, Actual: ${actual}`,
    actual,
    expected,
  };
}

/**
 * Assert an element's attribute value
 */
export async function assertAttribute(options: AssertAttributeOptions): Promise<AssertionResult> {
  const { page, selector, attribute, expected, matchType = 'exact', message } = options;

  try {
    const element = await page.$(selector);

    if (!element) {
      return {
        passed: false,
        message: message || `Element "${selector}" not found`,
        actual: 'element not found',
        expected: expected || 'attribute exists',
      };
    }

    const actual = await element.getAttribute(attribute);

    // Just checking existence
    if (matchType === 'exists') {
      const exists = actual !== null;
      return {
        passed: exists,
        message: exists
          ? message || `Attribute "${attribute}" exists on "${selector}"`
          : message || `Attribute "${attribute}" does not exist on "${selector}"`,
        actual: exists ? 'exists' : 'not found',
        expected: 'exists',
      };
    }

    // Value comparison
    if (expected === undefined) {
      return {
        passed: actual !== null,
        message: actual !== null
          ? message || `Attribute "${attribute}" has value: ${actual}`
          : message || `Attribute "${attribute}" not found`,
        actual,
        expected: 'any value',
      };
    }

    let passed: boolean;
    switch (matchType) {
      case 'exact':
        passed = actual === expected;
        break;
      case 'contains':
        passed = actual !== null && actual.includes(expected);
        break;
      default:
        passed = actual === expected;
    }

    return {
      passed,
      message: passed
        ? message || `Attribute "${attribute}" matches: ${expected}`
        : message || `Attribute "${attribute}" does not match. Expected: ${expected}, Actual: ${actual}`,
      actual,
      expected,
    };
  } catch (error) {
    return {
      passed: false,
      message: message || `Error checking attribute: ${error instanceof Error ? error.message : String(error)}`,
      actual: 'error',
      expected,
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Format assertion result for display
 */
export function formatAssertionResult(result: AssertionResult): string {
  const icon = result.passed ? '✅' : '❌';
  let output = `${icon} ${result.message}`;

  if (!result.passed && result.details) {
    output += `\n   Details: ${result.details}`;
  }

  return output;
}
