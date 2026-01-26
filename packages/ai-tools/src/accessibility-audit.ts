/**
 * Accessibility Audit - AI-Powered A11y Testing
 *
 * Runs accessibility audits on pages and provides actionable feedback.
 */

import type {
  A11yAuditOptions,
  A11yAuditResult,
  A11yIssue,
  A11yRule,
} from './types.js';

/**
 * Run an accessibility audit on a page
 */
export async function accessibilityAudit(options: A11yAuditOptions): Promise<A11yAuditResult> {
  const { page, rules, level = 'AA', includeWarnings = true, selector } = options;

  // Get page content for analysis
  const htmlContent = await (page as any).evaluate((sel: string | undefined) => {
    const root = sel ? document.querySelector(sel) : document;
    if (!root) return '';
    return root instanceof Element ? root.outerHTML : (root as Document).documentElement.outerHTML;
  }, selector);

  if (!htmlContent) {
    return {
      passed: false,
      score: 0,
      issues: [{
        rule: 'alt-text',
        severity: 'error',
        element: selector || 'page',
        message: 'Unable to access page content',
        impact: 'Cannot perform accessibility audit',
        suggestion: 'Check that the page is loaded correctly',
      }],
      summary: { errors: 1, warnings: 0, passed: 0, total: 1 },
      level,
    };
  }

  // Run all enabled rules
  const rulesToCheck = rules || [
    'alt-text',
    'aria-labels',
    'color-contrast',
    'form-labels',
    'heading-order',
    'link-text',
    'keyboard-access',
    'focus-visible',
    'role-attributes',
    'lang-attribute',
  ];

  const issues: A11yIssue[] = [];

  for (const rule of rulesToCheck) {
    const ruleIssues = await checkRule(page, rule, htmlContent);
    issues.push(...ruleIssues);
  }

  // Filter by severity level
  const filteredIssues = includeWarnings
    ? issues
    : issues.filter(i => i.severity === 'error');

  // Calculate score
  const errorCount = filteredIssues.filter(i => i.severity === 'error').length;
  const warningCount = filteredIssues.filter(i => i.severity === 'warning').length;
  const totalChecks = rulesToCheck.length * 5; // Rough estimate of total checks
  const passedChecks = Math.max(0, totalChecks - errorCount - warningCount * 0.5);
  const score = Math.round((passedChecks / totalChecks) * 100);

  return {
    passed: errorCount === 0,
    score,
    issues: filteredIssues,
    summary: {
      errors: errorCount,
      warnings: warningCount,
      passed: totalChecks - errorCount - warningCount,
      total: totalChecks,
    },
    level,
  };
}

async function checkRule(page: any, rule: A11yRule, html: string): Promise<A11yIssue[]> {
  switch (rule) {
    case 'alt-text':
      return checkAltText(page);
    case 'aria-labels':
      return checkAriaLabels(page);
    case 'form-labels':
      return checkFormLabels(page);
    case 'heading-order':
      return checkHeadingOrder(page);
    case 'link-text':
      return checkLinkText(page);
    case 'color-contrast':
      return checkColorContrast(page);
    case 'keyboard-access':
      return checkKeyboardAccess(page);
    case 'focus-visible':
      return checkFocusVisible(page);
    case 'role-attributes':
      return checkRoleAttributes(page);
    case 'lang-attribute':
      return checkLangAttribute(page);
    default:
      return [];
  }
}

async function checkAltText(page: any): Promise<A11yIssue[]> {
  const issues: A11yIssue[] = [];

  const results = await page.evaluate(() => {
    const images = document.querySelectorAll('img');
    const problems: Array<{ element: string; issue: string }> = [];

    images.forEach((img, idx) => {
      const alt = img.getAttribute('alt');
      const src = img.src || 'unknown';
      const desc = `img[src="${src.slice(-50)}"]`;

      if (alt === null) {
        problems.push({ element: desc, issue: 'missing' });
      } else if (alt === '') {
        // Empty alt is valid for decorative images
        if (!img.getAttribute('role') || img.getAttribute('role') !== 'presentation') {
          problems.push({ element: desc, issue: 'empty' });
        }
      }
    });

    return problems;
  });

  for (const result of results) {
    issues.push({
      rule: 'alt-text',
      severity: result.issue === 'missing' ? 'error' : 'warning',
      element: result.element,
      message: result.issue === 'missing'
        ? 'Image is missing alt attribute'
        : 'Image has empty alt text but is not marked as decorative',
      impact: 'Screen reader users cannot understand the image content',
      suggestion: 'Add descriptive alt text or role="presentation" for decorative images',
      wcag: '1.1.1',
    });
  }

  return issues;
}

