/**
 * ModelContextVerify - MCP Tool Testing Utility
 *
 * A utility for verifying MCP tools work correctly by invoking them
 * and validating responses against expected outcomes.
 */

export interface ToolTestCase {
  name: string;
  tool: string;
  args: Record<string, unknown>;
  validate: (result: ToolResult) => ValidationResult;
  timeout?: number;
  dependsOn?: string;  // Name of another test that must pass first
}

export interface ToolResult {
  success: boolean;
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  error?: string;
  duration: number;
}

export interface ValidationResult {
  passed: boolean;
  message: string;
  details?: string[];
}

export interface TestSuiteResult {
  name: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  tests: TestResult[];
  summary: string;
}

export interface TestResult {
  name: string;
  tool: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  duration: number;
  validation?: ValidationResult;
  error?: string;
  output?: string;
}

/**
 * Helper validators for common assertions
 */
export const validators = {
  /**
   * Check that the result contains specific text
   */
  containsText: (texts: string | string[]) => (result: ToolResult): ValidationResult => {
    const textArray = Array.isArray(texts) ? texts : [texts];
    const content = result.content.map(c => c.text || '').join('\n');

    const missing = textArray.filter(t => !content.toLowerCase().includes(t.toLowerCase()));

    return {
      passed: missing.length === 0,
      message: missing.length === 0
        ? `Contains all expected text patterns`
        : `Missing: ${missing.join(', ')}`,
      details: missing.length > 0 ? [`Content: ${content.substring(0, 500)}...`] : undefined,
    };
  },

  /**
   * Check that the result matches a regex pattern
   */
  matchesPattern: (pattern: RegExp) => (result: ToolResult): ValidationResult => {
    const content = result.content.map(c => c.text || '').join('\n');
    const matches = pattern.test(content);

    return {
      passed: matches,
      message: matches
        ? `Matches pattern ${pattern}`
        : `Does not match pattern ${pattern}`,
      details: !matches ? [`Content: ${content.substring(0, 500)}...`] : undefined,
    };
  },

  /**
   * Check that no error occurred
   */
  noError: () => (result: ToolResult): ValidationResult => ({
    passed: result.success && !result.error,
    message: result.success ? 'No error' : `Error: ${result.error}`,
  }),

  /**
   * Check that result contains JSON with specific keys
   */
  hasJsonKeys: (keys: string[]) => (result: ToolResult): ValidationResult => {
    const content = result.content.map(c => c.text || '').join('\n');

    try {
      // Try to find JSON in the content
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { passed: false, message: 'No JSON found in response' };
      }

      const json = JSON.parse(jsonMatch[0]);
      const missing = keys.filter(k => !(k in json));

      return {
        passed: missing.length === 0,
        message: missing.length === 0
          ? `Has all expected keys: ${keys.join(', ')}`
          : `Missing keys: ${missing.join(', ')}`,
      };
    } catch {
      return { passed: false, message: 'Failed to parse JSON from response' };
    }
  },

  /**
   * Check that tool completed within timeout
   */
  withinDuration: (maxMs: number) => (result: ToolResult): ValidationResult => ({
    passed: result.duration <= maxMs,
    message: result.duration <= maxMs
      ? `Completed in ${result.duration}ms (< ${maxMs}ms)`
      : `Took ${result.duration}ms (exceeded ${maxMs}ms limit)`,
  }),

  /**
   * Combine multiple validators (all must pass)
   */
  all: (...validators: Array<(result: ToolResult) => ValidationResult>) =>
    (result: ToolResult): ValidationResult => {
      const results = validators.map(v => v(result));
      const failed = results.filter(r => !r.passed);

      return {
        passed: failed.length === 0,
        message: failed.length === 0
          ? 'All validations passed'
          : `${failed.length} validation(s) failed`,
        details: failed.map(f => f.message),
      };
    },

  /**
   * Custom validation function
   */
  custom: (fn: (content: string) => boolean, description: string) =>
    (result: ToolResult): ValidationResult => {
      const content = result.content.map(c => c.text || '').join('\n');
      const passed = fn(content);

      return {
        passed,
        message: passed ? description : `Failed: ${description}`,
      };
    },
};

/**
 * ModelContextVerify - Main testing class
 */
export class ModelContextVerify {
  private results: TestResult[] = [];
  private passedTests = new Set<string>();

  constructor(
    private invoker: (tool: string, args: Record<string, unknown>) => Promise<ToolResult>,
    private options: {
      verbose?: boolean;
      stopOnFailure?: boolean;
      defaultTimeout?: number;
    } = {}
  ) {}

