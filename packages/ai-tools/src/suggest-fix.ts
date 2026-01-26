/**
 * Suggest Fix Tool
 *
 * Analyzes test failures and suggests code fixes.
 * Provides actionable recommendations for both test and application code.
 */

export interface SuggestFixOptions {
  errorMessage: string;
  testCode?: string;
  stackTrace?: string;
  screenshot?: string;
  html?: string;
  previousAttempts?: string[];
  context?: {
    framework?: string;
    browser?: string;
    environment?: string;
  };
}

export interface CodeFix {
  type: 'test' | 'application' | 'configuration' | 'environment';
  location: string;
  original?: string;
  suggested: string;
  explanation: string;
  confidence: number;
}

export interface SuggestFixResult {
  diagnosis: string;
  rootCause: string;
  fixes: CodeFix[];
  workarounds: string[];
  preventionTips: string[];
  relatedIssues: string[];
  confidence: number;
}

/**
 * Suggest fixes for a test failure
 */
export function suggestFix(options: SuggestFixOptions): SuggestFixResult {
  const {
    errorMessage,
    testCode,
    stackTrace,
    html,
    previousAttempts = [],
    context = {},
  } = options;

  // Analyze the error
  const errorAnalysis = analyzeError(errorMessage, stackTrace);

  // Determine root cause
  const rootCause = determineRootCause(errorAnalysis, html, testCode);

  // Generate fixes
  const fixes = generateFixes(errorAnalysis, rootCause, testCode, html, previousAttempts);

  // Generate workarounds
  const workarounds = generateWorkarounds(errorAnalysis, rootCause, context);

  // Generate prevention tips
  const preventionTips = generatePreventionTips(errorAnalysis, rootCause);

  // Find related issues
  const relatedIssues = findRelatedIssues(errorAnalysis);

  // Calculate overall confidence
  const confidence = calculateConfidence(fixes, previousAttempts);

  return {
    diagnosis: errorAnalysis.summary,
    rootCause,
    fixes,
    workarounds,
    preventionTips,
    relatedIssues,
    confidence,
  };
}

interface ErrorAnalysis {
  type: string;
  summary: string;
  selector?: string;
  timeout?: boolean;
  assertion?: boolean;
  network?: boolean;
  element?: {
    expected?: string;
    actual?: string;
  };
  details: Record<string, string>;
}

