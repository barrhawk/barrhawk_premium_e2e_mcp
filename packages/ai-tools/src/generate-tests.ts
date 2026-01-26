/**
 * Generate Tests - Auto-generate tests from page analysis
 *
 * Analyzes page DOM structure and generates relevant tests.
 */

import type { GeneratedTest, TestStep, TestAssertion } from './test-from-description.js';

export interface GenerateTestsOptions {
  page: unknown;            // Playwright page
  url?: string;
  focus?: ('forms' | 'links' | 'buttons' | 'navigation' | 'inputs' | 'all')[];
  maxTests?: number;
}

export interface GenerateFromFlowOptions {
  flow: string;             // Flow description
  baseUrl?: string;
  page?: unknown;           // Optional: use existing page for context
}

export interface PageAnalysis {
  url: string;
  title: string;
  forms: FormInfo[];
  links: LinkInfo[];
  buttons: ButtonInfo[];
  inputs: InputInfo[];
  navigation: NavInfo[];
  headings: string[];
}

interface FormInfo {
  id?: string;
  action?: string;
  method?: string;
  inputs: InputInfo[];
  submitButton?: string;
}

interface LinkInfo {
  text: string;
  href: string;
  isExternal: boolean;
}

interface ButtonInfo {
  text: string;
  selector: string;
  type?: string;
}

interface InputInfo {
  type: string;
  name?: string;
  id?: string;
  placeholder?: string;
  label?: string;
  required: boolean;
  selector: string;
}

interface NavInfo {
  text: string;
  href: string;
}

/**
 * Analyze a page and generate tests
 */
export async function generateTestsFromUrl(options: GenerateTestsOptions): Promise<GeneratedTest[]> {
  const { page, focus = ['all'], maxTests = 10 } = options;

  // Analyze the page
  const analysis = await analyzePage(page);
  const tests: GeneratedTest[] = [];

  const shouldInclude = (type: string) =>
    focus.includes('all') || focus.includes(type as any);

  // Generate form tests
  if (shouldInclude('forms') && analysis.forms.length > 0) {
    for (const form of analysis.forms.slice(0, 3)) {
      tests.push(generateFormTest(form, analysis.url));
      if (form.inputs.some(i => i.required)) {
        tests.push(generateFormValidationTest(form, analysis.url));
      }
    }
  }

  // Generate button interaction tests
  if (shouldInclude('buttons') && analysis.buttons.length > 0) {
    for (const button of analysis.buttons.slice(0, 3)) {
      tests.push(generateButtonTest(button, analysis.url));
    }
  }

  // Generate navigation tests
  if (shouldInclude('navigation') && analysis.navigation.length > 0) {
    tests.push(generateNavigationTest(analysis.navigation, analysis.url));
  }

  // Generate link tests
  if (shouldInclude('links') && analysis.links.length > 0) {
    const internalLinks = analysis.links.filter(l => !l.isExternal).slice(0, 3);
    for (const link of internalLinks) {
      tests.push(generateLinkTest(link, analysis.url));
    }
  }

  // Generate input tests
  if (shouldInclude('inputs') && analysis.inputs.length > 0) {
    for (const input of analysis.inputs.filter(i => i.type !== 'hidden').slice(0, 3)) {
      tests.push(generateInputTest(input, analysis.url));
    }
  }

  // Limit total tests
  return tests.slice(0, maxTests);
}

/**
 * Generate tests from a flow description
 */
export async function generateTestsFromFlow(options: GenerateFromFlowOptions): Promise<GeneratedTest[]> {
  const { flow, baseUrl, page } = options;
  const flowLower = flow.toLowerCase();
  const tests: GeneratedTest[] = [];

  // Parse common flows
  if (flowLower.includes('login') || flowLower.includes('authentication')) {
    tests.push(generateLoginFlowTests(baseUrl));
    tests.push(generateLoginErrorTests(baseUrl));
  }

  if (flowLower.includes('signup') || flowLower.includes('registration')) {
    tests.push(generateSignupFlowTests(baseUrl));
    tests.push(generateSignupValidationTests(baseUrl));
  }

  if (flowLower.includes('checkout') || flowLower.includes('purchase')) {
    tests.push(generateCheckoutFlowTests(baseUrl));
  }

  if (flowLower.includes('search')) {
    tests.push(generateSearchFlowTests(baseUrl));
    tests.push(generateSearchEmptyTests(baseUrl));
  }

  if (flowLower.includes('profile') || flowLower.includes('settings')) {
    tests.push(generateProfileFlowTests(baseUrl));
  }

  if (flowLower.includes('crud') || flowLower.includes('create') || flowLower.includes('delete')) {
    tests.push(...generateCRUDFlowTests(baseUrl));
  }

  // If page is provided, enhance tests with actual page analysis
  if (page && tests.length === 0) {
    const pageTests = await generateTestsFromUrl({ page, maxTests: 5 });
    tests.push(...pageTests);
  }

  return tests;
}

