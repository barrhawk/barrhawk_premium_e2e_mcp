/**
 * Test From Description - Natural Language Test Authoring
 *
 * Creates executable test steps from natural language descriptions.
 */

export interface TestFromDescriptionOptions {
  description: string;
  baseUrl?: string;
  context?: string;
}

export interface GeneratedTest {
  name: string;
  description: string;
  steps: TestStep[];
  assertions: TestAssertion[];
  metadata: {
    confidence: number;
    generatedAt: string;
    inputDescription: string;
  };
}

export interface TestStep {
  action: 'navigate' | 'click' | 'type' | 'wait' | 'scroll' | 'hover' | 'select' | 'press';
  target?: string;
  value?: string;
  description: string;
}

export interface TestAssertion {
  type: 'visible' | 'text' | 'value' | 'url' | 'title' | 'count' | 'attribute';
  target?: string;
  expected?: string;
  description: string;
}

/**
 * Parse natural language description and generate test steps
 */
export async function testFromDescription(
  options: TestFromDescriptionOptions
): Promise<GeneratedTest> {
  const { description, baseUrl, context } = options;
  const desc = description.toLowerCase();

  // Extract test name from description
  const name = generateTestName(description);

  // Parse intent and generate steps
  const { steps, assertions } = parseDescription(desc, baseUrl);

  // Calculate confidence based on how well we understood the description
  const confidence = calculateConfidence(steps, assertions, desc);

  return {
    name,
    description,
    steps,
    assertions,
    metadata: {
      confidence,
      generatedAt: new Date().toISOString(),
      inputDescription: description,
    },
  };
}

