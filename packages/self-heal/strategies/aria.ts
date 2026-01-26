/**
 * ARIA Selector Strategy
 *
 * Attempts to find an element by aria-label, role, or other ARIA attributes.
 * ARIA labels are often stable as they're tied to accessibility requirements.
 */

import type { IHealingStrategy, StrategyResult, ElementInfo } from '../types.js';

export class AriaStrategy implements IHealingStrategy {
  name = 'aria-label' as const;
  priority = 3;

  async heal(
    originalSelector: string,
    storedInfo: ElementInfo | undefined,
    page: any
  ): Promise<StrategyResult> {
    // Extract aria info from selector or stored info
    const ariaLabelMatch = originalSelector.match(/\[aria-label=["']?([^"'\]]+)["']?\]/);
    const roleMatch = originalSelector.match(/\[role=["']?([^"'\]]+)["']?\]/);

    const originalAriaLabel = ariaLabelMatch?.[1] || storedInfo?.ariaLabel;
    const originalRole = roleMatch?.[1] || storedInfo?.ariaRole;

    try {
      // Strategy 1: Exact aria-label match
      if (originalAriaLabel) {
        const exactElement = await page.$(`[aria-label="${originalAriaLabel}"]`);
        if (exactElement) {
          const info = await this.getElementInfo(exactElement, page);
          return {
            found: true,
            selector: `[aria-label="${originalAriaLabel}"]`,
            confidence: 1.0,
            strategy: this.name,
            details: 'Exact aria-label match found',
            elementInfo: info,
          };
        }
      }

      // Strategy 2: Find by role + similar label
      // Use string-based evaluate to avoid tsx __name transformation issues
      if (originalRole && originalAriaLabel) {
        const candidates = await page.evaluate(`
          (function(params) {
            var role = params.role;
            var label = params.label;
            var elements = document.querySelectorAll('[role="' + role + '"]');
            var results = [];

            function norm(s) { return s.toLowerCase().trim(); }
            var normalizedLabel = norm(label);

            for (var i = 0; i < elements.length; i++) {
              var el = elements[i];
              var elLabel = el.getAttribute('aria-label');
              if (!elLabel) continue;

              var normalizedElLabel = norm(elLabel);
              var similarity = 0;

              if (normalizedElLabel === normalizedLabel) {
                similarity = 1.0;
              } else if (normalizedElLabel.indexOf(normalizedLabel) !== -1) {
                similarity = 0.85;
              } else if (normalizedLabel.indexOf(normalizedElLabel) !== -1) {
                similarity = 0.8;
              } else {
                var labelWords = normalizedLabel.split(/\\s+/);
                var elWords = normalizedElLabel.split(/\\s+/);
                var overlap = 0;
                for (var j = 0; j < labelWords.length; j++) {
                  if (elWords.indexOf(labelWords[j]) !== -1) overlap++;
                }
                similarity = overlap / Math.max(labelWords.length, elWords.length);
              }

              if (similarity > 0.4) {
                results.push({
                  selector: '[role="' + role + '"][aria-label="' + elLabel + '"]',
                  similarity: similarity,
                  label: elLabel
                });
              }
            }

            return results.sort(function(a, b) { return b.similarity - a.similarity; }).slice(0, 5);
          })(${JSON.stringify({ role: originalRole, label: originalAriaLabel })})
        `);

        if (candidates.length > 0) {
          const best = candidates[0];
          const element = await page.$(best.selector);
          if (element) {
            const info = await this.getElementInfo(element, page);
            return {
              found: true,
              selector: best.selector,
              confidence: best.similarity * 0.95,
              strategy: this.name,
              details: `Found by role + similar aria-label: "${originalAriaLabel}" -> "${best.label}"`,
              elementInfo: info,
            };
          }
        }
      }

      // Strategy 3: Fuzzy aria-label search across all elements
      // Use string-based evaluate to avoid tsx __name transformation issues
      if (originalAriaLabel) {
        const candidates = await page.evaluate(`
          (function(label) {
            var elements = document.querySelectorAll('[aria-label]');
            var results = [];

            function norm(s) { return s.toLowerCase().trim(); }
            var normalizedLabel = norm(label);

            for (var i = 0; i < elements.length; i++) {
              var el = elements[i];
              var elLabel = el.getAttribute('aria-label');
              var normalizedElLabel = norm(elLabel);
              var similarity = 0;

              if (normalizedElLabel === normalizedLabel) {
                similarity = 1.0;
              } else if (normalizedElLabel.indexOf(normalizedLabel) !== -1) {
                similarity = 0.85;
              } else if (normalizedLabel.indexOf(normalizedElLabel) !== -1) {
                similarity = 0.75;
              } else {
                var common = 0;
                for (var j = 0; j < normalizedLabel.length; j++) {
                  if (normalizedElLabel.indexOf(normalizedLabel[j]) !== -1) common++;
                }
                similarity = common / Math.max(normalizedLabel.length, normalizedElLabel.length);
              }

              if (similarity > 0.5) {
                results.push({
                  label: elLabel,
                  similarity: similarity,
                  tag: el.tagName.toLowerCase()
                });
              }
            }

            return results.sort(function(a, b) { return b.similarity - a.similarity; }).slice(0, 5);
          })(${JSON.stringify(originalAriaLabel)})
        `);

        if (candidates.length > 0) {
          const best = candidates[0];

          // Validate tag if we have stored info
          let confidence = best.similarity * 0.9;
          if (storedInfo && best.tag !== storedInfo.tagName) {
            confidence *= 0.8;
          }

          const element = await page.$(`[aria-label="${best.label}"]`);
          if (element) {
            const info = await this.getElementInfo(element, page);
            return {
              found: true,
              selector: `[aria-label="${best.label}"]`,
              confidence,
              strategy: this.name,
              details: `Fuzzy aria-label match: "${originalAriaLabel}" -> "${best.label}" (${(best.similarity * 100).toFixed(0)}%)`,
              elementInfo: info,
            };
          }
        }
      }

      // Strategy 4: Find by role alone with additional validation
      // Use string-based evaluate to avoid tsx __name transformation issues
      if (originalRole && storedInfo) {
        const candidates = await page.evaluate(`
          (function(params) {
            var role = params.role;
            var info = params.info;
            var elements = document.querySelectorAll('[role="' + role + '"]');
            var results = [];

            for (var i = 0; i < elements.length; i++) {
              var el = elements[i];
              var score = 0;

              if (el.tagName.toLowerCase() === info.tagName) score += 2;
              if (info.textContent && (el.textContent || '').indexOf(info.textContent.slice(0, 20)) !== -1) score += 1.5;
              if (el.hasAttribute('aria-label')) score += 0.5;

              if (score > 1) {
                var nthSelector = '[role="' + role + '"]:nth-of-type(' + (i + 1) + ')';
                var ariaLabel = el.getAttribute('aria-label');
                var selector = ariaLabel
                  ? '[role="' + role + '"][aria-label="' + ariaLabel + '"]'
                  : nthSelector;

                results.push({ selector: selector, score: score });
              }
            }

            return results.sort(function(a, b) { return b.score - a.score; }).slice(0, 3);
          })(${JSON.stringify({ role: originalRole, info: storedInfo })})
        `);

        if (candidates.length > 0) {
          const best = candidates[0];
          const element = await page.$(best.selector);
          if (element) {
            const info = await this.getElementInfo(element, page);
            return {
              found: true,
              selector: best.selector,
              confidence: Math.min(best.score / 4, 0.75),
              strategy: this.name,
              details: `Found by role with attribute validation (score: ${best.score.toFixed(1)})`,
              elementInfo: info,
            };
          }
        }
      }

      return {
        found: false,
        confidence: 0,
        strategy: this.name,
        details: 'No matching ARIA element found',
      };
    } catch (error) {
      return {
        found: false,
        confidence: 0,
        strategy: this.name,
        details: `Error during ARIA healing: ${error instanceof Error ? error.message : String(error)}`,
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

export const ariaStrategy = new AriaStrategy();