function analyzeError(errorMessage: string, stackTrace?: string): ErrorAnalysis {
  const analysis: ErrorAnalysis = {
    type: 'unknown',
    summary: '',
    details: {},
  };

  const errorLower = errorMessage.toLowerCase();

  // Element not found errors
  if (errorLower.includes('element not found') ||
      errorLower.includes('no element') ||
      errorLower.includes('cannot find') ||
      errorLower.includes('unable to locate')) {
    analysis.type = 'element_not_found';
    analysis.summary = 'The target element could not be located on the page';

    // Extract selector
    const selectorMatch = errorMessage.match(/['"`]([^'"`]+)['"`]/);
    if (selectorMatch) {
      analysis.selector = selectorMatch[1];
    }
  }

  // Timeout errors
  else if (errorLower.includes('timeout') ||
           errorLower.includes('timed out') ||
           errorLower.includes('exceeded')) {
    analysis.type = 'timeout';
    analysis.timeout = true;
    analysis.summary = 'Operation timed out waiting for a condition';

    const timeoutMatch = errorMessage.match(/(\d+)\s*(?:ms|milliseconds|seconds)/i);
    if (timeoutMatch) {
      analysis.details.timeout = timeoutMatch[0];
    }
  }

  // Assertion failures
  else if (errorLower.includes('expect') ||
           errorLower.includes('assert') ||
           errorLower.includes('should') ||
           errorLower.includes('expected')) {
    analysis.type = 'assertion';
    analysis.assertion = true;
    analysis.summary = 'An assertion failed - actual value did not match expected';

    // Try to extract expected vs actual
    const expectedMatch = errorMessage.match(/expected[:\s]+['"`]?([^'"`\n]+)['"`]?/i);
    const actualMatch = errorMessage.match(/(?:received|actual|got)[:\s]+['"`]?([^'"`\n]+)['"`]?/i);

    if (expectedMatch || actualMatch) {
      analysis.element = {
        expected: expectedMatch?.[1],
        actual: actualMatch?.[1],
      };
    }
  }

  // Network errors
  else if (errorLower.includes('network') ||
           errorLower.includes('fetch') ||
           errorLower.includes('request') ||
           errorLower.includes('net::') ||
           errorLower.includes('cors')) {
    analysis.type = 'network';
    analysis.network = true;
    analysis.summary = 'A network request failed or was blocked';

    if (errorLower.includes('cors')) {
      analysis.details.cors = 'CORS policy blocked the request';
    }
  }

  // Click interception
  else if (errorLower.includes('intercept') ||
           errorLower.includes('overlay') ||
           errorLower.includes('not clickable') ||
           errorLower.includes('click intercepted')) {
    analysis.type = 'click_intercepted';
    analysis.summary = 'Click was intercepted by another element (overlay, modal, etc.)';
  }

  // Stale element
  else if (errorLower.includes('stale') ||
           errorLower.includes('detached')) {
    analysis.type = 'stale_element';
    analysis.summary = 'Element became stale (was removed from DOM after being found)';
  }

  // Frame/iframe issues
  else if (errorLower.includes('frame') ||
           errorLower.includes('iframe')) {
    analysis.type = 'frame';
    analysis.summary = 'Element is inside a frame that needs to be switched to';
  }

  // Default
  else {
    analysis.summary = errorMessage.substring(0, 150);
  }

  // Parse stack trace for additional info
  if (stackTrace) {
    const fileMatch = stackTrace.match(/at\s+.+\s+\(([^:]+):(\d+)/);
    if (fileMatch) {
      analysis.details.file = fileMatch[1];
      analysis.details.line = fileMatch[2];
    }
  }

  return analysis;
}

function determineRootCause(
  analysis: ErrorAnalysis,
  html?: string,
  testCode?: string
): string {
  switch (analysis.type) {
    case 'element_not_found':
      if (analysis.selector) {
        // Check if selector looks dynamic
        if (analysis.selector.includes('[') && analysis.selector.match(/\d+/)) {
          return 'The selector contains a dynamic index or ID that may change between runs';
        }
        if (html && !html.includes(analysis.selector.split(' ')[0])) {
          return 'The element does not exist in the current page state - it may load later or require navigation';
        }
      }
      return 'The element selector is invalid or the element has not rendered yet';

    case 'timeout':
      return 'The page or element took longer to load than the configured timeout allows';

    case 'assertion':
      if (analysis.element?.expected && analysis.element?.actual) {
        return `Expected "${analysis.element.expected}" but found "${analysis.element.actual}" - the application state differs from expectations`;
      }
      return 'The application state or content does not match test expectations';

    case 'network':
      if (analysis.details.cors) {
        return 'Cross-origin request blocked - the server needs proper CORS headers';
      }
      return 'A network request failed - the API may be down or returning errors';

    case 'click_intercepted':
      return 'Another element (like a modal, toast, or loading overlay) is blocking the target element';

    case 'stale_element':
      return 'The element was found but then removed from the DOM before the action could complete';

    case 'frame':
      return 'The element is inside an iframe that the test needs to switch into first';

    default:
      return 'Unable to determine specific root cause - review error message for details';
  }
}

function generateFixes(
  analysis: ErrorAnalysis,
  rootCause: string,
  testCode?: string,
  html?: string,
  previousAttempts?: string[]
): CodeFix[] {
  const fixes: CodeFix[] = [];

  switch (analysis.type) {
    case 'element_not_found':
      // Suggest better selectors
      fixes.push({
        type: 'test',
        location: 'selector',
        original: analysis.selector,
        suggested: generateBetterSelector(analysis.selector || '', html),
        explanation: 'Use a more stable selector that is less likely to change',
        confidence: 0.8,
      });

      // Suggest adding wait
      fixes.push({
        type: 'test',
        location: 'before selector',
        suggested: `await page.waitForSelector('${analysis.selector}', { state: 'visible', timeout: 10000 });`,
        explanation: 'Add an explicit wait for the element to be visible before interacting',
        confidence: 0.9,
      });
      break;

    case 'timeout':
      // Suggest increasing timeout
      fixes.push({
        type: 'configuration',
        location: 'test config',
        suggested: 'timeout: 60000 // Increase to 60 seconds',
        explanation: 'Increase the timeout to allow more time for slow operations',
        confidence: 0.7,
      });

      // Suggest network idle wait
      fixes.push({
        type: 'test',
        location: 'after navigation',
        suggested: `await page.waitForLoadState('networkidle');`,
        explanation: 'Wait for network requests to complete before proceeding',
        confidence: 0.8,
      });
      break;

    case 'assertion':
      // Suggest flexible assertion
      if (analysis.element?.expected) {
        fixes.push({
          type: 'test',
          location: 'assertion',
          suggested: `expect(actual).toContain('${analysis.element.expected.split(' ')[0]}');`,
          explanation: 'Use a partial match instead of exact match for more flexibility',
          confidence: 0.6,
        });
      }

      // Suggest adding debug
      fixes.push({
        type: 'test',
        location: 'before assertion',
        suggested: 'console.log("Actual value:", actual); // Debug output',
        explanation: 'Add logging to see the actual value for debugging',
        confidence: 0.9,
      });
      break;

    case 'click_intercepted':
      // Suggest force click
      fixes.push({
        type: 'test',
        location: 'click action',
        suggested: `await page.click('${analysis.selector}', { force: true });`,
        explanation: 'Force the click to bypass visibility checks (use with caution)',
        confidence: 0.6,
      });

      // Suggest waiting for overlay to disappear
      fixes.push({
        type: 'test',
        location: 'before click',
        suggested: `await page.waitForSelector('.loading-overlay', { state: 'hidden' });`,
        explanation: 'Wait for loading overlays or modals to disappear',
        confidence: 0.8,
      });

      // Suggest scrolling into view
      fixes.push({
        type: 'test',
        location: 'before click',
        suggested: `await page.evaluate(() => document.querySelector('${analysis.selector}')?.scrollIntoView());`,
        explanation: 'Scroll the element into view before clicking',
        confidence: 0.7,
      });
      break;

    case 'stale_element':
      // Suggest re-querying
      fixes.push({
        type: 'test',
        location: 'element reference',
        suggested: '// Re-query element immediately before use instead of storing reference',
        explanation: 'Query for the element right before each action instead of storing a reference',
        confidence: 0.9,
      });
      break;

    case 'network':
      // Suggest mocking
      fixes.push({
        type: 'test',
        location: 'before test',
        suggested: `await page.route('**/api/**', route => route.fulfill({ status: 200, body: '{}' }));`,
        explanation: 'Mock network requests to avoid dependency on external services',
        confidence: 0.8,
      });

      // Suggest retry logic
      fixes.push({
        type: 'test',
        location: 'around request',
        suggested: '// Wrap in retry logic with exponential backoff',
        explanation: 'Add retry logic for flaky network requests',
        confidence: 0.7,
      });
      break;

    case 'frame':
      fixes.push({
        type: 'test',
        location: 'before selector',
        suggested: `const frame = page.frameLocator('iframe'); await frame.locator('${analysis.selector}').click();`,
        explanation: 'Use frameLocator to interact with elements inside iframes',
        confidence: 0.9,
      });
      break;
  }

  // Adjust confidence based on previous attempts
  if (previousAttempts && previousAttempts.length > 0) {
    fixes.forEach(fix => {
      const attemptedSimilar = previousAttempts.some(a =>
        a.toLowerCase().includes(fix.suggested.toLowerCase().substring(0, 20))
      );
      if (attemptedSimilar) {
        fix.confidence *= 0.5; // Reduce confidence for previously tried approaches
      }
    });
  }

  return fixes.sort((a, b) => b.confidence - a.confidence);
}

function generateBetterSelector(original: string, html?: string): string {
  // Suggest data-testid if not already using one
  if (!original.includes('data-testid') && !original.includes('data-test')) {
    return `[data-testid="<descriptive-name>"] // Add data-testid to the element`;
  }

  // If using class, suggest more stable option
  if (original.startsWith('.')) {
    return `[role="button"][aria-label="<description>"] // Use ARIA attributes`;
  }

  // If using index, suggest text-based
  if (original.match(/:\d+/) || original.match(/\[\d+\]/)) {
    return `text=<visible text> // Use visible text content`;
  }

  return `${original} // Consider adding data-testid attribute`;
}

function generateWorkarounds(
  analysis: ErrorAnalysis,
  rootCause: string,
  context: SuggestFixOptions['context']
): string[] {
  const workarounds: string[] = [];

  switch (analysis.type) {
    case 'element_not_found':
      workarounds.push('Try running the test in headed mode to visually verify page state');
      workarounds.push('Add a screenshot before the failing step to see actual page state');
      workarounds.push('Check if the element requires scrolling into view');
      break;

    case 'timeout':
      workarounds.push('Run the test locally to check if it\'s an environment issue');
      workarounds.push('Check server/API response times');
      workarounds.push('Try running tests in sequence instead of parallel');
      break;

    case 'assertion':
      workarounds.push('Log the actual value to understand the discrepancy');
      workarounds.push('Check if the data is environment-specific');
      workarounds.push('Verify the test data setup is correct');
      break;

    case 'network':
      workarounds.push('Use network stubbing/mocking for reliability');
      workarounds.push('Check if the API endpoint is correct for the test environment');
      workarounds.push('Verify any required authentication tokens');
      break;

    case 'click_intercepted':
      workarounds.push('Wait for any loading states to complete');
      workarounds.push('Close any modals or dialogs that may be open');
      workarounds.push('Check for cookie consent banners or other overlays');
      break;
  }

  // Add context-specific workarounds
  if (context?.browser === 'webkit') {
    workarounds.push('WebKit may have different behavior - try Chrome for comparison');
  }

  return workarounds;
}

function generatePreventionTips(analysis: ErrorAnalysis, rootCause: string): string[] {
  const tips: string[] = [];

  switch (analysis.type) {
    case 'element_not_found':
      tips.push('Use data-testid attributes for test-specific selectors');
      tips.push('Avoid CSS class selectors that may change with styling updates');
      tips.push('Consider using the Page Object pattern to centralize selectors');
      break;

    case 'timeout':
      tips.push('Set appropriate timeouts per operation type');
      tips.push('Use explicit waits instead of relying on implicit timeouts');
      tips.push('Monitor application performance in CI to catch slowdowns early');
      break;

    case 'assertion':
      tips.push('Use snapshot testing for complex comparisons');
      tips.push('Make assertions as specific as needed but not more');
      tips.push('Consider using test data factories for consistent data');
      break;

    case 'network':
      tips.push('Implement request interception for reliable tests');
      tips.push('Use health checks before tests to verify service availability');
      tips.push('Document and manage API test dependencies');
      break;

    case 'click_intercepted':
      tips.push('Always wait for page idle state before interactions');
      tips.push('Handle overlay dismissal as part of test setup');
      tips.push('Consider creating a helper to dismiss common overlays');
      break;
  }

  return tips;
}

function findRelatedIssues(analysis: ErrorAnalysis): string[] {
  const issues: string[] = [];

  // Common related issues based on error type
  switch (analysis.type) {
    case 'element_not_found':
      issues.push('Race condition between page load and test execution');
      issues.push('Dynamic content loading via JavaScript');
      issues.push('Element rendered in different location/structure');
      break;

    case 'timeout':
      issues.push('Server performance degradation');
      issues.push('Network latency in CI environment');
      issues.push('Database query performance');
      break;

    case 'assertion':
      issues.push('Data synchronization issues');
      issues.push('Timezone or locale differences');
      issues.push('Caching returning stale data');
      break;
  }

  return issues;
}

function calculateConfidence(fixes: CodeFix[], previousAttempts: string[]): number {
  if (fixes.length === 0) return 0.1;

  const avgFixConfidence = fixes.reduce((sum, f) => sum + f.confidence, 0) / fixes.length;

  // Reduce overall confidence if many previous attempts
  const attemptPenalty = Math.min(previousAttempts.length * 0.1, 0.3);

  return Math.max(0.1, Math.min(1, avgFixConfidence - attemptPenalty));
}

/**
 * Format fix suggestions as readable output
 */
export function formatFixSuggestions(result: SuggestFixResult): string {
  const lines: string[] = [];

  lines.push('# Fix Suggestions');
  lines.push('');
  lines.push(`## Diagnosis`);
  lines.push(result.diagnosis);
  lines.push('');
  lines.push(`## Root Cause`);
  lines.push(result.rootCause);
  lines.push('');

  if (result.fixes.length > 0) {
    lines.push(`## Suggested Fixes (${result.fixes.length})`);
    lines.push('');

    result.fixes.forEach((fix, i) => {
      lines.push(`### Fix ${i + 1} (${Math.round(fix.confidence * 100)}% confidence)`);
      lines.push(`**Type**: ${fix.type}`);
      lines.push(`**Location**: ${fix.location}`);
      if (fix.original) {
        lines.push(`**Original**: \`${fix.original}\``);
      }
      lines.push('**Suggested**:');
      lines.push('```');
      lines.push(fix.suggested);
      lines.push('```');
      lines.push(`**Why**: ${fix.explanation}`);
      lines.push('');
    });
  }

  if (result.workarounds.length > 0) {
    lines.push(`## Workarounds`);
    result.workarounds.forEach(w => lines.push(`- ${w}`));
    lines.push('');
  }

  if (result.preventionTips.length > 0) {
    lines.push(`## Prevention Tips`);
    result.preventionTips.forEach(t => lines.push(`- ${t}`));
    lines.push('');
  }

  if (result.relatedIssues.length > 0) {
    lines.push(`## Related Issues to Check`);
    result.relatedIssues.forEach(i => lines.push(`- ${i}`));
    lines.push('');
  }

  lines.push(`---`);
  lines.push(`Overall confidence: ${Math.round(result.confidence * 100)}%`);

  return lines.join('\n');
}