async function checkAriaLabels(page: any): Promise<A11yIssue[]> {
  const issues: A11yIssue[] = [];

  const results = await page.evaluate(() => {
    const interactiveElements = document.querySelectorAll(
      'button, a, input, select, textarea, [role="button"], [role="link"]'
    );
    const problems: Array<{ element: string; issue: string }> = [];

    interactiveElements.forEach((el) => {
      const hasLabel = !!(
        el.getAttribute('aria-label') ||
        el.getAttribute('aria-labelledby') ||
        el.textContent?.trim() ||
        (el as HTMLInputElement).placeholder ||
        el.getAttribute('title')
      );

      if (!hasLabel) {
        const tagName = el.tagName.toLowerCase();
        const id = el.id ? `#${el.id}` : '';
        const classes = el.className ? `.${el.className.split(' ').join('.')}` : '';
        problems.push({
          element: `${tagName}${id}${classes}`,
          issue: 'missing-label',
        });
      }
    });

    return problems;
  });

  for (const result of results) {
    issues.push({
      rule: 'aria-labels',
      severity: 'error',
      element: result.element,
      message: 'Interactive element has no accessible name',
      impact: 'Screen reader users cannot identify the purpose of this element',
      suggestion: 'Add aria-label, aria-labelledby, or visible text content',
      wcag: '4.1.2',
    });
  }

  return issues;
}

async function checkFormLabels(page: any): Promise<A11yIssue[]> {
  const issues: A11yIssue[] = [];

  const results = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input, select, textarea');
    const problems: Array<{ element: string; issue: string }> = [];

    inputs.forEach((input) => {
      const type = (input as HTMLInputElement).type;
      if (type === 'hidden' || type === 'submit' || type === 'button') return;

      const id = input.id;
      const hasLabel = !!(
        id && document.querySelector(`label[for="${id}"]`) ||
        input.closest('label') ||
        input.getAttribute('aria-label') ||
        input.getAttribute('aria-labelledby')
      );

      if (!hasLabel) {
        const tagName = input.tagName.toLowerCase();
        const idAttr = id ? `#${id}` : '';
        const name = (input as HTMLInputElement).name ? `[name="${(input as HTMLInputElement).name}"]` : '';
        problems.push({
          element: `${tagName}${idAttr}${name}`,
          issue: 'missing-label',
        });
      }
    });

    return problems;
  });

  for (const result of results) {
    issues.push({
      rule: 'form-labels',
      severity: 'error',
      element: result.element,
      message: 'Form input has no associated label',
      impact: 'Screen reader users cannot identify what information to enter',
      suggestion: 'Add a <label> element with for attribute or wrap input in <label>',
      wcag: '1.3.1',
    });
  }

  return issues;
}

async function checkHeadingOrder(page: any): Promise<A11yIssue[]> {
  const issues: A11yIssue[] = [];

  const results = await page.evaluate(() => {
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const levels: number[] = [];
    const problems: Array<{ element: string; issue: string; prev: number; curr: number }> = [];

    headings.forEach((h) => {
      const level = parseInt(h.tagName.charAt(1), 10);
      const prevLevel = levels.length > 0 ? levels[levels.length - 1] : 0;

      if (prevLevel > 0 && level > prevLevel + 1) {
        problems.push({
          element: `${h.tagName.toLowerCase()}: "${h.textContent?.slice(0, 30)}"`,
          issue: 'skipped-level',
          prev: prevLevel,
          curr: level,
        });
      }

      levels.push(level);
    });

    return problems;
  });

  for (const result of results) {
    issues.push({
      rule: 'heading-order',
      severity: 'warning',
      element: result.element,
      message: `Heading level skipped from h${result.prev} to h${result.curr}`,
      impact: 'Document structure is unclear, making navigation difficult',
      suggestion: `Use h${result.prev + 1} instead, or restructure heading hierarchy`,
      wcag: '1.3.1',
    });
  }

  return issues;
}

