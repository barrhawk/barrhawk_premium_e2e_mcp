/**
 * Accessibility Fix Tool
 *
 * Analyzes accessibility issues and provides specific code fixes.
 * Generates corrected HTML/CSS/ARIA for identified problems.
 */

import type { A11yIssue } from './types.js';

export interface AccessibilityFixOptions {
  issue: A11yIssue;
  elementHtml?: string;
  context?: string;
  framework?: 'html' | 'react' | 'vue' | 'angular' | 'svelte';
}

export interface AccessibilityFix {
  original: string;
  fixed: string;
  explanation: string;
  wcagReference: string;
  additionalChanges?: string[];
  cssChanges?: string[];
  ariaChanges?: string[];
}

export interface AccessibilityFixResult {
  issue: A11yIssue;
  fix: AccessibilityFix;
  alternativeFixes?: AccessibilityFix[];
  testingTips: string[];
  resources: string[];
}

/**
 * Generate fix for an accessibility issue
 */
export function generateAccessibilityFix(options: AccessibilityFixOptions): AccessibilityFixResult {
  const { issue, elementHtml, framework = 'html' } = options;

  // Generate primary fix
  const fix = generateFix(issue, elementHtml, framework);

  // Generate alternative fixes if applicable
  const alternativeFixes = generateAlternatives(issue, elementHtml, framework);

  // Generate testing tips
  const testingTips = generateTestingTips(issue);

  // Get relevant resources
  const resources = getResources(issue);

  return {
    issue,
    fix,
    alternativeFixes: alternativeFixes.length > 0 ? alternativeFixes : undefined,
    testingTips,
    resources,
  };
}

function generateFix(issue: A11yIssue, html?: string, framework?: string): AccessibilityFix {
  const ruleId = issue.rule;

  // Use provided HTML or extract from issue
  const originalHtml = html || issue.html || '<element>';

  switch (ruleId) {
    // Image accessibility
    case 'image-alt':
      return fixImageAlt(originalHtml, framework);

    // Form labels
    case 'label':
    case 'form-field-label':
      return fixFormLabel(originalHtml, issue, framework);

    // Button accessibility
    case 'button-name':
      return fixButtonName(originalHtml, framework);

    // Link accessibility
    case 'link-name':
      return fixLinkName(originalHtml, framework);

    // Color contrast
    case 'color-contrast':
    case 'color-contrast-enhanced':
      return fixColorContrast(originalHtml, issue);

    // Heading order
    case 'heading-order':
      return fixHeadingOrder(originalHtml, issue);

    // Empty heading
    case 'empty-heading':
      return fixEmptyHeading(originalHtml, framework);

    // Focus visible
    case 'focus-visible':
      return fixFocusVisible(originalHtml);

    // Keyboard accessibility
    case 'keyboard':
    case 'keyboard-focusable':
      return fixKeyboardAccess(originalHtml, issue, framework);

    // ARIA roles
    case 'aria-roles':
    case 'aria-valid-attr':
      return fixAriaRole(originalHtml, issue, framework);

    // Document language
    case 'html-lang':
      return fixHtmlLang(originalHtml);

    // Page title
    case 'document-title':
      return fixDocumentTitle();

    // Skip link
    case 'bypass':
    case 'skip-link':
      return fixSkipLink(framework);

    // Table headers
    case 'td-headers-attr':
    case 'th-has-data-cells':
      return fixTableHeaders(originalHtml, framework);

    // Duplicate IDs
    case 'duplicate-id':
    case 'duplicate-id-active':
      return fixDuplicateId(originalHtml, issue);

    // Meta viewport
    case 'meta-viewport':
      return fixMetaViewport(originalHtml);

    // Autocomplete
    case 'autocomplete-valid':
      return fixAutocomplete(originalHtml, issue);

    // Default handler
    default:
      return generateGenericFix(issue, originalHtml, framework);
  }
}