async function analyzePage(page: unknown): Promise<PageAnalysis> {
  return await (page as any).evaluate(() => {
    const analysis: PageAnalysis = {
      url: window.location.href,
      title: document.title,
      forms: [],
      links: [],
      buttons: [],
      inputs: [],
      navigation: [],
      headings: [],
    };

    // Analyze forms
    document.querySelectorAll('form').forEach((form, idx) => {
      const inputs: InputInfo[] = [];
      form.querySelectorAll('input, select, textarea').forEach((input) => {
        const el = input as HTMLInputElement;
        const label = form.querySelector(`label[for="${el.id}"]`)?.textContent ||
          input.closest('label')?.textContent || '';

        inputs.push({
          type: el.type || 'text',
          name: el.name || undefined,
          id: el.id || undefined,
          placeholder: el.placeholder || undefined,
          label: label.trim() || undefined,
          required: el.required,
          selector: el.id ? `#${el.id}` : el.name ? `[name="${el.name}"]` : `form:nth-of-type(${idx + 1}) input`,
        });
      });

      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');

      analysis.forms.push({
        id: form.id || undefined,
        action: form.action || undefined,
        method: form.method || 'get',
        inputs,
        submitButton: submitBtn ?
          (submitBtn.id ? `#${submitBtn.id}` : 'button[type="submit"]') :
          undefined,
      });
    });

    // Analyze links
    document.querySelectorAll('a[href]').forEach((link) => {
      const a = link as HTMLAnchorElement;
      const href = a.getAttribute('href') || '';
      const isExternal = href.startsWith('http') && !href.includes(window.location.hostname);

      analysis.links.push({
        text: a.textContent?.trim() || '',
        href,
        isExternal,
      });
    });

    // Analyze buttons
    document.querySelectorAll('button, [role="button"]').forEach((btn, idx) => {
      const button = btn as HTMLButtonElement;
      analysis.buttons.push({
        text: button.textContent?.trim() || '',
        selector: button.id ? `#${button.id}` :
          button.className ? `.${button.className.split(' ')[0]}` :
            `button:nth-of-type(${idx + 1})`,
        type: button.type || undefined,
      });
    });

    // Analyze standalone inputs
    document.querySelectorAll('input:not(form input), select:not(form select)').forEach((input) => {
      const el = input as HTMLInputElement;
      analysis.inputs.push({
        type: el.type || 'text',
        name: el.name || undefined,
        id: el.id || undefined,
        placeholder: el.placeholder || undefined,
        required: el.required,
        selector: el.id ? `#${el.id}` : el.name ? `[name="${el.name}"]` : 'input',
      });
    });

    // Analyze navigation
    document.querySelectorAll('nav a, header a, .nav a, .menu a').forEach((link) => {
      const a = link as HTMLAnchorElement;
      analysis.navigation.push({
        text: a.textContent?.trim() || '',
        href: a.getAttribute('href') || '',
      });
    });

    // Get headings for context
    document.querySelectorAll('h1, h2, h3').forEach((h) => {
      const text = h.textContent?.trim();
      if (text) analysis.headings.push(text);
    });

    return analysis;
  });
}

function generateFormTest(form: FormInfo, url: string): GeneratedTest {
  const steps: TestStep[] = [];
  const assertions: TestAssertion[] = [];

  steps.push({
    action: 'navigate',
    target: url,
    description: 'Navigate to page',
  });

  // Fill each input
  for (const input of form.inputs) {
    if (input.type === 'hidden' || input.type === 'submit') continue;

    const value = getTestValueForInput(input);
    steps.push({
      action: 'type',
      target: input.selector,
      value,
      description: `Fill ${input.label || input.name || input.type} field`,
    });
  }

  // Submit form
  if (form.submitButton) {
    steps.push({
      action: 'click',
      target: form.submitButton,
      description: 'Submit form',
    });
  }

  assertions.push({
    type: 'visible',
    target: '.success, .confirmation, [role="alert"]',
    description: 'Should see confirmation or response',
  });

  return {
    name: `form_submission_${form.id || 'test'}`,
    description: `Test form submission for ${form.id || 'form'}`,
    steps,
    assertions,
    metadata: {
      confidence: 0.8,
      generatedAt: new Date().toISOString(),
      inputDescription: 'Auto-generated from page analysis',
    },
  };
}

