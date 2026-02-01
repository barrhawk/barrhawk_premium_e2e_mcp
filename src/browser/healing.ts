/**
 * Self-Healing Selectors
 *
 * When a selector fails, try alternative strategies to find the element.
 */

import { Page } from 'playwright';

export interface HealingResult {
  healed: boolean;
  originalSelector: string;
  newSelector?: string;
  strategy?: string;
  confidence: number;
  attempts: Array<{
    strategy: string;
    selector: string;
    found: boolean;
    confidence: number;
  }>;
}

interface HealingStrategy {
  name: string;
  generate: (page: Page, original: string) => Promise<string[]>;
  confidence: number;
}

/**
 * Healing strategies in order of preference
 */
const HEALING_STRATEGIES: HealingStrategy[] = [
  {
    name: 'data-testid',
    confidence: 0.95,
    generate: async (page, original) => {
      // Extract potential test ID from original selector
      const match = original.match(/[.#]?([\w-]+)/);
      if (!match) return [];

      const hint = match[1].toLowerCase().replace(/[_-]/g, '');

      // Find elements with data-testid containing the hint
      const testIds = await page.evaluate((h) => {
        const elements = document.querySelectorAll('[data-testid]');
        const matches: string[] = [];
        elements.forEach((el) => {
          const testId = el.getAttribute('data-testid') || '';
          if (testId.toLowerCase().includes(h)) {
            matches.push(`[data-testid="${testId}"]`);
          }
        });
        return matches;
      }, hint);

      return testIds;
    },
  },
  {
    name: 'id',
    confidence: 0.9,
    generate: async (page, original) => {
      const match = original.match(/[.#]?([\w-]+)/);
      if (!match) return [];

      const hint = match[1].toLowerCase();

      const ids = await page.evaluate((h) => {
        const elements = document.querySelectorAll('[id]');
        const matches: string[] = [];
        elements.forEach((el) => {
          const id = el.id.toLowerCase();
          if (id.includes(h)) {
            matches.push(`#${el.id}`);
          }
        });
        return matches;
      }, hint);

      return ids;
    },
  },
  {
    name: 'aria-label',
    confidence: 0.85,
    generate: async (page, original) => {
      const match = original.match(/[.#]?([\w-]+)/);
      if (!match) return [];

      const hint = match[1].toLowerCase().replace(/[_-]/g, ' ');

      const ariaSelectors = await page.evaluate((h) => {
        const elements = document.querySelectorAll('[aria-label]');
        const matches: string[] = [];
        elements.forEach((el) => {
          const label = (el.getAttribute('aria-label') || '').toLowerCase();
          if (label.includes(h)) {
            matches.push(`[aria-label="${el.getAttribute('aria-label')}"]`);
          }
        });
        return matches;
      }, hint);

      return ariaSelectors;
    },
  },
  {
    name: 'text-content',
    confidence: 0.75,
    generate: async (page, original) => {
      // Try to extract meaningful text from selector
      const match = original.match(/[.#]?([\w-]+)/);
      if (!match) return [];

      const hint = match[1]
        .replace(/([A-Z])/g, ' $1') // camelCase to words
        .replace(/[-_]/g, ' ')
        .toLowerCase()
        .trim();

      // This will be used with page.getByText() instead of a CSS selector
      return [`text=${hint}`];
    },
  },
  {
    name: 'role',
    confidence: 0.7,
    generate: async (page, original) => {
      // Infer role from selector hints
      const hints: Record<string, string> = {
        btn: 'button',
        button: 'button',
        submit: 'button',
        link: 'link',
        input: 'textbox',
        checkbox: 'checkbox',
        radio: 'radio',
        select: 'combobox',
        nav: 'navigation',
        menu: 'menu',
        dialog: 'dialog',
        modal: 'dialog',
      };

      const lower = original.toLowerCase();
      for (const [hint, role] of Object.entries(hints)) {
        if (lower.includes(hint)) {
          const roleSelectors = await page.evaluate((r) => {
            const elements = document.querySelectorAll(`[role="${r}"]`);
            const matches: string[] = [];
            elements.forEach((el, i) => {
              // Generate a unique selector for this role element
              const id = el.id ? `#${el.id}` : '';
              const classes = el.className ? `.${el.className.split(' ').join('.')}` : '';
              if (id) {
                matches.push(id);
              } else if (classes) {
                matches.push(`[role="${r}"]${classes}`);
              } else {
                matches.push(`[role="${r}"]:nth-of-type(${i + 1})`);
              }
            });
            return matches.slice(0, 5); // Limit results
          }, role);

          return roleSelectors;
        }
      }

      return [];
    },
  },
];

/**
 * Try to heal a failed selector by finding alternatives
 */
export async function tryHealSelector(
  page: Page,
  originalSelector: string,
  minConfidence: number = 0.7
): Promise<HealingResult> {
  const result: HealingResult = {
    healed: false,
    originalSelector,
    confidence: 0,
    attempts: [],
  };

  for (const strategy of HEALING_STRATEGIES) {
    if (strategy.confidence < minConfidence) {
      continue;
    }

    try {
      const candidates = await strategy.generate(page, originalSelector);

      for (const candidate of candidates) {
        // Handle text= pseudo-selector
        if (candidate.startsWith('text=')) {
          const text = candidate.substring(5);
          try {
            const element = page.getByText(text, { exact: false }).first();
            const isVisible = await element.isVisible().catch(() => false);

            result.attempts.push({
              strategy: strategy.name,
              selector: candidate,
              found: isVisible,
              confidence: strategy.confidence,
            });

            if (isVisible) {
              // Convert to a usable selector
              const box = await element.boundingBox();
              if (box) {
                result.healed = true;
                result.newSelector = candidate;
                result.strategy = strategy.name;
                result.confidence = strategy.confidence;
                return result;
              }
            }
          } catch {
            // Element not found with this text
          }
          continue;
        }

        // Standard CSS selector
        try {
          const element = await page.$(candidate);
          const isVisible = element ? await element.isVisible().catch(() => false) : false;

          result.attempts.push({
            strategy: strategy.name,
            selector: candidate,
            found: isVisible,
            confidence: strategy.confidence,
          });

          if (isVisible) {
            result.healed = true;
            result.newSelector = candidate;
            result.strategy = strategy.name;
            result.confidence = strategy.confidence;
            return result;
          }
        } catch {
          // Selector invalid or element not found
        }
      }
    } catch (error) {
      // Strategy failed, try next
      console.error(`Healing strategy ${strategy.name} failed:`, error);
    }
  }

  return result;
}

/**
 * Log healing result for debugging
 */
export function logHealingResult(result: HealingResult): void {
  if (result.healed) {
    console.error(
      `[HEALED] "${result.originalSelector}" → "${result.newSelector}" ` +
      `(${result.strategy}, confidence: ${result.confidence})`
    );
  } else {
    console.error(
      `[HEAL FAILED] "${result.originalSelector}" - tried ${result.attempts.length} alternatives`
    );
  }
}