function fixImageAlt(html: string, framework?: string): AccessibilityFix {
  let fixed: string;

  if (framework === 'react') {
    fixed = html.replace(/<img([^>]*)>/i, '<img$1 alt="Descriptive text about the image" />');
    if (!fixed.includes(' alt=')) {
      fixed = html.replace(/<img/i, '<img alt="Descriptive text"');
    }
  } else {
    fixed = html.replace(/<img([^>]*)>/i, '<img$1 alt="Descriptive text about the image">');
    if (!fixed.includes(' alt=')) {
      fixed = html.replace(/<img/i, '<img alt="Descriptive text"');
    }
  }

  return {
    original: html,
    fixed,
    explanation: 'Add an alt attribute that describes the image content. For decorative images, use alt=""',
    wcagReference: 'WCAG 1.1.1 Non-text Content (Level A)',
    additionalChanges: [
      'If image is decorative: alt=""',
      'If image is a link: describe the link destination',
      'If image contains text: include that text in alt',
    ],
  };
}

function fixFormLabel(html: string, issue: A11yIssue, framework?: string): AccessibilityFix {
  const inputMatch = html.match(/id=["']([^"']+)["']/);
  const inputId = inputMatch ? inputMatch[1] : 'input-' + Math.random().toString(36).substr(2, 9);

  let fixed: string;

  if (framework === 'react') {
    fixed = `<label htmlFor="${inputId}">Field Label</label>\n${html.includes('id=') ? html : html.replace(/<input/i, `<input id="${inputId}"`)}`;
  } else if (framework === 'vue') {
    fixed = `<label :for="'${inputId}'">Field Label</label>\n${html.includes('id=') ? html : html.replace(/<input/i, `<input id="${inputId}"`)}`;
  } else {
    fixed = `<label for="${inputId}">Field Label</label>\n${html.includes('id=') ? html : html.replace(/<input/i, `<input id="${inputId}"`)}`;
  }

  return {
    original: html,
    fixed,
    explanation: 'Associate a label with the input using for/id attributes, or wrap the input in a label element',
    wcagReference: 'WCAG 1.3.1 Info and Relationships (Level A), 3.3.2 Labels or Instructions (Level A)',
    additionalChanges: [
      'Wrap input in label: <label>Field Label <input></label>',
      'Use aria-label: <input aria-label="Field Label">',
      'Use aria-labelledby: <input aria-labelledby="label-id">',
    ],
    ariaChanges: ['aria-label="Field Label"', 'aria-describedby="help-text-id" for additional context'],
  };
}

function fixButtonName(html: string, framework?: string): AccessibilityFix {
  let fixed: string;

  if (html.includes('<button') && html.includes('</button>')) {
    // Button with content
    fixed = html.replace(/<button([^>]*)>\s*<\/button>/i, '<button$1>Click me</button>');
  } else {
    // Icon button or empty
    fixed = html.replace(/<button([^>]*)>/i, '<button$1 aria-label="Button description">');
  }

  return {
    original: html,
    fixed,
    explanation: 'Buttons must have accessible names from content, aria-label, or aria-labelledby',
    wcagReference: 'WCAG 4.1.2 Name, Role, Value (Level A)',
    additionalChanges: [
      'Add visible text content to the button',
      'For icon buttons: use aria-label',
      'Ensure icon has aria-hidden="true" if decorative',
    ],
    ariaChanges: ['aria-label="Action description"', 'aria-describedby="extended-description-id"'],
  };
}

function fixLinkName(html: string, framework?: string): AccessibilityFix {
  let fixed: string;

  if (html.match(/<a[^>]*>\s*<\/a>/i)) {
    fixed = html.replace(/<a([^>]*)>\s*<\/a>/i, '<a$1>Link text</a>');
  } else {
    fixed = html.replace(/<a([^>]*)>/i, '<a$1 aria-label="Link description">');
  }

  return {
    original: html,
    fixed,
    explanation: 'Links must have accessible names that describe their destination or purpose',
    wcagReference: 'WCAG 2.4.4 Link Purpose (In Context) (Level A)',
    additionalChanges: [
      'Add descriptive text inside the link',
      'Avoid "click here" or "read more" alone',
      'For image links: ensure image has alt text',
    ],
    ariaChanges: ['aria-label="Go to About page"', 'aria-describedby for additional context'],
  };
}

