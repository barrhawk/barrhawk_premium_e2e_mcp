/**
 * CSS Path Selector Strategy
 *
 * Attempts to find an element using structural CSS selectors like
 * nth-child, nth-of-type, and parent-child relationships.
 * Falls back to proximity matching when structure changes.
 */

import type { IHealingStrategy, StrategyResult, ElementInfo } from '../types.js';

export class CssPathStrategy implements IHealingStrategy {
  name = 'css-path' as const;
  priority = 5;

  async heal(
    originalSelector: string,
    storedInfo: ElementInfo | undefined,
    page: any
  ): Promise<StrategyResult> {
    if (!storedInfo) {
      return {
        found: false,
        confidence: 0,
        strategy: this.name,
        details: 'CSS path strategy requires stored element info',
      };
    }

    try {
      // Strategy 1: Build selector from stored attributes
      const selectors = this.buildSelectors(storedInfo);

      for (const { selector, confidence: baseConfidence, description } of selectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            const info = await this.getElementInfo(element, page);

            // Validate the match
            const validation = this.validateMatch(info, storedInfo);

            if (validation.score > 0.5) {
              const confidence = Math.min(baseConfidence * validation.score, 0.95);
              return {
                found: true,
                selector,
                confidence,
                strategy: this.name,
                details: `${description} (validation: ${validation.details})`,
                elementInfo: info,
              };
            }
          }
        } catch {
          // Selector may be invalid, try next
          continue;
        }
      }

      // Strategy 2: Find by class combination
      if (storedInfo.classes && storedInfo.classes.length > 0) {
        const candidates = await page.evaluate((info: ElementInfo) => {
          // Helper function for combinations
          function getCombinations<T>(arr: T[], size: number): T[][] {
            if (size === 1) return arr.map(x => [x]);
            const result: T[][] = [];
            for (let i = 0; i <= arr.length - size; i++) {
              const head = arr[i];
              const tails = getCombinations(arr.slice(i + 1), size - 1);
              for (const tail of tails) {
                result.push([head, ...tail]);
              }
            }
            return result;
          }

          const results: Array<{ selector: string; score: number }> = [];

          // Try all combinations of classes
          const classes = info.classes || [];
          for (let i = classes.length; i >= 1; i--) {
            // Get combinations of size i
            const combos = getCombinations(classes, i);
            for (const combo of combos) {
              const selector = `${info.tagName}.${combo.join('.')}`;
              const elements = document.querySelectorAll(selector);

              if (elements.length === 1) {
                results.push({ selector, score: combo.length / classes.length + 0.5 });
              } else if (elements.length > 0 && elements.length <= 3) {
                results.push({
                  selector: `${selector}:first-of-type`,
                  score: combo.length / classes.length + 0.3,
                });
              }
            }
          }

          return results.sort((a, b) => b.score - a.score).slice(0, 3);
        }, storedInfo);

        if (candidates.length > 0) {
          const best = candidates[0];
          const element = await page.$(best.selector);
          if (element) {
            const info = await this.getElementInfo(element, page);
            return {
              found: true,
              selector: best.selector,
              confidence: Math.min(best.score, 0.85),
              strategy: this.name,
              details: `Found by class combination: ${best.selector}`,
              elementInfo: info,
            };
          }
        }
      }

      // Strategy 3: Find by structural position relative to parent
      if (storedInfo.parent) {
        const candidates = await page.evaluate((info: ElementInfo) => {
          const results: Array<{ selector: string; score: number }> = [];
          const parentInfo = info.parent!;

          // Find potential parent elements
          let parentSelector = parentInfo.tagName;
          if (parentInfo.id) {
            parentSelector = `#${parentInfo.id}`;
          } else if (parentInfo.classes && parentInfo.classes.length > 0) {
            parentSelector = `${parentInfo.tagName}.${parentInfo.classes[0]}`;
          }

          const parents = document.querySelectorAll(parentSelector);

          for (const parent of parents) {
            const children = parent.querySelectorAll(info.tagName);

            for (let i = 0; i < children.length; i++) {
              const child = children[i];
              let score = 0;

              // Check text content
              if (info.textContent && child.textContent?.includes(info.textContent.slice(0, 20))) {
                score += 1;
              }

              // Check classes overlap
              if (info.classes && child.className) {
                const childClasses = child.className.split(' ');
                const overlap = info.classes.filter(c => childClasses.includes(c)).length;
                score += overlap * 0.3;
              }

              if (score > 0.5) {
                const selector = `${parentSelector} > ${info.tagName}:nth-child(${i + 1})`;
                results.push({ selector, score });
              }
            }
          }

          return results.sort((a, b) => b.score - a.score).slice(0, 3);
        }, storedInfo);

        if (candidates.length > 0) {
          const best = candidates[0];
          const element = await page.$(best.selector);
          if (element) {
            const info = await this.getElementInfo(element, page);
            return {
              found: true,
              selector: best.selector,
              confidence: Math.min(best.score * 0.7, 0.8),
              strategy: this.name,
              details: `Found by parent-child relationship: ${best.selector}`,
              elementInfo: info,
            };
          }
        }
      }