function generateFormValidationTest(form: FormInfo, url: string): GeneratedTest {
  const steps: TestStep[] = [];
  const assertions: TestAssertion[] = [];

  steps.push({
    action: 'navigate',
    target: url,
    description: 'Navigate to page',
  });

  // Submit without filling required fields
  if (form.submitButton) {
    steps.push({
      action: 'click',
      target: form.submitButton,
      description: 'Submit form without filling required fields',
    });
  }

  assertions.push({
    type: 'visible',
    target: '.error, .validation-error, :invalid, [aria-invalid="true"]',
    description: 'Should show validation errors',
  });

  return {
    name: `form_validation_${form.id || 'test'}`,
    description: `Test form validation for ${form.id || 'form'}`,
    steps,
    assertions,
    metadata: {
      confidence: 0.75,
      generatedAt: new Date().toISOString(),
      inputDescription: 'Auto-generated validation test',
    },
  };
}

function generateButtonTest(button: ButtonInfo, url: string): GeneratedTest {
  return {
    name: `button_click_${button.text.toLowerCase().replace(/\s+/g, '_').slice(0, 20)}`,
    description: `Test clicking "${button.text}" button`,
    steps: [
      { action: 'navigate', target: url, description: 'Navigate to page' },
      { action: 'click', target: button.selector, description: `Click "${button.text}" button` },
      { action: 'wait', target: 'body', description: 'Wait for response' },
    ],
    assertions: [{
      type: 'visible',
      target: 'body',
      description: 'Page should respond to button click',
    }],
    metadata: {
      confidence: 0.7,
      generatedAt: new Date().toISOString(),
      inputDescription: 'Auto-generated button test',
    },
  };
}

function generateNavigationTest(nav: NavInfo[], url: string): GeneratedTest {
  const steps: TestStep[] = [
    { action: 'navigate', target: url, description: 'Navigate to page' },
  ];

  for (const item of nav.slice(0, 3)) {
    steps.push({
      action: 'click',
      target: `a:has-text("${item.text}")`,
      description: `Click "${item.text}" link`,
    });
    steps.push({
      action: 'wait',
      target: 'body',
      description: 'Wait for navigation',
    });
  }

  return {
    name: 'navigation_flow_test',
    description: 'Test main navigation links',
    steps,
    assertions: [{
      type: 'visible',
      target: 'nav, .nav, header',
      description: 'Navigation should be present',
    }],
    metadata: {
      confidence: 0.75,
      generatedAt: new Date().toISOString(),
      inputDescription: 'Auto-generated navigation test',
    },
  };
}

function generateLinkTest(link: LinkInfo, url: string): GeneratedTest {
  return {
    name: `link_${link.text.toLowerCase().replace(/\s+/g, '_').slice(0, 20)}`,
    description: `Test "${link.text}" link navigates correctly`,
    steps: [
      { action: 'navigate', target: url, description: 'Navigate to page' },
      { action: 'click', target: `a:has-text("${link.text}")`, description: `Click "${link.text}" link` },
    ],
    assertions: [{
      type: 'url',
      expected: link.href,
      description: `Should navigate to ${link.href}`,
    }],
    metadata: {
      confidence: 0.8,
      generatedAt: new Date().toISOString(),
      inputDescription: 'Auto-generated link test',
    },
  };
}

function generateInputTest(input: InputInfo, url: string): GeneratedTest {
  const value = getTestValueForInput(input);

  return {
    name: `input_${input.name || input.id || input.type}_test`,
    description: `Test ${input.label || input.name || input.type} input`,
    steps: [
      { action: 'navigate', target: url, description: 'Navigate to page' },
      { action: 'type', target: input.selector, value, description: `Enter value in ${input.label || input.name || 'input'}` },
    ],
    assertions: [{
      type: 'value',
      target: input.selector,
      expected: value,
      description: 'Input should contain entered value',
    }],
    metadata: {
      confidence: 0.85,
      generatedAt: new Date().toISOString(),
      inputDescription: 'Auto-generated input test',
    },
  };
}