function fixColorContrast(html: string, issue: A11yIssue): AccessibilityFix {
  // Extract contrast info from issue if available
  const contrastInfo = issue.description?.match(/(\d+\.?\d*):1/);
  const currentRatio = contrastInfo ? contrastInfo[1] : 'unknown';

  return {
    original: html,
    fixed: html,
    explanation: `Color contrast ratio is ${currentRatio}:1. For normal text, minimum is 4.5:1 (AA) or 7:1 (AAA). For large text, minimum is 3:1 (AA) or 4.5:1 (AAA).`,
    wcagReference: 'WCAG 1.4.3 Contrast (Minimum) (Level AA)',
    cssChanges: [
      'Increase text color darkness: color: #333333;',
      'Or lighten background: background-color: #ffffff;',
      'Use a contrast checker tool to verify ratio',
    ],
    additionalChanges: [
      'Consider using CSS custom properties for consistent colors',
      'Test with browser developer tools color contrast checker',
    ],
  };
}

function fixHeadingOrder(html: string, issue: A11yIssue): AccessibilityFix {
  // Try to extract heading level from issue
  const headingMatch = html.match(/<h(\d)/i);
  const currentLevel = headingMatch ? parseInt(headingMatch[1]) : 3;
  const suggestedLevel = Math.max(1, currentLevel - 1);

  const fixed = html.replace(/<h\d/i, `<h${suggestedLevel}`).replace(/<\/h\d>/i, `</h${suggestedLevel}>`);

  return {
    original: html,
    fixed,
    explanation: 'Headings should follow a logical order without skipping levels (h1 → h2 → h3)',
    wcagReference: 'WCAG 1.3.1 Info and Relationships (Level A)',
    additionalChanges: [
      'Ensure page has one h1 for the main title',
      'Use headings to create document outline',
      'Do not use headings just for visual styling',
    ],
  };
}

function fixEmptyHeading(html: string, framework?: string): AccessibilityFix {
  const fixed = html.replace(/(<h\d[^>]*>)\s*(<\/h\d>)/i, '$1Heading Text$2');

  return {
    original: html,
    fixed,
    explanation: 'Headings must have text content to be accessible to screen readers',
    wcagReference: 'WCAG 1.3.1 Info and Relationships (Level A)',
    additionalChanges: [
      'Add meaningful text content',
      'If heading should be hidden, consider if heading is needed at all',
      'Use CSS to visually hide if needed: .sr-only class',
    ],
  };
}

function fixFocusVisible(html: string): AccessibilityFix {
  return {
    original: html,
    fixed: html,
    explanation: 'Keyboard focus must be visible on interactive elements',
    wcagReference: 'WCAG 2.4.7 Focus Visible (Level AA)',
    cssChanges: [
      ':focus { outline: 2px solid #0066cc; outline-offset: 2px; }',
      ':focus-visible { outline: 2px solid #0066cc; }',
      'Never use outline: none without providing alternative focus styles',
    ],
    additionalChanges: [
      'Test keyboard navigation with Tab key',
      'Focus indicator should have 3:1 contrast ratio',
    ],
  };
}

function fixKeyboardAccess(html: string, issue: A11yIssue, framework?: string): AccessibilityFix {
  let fixed = html;

  // Check if element has click handler but no keyboard access
  if (html.includes('onclick') || html.includes('onClick')) {
    if (!html.includes('onkeydown') && !html.includes('onKeyDown')) {
      if (framework === 'react') {
        fixed = html.replace(/onClick=/i, 'onKeyDown={handleKeyDown} onClick=');
      } else {
        fixed = html.replace(/onclick=/i, 'onkeydown="handleKeyDown(event)" onclick=');
      }
    }
    if (!html.includes('tabindex') && !html.includes('tabIndex')) {
      fixed = fixed.replace(/>/, ' tabindex="0">');
    }
  }

  return {
    original: html,
    fixed,
    explanation: 'Interactive elements must be keyboard accessible',
    wcagReference: 'WCAG 2.1.1 Keyboard (Level A)',
    additionalChanges: [
      'Add tabindex="0" to make element focusable',
      'Add keyboard event handlers (Enter/Space for activation)',
      'Consider using native button or link elements instead',
    ],
    ariaChanges: ['role="button" if element acts as button', 'aria-pressed for toggle buttons'],
  };
}