  /**
   * Run a single test case
   */
  async runTest(test: ToolTestCase): Promise<TestResult> {
    const startTime = Date.now();

    // Check dependencies
    if (test.dependsOn && !this.passedTests.has(test.dependsOn)) {
      return {
        name: test.name,
        tool: test.tool,
        status: 'skipped',
        duration: 0,
        error: `Skipped: depends on "${test.dependsOn}" which did not pass`,
      };
    }

    try {
      // Invoke the tool
      const result = await Promise.race([
        this.invoker(test.tool, test.args),
        new Promise<ToolResult>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), test.timeout || this.options.defaultTimeout || 30000)
        ),
      ]);

      result.duration = Date.now() - startTime;

      // Validate the result
      const validation = test.validate(result);

      if (validation.passed) {
        this.passedTests.add(test.name);
      }

      const testResult: TestResult = {
        name: test.name,
        tool: test.tool,
        status: validation.passed ? 'passed' : 'failed',
        duration: result.duration,
        validation,
        output: this.options.verbose
          ? result.content.map(c => c.text || '').join('\n').substring(0, 1000)
          : undefined,
      };

      this.results.push(testResult);
      return testResult;

    } catch (error) {
      const testResult: TestResult = {
        name: test.name,
        tool: test.tool,
        status: 'error',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };

      this.results.push(testResult);
      return testResult;
    }
  }

  /**
   * Run a suite of tests
   */
  async runSuite(name: string, tests: ToolTestCase[]): Promise<TestSuiteResult> {
    const startTime = Date.now();
    this.results = [];
    this.passedTests.clear();

    for (const test of tests) {
      const result = await this.runTest(test);

      if (this.options.verbose) {
        const icon = result.status === 'passed' ? '✅' :
                     result.status === 'failed' ? '❌' :
                     result.status === 'skipped' ? '⏭️' : '💥';
        console.log(`${icon} ${test.name} (${result.duration}ms)`);
        if (result.validation?.message) {
          console.log(`   ${result.validation.message}`);
        }
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }
      }

      if (this.options.stopOnFailure && result.status === 'failed') {
        break;
      }
    }

    const passed = this.results.filter(r => r.status === 'passed').length;
    const failed = this.results.filter(r => r.status === 'failed').length;
    const skipped = this.results.filter(r => r.status === 'skipped').length;
    const errors = this.results.filter(r => r.status === 'error').length;

    return {
      name,
      passed,
      failed: failed + errors,
      skipped,
      duration: Date.now() - startTime,
      tests: this.results,
      summary: `${passed}/${tests.length} passed, ${failed} failed, ${errors} errors, ${skipped} skipped`,
    };
  }

  /**
   * Format suite results as markdown
   */
  static formatResults(suite: TestSuiteResult): string {
    const lines: string[] = [];

    lines.push(`# Test Suite: ${suite.name}`);
    lines.push('');
    lines.push(`**Summary:** ${suite.summary}`);
    lines.push(`**Duration:** ${suite.duration}ms`);
    lines.push('');
    lines.push('## Results');
    lines.push('');
    lines.push('| Status | Test | Tool | Duration | Message |');
    lines.push('|--------|------|------|----------|---------|');

    for (const test of suite.tests) {
      const icon = test.status === 'passed' ? '✅' :
                   test.status === 'failed' ? '❌' :
                   test.status === 'skipped' ? '⏭️' : '💥';
      const message = test.validation?.message || test.error || '';
      lines.push(`| ${icon} ${test.status} | ${test.name} | ${test.tool} | ${test.duration}ms | ${message.substring(0, 50)} |`);
    }

    // Add failure details
    const failures = suite.tests.filter(t => t.status === 'failed' || t.status === 'error');
    if (failures.length > 0) {
      lines.push('');
      lines.push('## Failure Details');

      for (const test of failures) {
        lines.push('');
        lines.push(`### ${test.name}`);
        lines.push(`**Tool:** ${test.tool}`);
        if (test.validation?.message) {
          lines.push(`**Message:** ${test.validation.message}`);
        }
        if (test.validation?.details) {
          lines.push('**Details:**');
          test.validation.details.forEach(d => lines.push(`- ${d}`));
        }
        if (test.error) {
          lines.push(`**Error:** ${test.error}`);
        }
        if (test.output) {
          lines.push('**Output:**');
          lines.push('```');
          lines.push(test.output.substring(0, 500));
          lines.push('```');
        }
      }
    }

    return lines.join('\n');
  }
}

/**
 * Create a test suite builder for fluent API
 */
export function createTestSuite(name: string) {
  const tests: ToolTestCase[] = [];

  return {
    test(
      testName: string,
      tool: string,
      args: Record<string, unknown>,
      validate: (result: ToolResult) => ValidationResult
    ) {
      tests.push({ name: testName, tool, args, validate });
      return this;
    },

    testWithDependency(
      testName: string,
      tool: string,
      args: Record<string, unknown>,
      validate: (result: ToolResult) => ValidationResult,
      dependsOn: string
    ) {
      tests.push({ name: testName, tool, args, validate, dependsOn });
      return this;
    },

    getTests() {
      return tests;
    },

    getName() {
      return name;
    },
  };
}