function getTestValueForInput(input: InputInfo): string {
  switch (input.type) {
    case 'email':
      return 'test@example.com';
    case 'password':
      return 'TestPass123!';
    case 'tel':
      return '+1234567890';
    case 'url':
      return 'https://example.com';
    case 'number':
      return '42';
    case 'date':
      return '2024-01-15';
    case 'checkbox':
    case 'radio':
      return 'checked';
    default:
      return input.placeholder || 'Test Value';
  }
}

// Flow-specific test generators

function generateLoginFlowTests(baseUrl?: string): GeneratedTest {
  return {
    name: 'login_success_flow',
    description: 'Test successful login flow',
    steps: [
      { action: 'navigate', target: `${baseUrl || ''}/login`, description: 'Go to login page' },
      { action: 'type', target: 'input[type="email"], input[name="email"]', value: 'user@example.com', description: 'Enter email' },
      { action: 'type', target: 'input[type="password"]', value: 'password123', description: 'Enter password' },
      { action: 'click', target: 'button[type="submit"]', description: 'Click login' },
      { action: 'wait', target: '.dashboard, .home, [data-testid="user"]', description: 'Wait for login' },
    ],
    assertions: [
      { type: 'url', expected: 'dashboard|home|account', description: 'Should redirect after login' },
    ],
    metadata: { confidence: 0.85, generatedAt: new Date().toISOString(), inputDescription: 'Login flow' },
  };
}

function generateLoginErrorTests(baseUrl?: string): GeneratedTest {
  return {
    name: 'login_error_flow',
    description: 'Test login with invalid credentials',
    steps: [
      { action: 'navigate', target: `${baseUrl || ''}/login`, description: 'Go to login page' },
      { action: 'type', target: 'input[type="email"], input[name="email"]', value: 'user@example.com', description: 'Enter email' },
      { action: 'type', target: 'input[type="password"]', value: 'wrongpassword', description: 'Enter wrong password' },
      { action: 'click', target: 'button[type="submit"]', description: 'Click login' },
    ],
    assertions: [
      { type: 'visible', target: '.error, [role="alert"]', description: 'Should show error message' },
    ],
    metadata: { confidence: 0.85, generatedAt: new Date().toISOString(), inputDescription: 'Login error flow' },
  };
}

function generateSignupFlowTests(baseUrl?: string): GeneratedTest {
  return {
    name: 'signup_success_flow',
    description: 'Test successful signup flow',
    steps: [
      { action: 'navigate', target: `${baseUrl || ''}/signup`, description: 'Go to signup page' },
      { action: 'type', target: 'input[name="name"], input[name="fullName"]', value: 'Test User', description: 'Enter name' },
      { action: 'type', target: 'input[type="email"]', value: 'newuser@example.com', description: 'Enter email' },
      { action: 'type', target: 'input[type="password"]', value: 'SecurePass123!', description: 'Enter password' },
      { action: 'click', target: 'button[type="submit"]', description: 'Click signup' },
    ],
    assertions: [
      { type: 'visible', target: '.success, .welcome, .confirmation', description: 'Should show success' },
    ],
    metadata: { confidence: 0.8, generatedAt: new Date().toISOString(), inputDescription: 'Signup flow' },
  };
}

function generateSignupValidationTests(baseUrl?: string): GeneratedTest {
  return {
    name: 'signup_validation_flow',
    description: 'Test signup validation',
    steps: [
      { action: 'navigate', target: `${baseUrl || ''}/signup`, description: 'Go to signup page' },
      { action: 'type', target: 'input[type="email"]', value: 'invalidemail', description: 'Enter invalid email' },
      { action: 'click', target: 'button[type="submit"]', description: 'Click signup' },
    ],
    assertions: [
      { type: 'visible', target: '.error, :invalid', description: 'Should show validation error' },
    ],
    metadata: { confidence: 0.8, generatedAt: new Date().toISOString(), inputDescription: 'Signup validation' },
  };
}

function generateCheckoutFlowTests(baseUrl?: string): GeneratedTest {
  return {
    name: 'checkout_flow',
    description: 'Test checkout process',
    steps: [
      { action: 'navigate', target: `${baseUrl || ''}/checkout`, description: 'Go to checkout' },
      { action: 'type', target: 'input[name="card"], #card-number', value: '4242424242424242', description: 'Enter card' },
      { action: 'type', target: 'input[name="expiry"], #expiry', value: '12/25', description: 'Enter expiry' },
      { action: 'type', target: 'input[name="cvv"], #cvv', value: '123', description: 'Enter CVV' },
      { action: 'click', target: 'button[type="submit"]', description: 'Complete purchase' },
    ],
    assertions: [
      { type: 'visible', target: '.success, .confirmation', description: 'Should show confirmation' },
    ],
    metadata: { confidence: 0.75, generatedAt: new Date().toISOString(), inputDescription: 'Checkout flow' },
  };
}

