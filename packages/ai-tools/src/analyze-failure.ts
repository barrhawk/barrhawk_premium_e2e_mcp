/**
 * Analyze Failure - AI Root Cause Analysis
 *
 * Analyzes test failures to determine root cause and suggest fixes.
 */

import type {
  FailureContext,
  FailureAnalysisResult,
  FailureType,
  FixSuggestion,
} from './types.js';

/**
 * Analyze a test failure and provide root cause analysis
 */
export async function analyzeFailure(context: FailureContext): Promise<FailureAnalysisResult> {
  const error = context.error.toLowerCase();

  // Identify failure type
  const failureType = identifyFailureType(context);

  // Generate root cause description
  const rootCause = generateRootCauseDescription(failureType, context);

  // Generate fix suggestions
  const suggestions = generateSuggestions(failureType, context);

  // Identify related patterns
  const relatedPatterns = findRelatedPatterns(failureType, context);

  // Determine severity
  const severity = determineSeverity(failureType, context);

  return {
    rootCause,
    suggestions,
    relatedPatterns,
    severity,
  };
}

function identifyFailureType(context: FailureContext): FailureType {
  const error = context.error.toLowerCase();

  // Selector/element not found
  if (
    error.includes('no element') ||
    error.includes('not found') ||
    error.includes('unable to locate') ||
    error.includes('selector') ||
    error.includes('waiting for selector')
  ) {
    // Check if this might be a changed selector vs completely missing element
    if (context.htmlSnapshot && context.selector) {
      const selectorParts = extractSelectorParts(context.selector);
      const hasPartialMatch = selectorParts.some(part =>
        context.htmlSnapshot!.toLowerCase().includes(part.toLowerCase())
      );
      return hasPartialMatch ? 'selector_changed' : 'selector_not_found';
    }
    return 'selector_not_found';
  }

  // Timeout errors
  if (
    error.includes('timeout') ||
    error.includes('exceeded') ||
    error.includes('timed out')
  ) {
    return 'timeout';
  }

  // Network errors
  if (
    error.includes('network') ||
    error.includes('fetch') ||
    error.includes('request failed') ||
    error.includes('xhr') ||
    error.includes('cors') ||
    (context.networkErrors && context.networkErrors.length > 0)
  ) {
    return 'network_error';
  }

  // Assertion failures
  if (
    error.includes('assert') ||
    error.includes('expect') ||
    error.includes('should') ||
    error.includes('to equal') ||
    error.includes('to contain') ||
    error.includes('toBe')
  ) {
    return 'assertion_failed';
  }

  // Visibility issues
  if (
    error.includes('not visible') ||
    error.includes('hidden') ||
    error.includes('display: none') ||
    error.includes('visibility')
  ) {
    return 'element_not_visible';
  }

  // Interactability issues
  if (
    error.includes('not clickable') ||
    error.includes('not interactable') ||
    error.includes('another element') ||
    error.includes('intercept')
  ) {
    return 'element_not_interactable';
  }

  // Page/browser crashes
  if (
    error.includes('crash') ||
    error.includes('disconnected') ||
    error.includes('browser') ||
    error.includes('page closed')
  ) {
    return 'page_crashed';
  }

  // Navigation failures
  if (
    error.includes('navigation') ||
    error.includes('navigate') ||
    error.includes('net::err') ||
    error.includes('refused')
  ) {
    return 'navigation_failed';
  }

  return 'unknown';
}

function generateRootCauseDescription(
  type: FailureType,
  context: FailureContext
): { type: FailureType; confidence: number; description: string } {
  const descriptions: Record<FailureType, { confidence: number; description: string }> = {
    selector_not_found: {
      confidence: 0.85,
      description: `The element "${context.selector || 'unknown'}" does not exist on the page. The element may have been removed from the DOM or the selector may be incorrect.`,
    },
    selector_changed: {
      confidence: 0.8,
      description: `The selector "${context.selector || 'unknown'}" no longer matches the target element. The element likely exists but its attributes (id, class, data-testid) have changed.`,
    },
    timeout: {
      confidence: 0.9,
      description: `The operation timed out after ${context.timing?.timeout || 'the configured limit'}ms. This could be due to slow page load, element not appearing in time, or an infinite loading state.`,
    },
    network_error: {
      confidence: 0.85,
      description: `A network request failed: ${context.networkErrors?.[0] || 'Unknown network error'}. This may be caused by API unavailability, CORS issues, or authentication problems.`,
    },
    assertion_failed: {
      confidence: 0.95,
      description: `Assertion failed: expected "${context.expectedBehavior || 'expected value'}" but got "${context.actualBehavior || 'actual value'}". The page state or data did not match expectations.`,
    },
    element_not_visible: {
      confidence: 0.85,
      description: `The element "${context.selector || 'unknown'}" exists but is not visible. It may be hidden by CSS (display:none, visibility:hidden) or outside the viewport.`,
    },
    element_not_interactable: {
      confidence: 0.85,
      description: `The element "${context.selector || 'unknown'}" cannot be interacted with. It may be covered by another element (overlay, modal) or disabled.`,
    },
    page_crashed: {
      confidence: 0.9,
      description: 'The browser page crashed or became disconnected. This could be due to memory issues, JavaScript errors, or browser instability.',
    },
    navigation_failed: {
      confidence: 0.9,
      description: 'Navigation to the target URL failed. The server may be down, the URL may be incorrect, or there may be network connectivity issues.',
    },
    unknown: {
      confidence: 0.5,
      description: `An unexpected error occurred: ${context.error}. Further investigation is needed to determine the root cause.`,
    },
  };

  return {
    type,
    ...descriptions[type],
  };
}

