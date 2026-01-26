/**
 * Test Explain Tool
 *
 * Analyzes test code and explains what it does in natural language.
 * Helps understand test intent and coverage.
 */

export interface TestExplainOptions {
  testCode: string;
  testName?: string;
  format?: 'brief' | 'detailed' | 'technical';
  includeAssertions?: boolean;
  includeCoverage?: boolean;
}

export interface TestStep {
  action: string;
  description: string;
  selector?: string;
  value?: string;
  assertion?: string;
}

export interface TestExplainResult {
  testName: string;
  summary: string;
  purpose: string;
  steps: TestStep[];
  assertions: string[];
  coverage: {
    features: string[];
    userFlows: string[];
    edgeCases: string[];
  };
  complexity: 'simple' | 'moderate' | 'complex';
  estimatedDuration: string;
  dependencies: string[];
  suggestions: string[];
}

/**
 * Explain what a test does in natural language
 */
export function explainTest(options: TestExplainOptions): TestExplainResult {
  const {
    testCode,
    testName,
    format = 'detailed',
    includeAssertions = true,
    includeCoverage = true,
  } = options;

  // Parse test code to extract information
  const parsed = parseTestCode(testCode);

  // Extract test name from code if not provided
  const extractedName = testName || parsed.name || 'Unnamed Test';

  // Analyze steps
  const steps = analyzeSteps(parsed.statements);

  // Extract assertions
  const assertions = includeAssertions ? extractAssertions(parsed.statements) : [];

  // Determine coverage
  const coverage = includeCoverage ? analyzeCoverage(steps, assertions) : {
    features: [],
    userFlows: [],
    edgeCases: [],
  };

  // Generate summary based on format
  const summary = generateSummary(extractedName, steps, assertions, format);

  // Determine purpose
  const purpose = determinePurpose(steps, assertions);

  // Assess complexity
  const complexity = assessComplexity(steps, assertions);

  // Estimate duration
  const estimatedDuration = estimateDuration(steps);

  // Find dependencies
  const dependencies = findDependencies(parsed.statements);

  // Generate suggestions
  const suggestions = generateSuggestions(steps, assertions, coverage);

  return {
    testName: extractedName,
    summary,
    purpose,
    steps,
    assertions,
    coverage,
    complexity,
    estimatedDuration,
    dependencies,
    suggestions,
  };
}

interface ParsedTest {
  name: string;
  statements: string[];
  imports: string[];
}