function generateSearchFlowTests(baseUrl?: string): GeneratedTest {
  return {
    name: 'search_flow',
    description: 'Test search functionality',
    steps: [
      { action: 'navigate', target: baseUrl || '/', description: 'Go to page' },
      { action: 'type', target: 'input[type="search"], input[name="q"]', value: 'test query', description: 'Enter search' },
      { action: 'click', target: 'button[type="submit"], .search-btn', description: 'Click search' },
    ],
    assertions: [
      { type: 'visible', target: '.results, .search-results', description: 'Should show results' },
    ],
    metadata: { confidence: 0.8, generatedAt: new Date().toISOString(), inputDescription: 'Search flow' },
  };
}

function generateSearchEmptyTests(baseUrl?: string): GeneratedTest {
  return {
    name: 'search_no_results',
    description: 'Test search with no results',
    steps: [
      { action: 'navigate', target: baseUrl || '/', description: 'Go to page' },
      { action: 'type', target: 'input[type="search"], input[name="q"]', value: 'xyznonexistent123', description: 'Enter nonsense query' },
      { action: 'click', target: 'button[type="submit"], .search-btn', description: 'Click search' },
    ],
    assertions: [
      { type: 'visible', target: '.no-results, .empty', description: 'Should show no results message' },
    ],
    metadata: { confidence: 0.75, generatedAt: new Date().toISOString(), inputDescription: 'Search no results' },
  };
}

function generateProfileFlowTests(baseUrl?: string): GeneratedTest {
  return {
    name: 'profile_update_flow',
    description: 'Test profile update',
    steps: [
      { action: 'navigate', target: `${baseUrl || ''}/profile`, description: 'Go to profile' },
      { action: 'type', target: 'input[name="name"], #name', value: 'Updated Name', description: 'Update name' },
      { action: 'click', target: 'button[type="submit"]', description: 'Save changes' },
    ],
    assertions: [
      { type: 'visible', target: '.success, .saved', description: 'Should show saved confirmation' },
    ],
    metadata: { confidence: 0.75, generatedAt: new Date().toISOString(), inputDescription: 'Profile update' },
  };
}

function generateCRUDFlowTests(baseUrl?: string): GeneratedTest[] {
  return [
    {
      name: 'crud_create',
      description: 'Test create operation',
      steps: [
        { action: 'navigate', target: `${baseUrl || ''}/items/new`, description: 'Go to create page' },
        { action: 'type', target: 'input[name="name"], #name', value: 'New Item', description: 'Enter name' },
        { action: 'click', target: 'button[type="submit"]', description: 'Create' },
      ],
      assertions: [{ type: 'visible', target: '.success', description: 'Should confirm creation' }],
      metadata: { confidence: 0.7, generatedAt: new Date().toISOString(), inputDescription: 'CRUD create' },
    },
    {
      name: 'crud_delete',
      description: 'Test delete operation',
      steps: [
        { action: 'navigate', target: `${baseUrl || ''}/items`, description: 'Go to items list' },
        { action: 'click', target: '.delete-btn, button:has-text("Delete")', description: 'Click delete' },
        { action: 'click', target: '.confirm, button:has-text("Confirm")', description: 'Confirm delete' },
      ],
      assertions: [{ type: 'visible', target: '.success, .deleted', description: 'Should confirm deletion' }],
      metadata: { confidence: 0.7, generatedAt: new Date().toISOString(), inputDescription: 'CRUD delete' },
    },
  ];
}

/**
 * Format multiple tests as a test suite
 */
export function formatTestSuite(tests: GeneratedTest[]): string {
  let output = `# Generated Test Suite\n`;
  output += `Generated: ${new Date().toISOString()}\n`;
  output += `Total Tests: ${tests.length}\n\n`;

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    output += `## ${i + 1}. ${test.name}\n`;
    output += `${test.description}\n`;
    output += `Confidence: ${(test.metadata.confidence * 100).toFixed(0)}%\n\n`;

    output += `### Steps:\n`;
    for (const step of test.steps) {
      output += `- ${step.action}: ${step.description}\n`;
    }

    output += `\n### Assertions:\n`;
    for (const assertion of test.assertions) {
      output += `- ${assertion.description}\n`;
    }

    output += '\n---\n\n';
  }

  return output;
}