      return {
        found: false,
        confidence: 0,
        strategy: this.name,
        details: 'No matching element found via CSS path',
      };
    } catch (error) {
      return {
        found: false,
        confidence: 0,
        strategy: this.name,
        details: `Error during CSS path healing: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private buildSelectors(
    info: ElementInfo
  ): Array<{ selector: string; confidence: number; description: string }> {
    const selectors: Array<{ selector: string; confidence: number; description: string }> = [];

    // ID selector (highest confidence)
    if (info.id) {
      selectors.push({
        selector: `#${info.id}`,
        confidence: 1.0,
        description: 'ID selector',
      });
    }

    // data-testid (very high confidence)
    if (info.testId) {
      selectors.push({
        selector: `[data-testid="${info.testId}"]`,
        confidence: 0.98,
        description: 'data-testid selector',
      });
    }

    // name attribute (high confidence for form elements)
    if (info.name) {
      selectors.push({
        selector: `${info.tagName}[name="${info.name}"]`,
        confidence: 0.9,
        description: 'name attribute selector',
      });
    }

    // aria-label (high confidence)
    if (info.ariaLabel) {
      selectors.push({
        selector: `[aria-label="${info.ariaLabel}"]`,
        confidence: 0.88,
        description: 'aria-label selector',
      });
    }

    // placeholder (medium-high confidence)
    if (info.placeholder) {
      selectors.push({
        selector: `${info.tagName}[placeholder="${info.placeholder}"]`,
        confidence: 0.85,
        description: 'placeholder selector',
      });
    }

    // Type + first class (medium confidence)
    if (info.type && info.classes && info.classes.length > 0) {
      selectors.push({
        selector: `${info.tagName}[type="${info.type}"].${info.classes[0]}`,
        confidence: 0.75,
        description: 'type + class selector',
      });
    }

    // Just type (lower confidence)
    if (info.type) {
      selectors.push({
        selector: `${info.tagName}[type="${info.type}"]`,
        confidence: 0.5,
        description: 'type-only selector',
      });
    }

    return selectors;
  }

  private validateMatch(
    found: ElementInfo,
    stored: ElementInfo
  ): { score: number; details: string } {
    let score = 0;
    const matches: string[] = [];
    const mismatches: string[] = [];

    // Tag must match
    if (found.tagName === stored.tagName) {
      score += 0.3;
      matches.push('tag');
    } else {
      mismatches.push('tag');
      return { score: 0, details: `Tag mismatch: ${found.tagName} vs ${stored.tagName}` };
    }

    // Type match (important for inputs)
    if (stored.type) {
      if (found.type === stored.type) {
        score += 0.2;
        matches.push('type');
      } else {
        score -= 0.1;
        mismatches.push('type');
      }
    }

    // Text content similarity
    if (stored.textContent && found.textContent) {
      const storedNorm = stored.textContent.toLowerCase().trim();
      const foundNorm = found.textContent.toLowerCase().trim();
      if (foundNorm.includes(storedNorm) || storedNorm.includes(foundNorm)) {
        score += 0.2;
        matches.push('text');
      }
    }

    // Class overlap
    if (stored.classes && found.classes) {
      const overlap = stored.classes.filter(c => found.classes!.includes(c)).length;
      const classScore = overlap / Math.max(stored.classes.length, 1) * 0.2;
      score += classScore;
      if (overlap > 0) {
        matches.push(`classes(${overlap})`);
      }
    }

    // Aria label match
    if (stored.ariaLabel && found.ariaLabel === stored.ariaLabel) {
      score += 0.1;
      matches.push('aria-label');
    }

    return {
      score: Math.min(score, 1),
      details: `Matched: [${matches.join(', ')}]${mismatches.length ? ` Mismatched: [${mismatches.join(', ')}]` : ''}`,
    };
  }

  private async getElementInfo(element: any, page: any): Promise<ElementInfo> {
    return await page.evaluate((el: Element) => {
      // Get parent info
      const parent = el.parentElement;
      const parentInfo = parent
        ? {
            tagName: parent.tagName.toLowerCase(),
            id: parent.id || undefined,
            classes: parent.className ? parent.className.split(' ').filter(Boolean) : undefined,
          }
        : undefined;

      return {
        tagName: el.tagName.toLowerCase(),
        id: el.id || undefined,
        classes: el.className ? el.className.split(' ').filter(Boolean) : undefined,
        testId: el.getAttribute('data-testid') || undefined,
        ariaLabel: el.getAttribute('aria-label') || undefined,
        ariaRole: el.getAttribute('role') || undefined,
        textContent: el.textContent?.trim().slice(0, 100) || undefined,
        placeholder: el.getAttribute('placeholder') || undefined,
        name: el.getAttribute('name') || undefined,
        href: el.getAttribute('href') || undefined,
        type: el.getAttribute('type') || undefined,
        parent: parentInfo,
      };
    }, element);
  }
}

export const cssPathStrategy = new CssPathStrategy();