async function checkLinkText(page: any): Promise<A11yIssue[]> {
  const issues: A11yIssue[] = [];

  const results = await page.evaluate(() => {
    const links = document.querySelectorAll('a');
    const problems: Array<{ element: string; issue: string }> = [];
    const genericTexts = ['click here', 'here', 'read more', 'learn more', 'more', 'link'];

    links.forEach((link) => {
      const text = (link.textContent || '').trim().toLowerCase();
      const ariaLabel = link.getAttribute('aria-label')?.toLowerCase();
      const effectiveText = ariaLabel || text;

      if (!effectiveText || genericTexts.includes(effectiveText)) {
        const href = link.getAttribute('href') || '';
        problems.push({
          element: `a[href="${href.slice(0, 30)}"]`,
          issue: !effectiveText ? 'empty' : 'generic',
        });
      }
    });

    return problems;
  });

  for (const result of results) {
    issues.push({
      rule: 'link-text',
      severity: result.issue === 'empty' ? 'error' : 'warning',
      element: result.element,
      message: result.issue === 'empty'
        ? 'Link has no accessible text'
        : 'Link text is too generic',
      impact: 'Screen reader users cannot determine link destination',
      suggestion: 'Use descriptive text that indicates the link destination',
      wcag: '2.4.4',
    });
  }

  return issues;
}

async function checkColorContrast(page: any): Promise<A11yIssue[]> {
  // Note: Full color contrast checking requires computing styles and is complex
  // This is a simplified check that looks for common issues
  const issues: A11yIssue[] = [];

  const results = await page.evaluate(() => {
    const elements = document.querySelectorAll('p, span, a, h1, h2, h3, h4, h5, h6, li, label');
    const problems: Array<{ element: string; issue: string }> = [];

    elements.forEach((el) => {
      const style = window.getComputedStyle(el);
      const color = style.color;
      const bgColor = style.backgroundColor;

      // Simple check: if text and background are both very light or very dark
      // This is a simplified heuristic, not a proper contrast calculation
      if (color === bgColor) {
        problems.push({
          element: `${el.tagName.toLowerCase()}: "${el.textContent?.slice(0, 20)}"`,
          issue: 'identical-colors',
        });
      }
    });

    return problems;
  });

  for (const result of results) {
    issues.push({
      rule: 'color-contrast',
      severity: 'error',
      element: result.element,
      message: 'Text color is identical to background color',
      impact: 'Text is invisible to all users',
      suggestion: 'Ensure sufficient contrast ratio (4.5:1 for normal text, 3:1 for large text)',
      wcag: '1.4.3',
    });
  }

  return issues;
}

async function checkKeyboardAccess(page: any): Promise<A11yIssue[]> {
  const issues: A11yIssue[] = [];

  const results = await page.evaluate(() => {
    const clickables = document.querySelectorAll('[onclick], [onmousedown]');
    const problems: Array<{ element: string }> = [];

    clickables.forEach((el) => {
      const tagName = el.tagName.toLowerCase();
      const isNativelyFocusable = ['a', 'button', 'input', 'select', 'textarea'].includes(tagName);
      const hasTabindex = el.hasAttribute('tabindex');
      const hasKeyHandler = el.hasAttribute('onkeypress') || el.hasAttribute('onkeydown');

      if (!isNativelyFocusable && !hasTabindex) {
        problems.push({
          element: `${tagName}[onclick]`,
        });
      } else if (!isNativelyFocusable && !hasKeyHandler) {
        problems.push({
          element: `${tagName}[onclick] without keyboard handler`,
        });
      }
    });

    return problems;
  });

  for (const result of results) {
    issues.push({
      rule: 'keyboard-access',
      severity: 'error',
      element: result.element,
      message: 'Click handler without keyboard equivalent',
      impact: 'Keyboard-only users cannot access this functionality',
      suggestion: 'Add tabindex="0" and keyboard event handlers, or use a <button> element',
      wcag: '2.1.1',
    });
  }

  return issues;
}

async function checkFocusVisible(page: any): Promise<A11yIssue[]> {
  // This would require actually focusing elements and checking styles
  // Returning empty for now as it requires more complex implementation
  return [];
}

