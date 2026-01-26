/**
 * Basic Selectors - Free Tier
 *
 * Simple selector utilities without AI.
 * For AI-powered selector generation, upgrade to Premium.
 */

import type { Page, ElementHandle } from 'playwright';

// ============================================================================
// Types
// ============================================================================

export interface SelectorSuggestion {
  selector: string;
  type: 'id' | 'data-testid' | 'aria' | 'class' | 'tag' | 'text' | 'css-path' | 'xpath';
  confidence: number;
  description: string;
}

export interface SelectorSuggestOptions {
  page: Page;
  element?: ElementHandle;
  description?: string;  // Human description of what to find
  near?: string;  // Selector of nearby element
}

export interface SelectorSuggestResult {
  suggestions: SelectorSuggestion[];
  recommended: string;
  count: number;
}

export interface SelectorValidateOptions {
  page: Page;
  selector: string;
  expectUnique?: boolean;
}

export interface SelectorValidateResult {
  valid: boolean;
  count: number;
  message: string;
  isUnique: boolean;
  suggestion?: string;
}

export interface SelectorAlternativesOptions {
  page: Page;
  selector: string;
  maxAlternatives?: number;
}

export interface SelectorAlternativesResult {
  original: string;
  alternatives: SelectorSuggestion[];
  count: number;
}

// ============================================================================
// Implementations
// ============================================================================

/**
 * Suggest selectors for an element or based on description
 */
export async function selectorSuggest(options: SelectorSuggestOptions): Promise<SelectorSuggestResult> {
  const { page, element, description, near } = options;
  const suggestions: SelectorSuggestion[] = [];

  // If element provided, analyze it directly
  if (element) {
    const elementSuggestions = await analyzeElement(element);
    suggestions.push(...elementSuggestions);
  }

  // If description provided, try to find matching elements
  if (description) {
    const descSuggestions = await findByDescription(page, description);
    suggestions.push(...descSuggestions);
  }

  // If near selector provided, look for elements nearby
  if (near) {
    const nearSuggestions = await findNearElement(page, near);
    suggestions.push(...nearSuggestions);
  }

  // Sort by confidence
  suggestions.sort((a, b) => b.confidence - a.confidence);

  // Remove duplicates
  const unique = suggestions.filter((s, i, arr) =>
    arr.findIndex(x => x.selector === s.selector) === i
  );

  return {
    suggestions: unique.slice(0, 10),
    recommended: unique[0]?.selector || '',
    count: unique.length,
  };
}

/**
 * Validate if a selector works and is unique
 */
export async function selectorValidate(options: SelectorValidateOptions): Promise<SelectorValidateResult> {
  const { page, selector, expectUnique = true } = options;

  try {
    const elements = await page.$$(selector);
    const count = elements.length;

    if (count === 0) {
      return {
        valid: false,
        count: 0,
        message: `No elements found for selector: ${selector}`,
        isUnique: false,
        suggestion: 'Try a less specific selector or check if the element exists',
      };
    }

    const isUnique = count === 1;

    if (expectUnique && !isUnique) {
      return {
        valid: true,
        count,
        message: `Selector matches ${count} elements (expected unique)`,
        isUnique: false,
        suggestion: 'Add more specificity to target a single element',
      };
    }

    return {
      valid: true,
      count,
      message: isUnique
        ? `Selector is valid and unique`
        : `Selector matches ${count} elements`,
      isUnique,
    };
  } catch (error) {
    return {
      valid: false,
      count: 0,
      message: `Invalid selector syntax: ${error instanceof Error ? error.message : String(error)}`,
      isUnique: false,
      suggestion: 'Check selector syntax',
    };
  }
}

/**
 * Find alternative selectors for an element
 */
