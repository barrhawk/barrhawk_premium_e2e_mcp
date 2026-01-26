/**
 * Smart Assert - AI-Powered Assertions
 *
 * Uses AI to evaluate assertions described in natural language.
 */

import type { SmartAssertOptions, SmartAssertResult } from './types.js';

/**
 * Evaluate an assertion using AI understanding
 */
export async function smartAssert(options: SmartAssertOptions): Promise<SmartAssertResult> {
  const { actual, expected, context, strict } = options;

  // Serialize actual value for analysis
  const actualStr = serializeValue(actual);
  const actualSummary = summarizeValue(actual);

  // Parse expected description into checkable criteria
  const criteria = parseExpectedDescription(expected);

  // Evaluate each criterion
  const matchDetails: string[] = [];
  const mismatchDetails: string[] = [];
  let totalScore = 0;
  let maxScore = 0;

  for (const criterion of criteria) {
    const result = evaluateCriterion(actual, criterion);
    maxScore += criterion.weight;

    if (result.passed) {
      matchDetails.push(`${criterion.description}: ${result.reason}`);
      totalScore += criterion.weight * result.confidence;
    } else {
      mismatchDetails.push(`${criterion.description}: ${result.reason}`);
    }
  }

  const confidence = maxScore > 0 ? totalScore / maxScore : 0;
  const threshold = strict ? 0.95 : 0.7;
  const passed = confidence >= threshold;

  // Generate suggestion if failed
  let suggestion: string | undefined;
  if (!passed && mismatchDetails.length > 0) {
    suggestion = generateSuggestion(mismatchDetails, expected);
  }

  return {
    passed,
    confidence,
    reason: passed
      ? `Assertion passed with ${(confidence * 100).toFixed(0)}% confidence`
      : `Assertion failed: ${mismatchDetails[0] || 'Criteria not met'}`,
    suggestion,
    details: {
      actualSummary,
      expectedInterpretation: criteria.map(c => c.description).join('; '),
      matchDetails,
      mismatchDetails,
    },
  };
}

interface Criterion {
  type: 'contains' | 'equals' | 'matches' | 'type' | 'length' | 'range' | 'truthy' | 'exists';
  description: string;
  value?: unknown;
  weight: number;
}