function fixAriaRole(html: string, issue: A11yIssue, framework?: string): AccessibilityFix {
  // Extract invalid role if present
  const roleMatch = html.match(/role=["']([^"']+)["']/i);
  const invalidRole = roleMatch ? roleMatch[1] : '';

  const validRoles: Record<string, string> = {
    btn: 'button',
    link: 'link',
    img: 'img',
    nav: 'navigation',
    main: 'main',
    header: 'banner',
    footer: 'contentinfo',
  };

  const suggestedRole = validRoles[invalidRole.toLowerCase()] || 'button';
  const fixed = html.replace(/role=["'][^"']+["']/i, `role="${suggestedRole}"`);

  return {
    original: html,
    fixed,
    explanation: `Use valid ARIA roles. "${invalidRole}" is not a valid role.`,
    wcagReference: 'WCAG 4.1.2 Name, Role, Value (Level A)',
    additionalChanges: [
      'Review WAI-ARIA specification for valid roles',
      'Consider using semantic HTML elements instead of ARIA roles',
      'Ensure required ARIA attributes are present for the role',
    ],
    ariaChanges: [
      `Valid roles include: button, link, navigation, main, etc.`,
      'Use aria-label or aria-labelledby for accessible name',
    ],
  };
}

function fixHtmlLang(html: string): AccessibilityFix {
  return {
    original: '<html>',
    fixed: '<html lang="en">',
    explanation: 'The html element must have a lang attribute specifying the page language',
    wcagReference: 'WCAG 3.1.1 Language of Page (Level A)',
    additionalChanges: [
      'Use BCP 47 language tags (en, es, fr, de, etc.)',
      'For multilingual pages, use lang on specific sections',
    ],
  };
}

function fixDocumentTitle(): AccessibilityFix {
  return {
    original: '<!-- no title -->',
    fixed: '<title>Page Title - Site Name</title>',
    explanation: 'Every page must have a descriptive title in the head element',
    wcagReference: 'WCAG 2.4.2 Page Titled (Level A)',
    additionalChanges: [
      'Title should be unique and describe page content',
      'Put most specific information first',
      'Keep titles concise but descriptive',
    ],
  };
}

function fixSkipLink(framework?: string): AccessibilityFix {
  const skipLinkHtml = framework === 'react'
    ? `<a href="#main-content" className="skip-link">Skip to main content</a>`
    : `<a href="#main-content" class="skip-link">Skip to main content</a>`;

  const cssCode = `.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  padding: 8px;
  background: #000;
  color: #fff;
  z-index: 100;
}
.skip-link:focus {
  top: 0;
}`;

  return {
    original: '<!-- no skip link -->',
    fixed: skipLinkHtml,
    explanation: 'Provide a skip link to bypass repetitive navigation',
    wcagReference: 'WCAG 2.4.1 Bypass Blocks (Level A)',
    cssChanges: [cssCode],
    additionalChanges: [
      'Place skip link as first focusable element',
      'Link should jump to main content area',
      'Make link visible on focus',
    ],
  };
}

function fixTableHeaders(html: string, framework?: string): AccessibilityFix {
  let fixed = html;

  // Add scope to th elements
  fixed = fixed.replace(/<th(?![^>]*scope)/gi, '<th scope="col"');

  return {
    original: html,
    fixed,
    explanation: 'Table headers must be properly associated with data cells using th and scope',
    wcagReference: 'WCAG 1.3.1 Info and Relationships (Level A)',
    additionalChanges: [
      'Use <th scope="col"> for column headers',
      'Use <th scope="row"> for row headers',
      'For complex tables, use headers and id attributes',
    ],
    ariaChanges: ['aria-describedby for table caption', 'role="table" if using non-table elements'],
  };
}