function generateSuggestions(type: FailureType, context: FailureContext): FixSuggestion[] {
  const suggestions: FixSuggestion[] = [];

  switch (type) {
    case 'selector_not_found':
      suggestions.push({
        type: 'selector',
        description: 'Use a more stable selector like data-testid or aria-label',
        code: context.selector
          ? `// Instead of: ${context.selector}\n// Try: [data-testid="element-name"]`
          : undefined,
        confidence: 0.8,
      });
      suggestions.push({
        type: 'wait',
        description: 'Add explicit wait for element to appear',
        code: `await page.waitForSelector('${context.selector || 'selector'}', { state: 'visible', timeout: 10000 });`,
        confidence: 0.7,
      });
      break;

    case 'selector_changed':
      suggestions.push({
        type: 'selector',
        description: 'Enable self-healing selectors to auto-recover from selector changes',
        code: `await browser_click({ selector: '${context.selector || 'selector'}', self_heal: true });`,
        confidence: 0.9,
      });
      suggestions.push({
        type: 'selector',
        description: 'Update the selector to match the new DOM structure',
        confidence: 0.85,
      });
      break;

    case 'timeout':
      suggestions.push({
        type: 'wait',
        description: 'Increase the timeout duration',
        code: `await page.waitForSelector('${context.selector || 'selector'}', { timeout: 30000 });`,
        confidence: 0.7,
      });
      suggestions.push({
        type: 'wait',
        description: 'Wait for network requests to complete before acting',
        code: `await page.waitForLoadState('networkidle');`,
        confidence: 0.75,
      });
      suggestions.push({
        type: 'environment',
        description: 'Check if the test environment is overloaded or slow',
        confidence: 0.6,
      });
      break;

    case 'network_error':
      suggestions.push({
        type: 'environment',
        description: 'Verify the API endpoint is accessible',
        confidence: 0.8,
      });
      suggestions.push({
        type: 'wait',
        description: 'Add retry logic for flaky network requests',
        code: `// Consider implementing retry logic\nawait retry(() => page.goto(url), { retries: 3, delay: 1000 });`,
        confidence: 0.7,
      });
      break;

    case 'assertion_failed':
      suggestions.push({
        type: 'assertion',
        description: 'Update the expected value to match current behavior (if behavior change is intentional)',
        confidence: 0.7,
      });
      suggestions.push({
        type: 'wait',
        description: 'Wait for the data to be fully loaded before asserting',
        code: `await page.waitForResponse(response => response.url().includes('/api/'));`,
        confidence: 0.75,
      });
      break;

    case 'element_not_visible':
      suggestions.push({
        type: 'wait',
        description: 'Wait for element to become visible',
        code: `await page.waitForSelector('${context.selector || 'selector'}', { state: 'visible' });`,
        confidence: 0.85,
      });
      suggestions.push({
        type: 'flow',
        description: 'Scroll the element into view before interacting',
        code: `await page.locator('${context.selector || 'selector'}').scrollIntoViewIfNeeded();`,
        confidence: 0.7,
      });
      break;

    case 'element_not_interactable':
      suggestions.push({
        type: 'wait',
        description: 'Wait for overlays or modals to close',
        code: `await page.waitForSelector('.overlay', { state: 'hidden' });`,
        confidence: 0.75,
      });
      suggestions.push({
        type: 'flow',
        description: 'Use force click to bypass interactability checks (use with caution)',
        code: `await page.locator('${context.selector || 'selector'}').click({ force: true });`,
        confidence: 0.6,
      });
      break;

    case 'page_crashed':
      suggestions.push({
        type: 'environment',
        description: 'Reduce memory usage by closing unused pages',
        confidence: 0.7,
      });
      suggestions.push({
        type: 'environment',
        description: 'Run the browser in headless mode to reduce resource usage',
        confidence: 0.6,
      });
      break;

    case 'navigation_failed':
      suggestions.push({
        type: 'environment',
        description: 'Verify the target URL is correct and accessible',
        confidence: 0.9,
      });
      suggestions.push({
        type: 'wait',
        description: 'Add retry logic for navigation',
        code: `try { await page.goto(url); } catch { await page.goto(url); }`,
        confidence: 0.7,
      });
      break;

    default:
      suggestions.push({
        type: 'flow',
        description: 'Review the test logic and error message for more context',
        confidence: 0.5,
      });
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

function findRelatedPatterns(type: FailureType, context: FailureContext): string[] {
  const patterns: string[] = [];

  // Add patterns based on console errors
  if (context.consoleErrors && context.consoleErrors.length > 0) {
    patterns.push(`Console errors detected: ${context.consoleErrors.length} errors`);
    if (context.consoleErrors.some(e => e.includes('undefined'))) {
      patterns.push('JavaScript undefined errors may indicate missing data');
    }
    if (context.consoleErrors.some(e => e.includes('CORS'))) {
      patterns.push('CORS issues may require backend configuration');
    }
  }

  // Add patterns based on timing
  if (context.timing) {
    if (context.timing.pageLoadTime && context.timing.pageLoadTime > 5000) {
      patterns.push('Slow page load (>5s) may indicate performance issues');
    }
    if (context.timing.actionTime && context.timing.actionTime > 10000) {
      patterns.push('Long action duration suggests loading or animation delays');
    }
  }

  // Add patterns based on failure type
  if (type === 'selector_changed' || type === 'selector_not_found') {
    patterns.push('Selector failures often occur after frontend deployments');
  }

  if (type === 'timeout') {
    patterns.push('Timeouts may be environment-specific - check CI vs local');
  }

  return patterns;
}

function determineSeverity(
  type: FailureType,
  context: FailureContext
): 'low' | 'medium' | 'high' | 'critical' {
  // Critical: System is broken
  if (type === 'page_crashed' || type === 'navigation_failed') {
    return 'critical';
  }

  // High: Core functionality broken
  if (type === 'assertion_failed') {
    return 'high';
  }

  // Medium: Test infrastructure issues
  if (
    type === 'selector_not_found' ||
    type === 'selector_changed' ||
    type === 'timeout'
  ) {
    return 'medium';
  }

  // Low: Minor issues
  if (
    type === 'element_not_visible' ||
    type === 'element_not_interactable' ||
    type === 'network_error'
  ) {
    return 'low';
  }

  return 'medium';
}

function extractSelectorParts(selector: string): string[] {
  const parts: string[] = [];

  // Extract id
  const idMatch = selector.match(/#([a-zA-Z0-9_-]+)/);
  if (idMatch) parts.push(idMatch[1]);

  // Extract classes
  const classMatches = selector.match(/\.([a-zA-Z0-9_-]+)/g);
  if (classMatches) {
    parts.push(...classMatches.map(c => c.slice(1)));
  }

  // Extract data-testid
  const testIdMatch = selector.match(/\[data-testid=["']([^"']+)["']\]/);
  if (testIdMatch) parts.push(testIdMatch[1]);

  // Extract text content
  const textMatch = selector.match(/text=["']?([^"']+)["']?/i);
  if (textMatch) parts.push(textMatch[1]);

  return parts;
}

/**
 * Format analysis result as text
 */
export function formatAnalysisResult(result: FailureAnalysisResult): string {
  let output = `\n# Failure Analysis\n`;
  output += '═'.repeat(50) + '\n\n';

  // Root cause
  output += `## Root Cause\n`;
  output += `**Type:** ${result.rootCause.type}\n`;
  output += `**Confidence:** ${(result.rootCause.confidence * 100).toFixed(0)}%\n`;
  output += `**Severity:** ${result.severity.toUpperCase()}\n\n`;
  output += `${result.rootCause.description}\n\n`;

  // Suggestions
  output += `## Suggested Fixes\n`;
  for (let i = 0; i < result.suggestions.length; i++) {
    const s = result.suggestions[i];
    output += `\n${i + 1}. **${s.description}** (${(s.confidence * 100).toFixed(0)}% confidence)\n`;
    if (s.code) {
      output += '```javascript\n';
      output += s.code + '\n';
      output += '```\n';
    }
  }

  // Related patterns
  if (result.relatedPatterns && result.relatedPatterns.length > 0) {
    output += `\n## Related Patterns\n`;
    for (const pattern of result.relatedPatterns) {
      output += `- ${pattern}\n`;
    }
  }

  return output;
}
