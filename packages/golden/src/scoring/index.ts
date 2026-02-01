/**
 * Golden Girl Scoring
 *
 * Algorithms for comparing actual outputs against golden expectations.
 */

import type {
  MatchMode,
  GoldenExpected,
  ScoreResult,
  ScoreBreakdown,
  Assertion,
  ExpectedStep,
} from '../types.js';

// JSONPath implementation (simple subset)
function queryPath(obj: unknown, path: string): unknown[] {
  // Handle basic JSONPath patterns
  // $.foo.bar => obj.foo.bar
  // $.foo[*] => all items in array
  // $.foo[*].bar => bar property of all items

  if (!path.startsWith('$')) return [];

  const cleanPath = path.slice(1); // Remove $
  if (!cleanPath) return [obj];

  const parts = cleanPath.split(/\.|\[|\]/).filter(Boolean);
  let results: unknown[] = [obj];

  for (const part of parts) {
    const nextResults: unknown[] = [];

    for (const result of results) {
      if (result === null || result === undefined) continue;

      if (part === '*') {
        // Wildcard - get all array items or object values
        if (Array.isArray(result)) {
          nextResults.push(...result);
        } else if (typeof result === 'object') {
          nextResults.push(...Object.values(result as Record<string, unknown>));
        }
      } else if (/^\d+$/.test(part)) {
        // Array index
        if (Array.isArray(result)) {
          const idx = parseInt(part, 10);
          if (idx < result.length) {
            nextResults.push(result[idx]);
          }
        }
      } else {
        // Property access
        if (typeof result === 'object' && result !== null) {
          const value = (result as Record<string, unknown>)[part];
          if (value !== undefined) {
            nextResults.push(value);
          }
        }
      }
    }

    results = nextResults;
  }

  return results;
}

// Deep equality check
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, idx) => deepEqual(val, b[idx]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a as Record<string, unknown>);
    const bKeys = Object.keys(b as Record<string, unknown>);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(key =>
      deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key]
      )
    );
  }

  return false;
}

// Evaluate a single assertion
function evaluateAssertion(
  values: unknown[],
  assertion: Assertion
): { score: number; details: string } {
  const { operator, expected } = assertion;

  if (values.length === 0) {
    if (operator === 'exists') {
      return { score: expected ? 0 : 1, details: 'Path not found' };
    }
    return { score: 0, details: 'Path not found' };
  }

  const value = values.length === 1 ? values[0] : values;

  switch (operator) {
    case 'equals':
      if (deepEqual(value, expected)) {
        return { score: 1, details: `Equals ${JSON.stringify(expected)}` };
      }
      return { score: 0, details: `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}` };

    case 'contains':
      const strValue = JSON.stringify(value).toLowerCase();
      const strExpected = String(expected).toLowerCase();
      if (strValue.includes(strExpected)) {
        return { score: 1, details: `Contains "${expected}"` };
      }
      return { score: 0, details: `Does not contain "${expected}"` };

    case 'matches':
      const regex = new RegExp(String(expected), 'i');
      if (regex.test(String(value))) {
        return { score: 1, details: `Matches ${expected}` };
      }
      return { score: 0, details: `Does not match ${expected}` };

    case 'exists':
      const exists = value !== undefined && value !== null;
      if (exists === expected) {
        return { score: 1, details: expected ? 'Exists' : 'Does not exist' };
      }
      return { score: 0, details: expected ? 'Does not exist' : 'Exists but should not' };

    case 'type':
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType === expected) {
        return { score: 1, details: `Type is ${expected}` };
      }
      return { score: 0, details: `Expected type ${expected}, got ${actualType}` };

    case 'in':
      if (Array.isArray(expected) && expected.includes(value)) {
        return { score: 1, details: `Value in ${JSON.stringify(expected)}` };
      }
      return { score: 0, details: `Value not in ${JSON.stringify(expected)}` };

    case '>=':
      if (typeof value === 'number' && typeof expected === 'number' && value >= expected) {
        return { score: 1, details: `${value} >= ${expected}` };
      }
      return { score: 0, details: `${value} < ${expected}` };

    case '<=':
      if (typeof value === 'number' && typeof expected === 'number' && value <= expected) {
        return { score: 1, details: `${value} <= ${expected}` };
      }
      return { score: 0, details: `${value} > ${expected}` };

    case '>':
      if (typeof value === 'number' && typeof expected === 'number' && value > expected) {
        return { score: 1, details: `${value} > ${expected}` };
      }
      return { score: 0, details: `${value} <= ${expected}` };

    case '<':
      if (typeof value === 'number' && typeof expected === 'number' && value < expected) {
        return { score: 1, details: `${value} < ${expected}` };
      }
      return { score: 0, details: `${value} >= ${expected}` };

    default:
      return { score: 0, details: `Unknown operator: ${operator}` };
  }
}