function fixDuplicateId(html: string, issue: A11yIssue): AccessibilityFix {
  const idMatch = html.match(/id=["']([^"']+)["']/i);
  const duplicateId = idMatch ? idMatch[1] : 'duplicate-id';
  const newId = `${duplicateId}-${Math.random().toString(36).substr(2, 5)}`;

  const fixed = html.replace(/id=["'][^"']+["']/i, `id="${newId}"`);

  return {
    original: html,
    fixed,
    explanation: `ID "${duplicateId}" is used multiple times. IDs must be unique on the page.`,
    wcagReference: 'WCAG 4.1.1 Parsing (Level A)',
    additionalChanges: [
      'Audit page for all duplicate IDs',
      'Use classes instead of IDs for styling',
      'Ensure form labels reference correct unique IDs',
    ],
  };
}

function fixMetaViewport(html: string): AccessibilityFix {
  return {
    original: html,
    fixed: '<meta name="viewport" content="width=device-width, initial-scale=1">',
    explanation: 'Viewport meta tag should not disable user scaling',
    wcagReference: 'WCAG 1.4.4 Resize Text (Level AA)',
    additionalChanges: [
      'Remove maximum-scale=1.0 restriction',
      'Remove user-scalable=no',
      'Allow users to zoom up to at least 200%',
    ],
  };
}

function fixAutocomplete(html: string, issue: A11yIssue): AccessibilityFix {
  // Determine appropriate autocomplete value based on input type/name
  const inputType = html.match(/type=["']([^"']+)["']/i)?.[1] || '';
  const inputName = html.match(/name=["']([^"']+)["']/i)?.[1] || '';

  const autocompleteValues: Record<string, string> = {
    email: 'email',
    tel: 'tel',
    phone: 'tel',
    password: 'current-password',
    name: 'name',
    fname: 'given-name',
    lname: 'family-name',
    address: 'street-address',
    city: 'address-level2',
    state: 'address-level1',
    zip: 'postal-code',
    country: 'country-name',
    cc: 'cc-number',
  };

  const suggestion = autocompleteValues[inputType] || autocompleteValues[inputName.toLowerCase()] || 'on';
  const fixed = html.replace(/<input/i, `<input autocomplete="${suggestion}"`);

  return {
    original: html,
    fixed,
    explanation: 'Use valid autocomplete values to help users fill in forms',
    wcagReference: 'WCAG 1.3.5 Identify Input Purpose (Level AA)',
    additionalChanges: [
      'Review HTML autocomplete attribute specification',
      'Common values: name, email, tel, street-address, postal-code',
      'Use off only when autocomplete would be inappropriate',
    ],
  };
}

function generateGenericFix(issue: A11yIssue, html: string, framework?: string): AccessibilityFix {
  return {
    original: html,
    fixed: html,
    explanation: issue.description || `Fix the accessibility issue: ${issue.rule}`,
    wcagReference: `WCAG - ${issue.impact?.toUpperCase() || 'Review guidelines'}`,
    additionalChanges: [
      'Review the specific WCAG guideline for this issue',
      'Test with screen readers to verify fix',
      'Use automated testing tools to verify compliance',
    ],
  };
}

function generateAlternatives(issue: A11yIssue, html?: string, framework?: string): AccessibilityFix[] {
  const alternatives: AccessibilityFix[] = [];
  const ruleId = issue.rule;

  // Only some rules have meaningful alternatives
  switch (ruleId) {
    case 'label':
    case 'form-field-label':
      alternatives.push({
        original: html || '<input>',
        fixed: '<label>Field Label <input></label>',
        explanation: 'Wrap input in label element (no for/id needed)',
        wcagReference: 'WCAG 1.3.1',
      });
      alternatives.push({
        original: html || '<input>',
        fixed: '<input aria-label="Field Label">',
        explanation: 'Use aria-label for invisible label (screen reader only)',
        wcagReference: 'WCAG 1.3.1',
      });
      break;

    case 'button-name':
      alternatives.push({
        original: html || '<button></button>',
        fixed: '<button>Click me</button>',
        explanation: 'Add visible text content to button',
        wcagReference: 'WCAG 4.1.2',
      });
      alternatives.push({
        original: html || '<button></button>',
        fixed: '<button aria-labelledby="btn-label-id">...</button>',
        explanation: 'Reference another element for the label',
        wcagReference: 'WCAG 4.1.2',
      });
      break;
  }

  return alternatives;
}