export async function selectorAlternatives(options: SelectorAlternativesOptions): Promise<SelectorAlternativesResult> {
  const { page, selector, maxAlternatives = 5 } = options;
  const alternatives: SelectorSuggestion[] = [];

  try {
    const element = await page.$(selector);

    if (!element) {
      return {
        original: selector,
        alternatives: [],
        count: 0,
      };
    }

    // Get element info
    const tagName = await element.evaluate(el => el.tagName.toLowerCase());
    const id = await element.getAttribute('id');
    const className = await element.getAttribute('class');
    const dataTestId = await element.getAttribute('data-testid');
    const dataTest = await element.getAttribute('data-test');
    const ariaLabel = await element.getAttribute('aria-label');
    const role = await element.getAttribute('role');
    const name = await element.getAttribute('name');
    const type = await element.getAttribute('type');
    const text = await element.textContent();
    const placeholder = await element.getAttribute('placeholder');

    // Generate alternatives
    if (id && !selector.includes(`#${id}`)) {
      alternatives.push({
        selector: `#${id}`,
        type: 'id',
        confidence: 0.95,
        description: 'ID selector (most reliable)',
      });
    }

    if (dataTestId && !selector.includes(`data-testid="${dataTestId}"`)) {
      alternatives.push({
        selector: `[data-testid="${dataTestId}"]`,
        type: 'data-testid',
        confidence: 0.9,
        description: 'Test ID (recommended for testing)',
      });
    }

    if (dataTest && !selector.includes(`data-test="${dataTest}"`)) {
      alternatives.push({
        selector: `[data-test="${dataTest}"]`,
        type: 'data-testid',
        confidence: 0.9,
        description: 'Test attribute',
      });
    }

    if (ariaLabel) {
      alternatives.push({
        selector: `[aria-label="${ariaLabel}"]`,
        type: 'aria',
        confidence: 0.85,
        description: 'ARIA label selector',
      });
    }

    if (role) {
      const roleSelector = ariaLabel
        ? `[role="${role}"][aria-label="${ariaLabel}"]`
        : `[role="${role}"]`;
      alternatives.push({
        selector: roleSelector,
        type: 'aria',
        confidence: ariaLabel ? 0.8 : 0.6,
        description: 'ARIA role selector',
      });
    }

    if (name) {
      alternatives.push({
        selector: `${tagName}[name="${name}"]`,
        type: 'css-path',
        confidence: 0.75,
        description: 'Name attribute selector',
      });
    }

    if (type && tagName === 'input') {
      const typeSelector = name
        ? `input[type="${type}"][name="${name}"]`
        : `input[type="${type}"]`;
      alternatives.push({
        selector: typeSelector,
        type: 'css-path',
        confidence: name ? 0.7 : 0.4,
        description: 'Input type selector',
      });
    }

    if (placeholder) {
      alternatives.push({
        selector: `${tagName}[placeholder="${placeholder}"]`,
        type: 'css-path',
        confidence: 0.65,
        description: 'Placeholder selector',
      });
    }

    if (text && text.trim().length > 0 && text.trim().length < 50) {
      const cleanText = text.trim();
      alternatives.push({
        selector: `${tagName}:has-text("${cleanText}")`,
        type: 'text',
        confidence: 0.6,
        description: 'Text content selector',
      });
      alternatives.push({
        selector: `text="${cleanText}"`,
        type: 'text',
        confidence: 0.55,
        description: 'Text selector (Playwright)',
      });
    }

    if (className) {
      const classes = className.split(/\s+/).filter(c => c.length > 0 && !c.match(/^[a-z]{1,3}\d|^\d/));
      if (classes.length > 0) {
        const classSelector = classes.slice(0, 2).map(c => `.${c}`).join('');
        alternatives.push({
          selector: `${tagName}${classSelector}`,
          type: 'class',
          confidence: 0.5,
          description: 'Class selector (may be fragile)',
        });
      }
    }

    // Sort and limit
    alternatives.sort((a, b) => b.confidence - a.confidence);

    return {
      original: selector,
      alternatives: alternatives.slice(0, maxAlternatives),
      count: alternatives.length,
    };
  } catch (error) {
    return {
      original: selector,
      alternatives: [],
      count: 0,
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

async function analyzeElement(element: ElementHandle): Promise<SelectorSuggestion[]> {
  const suggestions: SelectorSuggestion[] = [];

  try {
    const info = await element.evaluate((el: Element) => ({
      tagName: el.tagName.toLowerCase(),
      id: el.id,
      className: el.className as string,
      dataTestId: el.getAttribute('data-testid'),
      ariaLabel: el.getAttribute('aria-label'),
      role: el.getAttribute('role'),
      text: el.textContent?.trim().substring(0, 50),
    }));

    if (info.id) {
      suggestions.push({
        selector: `#${info.id}`,
        type: 'id',
        confidence: 0.95,
        description: 'ID selector',
      });
    }

    if (info.dataTestId) {
      suggestions.push({
        selector: `[data-testid="${info.dataTestId}"]`,
        type: 'data-testid',
        confidence: 0.9,
        description: 'Test ID selector',
      });
    }

    if (info.ariaLabel) {
      suggestions.push({
        selector: `[aria-label="${info.ariaLabel}"]`,
        type: 'aria',
        confidence: 0.85,
        description: 'ARIA label selector',
      });
    }

    if (info.role) {
      suggestions.push({
        selector: `[role="${info.role}"]`,
        type: 'aria',
        confidence: 0.7,
        description: 'ARIA role selector',
      });
    }

    if (info.text && info.text.length < 30) {
      suggestions.push({
        selector: `text="${info.text}"`,
        type: 'text',
        confidence: 0.6,
        description: 'Text selector',
      });
    }
  } catch {
    // Element may have been detached
  }

  return suggestions;
}

async function findByDescription(page: Page, description: string): Promise<SelectorSuggestion[]> {
  const suggestions: SelectorSuggestion[] = [];
  const desc = description.toLowerCase();

  // Common element mappings
  const mappings: Array<{ keywords: string[]; selectors: string[]; type: SelectorSuggestion['type'] }> = [
    { keywords: ['login', 'sign in'], selectors: ['button:has-text("Login")', 'button:has-text("Sign in")', '[type="submit"]'], type: 'text' },
    { keywords: ['submit', 'send'], selectors: ['button[type="submit"]', 'input[type="submit"]'], type: 'css-path' },
    { keywords: ['email'], selectors: ['input[type="email"]', 'input[name="email"]', '#email'], type: 'css-path' },
    { keywords: ['password'], selectors: ['input[type="password"]', 'input[name="password"]', '#password'], type: 'css-path' },
    { keywords: ['search'], selectors: ['input[type="search"]', 'input[name="search"]', '[role="searchbox"]'], type: 'css-path' },
    { keywords: ['menu', 'nav'], selectors: ['nav', '[role="navigation"]', '.nav', '.menu'], type: 'aria' },
    { keywords: ['button'], selectors: ['button', '[role="button"]'], type: 'tag' },
    { keywords: ['link'], selectors: ['a', '[role="link"]'], type: 'tag' },
    { keywords: ['input', 'field', 'text'], selectors: ['input[type="text"]', 'input:not([type])'], type: 'css-path' },
    { keywords: ['checkbox'], selectors: ['input[type="checkbox"]', '[role="checkbox"]'], type: 'css-path' },
    { keywords: ['dropdown', 'select'], selectors: ['select', '[role="combobox"]', '[role="listbox"]'], type: 'css-path' },
  ];

  for (const mapping of mappings) {
    if (mapping.keywords.some(kw => desc.includes(kw))) {
      for (const selector of mapping.selectors) {
        try {
          const count = await page.$$(selector).then(els => els.length);
          if (count > 0) {
            suggestions.push({
              selector,
              type: mapping.type,
              confidence: count === 1 ? 0.8 : 0.5,
              description: `Found ${count} element(s) matching "${mapping.keywords[0]}"`,
            });
          }
        } catch {
          // Invalid selector, skip
        }
      }
    }
  }

  return suggestions;
}

async function findNearElement(page: Page, nearSelector: string): Promise<SelectorSuggestion[]> {
  const suggestions: SelectorSuggestion[] = [];

  try {
    const nearElement = await page.$(nearSelector);
    if (!nearElement) return suggestions;

    // Find siblings and nearby elements
    const nearby = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el || !el.parentElement) return [];

      const siblings = Array.from(el.parentElement.children)
        .filter(child => child !== el)
        .slice(0, 5)
        .map(child => ({
          tag: child.tagName.toLowerCase(),
          id: child.id,
          dataTestId: child.getAttribute('data-testid'),
          text: child.textContent?.trim().substring(0, 30),
        }));

      return siblings;
    }, nearSelector);

    for (const sibling of nearby) {
      if (sibling.id) {
        suggestions.push({
          selector: `#${sibling.id}`,
          type: 'id',
          confidence: 0.8,
          description: `Sibling element with ID`,
        });
      }
      if (sibling.dataTestId) {
        suggestions.push({
          selector: `[data-testid="${sibling.dataTestId}"]`,
          type: 'data-testid',
          confidence: 0.75,
          description: `Sibling element with test ID`,
        });
      }
    }
  } catch {
    // Selector may be invalid
  }

  return suggestions;
}

/**
 * Format selector result for display
 */
export function formatSelectorResult(result: SelectorSuggestResult | SelectorAlternativesResult): string {
  const lines: string[] = [];

  if ('recommended' in result) {
    lines.push(`**Recommended:** \`${result.recommended}\``);
    lines.push('');
  }

  if ('original' in result) {
    lines.push(`**Original:** \`${result.original}\``);
    lines.push('');
  }

  const hasAlternatives = 'alternatives' in result && result.alternatives?.length > 0;
  const hasSuggestions = 'suggestions' in result && result.suggestions.length > 0;

  if (hasAlternatives || hasSuggestions) {
    const items = 'suggestions' in result ? result.suggestions : (result as SelectorAlternativesResult).alternatives;
    lines.push(`**Alternatives (${items.length}):**`);

    for (const item of items) {
      const confidence = Math.round(item.confidence * 100);
      lines.push(`- \`${item.selector}\` (${confidence}%) - ${item.description}`);
    }
  }

  return lines.join('\n');
}