function parseExpectedDescription(description: string): Criterion[] {
  const criteria: Criterion[] = [];
  const desc = description.toLowerCase();

  // Check for "should contain" / "includes"
  if (desc.includes('contain') || desc.includes('include')) {
    const containMatch = description.match(/contain[s]?\s+["']?([^"']+)["']?/i);
    if (containMatch) {
      criteria.push({
        type: 'contains',
        description: `Contains "${containMatch[1]}"`,
        value: containMatch[1],
        weight: 1,
      });
    }
  }

  // Check for "should be" / "equals"
  if (desc.includes('should be') || desc.includes('equal')) {
    const equalMatch = description.match(/(?:should be|equal[s]?(?:\s+to)?)\s+["']?([^"']+)["']?/i);
    if (equalMatch) {
      criteria.push({
        type: 'equals',
        description: `Equals "${equalMatch[1]}"`,
        value: equalMatch[1],
        weight: 1,
      });
    }
  }

  // Check for "not empty" / "has content"
  if (desc.includes('not empty') || desc.includes('has content') || desc.includes('non-empty')) {
    criteria.push({
      type: 'truthy',
      description: 'Not empty',
      weight: 1,
    });
  }

  // Check for "exists" / "present"
  if (desc.includes('exist') || desc.includes('present') || desc.includes('defined')) {
    criteria.push({
      type: 'exists',
      description: 'Exists',
      weight: 1,
    });
  }

  // Check for numeric expectations
  if (desc.includes('greater than') || desc.includes('more than')) {
    const numMatch = description.match(/(?:greater|more)\s+than\s+(\d+)/i);
    if (numMatch) {
      criteria.push({
        type: 'range',
        description: `Greater than ${numMatch[1]}`,
        value: { min: parseInt(numMatch[1], 10) },
        weight: 1,
      });
    }
  }

  if (desc.includes('less than') || desc.includes('fewer than')) {
    const numMatch = description.match(/(?:less|fewer)\s+than\s+(\d+)/i);
    if (numMatch) {
      criteria.push({
        type: 'range',
        description: `Less than ${numMatch[1]}`,
        value: { max: parseInt(numMatch[1], 10) },
        weight: 1,
      });
    }
  }

  // Check for type expectations
  if (desc.includes('is a') || desc.includes('is an')) {
    const typeMatch = description.match(/is\s+an?\s+(string|number|object|array|boolean)/i);
    if (typeMatch) {
      criteria.push({
        type: 'type',
        description: `Is ${typeMatch[1]}`,
        value: typeMatch[1].toLowerCase(),
        weight: 1,
      });
    }
  }

  // Check for length expectations
  if (desc.includes('length')) {
    const lengthMatch = description.match(/length\s+(?:of\s+)?(\d+)/i);
    if (lengthMatch) {
      criteria.push({
        type: 'length',
        description: `Has length ${lengthMatch[1]}`,
        value: parseInt(lengthMatch[1], 10),
        weight: 1,
      });
    }
  }

  // Check for regex/pattern
  if (desc.includes('match') && desc.includes('/')) {
    const patternMatch = description.match(/\/([^/]+)\//);
    if (patternMatch) {
      criteria.push({
        type: 'matches',
        description: `Matches pattern /${patternMatch[1]}/`,
        value: patternMatch[1],
        weight: 1,
      });
    }
  }

  // If no criteria found, default to truthy
  if (criteria.length === 0) {
    criteria.push({
      type: 'truthy',
      description: description,
      weight: 1,
    });
  }

  return criteria;
}

function evaluateCriterion(
  actual: unknown,
  criterion: Criterion
): { passed: boolean; confidence: number; reason: string } {
  switch (criterion.type) {
    case 'contains': {
      const actualStr = String(actual).toLowerCase();
      const expectedStr = String(criterion.value).toLowerCase();
      const passed = actualStr.includes(expectedStr);
      return {
        passed,
        confidence: passed ? 1 : 0,
        reason: passed ? 'Found expected content' : `"${criterion.value}" not found in value`,
      };
    }

    case 'equals': {
      const passed = String(actual).toLowerCase() === String(criterion.value).toLowerCase();
      return {
        passed,
        confidence: passed ? 1 : 0,
        reason: passed ? 'Values are equal' : `Expected "${criterion.value}", got "${actual}"`,
      };
    }

    case 'matches': {
      try {
        const regex = new RegExp(String(criterion.value), 'i');
        const passed = regex.test(String(actual));
        return {
          passed,
          confidence: passed ? 1 : 0,
          reason: passed ? 'Pattern matched' : 'Pattern did not match',
        };
      } catch {
        return { passed: false, confidence: 0, reason: 'Invalid regex pattern' };
      }
    }

    case 'type': {
      const actualType = Array.isArray(actual) ? 'array' : typeof actual;
      const passed = actualType === criterion.value;
      return {
        passed,
        confidence: passed ? 1 : 0,
        reason: passed ? `Type is ${criterion.value}` : `Expected ${criterion.value}, got ${actualType}`,
      };
    }

    case 'length': {
      const len = getLength(actual);
      const expected = criterion.value as number;
      const passed = len === expected;
      return {
        passed,
        confidence: passed ? 1 : 0,
        reason: passed ? `Length is ${expected}` : `Expected length ${expected}, got ${len}`,
      };
    }

    case 'range': {
      const num = typeof actual === 'number' ? actual : parseFloat(String(actual));
      const range = criterion.value as { min?: number; max?: number };
      const passedMin = range.min === undefined || num > range.min;
      const passedMax = range.max === undefined || num < range.max;
      const passed = passedMin && passedMax;
      return {
        passed,
        confidence: passed ? 1 : 0,
        reason: passed
          ? `Value ${num} is within expected range`
          : `Value ${num} is outside expected range`,
      };
    }

    case 'truthy': {
      const passed = Boolean(actual) && (typeof actual !== 'string' || actual.length > 0);
      return {
        passed,
        confidence: passed ? 1 : 0,
        reason: passed ? 'Value is truthy' : 'Value is falsy or empty',
      };
    }

    case 'exists': {
      const passed = actual !== undefined && actual !== null;
      return {
        passed,
        confidence: passed ? 1 : 0,
        reason: passed ? 'Value exists' : 'Value is null or undefined',
      };
    }

    default:
      return { passed: false, confidence: 0, reason: 'Unknown criterion type' };
  }
}

function getLength(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'string') return value.length;
  if (typeof value === 'object' && value !== null) return Object.keys(value).length;
  return 0;
}

function serializeValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function summarizeValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  if (typeof value === 'string') {
    return value.length > 100 ? `"${value.slice(0, 100)}..." (${value.length} chars)` : `"${value}"`;
  }

  if (Array.isArray(value)) {
    return `Array with ${value.length} items`;
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value as object);
    return `Object with ${keys.length} keys: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`;
  }

  return String(value);
}

function generateSuggestion(mismatches: string[], expected: string): string {
  if (mismatches.length === 0) return '';

  const firstMismatch = mismatches[0];

  if (firstMismatch.includes('not found')) {
    return `Consider checking if the value contains a variation of "${expected}" or relaxing the assertion criteria.`;
  }

  if (firstMismatch.includes('Expected')) {
    return 'The actual value differs from the expected value. Check for whitespace, case sensitivity, or data transformations.';
  }

  return 'Review the assertion criteria and actual data to ensure they align correctly.';
}

/**
 * Shorthand for common assertions
 */
export const assert = {
  contains: (actual: unknown, substring: string) =>
    smartAssert({ actual, expected: `should contain "${substring}"` }),

  equals: (actual: unknown, expected: unknown) =>
    smartAssert({ actual, expected: `should equal "${expected}"` }),

  notEmpty: (actual: unknown) =>
    smartAssert({ actual, expected: 'should not be empty' }),

  exists: (actual: unknown) =>
    smartAssert({ actual, expected: 'should exist' }),

  isType: (actual: unknown, type: string) =>
    smartAssert({ actual, expected: `should be a ${type}` }),

  greaterThan: (actual: number, min: number) =>
    smartAssert({ actual, expected: `should be greater than ${min}` }),

  lessThan: (actual: number, max: number) =>
    smartAssert({ actual, expected: `should be less than ${max}` }),
};