function generateTestingTips(issue: A11yIssue): string[] {
  const tips: string[] = [];

  // Generic testing tips
  tips.push('Test with keyboard navigation (Tab, Enter, Space, Escape)');
  tips.push('Verify with screen reader (NVDA, VoiceOver, or JAWS)');

  // Rule-specific tips
  switch (issue.rule) {
    case 'color-contrast':
      tips.push('Use browser DevTools color contrast checker');
      tips.push('Test with color blindness simulators');
      break;
    case 'focus-visible':
      tips.push('Tab through all interactive elements');
      tips.push('Ensure focus indicator is clearly visible');
      break;
    case 'image-alt':
      tips.push('Listen to page with screen reader');
      tips.push('Verify alt text describes image purpose');
      break;
    case 'keyboard':
      tips.push('Unplug mouse and navigate with keyboard only');
      tips.push('Test all interactive features with keyboard');
      break;
  }

  return tips;
}

function getResources(issue: A11yIssue): string[] {
  const resources: string[] = [];

  // General resources
  resources.push('https://www.w3.org/WAI/WCAG21/quickref/');
  resources.push('https://dequeuniversity.com/rules/axe/');

  // Rule-specific resources
  switch (issue.rule) {
    case 'color-contrast':
      resources.push('https://webaim.org/resources/contrastchecker/');
      break;
    case 'image-alt':
      resources.push('https://www.w3.org/WAI/tutorials/images/');
      break;
    case 'label':
      resources.push('https://www.w3.org/WAI/tutorials/forms/labels/');
      break;
    case 'keyboard':
      resources.push('https://webaim.org/techniques/keyboard/');
      break;
  }

  return resources;
}

/**
 * Format accessibility fix as readable output
 */
export function formatAccessibilityFix(result: AccessibilityFixResult): string {
  const lines: string[] = [];

  lines.push(`# Accessibility Fix: ${result.issue.rule}`);
  lines.push('');
  lines.push(`**Impact**: ${result.issue.impact || 'moderate'}`);
  lines.push(`**Description**: ${result.issue.description || result.issue.rule}`);
  lines.push('');

  lines.push('## Recommended Fix');
  lines.push('');
  lines.push('**Before:**');
  lines.push('```html');
  lines.push(result.fix.original);
  lines.push('```');
  lines.push('');
  lines.push('**After:**');
  lines.push('```html');
  lines.push(result.fix.fixed);
  lines.push('```');
  lines.push('');
  lines.push(`**Explanation**: ${result.fix.explanation}`);
  lines.push(`**WCAG Reference**: ${result.fix.wcagReference}`);

  if (result.fix.cssChanges && result.fix.cssChanges.length > 0) {
    lines.push('');
    lines.push('### CSS Changes');
    lines.push('```css');
    result.fix.cssChanges.forEach(css => lines.push(css));
    lines.push('```');
  }

  if (result.fix.additionalChanges && result.fix.additionalChanges.length > 0) {
    lines.push('');
    lines.push('### Additional Considerations');
    result.fix.additionalChanges.forEach(c => lines.push(`- ${c}`));
  }

  if (result.alternativeFixes && result.alternativeFixes.length > 0) {
    lines.push('');
    lines.push('## Alternative Approaches');
    result.alternativeFixes.forEach((alt, i) => {
      lines.push(`### Option ${i + 2}`);
      lines.push('```html');
      lines.push(alt.fixed);
      lines.push('```');
      lines.push(alt.explanation);
      lines.push('');
    });
  }

  if (result.testingTips.length > 0) {
    lines.push('## Testing Tips');
    result.testingTips.forEach(tip => lines.push(`- ${tip}`));
    lines.push('');
  }

  if (result.resources.length > 0) {
    lines.push('## Resources');
    result.resources.forEach(r => lines.push(`- ${r}`));
  }

  return lines.join('\n');
}