// Find a matching step in actual steps
function findMatchingStep(
  actualSteps: unknown[] | undefined,
  expected: ExpectedStep
): boolean {
  if (!actualSteps || !Array.isArray(actualSteps)) return false;

  return actualSteps.some((step: unknown) => {
    if (typeof step !== 'object' || step === null) return false;
    const s = step as Record<string, unknown>;

    // Check action matches (using regex if target has regex pattern)
    const actionPattern = new RegExp(expected.action, 'i');
    if (!actionPattern.test(String(s.action || ''))) return false;

    // Check target if specified
    if (expected.target) {
      const targetPattern = new RegExp(expected.target, 'i');
      const actualTarget = String(s.target || s.selector || s.element || '');
      if (!targetPattern.test(actualTarget)) return false;
    }

    // Check value if specified
    if (expected.value) {
      const valuePattern = new RegExp(expected.value, 'i');
      const actualValue = String(s.value || s.text || s.input || '');
      if (!valuePattern.test(actualValue)) return false;
    }

    return true;
  });
}

/**
 * Calculate score for exact match mode
 */
export function scoreExact(actual: unknown, expected: GoldenExpected): ScoreResult {
  const isEqual = deepEqual(actual, expected.output);
  return {
    score: isEqual ? 1 : 0,
    passed: isEqual,
    breakdown: [{
      check: 'exact match',
      weight: 1,
      score: isEqual ? 1 : 0,
      details: isEqual ? 'Exact match' : 'Not an exact match',
    }],
  };
}

/**
 * Calculate score for semantic match mode
 */
export function scoreSemantic(actual: unknown, expected: GoldenExpected, threshold: number): ScoreResult {
  const breakdown: ScoreBreakdown[] = [];
  const text = JSON.stringify(actual).toLowerCase();

  // Check mustContain
  if (expected.mustContain && expected.mustContain.length > 0) {
    const weight = 1 / expected.mustContain.length;
    for (const term of expected.mustContain) {
      const found = text.includes(term.toLowerCase());
      breakdown.push({
        check: `contains "${term}"`,
        weight,
        score: found ? 1 : 0,
        details: found ? 'Found' : 'Not found',
      });
    }
  }

  // Check mustNotContain
  if (expected.mustNotContain && expected.mustNotContain.length > 0) {
    const weight = 0.5 / expected.mustNotContain.length;
    for (const term of expected.mustNotContain) {
      const found = text.includes(term.toLowerCase());
      breakdown.push({
        check: `not contains "${term}"`,
        weight,
        score: found ? 0 : 1,
        details: found ? 'Found (bad)' : 'Not found (good)',
      });
    }
  }

  // Calculate weighted score
  const totalWeight = breakdown.reduce((sum, b) => sum + b.weight, 0);
  const weightedScore = breakdown.reduce((sum, b) => sum + b.score * b.weight, 0);
  const score = totalWeight > 0 ? weightedScore / totalWeight : 0;

  return {
    score,
    passed: score >= threshold,
    breakdown,
  };
}

/**
 * Calculate score for structure match mode (using assertions)
 */
export function scoreStructure(actual: unknown, expected: GoldenExpected, threshold: number): ScoreResult {
  const breakdown: ScoreBreakdown[] = [];

  if (expected.assertions && expected.assertions.length > 0) {
    for (const assertion of expected.assertions) {
      const values = queryPath(actual, assertion.path);
      const result = evaluateAssertion(values, assertion);
      breakdown.push({
        check: `${assertion.path} ${assertion.operator} ${JSON.stringify(assertion.expected)}`,
        weight: assertion.weight,
        score: result.score,
        details: result.details,
      });
    }
  }

  // Calculate weighted score
  const totalWeight = breakdown.reduce((sum, b) => sum + b.weight, 0);
  const weightedScore = breakdown.reduce((sum, b) => sum + b.score * b.weight, 0);
  const score = totalWeight > 0 ? weightedScore / totalWeight : 0;

  return {
    score,
    passed: score >= threshold,
    breakdown,
  };
}

/**
 * Calculate score for contains match mode (step checking)
 */
export function scoreContains(actual: unknown, expected: GoldenExpected, threshold: number): ScoreResult {
  const breakdown: ScoreBreakdown[] = [];

  // Get steps from actual
  const actualSteps = (actual as Record<string, unknown>)?.steps as unknown[] | undefined;

  if (expected.steps && expected.steps.length > 0) {
    for (const step of expected.steps) {
      const found = findMatchingStep(actualSteps, step);
      const weight = step.required ? 1 : 0.5;
      breakdown.push({
        check: `step: ${step.action} ${step.target || ''}`,
        weight,
        score: found ? 1 : 0,
        details: found ? 'Found' : 'Not found',
      });
    }
  }

  // Calculate weighted score
  const totalWeight = breakdown.reduce((sum, b) => sum + b.weight, 0);
  const weightedScore = breakdown.reduce((sum, b) => sum + b.score * b.weight, 0);
  const score = totalWeight > 0 ? weightedScore / totalWeight : 0;

  return {
    score,
    passed: score >= threshold,
    breakdown,
  };
}

/**
 * Main scoring function - routes to appropriate scorer based on match mode
 */
export function calculateScore(
  actual: unknown,
  expected: GoldenExpected,
  mode: MatchMode,
  threshold: number
): ScoreResult {
  switch (mode) {
    case 'exact':
      return scoreExact(actual, expected);

    case 'semantic':
      return scoreSemantic(actual, expected, threshold);

    case 'structure':
      return scoreStructure(actual, expected, threshold);

    case 'contains':
      return scoreContains(actual, expected, threshold);

    default:
      return {
        score: 0,
        passed: false,
        breakdown: [{ check: 'unknown mode', weight: 1, score: 0, details: `Unknown mode: ${mode}` }],
      };
  }
}