async function checkRoleAttributes(page: any): Promise<A11yIssue[]> {
  const issues: A11yIssue[] = [];

  const results = await page.evaluate(() => {
    const elementsWithRole = document.querySelectorAll('[role]');
    const problems: Array<{ element: string; role: string; issue: string }> = [];

    const validRoles = [
      'alert', 'alertdialog', 'application', 'article', 'banner', 'button',
      'cell', 'checkbox', 'columnheader', 'combobox', 'complementary', 'contentinfo',
      'definition', 'dialog', 'directory', 'document', 'feed', 'figure', 'form',
      'grid', 'gridcell', 'group', 'heading', 'img', 'link', 'list', 'listbox',
      'listitem', 'log', 'main', 'marquee', 'math', 'menu', 'menubar', 'menuitem',
      'menuitemcheckbox', 'menuitemradio', 'navigation', 'none', 'note', 'option',
      'presentation', 'progressbar', 'radio', 'radiogroup', 'region', 'row',
      'rowgroup', 'rowheader', 'scrollbar', 'search', 'searchbox', 'separator',
      'slider', 'spinbutton', 'status', 'switch', 'tab', 'table', 'tablist',
      'tabpanel', 'term', 'textbox', 'timer', 'toolbar', 'tooltip', 'tree',
      'treegrid', 'treeitem',
    ];

    elementsWithRole.forEach((el) => {
      const role = el.getAttribute('role');
      if (role && !validRoles.includes(role)) {
        problems.push({
          element: `${el.tagName.toLowerCase()}[role="${role}"]`,
          role,
          issue: 'invalid-role',
        });
      }
    });

    return problems;
  });

  for (const result of results) {
    issues.push({
      rule: 'role-attributes',
      severity: 'error',
      element: result.element,
      message: `Invalid ARIA role: "${result.role}"`,
      impact: 'Assistive technology may not correctly interpret this element',
      suggestion: 'Use a valid ARIA role or remove the role attribute',
      wcag: '4.1.2',
    });
  }

  return issues;
}

async function checkLangAttribute(page: any): Promise<A11yIssue[]> {
  const issues: A11yIssue[] = [];

  const hasLang = await page.evaluate(() => {
    return !!document.documentElement.getAttribute('lang');
  });

  if (!hasLang) {
    issues.push({
      rule: 'lang-attribute',
      severity: 'error',
      element: 'html',
      message: 'Page is missing lang attribute on <html> element',
      impact: 'Screen readers may not use the correct pronunciation',
      suggestion: 'Add lang="en" (or appropriate language code) to the <html> element',
      wcag: '3.1.1',
    });
  }

  return issues;
}

/**
 * Format audit result as text
 */
export function formatAuditResult(result: A11yAuditResult): string {
  let output = `\n# Accessibility Audit Report\n`;
  output += '═'.repeat(50) + '\n\n';

  output += `**Score:** ${result.score}/100\n`;
  output += `**Level:** WCAG ${result.level}\n`;
  output += `**Status:** ${result.passed ? 'PASSED' : 'FAILED'}\n\n`;

  output += `## Summary\n`;
  output += `- Errors: ${result.summary.errors}\n`;
  output += `- Warnings: ${result.summary.warnings}\n`;
  output += `- Passed: ${result.summary.passed}\n\n`;

  if (result.issues.length > 0) {
    output += `## Issues\n\n`;

    // Group by severity
    const errors = result.issues.filter(i => i.severity === 'error');
    const warnings = result.issues.filter(i => i.severity === 'warning');

    if (errors.length > 0) {
      output += `### Errors (${errors.length})\n\n`;
      for (const issue of errors) {
        output += `- **${issue.rule}** (WCAG ${issue.wcag || 'N/A'})\n`;
        output += `  Element: \`${issue.element}\`\n`;
        output += `  ${issue.message}\n`;
        output += `  *Fix:* ${issue.suggestion}\n\n`;
      }
    }

    if (warnings.length > 0) {
      output += `### Warnings (${warnings.length})\n\n`;
      for (const issue of warnings) {
        output += `- **${issue.rule}** (WCAG ${issue.wcag || 'N/A'})\n`;
        output += `  Element: \`${issue.element}\`\n`;
        output += `  ${issue.message}\n`;
        output += `  *Fix:* ${issue.suggestion}\n\n`;
      }
    }
  }

  return output;
}
