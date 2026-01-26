/**
 * data-testid Selector Strategy
 *
 * Attempts to find an element by data-testid attribute.
 * This is typically the most reliable strategy as test IDs are
 * designed to be stable across changes.
 */

import type { IHealingStrategy, StrategyResult, ElementInfo } from '../types.js';

export class DataTestIdStrategy implements IHealingStrategy {
  name = 'data-testid' as const;
  priority = 2;

  async heal(
    originalSelector: string,
    storedInfo: ElementInfo | undefined,
    page: any
  ): Promise<StrategyResult> {
    // Extract data-testid from original selector or stored info
    const testIdMatch = originalSelector.match(/\[data-testid=["']?([^"'\]]+)["']?\]/);
    const originalTestId = testIdMatch?.[1] || storedInfo?.testId;

    try {
      // If we have a stored testId, try to find it directly
      if (originalTestId) {
        // Strategy 1: Exact match
        const exactElement = await page.$(`[data-testid="${originalTestId}"]`);
        if (exactElement) {
          const info = await this.getElementInfo(exactElement, page);
          return {
            found: true,
            selector: `[data-testid="${originalTestId}"]`,
            confidence: 1.0,
            strategy: this.name,
            details: 'Exact data-testid match found',
            elementInfo: info,
          };
        }

        // Strategy 2: Partial/similar match
        // Use string-based evaluate to avoid tsx __name transformation issues
        const candidates = await page.evaluate(`
          (function(originalId) {
            var allElements = document.querySelectorAll('[data-testid]');
            var results = [];

            function norm(s) { return s.toLowerCase().replace(/[-_]/g, ''); }
            var normalizedOriginal = norm(originalId);

            for (var i = 0; i < allElements.length; i++) {
              var el = allElements[i];
              var testId = el.getAttribute('data-testid');
              var normalizedTest = norm(testId);
              var similarity = 0;

              if (normalizedTest === normalizedOriginal) {
                similarity = 0.95;
              } else if (normalizedTest.indexOf(normalizedOriginal) !== -1) {
                similarity = 0.8;
              } else if (normalizedOriginal.indexOf(normalizedTest) !== -1) {
                similarity = 0.7;
              } else {
                var commonChars = 0;
                for (var j = 0; j < normalizedOriginal.length; j++) {
                  if (normalizedTest.indexOf(normalizedOriginal[j]) !== -1) commonChars++;
                }
                similarity = commonChars / Math.max(normalizedOriginal.length, normalizedTest.length);
              }

              if (similarity > 0.4) {
                results.push({ testId: testId, similarity: similarity });
              }
            }

            return results.sort(function(a, b) { return b.similarity - a.similarity; }).slice(0, 5);
          })(${JSON.stringify(originalTestId)})
        `);

        if (candidates.length > 0) {
          const best = candidates[0];
          const element = await page.$(`[data-testid="${best.testId}"]`);

          if (element) {
            const info = await this.getElementInfo(element, page);

            // Validate tag match if we have stored info
            let confidence = best.similarity;
            if (storedInfo && info.tagName !== storedInfo.tagName) {
              confidence *= 0.8;
            }

            return {
              found: true,
              selector: `[data-testid="${best.testId}"]`,
              confidence,
              strategy: this.name,
              details: `Similar data-testid found: "${originalTestId}" -> "${best.testId}" (similarity: ${(best.similarity * 100).toFixed(0)}%)`,
              elementInfo: info,
            };
          }
        }
      }

      // Strategy 3: If we have stored element info, try to find any element with similar attributes
      // that also has a data-testid
      // Use string-based evaluate to avoid tsx __name transformation issues
      if (storedInfo) {
        const candidates = await page.evaluate(`
          (function(info) {
            var results = [];
            var elements = document.querySelectorAll('[data-testid]');

            for (var i = 0; i < elements.length; i++) {
              var el = elements[i];
              var score = 0;

              if (el.tagName.toLowerCase() === info.tagName) score += 2;
              if (info.textContent && (el.textContent || '').indexOf(info.textContent.slice(0, 20)) !== -1) score += 1.5;
              if (info.ariaLabel && el.getAttribute('aria-label') === info.ariaLabel) score += 2;

              if (info.classes && el.className) {
                var elClasses = el.className.split(' ');
                var overlap = 0;
                for (var j = 0; j < info.classes.length; j++) {
                  if (elClasses.indexOf(info.classes[j]) !== -1) overlap++;
                }
                score += overlap * 0.5;
              }

              if (info.type && el.getAttribute('type') === info.type) score += 1;

              if (score > 0) {
                results.push({ testId: el.getAttribute('data-testid'), score: score });
              }
            }

            return results.sort(function(a, b) { return b.score - a.score; }).slice(0, 5);
          })(${JSON.stringify(storedInfo)})
        `);

        if (candidates.length > 0) {
          const best = candidates[0];
          const maxScore = 7.5; // Rough max possible
          const confidence = Math.min(best.score / maxScore, 0.85);

          const element = await page.$(`[data-testid="${best.testId}"]`);
          if (element) {
            const info = await this.getElementInfo(element, page);
            return {
              found: true,
              selector: `[data-testid="${best.testId}"]`,
              confidence,
              strategy: this.name,
              details: `Found data-testid by attribute matching (score: ${best.score.toFixed(1)})`,
              elementInfo: info,
            };
          }
        }
      }

      return {
        found: false,
        confidence: 0,
        strategy: this.name,
        details: 'No matching data-testid found',
      };
    } catch (error) {
      return {
        found: false,
        confidence: 0,
        strategy: this.name,
        details: `Error during data-testid healing: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async getElementInfo(element: any, page: any): Promise<ElementInfo> {
    return await page.evaluate((el: Element) => {
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
      };
    }, element);
  }
}

export const dataTestIdStrategy = new DataTestIdStrategy();