function generateTestName(description: string): string {
  // Clean up description into a test name
  return description
    .toLowerCase()
    .replace(/^test\s+(that\s+)?/i, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join('_');
}

function parseDescription(
  desc: string,
  baseUrl?: string
): { steps: TestStep[]; assertions: TestAssertion[] } {
  const steps: TestStep[] = [];
  const assertions: TestAssertion[] = [];

  // Detect login flow
  if (desc.includes('login') || desc.includes('sign in') || desc.includes('log in')) {
    parseLoginFlow(desc, steps, assertions, baseUrl);
  }
  // Detect signup/register flow
  else if (desc.includes('signup') || desc.includes('sign up') || desc.includes('register')) {
    parseSignupFlow(desc, steps, assertions, baseUrl);
  }
  // Detect search flow
  else if (desc.includes('search')) {
    parseSearchFlow(desc, steps, assertions, baseUrl);
  }
  // Detect form submission
  else if (desc.includes('form') || desc.includes('submit')) {
    parseFormFlow(desc, steps, assertions, baseUrl);
  }
  // Detect checkout/purchase flow
  else if (desc.includes('checkout') || desc.includes('purchase') || desc.includes('buy')) {
    parseCheckoutFlow(desc, steps, assertions, baseUrl);
  }
  // Detect navigation
  else if (desc.includes('navigate') || desc.includes('go to') || desc.includes('visit')) {
    parseNavigationFlow(desc, steps, assertions, baseUrl);
  }
  // Detect click action
  else if (desc.includes('click')) {
    parseClickFlow(desc, steps, assertions);
  }
  // Generic flow
  else {
    parseGenericFlow(desc, steps, assertions, baseUrl);
  }

  return { steps, assertions };
}

function parseLoginFlow(
  desc: string,
  steps: TestStep[],
  assertions: TestAssertion[],
  baseUrl?: string
): void {
  // Navigate to login page
  steps.push({
    action: 'navigate',
    target: baseUrl ? `${baseUrl}/login` : '/login',
    description: 'Navigate to login page',
  });

  // Determine if this is a positive or negative test
  const isNegativeTest = desc.includes('wrong') || desc.includes('invalid') ||
    desc.includes('incorrect') || desc.includes('bad') || desc.includes('error') ||
    desc.includes('fail');

  // Enter email/username
  const emailValue = extractValue(desc, 'email') || 'test@example.com';
  steps.push({
    action: 'type',
    target: 'input[type="email"], input[name="email"], #email, input[name="username"], #username',
    value: emailValue,
    description: 'Enter email/username',
  });

  // Enter password
  const passwordValue = isNegativeTest ? 'wrongpassword' : (extractValue(desc, 'password') || 'password123');
  steps.push({
    action: 'type',
    target: 'input[type="password"], input[name="password"], #password',
    value: passwordValue,
    description: isNegativeTest ? 'Enter wrong password' : 'Enter password',
  });

  // Click submit
  steps.push({
    action: 'click',
    target: 'button[type="submit"], input[type="submit"], #login-btn, .login-button, button:has-text("Sign In"), button:has-text("Login")',
    description: 'Click login button',
  });

  // Wait for response
  steps.push({
    action: 'wait',
    target: isNegativeTest ? '.error, .error-message, [role="alert"], #error' : '.success, .dashboard, [data-testid="dashboard"]',
    description: isNegativeTest ? 'Wait for error message' : 'Wait for successful login',
  });

  // Assertions
  if (isNegativeTest) {
    assertions.push({
      type: 'visible',
      target: '.error, .error-message, [role="alert"]',
      description: 'Error message should be visible',
    });
    assertions.push({
      type: 'text',
      target: '.error, .error-message',
      expected: 'invalid|incorrect|wrong|error|failed',
      description: 'Error message should indicate invalid credentials',
    });
  } else {
    assertions.push({
      type: 'url',
      expected: '/dashboard|/home|/account',
      description: 'Should redirect to dashboard',
    });
    assertions.push({
      type: 'visible',
      target: '.welcome, .user-profile, [data-testid="user-menu"]',
      description: 'User should see welcome message or profile',
    });
  }
}

function parseSignupFlow(
  desc: string,
  steps: TestStep[],
  assertions: TestAssertion[],
  baseUrl?: string
): void {
  steps.push({
    action: 'navigate',
    target: baseUrl ? `${baseUrl}/signup` : '/signup',
    description: 'Navigate to signup page',
  });

  // Check for validation test
  const isValidationTest = desc.includes('validation') || desc.includes('invalid') || desc.includes('error');

  steps.push({
    action: 'type',
    target: 'input[name="name"], input[name="fullname"], #name',
    value: 'Test User',
    description: 'Enter name',
  });

  const emailValue = isValidationTest && desc.includes('email') ? 'invalidemail' : 'test@example.com';
  steps.push({
    action: 'type',
    target: 'input[type="email"], input[name="email"], #email',
    value: emailValue,
    description: 'Enter email',
  });

  steps.push({
    action: 'type',
    target: 'input[type="password"], input[name="password"], #password',
    value: 'SecurePass123!',
    description: 'Enter password',
  });

  if (desc.includes('confirm')) {
    steps.push({
      action: 'type',
      target: 'input[name="confirmPassword"], input[name="password_confirm"], #confirm-password',
      value: 'SecurePass123!',
      description: 'Confirm password',
    });
  }

  steps.push({
    action: 'click',
    target: 'button[type="submit"], .signup-button, button:has-text("Sign Up"), button:has-text("Register")',
    description: 'Click signup button',
  });

  if (isValidationTest) {
    assertions.push({
      type: 'visible',
      target: '.error, .validation-error, [role="alert"]',
      description: 'Validation error should appear',
    });
  } else {
    assertions.push({
      type: 'visible',
      target: '.success, .confirmation, .welcome',
      description: 'Success message should appear',
    });
  }
}

function parseSearchFlow(
  desc: string,
  steps: TestStep[],
  assertions: TestAssertion[],
  baseUrl?: string
): void {
  if (baseUrl) {
    steps.push({
      action: 'navigate',
      target: baseUrl,
      description: 'Navigate to page',
    });
  }

  const searchTerm = extractQuotedValue(desc) || extractValue(desc, 'search') || 'test query';

  steps.push({
    action: 'type',
    target: 'input[type="search"], input[name="q"], input[name="search"], #search, .search-input',
    value: searchTerm,
    description: `Enter search term: ${searchTerm}`,
  });

  steps.push({
    action: 'click',
    target: 'button[type="submit"], .search-button, button:has-text("Search"), [aria-label="Search"]',
    description: 'Click search button',
  });

  steps.push({
    action: 'wait',
    target: '.search-results, .results, [data-testid="results"]',
    description: 'Wait for search results',
  });

  const expectNoResults = desc.includes('no results') || desc.includes('not found') || desc.includes('empty');

  if (expectNoResults) {
    assertions.push({
      type: 'visible',
      target: '.no-results, .empty-state',
      description: 'Should show no results message',
    });
  } else {
    assertions.push({
      type: 'visible',
      target: '.search-results, .result-item',
      description: 'Search results should be visible',
    });
    assertions.push({
      type: 'count',
      target: '.result-item, .search-result',
      expected: '>0',
      description: 'Should have at least one result',
    });
  }
}

function parseFormFlow(
  desc: string,
  steps: TestStep[],
  assertions: TestAssertion[],
  baseUrl?: string
): void {
  if (baseUrl) {
    steps.push({
      action: 'navigate',
      target: baseUrl,
      description: 'Navigate to form page',
    });
  }

  // Generic form filling
  steps.push({
    action: 'type',
    target: 'input[type="text"]:first-of-type, input[name]:first-of-type',
    value: 'Test Value',
    description: 'Fill first text input',
  });

  if (desc.includes('email')) {
    steps.push({
      action: 'type',
      target: 'input[type="email"]',
      value: 'test@example.com',
      description: 'Fill email field',
    });
  }

  steps.push({
    action: 'click',
    target: 'button[type="submit"], input[type="submit"]',
    description: 'Submit form',
  });

  const isValidationTest = desc.includes('validation') || desc.includes('required') || desc.includes('invalid');

  if (isValidationTest) {
    assertions.push({
      type: 'visible',
      target: '.error, .validation-error, .field-error',
      description: 'Validation error should appear',
    });
  } else {
    assertions.push({
      type: 'visible',
      target: '.success, .confirmation, .thank-you',
      description: 'Success message should appear',
    });
  }
}

function parseCheckoutFlow(
  desc: string,
  steps: TestStep[],
  assertions: TestAssertion[],
  baseUrl?: string
): void {
  if (baseUrl) {
    steps.push({
      action: 'navigate',
      target: `${baseUrl}/checkout`,
      description: 'Navigate to checkout',
    });
  }

  steps.push({
    action: 'type',
    target: 'input[name="card"], input[name="cardNumber"], #card-number',
    value: '4242424242424242',
    description: 'Enter card number',
  });

  steps.push({
    action: 'type',
    target: 'input[name="expiry"], input[name="exp"], #expiry',
    value: '12/25',
    description: 'Enter expiry date',
  });

  steps.push({
    action: 'type',
    target: 'input[name="cvv"], input[name="cvc"], #cvv',
    value: '123',
    description: 'Enter CVV',
  });

  steps.push({
    action: 'click',
    target: 'button[type="submit"], .pay-button, button:has-text("Pay"), button:has-text("Complete")',
    description: 'Complete purchase',
  });

  assertions.push({
    type: 'visible',
    target: '.success, .order-confirmation, .thank-you',
    description: 'Order confirmation should appear',
  });
}

function parseNavigationFlow(
  desc: string,
  steps: TestStep[],
  assertions: TestAssertion[],
  baseUrl?: string
): void {
  // Extract URL or page name from description
  const pageMatch = desc.match(/(?:navigate|go|visit)\s+(?:to\s+)?(?:the\s+)?["']?([^"'\s]+)["']?/i);
  const target = pageMatch ? pageMatch[1] : '/';

  steps.push({
    action: 'navigate',
    target: baseUrl ? `${baseUrl}${target.startsWith('/') ? target : '/' + target}` : target,
    description: `Navigate to ${target}`,
  });

  assertions.push({
    type: 'url',
    expected: target,
    description: `URL should contain ${target}`,
  });
}

function parseClickFlow(
  desc: string,
  steps: TestStep[],
  assertions: TestAssertion[]
): void {
  // Extract what to click
  const clickMatch = desc.match(/click\s+(?:on\s+)?(?:the\s+)?["']?([^"']+)["']?/i);
  const target = clickMatch ? clickMatch[1].trim() : 'button';

  // Convert natural language to selector
  const selector = naturalLanguageToSelector(target);

  steps.push({
    action: 'click',
    target: selector,
    description: `Click on ${target}`,
  });

  // Check for expected result
  if (desc.includes('should')) {
    const shouldMatch = desc.match(/should\s+(.+?)(?:\.|$)/i);
    if (shouldMatch) {
      const expectation = shouldMatch[1].trim();
      if (expectation.includes('visible') || expectation.includes('appear') || expectation.includes('show')) {
        const visibleTarget = extractTargetFromExpectation(expectation);
        assertions.push({
          type: 'visible',
          target: visibleTarget,
          description: `${visibleTarget} should be visible`,
        });
      }
    }
  }
}

function parseGenericFlow(
  desc: string,
  steps: TestStep[],
  assertions: TestAssertion[],
  baseUrl?: string
): void {
  // Try to extract any actions mentioned
  if (baseUrl) {
    steps.push({
      action: 'navigate',
      target: baseUrl,
      description: 'Navigate to page',
    });
  }

  // Look for "type X in Y" patterns
  const typeMatch = desc.match(/type\s+["']?([^"']+)["']?\s+(?:in|into)\s+(?:the\s+)?(.+?)(?:\s+and|\s+then|$)/i);
  if (typeMatch) {
    steps.push({
      action: 'type',
      target: naturalLanguageToSelector(typeMatch[2]),
      value: typeMatch[1],
      description: `Type "${typeMatch[1]}" into ${typeMatch[2]}`,
    });
  }

  // Look for "click X" patterns
  const clickMatch = desc.match(/click\s+(?:on\s+)?(?:the\s+)?["']?([^"']+?)["']?(?:\s+button)?(?:\s+and|\s+then|$)/i);
  if (clickMatch) {
    steps.push({
      action: 'click',
      target: naturalLanguageToSelector(clickMatch[1]),
      description: `Click ${clickMatch[1]}`,
    });
  }

  // Look for assertions
  if (desc.includes('should')) {
    const shouldMatch = desc.match(/should\s+(?:see|show|display|have)\s+(.+?)(?:\.|$)/i);
    if (shouldMatch) {
      assertions.push({
        type: 'visible',
        target: naturalLanguageToSelector(shouldMatch[1]),
        description: `Should see ${shouldMatch[1]}`,
      });
    }
  }

  // If we couldn't parse anything meaningful, add a generic wait
  if (steps.length === 0 || (steps.length === 1 && steps[0].action === 'navigate')) {
    steps.push({
      action: 'wait',
      target: 'body',
      description: 'Wait for page to load',
    });
  }
}

function naturalLanguageToSelector(text: string): string {
  const clean = text.toLowerCase().trim();

  // Common element mappings
  const mappings: Record<string, string> = {
    'login button': 'button:has-text("Login"), button:has-text("Sign In"), #login-btn',
    'submit button': 'button[type="submit"], input[type="submit"]',
    'search box': 'input[type="search"], input[name="q"], #search',
    'email field': 'input[type="email"], input[name="email"]',
    'password field': 'input[type="password"], input[name="password"]',
    'username field': 'input[name="username"], #username',
    'menu': 'nav, .menu, [role="navigation"]',
    'dropdown': 'select, [role="listbox"]',
    'checkbox': 'input[type="checkbox"]',
    'radio': 'input[type="radio"]',
  };

  for (const [key, selector] of Object.entries(mappings)) {
    if (clean.includes(key)) {
      return selector;
    }
  }

  // Try to construct a selector from the text
  if (clean.includes('button')) {
    const buttonText = clean.replace('button', '').trim();
    return buttonText ? `button:has-text("${buttonText}")` : 'button';
  }

  if (clean.includes('link')) {
    const linkText = clean.replace('link', '').trim();
    return linkText ? `a:has-text("${linkText}")` : 'a';
  }

  if (clean.includes('input') || clean.includes('field')) {
    return 'input';
  }

  // Default: try text-based selector
  return `text="${clean}", [aria-label="${clean}"], .${clean.replace(/\s+/g, '-')}`;
}

function extractValue(desc: string, field: string): string | undefined {
  const pattern = new RegExp(`${field}\\s*[:=]?\\s*["']?([^"'\\s]+)["']?`, 'i');
  const match = desc.match(pattern);
  return match ? match[1] : undefined;
}

function extractQuotedValue(desc: string): string | undefined {
  const match = desc.match(/["']([^"']+)["']/);
  return match ? match[1] : undefined;
}

function extractTargetFromExpectation(expectation: string): string {
  // Remove common words and convert to selector
  const cleaned = expectation
    .replace(/should|be|become|appear|visible|show|displayed/gi, '')
    .trim();

  return naturalLanguageToSelector(cleaned);
}

function calculateConfidence(steps: TestStep[], assertions: TestAssertion[], desc: string): number {
  let confidence = 0.5; // Base confidence

  // More steps = better understanding
  if (steps.length >= 3) confidence += 0.15;
  if (steps.length >= 5) confidence += 0.1;

  // Having assertions is good
  if (assertions.length > 0) confidence += 0.1;
  if (assertions.length >= 2) confidence += 0.05;

  // Known patterns boost confidence
  const knownPatterns = ['login', 'signup', 'search', 'checkout', 'form', 'click'];
  if (knownPatterns.some(p => desc.includes(p))) {
    confidence += 0.1;
  }

  return Math.min(confidence, 0.95);
}

/**
 * Format generated test as executable code
 */
export function formatTestAsCode(test: GeneratedTest): string {
  let code = `// Test: ${test.name}\n`;
  code += `// ${test.description}\n`;
  code += `// Confidence: ${(test.metadata.confidence * 100).toFixed(0)}%\n\n`;

  code += `async function ${test.name.replace(/-/g, '_')}(page) {\n`;

  for (const step of test.steps) {
    code += `  // ${step.description}\n`;
    switch (step.action) {
      case 'navigate':
        code += `  await page.goto('${step.target}');\n`;
        break;
      case 'click':
        code += `  await page.click('${step.target}');\n`;
        break;
      case 'type':
        code += `  await page.fill('${step.target}', '${step.value}');\n`;
        break;
      case 'wait':
        code += `  await page.waitForSelector('${step.target}');\n`;
        break;
      case 'scroll':
        code += `  await page.locator('${step.target}').scrollIntoViewIfNeeded();\n`;
        break;
      case 'hover':
        code += `  await page.hover('${step.target}');\n`;
        break;
      case 'select':
        code += `  await page.selectOption('${step.target}', '${step.value}');\n`;
        break;
      case 'press':
        code += `  await page.press('${step.target}', '${step.value}');\n`;
        break;
    }
    code += '\n';
  }

  if (test.assertions.length > 0) {
    code += '  // Assertions\n';
    for (const assertion of test.assertions) {
      code += `  // ${assertion.description}\n`;
      switch (assertion.type) {
        case 'visible':
          code += `  await expect(page.locator('${assertion.target}')).toBeVisible();\n`;
          break;
        case 'text':
          code += `  await expect(page.locator('${assertion.target}')).toContainText(/${assertion.expected}/i);\n`;
          break;
        case 'url':
          code += `  await expect(page).toHaveURL(/${assertion.expected}/);\n`;
          break;
        case 'title':
          code += `  await expect(page).toHaveTitle(/${assertion.expected}/);\n`;
          break;
        case 'count':
          code += `  await expect(page.locator('${assertion.target}')).toHaveCount({ min: 1 });\n`;
          break;
        case 'value':
          code += `  await expect(page.locator('${assertion.target}')).toHaveValue('${assertion.expected}');\n`;
          break;
        case 'attribute':
          code += `  await expect(page.locator('${assertion.target}')).toHaveAttribute('${assertion.expected}');\n`;
          break;
      }
    }
  }

  code += '}\n';

  return code;
}

/**
 * Format generated test as MCP tool calls
 */
export function formatTestAsMCPCalls(test: GeneratedTest): string {
  let output = `# Test: ${test.name}\n`;
  output += `# ${test.description}\n`;
  output += `# Confidence: ${(test.metadata.confidence * 100).toFixed(0)}%\n\n`;

  output += `## Steps:\n\n`;

  for (let i = 0; i < test.steps.length; i++) {
    const step = test.steps[i];
    output += `${i + 1}. ${step.description}\n`;
    output += `   Tool: browser_${step.action}\n`;

    switch (step.action) {
      case 'navigate':
        output += `   Args: { url: "${step.target}" }\n`;
        break;
      case 'click':
        output += `   Args: { selector: "${step.target}" }\n`;
        break;
      case 'type':
        output += `   Args: { selector: "${step.target}", text: "${step.value}" }\n`;
        break;
      case 'wait':
        output += `   Args: { selector: "${step.target}" }\n`;
        break;
      default:
        output += `   Args: { selector: "${step.target}"${step.value ? `, value: "${step.value}"` : ''} }\n`;
    }
    output += '\n';
  }

  if (test.assertions.length > 0) {
    output += `## Assertions:\n\n`;
    for (const assertion of test.assertions) {
      output += `- ${assertion.description}\n`;
      output += `  Type: ${assertion.type}\n`;
      if (assertion.target) output += `  Target: ${assertion.target}\n`;
      if (assertion.expected) output += `  Expected: ${assertion.expected}\n`;
      output += '\n';
    }
  }

  return output;
}
