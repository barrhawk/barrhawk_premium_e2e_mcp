/**
 * Basic Accessibility Checks - Free Tier
 *
 * Simple, rule-based accessibility checks.
 * For comprehensive WCAG auditing with AI explanations, upgrade to Premium.
 */

import type { Page } from 'playwright';

// ============================================================================
// Types
// ============================================================================

export interface A11yIssue {
  type: 'error' | 'warning' | 'info';
  rule: string;
  description: string;
  selector?: string;
  element?: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  suggestion?: string;
}

export interface A11yCheckOptions {
  page: Page;
  scope?: string;  // CSS selector to limit check scope
  rules?: A11yRuleSet[];  // Which rule sets to run
}

export type A11yRuleSet =
  | 'images'      // Alt text checks
  | 'forms'       // Form labels and inputs
  | 'headings'    // Heading structure
  | 'links'       // Link text quality
  | 'contrast'    // Basic contrast (limited without AI)
  | 'keyboard'    // Focus indicators
  | 'language'    // Lang attribute
  | 'landmarks'   // ARIA landmarks
  | 'all';

export interface A11yCheckResult {
  passed: boolean;
  score: number;  // 0-100
  issues: A11yIssue[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
    total: number;
  };
  checkedRules: string[];
  message: string;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Run basic accessibility checks on a page
 */
export async function a11yCheckBasic(options: A11yCheckOptions): Promise<A11yCheckResult> {
  const { page, scope, rules = ['all'] } = options;
  const issues: A11yIssue[] = [];
  const checkedRules: string[] = [];

  const shouldRun = (rule: A11yRuleSet) =>
    rules.includes('all') || rules.includes(rule);

  // Build the scope selector
  const scopeSelector = scope || 'body';

  // Run each rule set
  if (shouldRun('images')) {
    checkedRules.push('images');
    const imageIssues = await checkImages(page, scopeSelector);
    issues.push(...imageIssues);
  }

  if (shouldRun('forms')) {
    checkedRules.push('forms');
    const formIssues = await checkForms(page, scopeSelector);
    issues.push(...formIssues);
  }

  if (shouldRun('headings')) {
    checkedRules.push('headings');
    const headingIssues = await checkHeadings(page, scopeSelector);
    issues.push(...headingIssues);
  }

  if (shouldRun('links')) {
    checkedRules.push('links');
    const linkIssues = await checkLinks(page, scopeSelector);
    issues.push(...linkIssues);
  }

  if (shouldRun('keyboard')) {
    checkedRules.push('keyboard');
    const keyboardIssues = await checkKeyboard(page, scopeSelector);
    issues.push(...keyboardIssues);
  }

  if (shouldRun('language')) {
    checkedRules.push('language');
    const langIssues = await checkLanguage(page);
    issues.push(...langIssues);
  }

  if (shouldRun('landmarks')) {
    checkedRules.push('landmarks');
    const landmarkIssues = await checkLandmarks(page, scopeSelector);
    issues.push(...landmarkIssues);
  }

  // Calculate summary
  const errors = issues.filter(i => i.type === 'error').length;
  const warnings = issues.filter(i => i.type === 'warning').length;
  const info = issues.filter(i => i.type === 'info').length;

  // Calculate score (simple formula)
  const criticalWeight = 10;
  const seriousWeight = 5;
  const moderateWeight = 2;
  const minorWeight = 1;

  const penalty = issues.reduce((sum, issue) => {
    switch (issue.impact) {
      case 'critical': return sum + criticalWeight;
      case 'serious': return sum + seriousWeight;
      case 'moderate': return sum + moderateWeight;
      case 'minor': return sum + minorWeight;
      default: return sum;
    }
  }, 0);

  const score = Math.max(0, Math.min(100, 100 - penalty));
  const passed = errors === 0;

  return {
    passed,
    score,
    issues,
    summary: {
      errors,
      warnings,
      info,
      total: issues.length,
    },
    checkedRules,
    message: passed
      ? `Accessibility check passed with score ${score}/100`
      : `Accessibility check found ${errors} errors, ${warnings} warnings`,
  };
}

// ============================================================================
// Rule Implementations
// ============================================================================

async function checkImages(page: Page, scope: string): Promise<A11yIssue[]> {
  const issues: A11yIssue[] = [];

  const imageData = await page.evaluate((scopeSelector) => {
    const container = document.querySelector(scopeSelector);
    if (!container) return [];

    const images = container.querySelectorAll('img');
    return Array.from(images).map(img => ({
      src: img.src.substring(0, 100),
      alt: img.getAttribute('alt'),
      hasAlt: img.hasAttribute('alt'),
      role: img.getAttribute('role'),
      ariaHidden: img.getAttribute('aria-hidden'),
      selector: generateSelector(img),
    }));

    function generateSelector(el: Element): string {
      if (el.id) return `#${el.id}`;
      if (el.className) return `img.${el.className.split(' ')[0]}`;
      return 'img';
    }
  }, scope);

  for (const img of imageData) {
    // Skip decorative images
    if (img.role === 'presentation' || img.ariaHidden === 'true') {
      continue;
    }

    if (!img.hasAlt) {
      issues.push({
        type: 'error',
        rule: 'img-alt',
        description: 'Image missing alt attribute',
        selector: img.selector,
        element: `<img src="${img.src}">`,
        impact: 'critical',
        suggestion: 'Add an alt attribute describing the image content, or alt="" for decorative images',
      });
    } else if (img.alt === '') {
      // Empty alt is valid for decorative images but should have role="presentation"
      if (img.role !== 'presentation') {
        issues.push({
          type: 'info',
          rule: 'img-alt-decorative',
          description: 'Image has empty alt - ensure it is decorative',
          selector: img.selector,
          element: `<img src="${img.src}" alt="">`,
          impact: 'minor',
          suggestion: 'Add role="presentation" to explicitly mark as decorative',
        });
      }
    } else if (img.alt && /\.(jpg|jpeg|png|gif|svg|webp)/i.test(img.alt)) {
      issues.push({
        type: 'error',
        rule: 'img-alt-filename',
        description: 'Alt text appears to be a filename',
        selector: img.selector,
        element: `<img alt="${img.alt}">`,
        impact: 'serious',
        suggestion: 'Replace filename with meaningful description',
      });
    }
  }

  return issues;
}

async function checkForms(page: Page, scope: string): Promise<A11yIssue[]> {
  const issues: A11yIssue[] = [];

  const formData = await page.evaluate((scopeSelector) => {
    const container = document.querySelector(scopeSelector);
    if (!container) return [];

    const inputs = container.querySelectorAll('input, select, textarea');
    return Array.from(inputs).map(input => {
      const inputEl = input as HTMLInputElement;
      return {
        type: inputEl.type || 'text',
        name: inputEl.name,
        id: inputEl.id,
        hasLabel: !!inputEl.labels?.length,
        ariaLabel: inputEl.getAttribute('aria-label'),
        ariaLabelledBy: inputEl.getAttribute('aria-labelledby'),
        placeholder: inputEl.getAttribute('placeholder'),
        required: inputEl.required,
        ariaRequired: inputEl.getAttribute('aria-required'),
        selector: generateSelector(inputEl),
      };

      function generateSelector(el: Element): string {
        if (el.id) return `#${el.id}`;
        const inputEl = el as HTMLInputElement;
        if (inputEl.name) return `[name="${inputEl.name}"]`;
        return el.tagName.toLowerCase();
      }
    });
  }, scope);

  for (const input of formData) {
    // Skip hidden and submit/button types
    if (['hidden', 'submit', 'button', 'image', 'reset'].includes(input.type)) {
      continue;
    }

    const hasAccessibleName = input.hasLabel || input.ariaLabel || input.ariaLabelledBy;

    if (!hasAccessibleName) {
      issues.push({
        type: 'error',
        rule: 'input-label',
        description: `Form input missing accessible label`,
        selector: input.selector,
        element: `<input type="${input.type}">`,
        impact: 'critical',
        suggestion: 'Add a <label> element, aria-label, or aria-labelledby',
      });

      if (input.placeholder) {
        issues.push({
          type: 'warning',
          rule: 'input-placeholder-label',
          description: 'Placeholder used instead of label',
          selector: input.selector,
          element: `<input placeholder="${input.placeholder}">`,
          impact: 'moderate',
          suggestion: 'Placeholders should not replace labels',
        });
      }
    }

    // Check required indication
    if (input.required && !input.ariaRequired) {
      issues.push({
        type: 'info',
        rule: 'input-required-aria',
        description: 'Required field may not be announced to screen readers',
        selector: input.selector,
        impact: 'minor',
        suggestion: 'Consider adding aria-required="true" in addition to required attribute',
      });
    }
  }

  return issues;
}

async function checkHeadings(page: Page, scope: string): Promise<A11yIssue[]> {
  const issues: A11yIssue[] = [];

  const headingData = await page.evaluate((scopeSelector) => {
    const container = document.querySelector(scopeSelector);
    if (!container) return [];

    const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
    return Array.from(headings).map(h => ({
      level: parseInt(h.tagName.charAt(1)),
      text: h.textContent?.trim().substring(0, 50) || '',
      empty: !h.textContent?.trim(),
      selector: h.id ? `#${h.id}` : h.tagName.toLowerCase(),
    }));
  }, scope);

  // Check for missing h1
  const hasH1 = headingData.some(h => h.level === 1);
  if (!hasH1 && headingData.length > 0) {
    issues.push({
      type: 'warning',
      rule: 'heading-h1-missing',
      description: 'Page has no h1 heading',
      impact: 'serious',
      suggestion: 'Add an h1 to identify the main content',
    });
  }

  // Check for multiple h1s
  const h1Count = headingData.filter(h => h.level === 1).length;
  if (h1Count > 1) {
    issues.push({
      type: 'warning',
      rule: 'heading-h1-multiple',
      description: `Page has ${h1Count} h1 headings`,
      impact: 'moderate',
      suggestion: 'Consider using only one h1 per page',
    });
  }

  // Check heading hierarchy
  let lastLevel = 0;
  for (const heading of headingData) {
    if (heading.empty) {
      issues.push({
        type: 'error',
        rule: 'heading-empty',
        description: 'Empty heading element',
        selector: heading.selector,
        element: `<h${heading.level}>`,
        impact: 'serious',
        suggestion: 'Add text content or remove the empty heading',
      });
    }

    // Check for skipped levels
    if (lastLevel > 0 && heading.level > lastLevel + 1) {
      issues.push({
        type: 'warning',
        rule: 'heading-skip',
        description: `Heading level skipped from h${lastLevel} to h${heading.level}`,
        selector: heading.selector,
        element: `<h${heading.level}>${heading.text}</h${heading.level}>`,
        impact: 'moderate',
        suggestion: 'Maintain proper heading hierarchy without skipping levels',
      });
    }

    lastLevel = heading.level;
  }

  return issues;
}

async function checkLinks(page: Page, scope: string): Promise<A11yIssue[]> {
  const issues: A11yIssue[] = [];

  const linkData = await page.evaluate((scopeSelector) => {
    const container = document.querySelector(scopeSelector);
    if (!container) return [];

    const links = container.querySelectorAll('a');
    return Array.from(links).map(a => ({
      href: a.href,
      text: a.textContent?.trim() || '',
      ariaLabel: a.getAttribute('aria-label'),
      title: a.title,
      hasImage: a.querySelector('img') !== null,
      imageAlt: a.querySelector('img')?.getAttribute('alt') || '',
      selector: a.id ? `#${a.id}` : 'a',
    }));
  }, scope);

  const genericLinkTexts = ['click here', 'here', 'read more', 'learn more', 'more', 'link'];

  for (const link of linkData) {
    const accessibleName = link.ariaLabel || link.text || (link.hasImage ? link.imageAlt : '');

    if (!accessibleName) {
      issues.push({
        type: 'error',
        rule: 'link-name',
        description: 'Link has no accessible name',
        selector: link.selector,
        element: `<a href="${link.href}">`,
        impact: 'critical',
        suggestion: 'Add link text, aria-label, or alt text for image links',
      });
    } else if (genericLinkTexts.includes(accessibleName.toLowerCase())) {
      issues.push({
        type: 'warning',
        rule: 'link-generic',
        description: `Link has generic text: "${accessibleName}"`,
        selector: link.selector,
        element: `<a>${accessibleName}</a>`,
        impact: 'moderate',
        suggestion: 'Use descriptive link text that indicates the destination',
      });
    }
  }

  return issues;
}

async function checkKeyboard(page: Page, scope: string): Promise<A11yIssue[]> {
  const issues: A11yIssue[] = [];

  const interactiveData = await page.evaluate((scopeSelector) => {
    const container = document.querySelector(scopeSelector);
    if (!container) return [];

    const interactiveElements = container.querySelectorAll(
      'a, button, input, select, textarea, [tabindex], [onclick], [role="button"], [role="link"]'
    );

    return Array.from(interactiveElements).map(el => {
      const computed = window.getComputedStyle(el);
      const focusComputed = window.getComputedStyle(el, ':focus');

      return {
        tag: el.tagName.toLowerCase(),
        tabindex: el.getAttribute('tabindex'),
        hasOnClick: el.hasAttribute('onclick'),
        role: el.getAttribute('role'),
        outlineStyle: computed.outlineStyle,
        outlineWidth: computed.outlineWidth,
        selector: el.id ? `#${el.id}` : el.tagName.toLowerCase(),
      };
    });
  }, scope);

  for (const el of interactiveData) {
    // Check for non-interactive elements with onclick
    if (el.hasOnClick && !['a', 'button', 'input', 'select', 'textarea'].includes(el.tag)) {
      if (!el.role && el.tabindex === null) {
        issues.push({
          type: 'error',
          rule: 'keyboard-onclick',
          description: `Non-interactive element with onclick is not keyboard accessible`,
          selector: el.selector,
          element: `<${el.tag} onclick="...">`,
          impact: 'critical',
          suggestion: 'Add tabindex="0" and keyboard event handlers, or use a button',
        });
      }
    }

    // Check for negative tabindex on interactive elements
    if (el.tabindex && parseInt(el.tabindex) < 0) {
      if (['a', 'button', 'input', 'select', 'textarea'].includes(el.tag)) {
        issues.push({
          type: 'warning',
          rule: 'keyboard-tabindex-negative',
          description: 'Interactive element removed from tab order',
          selector: el.selector,
          element: `<${el.tag} tabindex="${el.tabindex}">`,
          impact: 'serious',
          suggestion: 'Ensure element can be accessed via keyboard another way',
        });
      }
    }
  }

  return issues;
}

async function checkLanguage(page: Page): Promise<A11yIssue[]> {
  const issues: A11yIssue[] = [];

  const langData = await page.evaluate(() => {
    const html = document.documentElement;
    return {
      hasLang: html.hasAttribute('lang'),
      lang: html.getAttribute('lang'),
    };
  });

  if (!langData.hasLang) {
    issues.push({
      type: 'error',
      rule: 'html-lang',
      description: 'Page missing lang attribute',
      selector: 'html',
      impact: 'serious',
      suggestion: 'Add lang attribute to <html> element (e.g., lang="en")',
    });
  } else if (langData.lang && langData.lang.length < 2) {
    issues.push({
      type: 'error',
      rule: 'html-lang-valid',
      description: `Invalid lang attribute value: "${langData.lang}"`,
      selector: 'html',
      impact: 'serious',
      suggestion: 'Use a valid language code (e.g., "en", "en-US", "es")',
    });
  }

  return issues;
}

async function checkLandmarks(page: Page, scope: string): Promise<A11yIssue[]> {
  const issues: A11yIssue[] = [];

  const landmarkData = await page.evaluate((scopeSelector) => {
    const container = document.querySelector(scopeSelector);
    if (!container) return { hasMain: false, hasNav: false, landmarkCount: 0 };

    const main = container.querySelector('main, [role="main"]');
    const nav = container.querySelector('nav, [role="navigation"]');
    const landmarks = container.querySelectorAll(
      'main, nav, header, footer, aside, section[aria-label], section[aria-labelledby], ' +
      '[role="main"], [role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"], [role="region"]'
    );

    return {
      hasMain: !!main,
      hasNav: !!nav,
      landmarkCount: landmarks.length,
    };
  }, scope);

  if (!landmarkData.hasMain) {
    issues.push({
      type: 'warning',
      rule: 'landmark-main',
      description: 'Page has no main landmark',
      impact: 'moderate',
      suggestion: 'Add a <main> element or role="main" to identify main content',
    });
  }

  if (landmarkData.landmarkCount === 0) {
    issues.push({
      type: 'info',
      rule: 'landmark-none',
      description: 'Page has no landmark regions',
      impact: 'minor',
      suggestion: 'Consider using semantic HTML5 elements or ARIA landmarks',
    });
  }

  return issues;
}

/**
 * Format a11y results for display
 */
export function formatA11yResult(result: A11yCheckResult): string {
  const lines: string[] = [];

  const icon = result.passed ? '✅' : '❌';
  lines.push(`${icon} Accessibility Score: ${result.score}/100`);
  lines.push('');
  lines.push(`Checked: ${result.checkedRules.join(', ')}`);
  lines.push(`Errors: ${result.summary.errors} | Warnings: ${result.summary.warnings} | Info: ${result.summary.info}`);
  lines.push('');

  if (result.issues.length > 0) {
    lines.push('─'.repeat(50));
    lines.push('Issues:');
    lines.push('─'.repeat(50));

    for (const issue of result.issues) {
      const typeIcon = issue.type === 'error' ? '❌' : issue.type === 'warning' ? '⚠️' : 'ℹ️';
      lines.push(`${typeIcon} [${issue.rule}] ${issue.description}`);
      if (issue.selector) {
        lines.push(`   Selector: ${issue.selector}`);
      }
      if (issue.suggestion) {
        lines.push(`   💡 ${issue.suggestion}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