function parseTestCode(code: string): ParsedTest {
  const lines = code.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Extract test name from common patterns
  let name = '';
  const testNamePatterns = [
    /test\s*\(\s*['"`](.+?)['"`]/,
    /it\s*\(\s*['"`](.+?)['"`]/,
    /describe\s*\(\s*['"`](.+?)['"`]/,
    /\.test\s*=\s*['"`](.+?)['"`]/,
  ];

  for (const line of lines) {
    for (const pattern of testNamePatterns) {
      const match = line.match(pattern);
      if (match) {
        name = match[1];
        break;
      }
    }
    if (name) break;
  }

  // Extract imports
  const imports: string[] = [];
  for (const line of lines) {
    if (line.startsWith('import ') || line.startsWith('const ') && line.includes('require(')) {
      imports.push(line);
    }
  }

  // Filter to just statements (remove comments, imports)
  const statements = lines.filter(line =>
    !line.startsWith('//') &&
    !line.startsWith('/*') &&
    !line.startsWith('*') &&
    !line.startsWith('import ') &&
    !line.match(/^const\s+\w+\s*=\s*require/)
  );

  return { name, statements, imports };
}

function analyzeSteps(statements: string[]): TestStep[] {
  const steps: TestStep[] = [];

  const actionPatterns: Array<{ pattern: RegExp; action: string; extractor: (m: RegExpMatchArray) => Partial<TestStep> }> = [
    // Navigation
    {
      pattern: /(?:page|browser)\.goto\s*\(\s*['"`](.+?)['"`]/,
      action: 'navigate',
      extractor: (m) => ({ description: `Navigate to ${m[1]}`, value: m[1] }),
    },
    {
      pattern: /browser_navigate.*url.*['"`](.+?)['"`]/,
      action: 'navigate',
      extractor: (m) => ({ description: `Navigate to ${m[1]}`, value: m[1] }),
    },
    // Click actions
    {
      pattern: /\.click\s*\(\s*['"`](.+?)['"`]/,
      action: 'click',
      extractor: (m) => ({ description: `Click on element`, selector: m[1] }),
    },
    {
      pattern: /browser_click.*selector.*['"`](.+?)['"`]/,
      action: 'click',
      extractor: (m) => ({ description: `Click on element`, selector: m[1] }),
    },
    {
      pattern: /browser_click.*text.*['"`](.+?)['"`]/,
      action: 'click',
      extractor: (m) => ({ description: `Click on "${m[1]}"`, value: m[1] }),
    },
    // Type actions
    {
      pattern: /\.(?:type|fill)\s*\(\s*['"`](.+?)['"`]\s*,\s*['"`](.+?)['"`]/,
      action: 'type',
      extractor: (m) => ({ description: `Type "${m[2]}" into field`, selector: m[1], value: m[2] }),
    },
    {
      pattern: /browser_type.*selector.*['"`](.+?)['"`].*text.*['"`](.+?)['"`]/,
      action: 'type',
      extractor: (m) => ({ description: `Type "${m[2]}" into field`, selector: m[1], value: m[2] }),
    },
    // Wait actions
    {
      pattern: /\.waitFor(?:Selector|Element)\s*\(\s*['"`](.+?)['"`]/,
      action: 'wait',
      extractor: (m) => ({ description: `Wait for element to appear`, selector: m[1] }),
    },
    {
      pattern: /browser_wait.*selector.*['"`](.+?)['"`]/,
      action: 'wait',
      extractor: (m) => ({ description: `Wait for element`, selector: m[1] }),
    },
    // Screenshot
    {
      pattern: /\.screenshot\s*\(/,
      action: 'screenshot',
      extractor: () => ({ description: 'Take a screenshot' }),
    },
    {
      pattern: /browser_screenshot/,
      action: 'screenshot',
      extractor: () => ({ description: 'Take a screenshot' }),
    },
    // Scroll
    {
      pattern: /\.scroll/,
      action: 'scroll',
      extractor: () => ({ description: 'Scroll the page' }),
    },
    {
      pattern: /browser_scroll.*direction.*['"`](\w+)['"`]/,
      action: 'scroll',
      extractor: (m) => ({ description: `Scroll ${m[1]}` }),
    },
    // Get text
    {
      pattern: /\.(?:textContent|innerText)\s*\(\s*['"`]?(.+?)['"`]?\s*\)/,
      action: 'getText',
      extractor: (m) => ({ description: 'Get text content', selector: m[1] }),
    },
    {
      pattern: /browser_get_text/,
      action: 'getText',
      extractor: () => ({ description: 'Get text from page' }),
    },
    // Assertions
    {
      pattern: /expect\s*\(.+?\)\.to(?:Be|Have|Equal|Match|Contain)(.+?)\(/,
      action: 'assert',
      extractor: (m) => ({ description: `Assert ${m[1].replace(/([A-Z])/g, ' $1').toLowerCase().trim()}` }),
    },
    {
      pattern: /smart_assert/,
      action: 'assert',
      extractor: () => ({ description: 'Smart assertion check' }),
    },
  ];

  for (const statement of statements) {
    for (const { pattern, action, extractor } of actionPatterns) {
      const match = statement.match(pattern);
      if (match) {
        const extracted = extractor(match);
        steps.push({
          action,
          description: extracted.description || action,
          selector: extracted.selector,
          value: extracted.value,
          assertion: action === 'assert' ? statement : undefined,
        });
        break;
      }
    }
  }

  return steps;
}

function extractAssertions(statements: string[]): string[] {
  const assertions: string[] = [];

  const assertionPatterns = [
    /expect\s*\((.+?)\)\.(to\w+)\(/,
    /assert\s*\.\s*(\w+)\s*\(/,
    /should\s*\.\s*(\w+)/,
    /smart_assert.*actual.*['"`](.+?)['"`]/,
  ];

  for (const statement of statements) {
    for (const pattern of assertionPatterns) {
      if (pattern.test(statement)) {
        // Generate human-readable assertion
        const readable = humanizeAssertion(statement);
        if (readable) {
          assertions.push(readable);
        }
        break;
      }
    }
  }

  return assertions;
}

function humanizeAssertion(assertion: string): string {
  // Common assertion patterns to human language
  const patterns: Array<[RegExp, string]> = [
    [/expect\(.+?\)\.toBeVisible/, 'Element should be visible'],
    [/expect\(.+?\)\.toBeHidden/, 'Element should be hidden'],
    [/expect\(.+?\)\.toContain\(['"`](.+?)['"`]/, 'Content should contain "$1"'],
    [/expect\(.+?\)\.toEqual\(['"`](.+?)['"`]/, 'Value should equal "$1"'],
    [/expect\(.+?\)\.toBeTruthy/, 'Value should be truthy'],
    [/expect\(.+?\)\.toBeFalsy/, 'Value should be falsy'],
    [/expect\(.+?\)\.toHaveLength\((\d+)/, 'Should have $1 items'],
    [/expect\(.+?\)\.toHaveText\(['"`](.+?)['"`]/, 'Should have text "$1"'],
    [/expect\(.+?\)\.toHaveAttribute\(['"`](\w+)['"`]/, 'Should have attribute "$1"'],
    [/expect\(.+?\)\.toBeEnabled/, 'Element should be enabled'],
    [/expect\(.+?\)\.toBeDisabled/, 'Element should be disabled'],
  ];

  for (const [pattern, template] of patterns) {
    const match = assertion.match(pattern);
    if (match) {
      let result = template;
      for (let i = 1; i < match.length; i++) {
        result = result.replace(`$${i}`, match[i]);
      }
      return result;
    }
  }

  return assertion.substring(0, 80);
}

function analyzeCoverage(steps: TestStep[], assertions: string[]): TestExplainResult['coverage'] {
  const features: string[] = [];
  const userFlows: string[] = [];
  const edgeCases: string[] = [];

  // Detect features from steps
  const hasNavigation = steps.some(s => s.action === 'navigate');
  const hasFormInput = steps.some(s => s.action === 'type');
  const hasClick = steps.some(s => s.action === 'click');
  const hasAssertions = steps.some(s => s.action === 'assert') || assertions.length > 0;

  if (hasNavigation) features.push('Page navigation');
  if (hasFormInput) features.push('Form input handling');
  if (hasClick) features.push('Click interactions');
  if (hasAssertions) features.push('State verification');

  // Detect user flows from step sequences
  const stepActions = steps.map(s => s.action).join(',');

  if (stepActions.includes('navigate,type,click')) {
    userFlows.push('Form submission flow');
  }
  if (stepActions.includes('navigate,click,navigate')) {
    userFlows.push('Multi-page navigation flow');
  }
  if (stepActions.includes('type') && stepActions.includes('click')) {
    userFlows.push('Data entry flow');
  }

  // Detect potential edge cases from assertions
  for (const assertion of assertions) {
    if (assertion.toLowerCase().includes('error')) {
      edgeCases.push('Error handling');
    }
    if (assertion.toLowerCase().includes('empty')) {
      edgeCases.push('Empty state handling');
    }
    if (assertion.toLowerCase().includes('disabled')) {
      edgeCases.push('Disabled state handling');
    }
  }

  return { features, userFlows, edgeCases };
}

function generateSummary(name: string, steps: TestStep[], assertions: string[], format: string): string {
  const stepCount = steps.length;
  const assertionCount = assertions.length;

  if (format === 'brief') {
    return `"${name}" performs ${stepCount} actions with ${assertionCount} assertions.`;
  }

  if (format === 'technical') {
    const actions = steps.map(s => s.action).join(' → ');
    return `Test "${name}" executes: ${actions}. Validates: ${assertions.slice(0, 3).join('; ')}${assertions.length > 3 ? '...' : ''}`;
  }

  // Detailed format
  const mainActions = steps.slice(0, 3).map(s => s.description).join(', then ');
  const mainAssertions = assertions.slice(0, 2).join(' and ');

  return `This test "${name}" ${mainActions}${steps.length > 3 ? ' and more' : ''}. It verifies that ${mainAssertions || 'the expected behavior occurs'}.`;
}

function determinePurpose(steps: TestStep[], assertions: string[]): string {
  // Analyze steps to determine test purpose
  const hasLogin = steps.some(s =>
    s.selector?.includes('password') ||
    s.selector?.includes('login') ||
    s.value?.toLowerCase().includes('login')
  );

  const hasSearch = steps.some(s =>
    s.selector?.includes('search') ||
    s.action === 'type' && s.selector?.includes('query')
  );

  const hasCheckout = steps.some(s =>
    s.selector?.includes('cart') ||
    s.selector?.includes('checkout') ||
    s.value?.toLowerCase().includes('buy')
  );

  const hasForm = steps.filter(s => s.action === 'type').length >= 2;

  if (hasLogin) return 'Verify user authentication flow works correctly';
  if (hasSearch) return 'Validate search functionality and results display';
  if (hasCheckout) return 'Test e-commerce checkout process';
  if (hasForm) return 'Ensure form submission and validation work properly';

  if (assertions.some(a => a.includes('visible'))) {
    return 'Verify UI elements render correctly';
  }

  if (assertions.some(a => a.includes('error'))) {
    return 'Test error handling and validation';
  }

  return 'Validate application behavior and user interactions';
}

function assessComplexity(steps: TestStep[], assertions: string[]): 'simple' | 'moderate' | 'complex' {
  const totalActions = steps.length + assertions.length;

  if (totalActions <= 5) return 'simple';
  if (totalActions <= 15) return 'moderate';
  return 'complex';
}

function estimateDuration(steps: TestStep[]): string {
  // Rough estimation based on step types
  let seconds = 0;

  for (const step of steps) {
    switch (step.action) {
      case 'navigate':
        seconds += 3; // Page load
        break;
      case 'click':
        seconds += 1;
        break;
      case 'type':
        seconds += 2;
        break;
      case 'wait':
        seconds += 2;
        break;
      case 'screenshot':
        seconds += 1;
        break;
      case 'assert':
        seconds += 0.5;
        break;
      default:
        seconds += 1;
    }
  }

  if (seconds < 5) return '< 5 seconds';
  if (seconds < 15) return '5-15 seconds';
  if (seconds < 30) return '15-30 seconds';
  if (seconds < 60) return '30-60 seconds';
  return '> 1 minute';
}

function findDependencies(statements: string[]): string[] {
  const dependencies: string[] = [];

  // Look for common testing frameworks and utilities
  const depPatterns: Array<[RegExp, string]> = [
    [/playwright/i, 'Playwright'],
    [/puppeteer/i, 'Puppeteer'],
    [/cypress/i, 'Cypress'],
    [/selenium/i, 'Selenium'],
    [/jest/i, 'Jest'],
    [/mocha/i, 'Mocha'],
    [/vitest/i, 'Vitest'],
    [/browser_/i, 'BarrHawk E2E MCP'],
  ];

  const fullCode = statements.join(' ');

  for (const [pattern, name] of depPatterns) {
    if (pattern.test(fullCode) && !dependencies.includes(name)) {
      dependencies.push(name);
    }
  }

  return dependencies;
}

function generateSuggestions(
  steps: TestStep[],
  assertions: string[],
  coverage: TestExplainResult['coverage']
): string[] {
  const suggestions: string[] = [];

  // Check for missing assertions
  if (assertions.length === 0) {
    suggestions.push('Add assertions to verify expected behavior');
  }

  // Check for missing error handling
  if (!coverage.edgeCases.includes('Error handling')) {
    suggestions.push('Consider adding error state testing');
  }

  // Check for missing screenshots
  if (!steps.some(s => s.action === 'screenshot')) {
    suggestions.push('Add screenshots for visual debugging');
  }

  // Check for proper waits
  const hasNavigation = steps.some(s => s.action === 'navigate');
  const hasWaits = steps.some(s => s.action === 'wait');
  if (hasNavigation && !hasWaits) {
    suggestions.push('Add explicit waits after navigation for reliability');
  }

  // Check assertion count relative to steps
  if (steps.length > 5 && assertions.length < 2) {
    suggestions.push('Add more assertions to validate intermediate states');
  }

  return suggestions;
}

/**
 * Format test explanation as human-readable output
 */
export function formatTestExplanation(result: TestExplainResult): string {
  const lines: string[] = [];

  lines.push(`# Test: ${result.testName}`);
  lines.push('');
  lines.push(`## Summary`);
  lines.push(result.summary);
  lines.push('');
  lines.push(`## Purpose`);
  lines.push(result.purpose);
  lines.push('');
  lines.push(`## Steps (${result.steps.length})`);

  result.steps.forEach((step, i) => {
    let stepLine = `${i + 1}. **${step.action}**: ${step.description}`;
    if (step.selector) stepLine += ` (${step.selector})`;
    lines.push(stepLine);
  });

  if (result.assertions.length > 0) {
    lines.push('');
    lines.push(`## Assertions (${result.assertions.length})`);
    result.assertions.forEach(a => lines.push(`- ${a}`));
  }

  lines.push('');
  lines.push(`## Analysis`);
  lines.push(`- **Complexity**: ${result.complexity}`);
  lines.push(`- **Estimated Duration**: ${result.estimatedDuration}`);

  if (result.coverage.features.length > 0) {
    lines.push(`- **Features Tested**: ${result.coverage.features.join(', ')}`);
  }

  if (result.coverage.userFlows.length > 0) {
    lines.push(`- **User Flows**: ${result.coverage.userFlows.join(', ')}`);
  }

  if (result.dependencies.length > 0) {
    lines.push(`- **Dependencies**: ${result.dependencies.join(', ')}`);
  }

  if (result.suggestions.length > 0) {
    lines.push('');
    lines.push(`## Suggestions`);
    result.suggestions.forEach(s => lines.push(`- ${s}`));
  }

  return lines.join('\n');
}
