/**
 * ID Selector Strategy
 *
 * Attempts to find an element by ID, falling back to partial ID matching
 * when the exact ID has changed but contains similar components.
 */

import type { IHealingStrategy, StrategyResult, ElementInfo } from '../types.js';

export class IdStrategy implements IHealingStrategy {
  name = 'id' as const;
  priority = 1;

  async heal(
    originalSelector: string,
    storedInfo: ElementInfo | undefined,
    page: any
  ): Promise<StrategyResult> {
    // Extract ID from original selector
    const idMatch = originalSelector.match(/#([a-zA-Z0-9_-]+)/);
    const originalId = idMatch?.[1] || storedInfo?.id;

    if (!originalId) {
      return {
        found: false,
        confidence: 0,
        strategy: this.name,
        details: 'No ID found in original selector or stored info',
      };
    }

    try {
      // Strategy 1: Try exact ID match (in case it was just a page state issue)
      const exactElement = await page.$(`#${originalId}`);
      if (exactElement) {
        const info = await this.getElementInfo(exactElement, page);
        return {
          found: true,
          selector: `#${originalId}`,
          confidence: 1.0,
          strategy: this.name,
          details: 'Exact ID match found',
          elementInfo: info,
        };
      }

      // Strategy 2: Find elements with partial ID match
      // Split ID into components (handles cases like 'submit-btn' -> ['submit', 'btn'])
      // Use string-based evaluate to avoid tsx __name transformation issues
      const idComponents = originalId.split(/[-_]/);
      const candidateIds = await page.evaluate(`
        (function(components) {
          var allElements = document.querySelectorAll('[id]');
          var candidates = [];

          for (var i = 0; i < allElements.length; i++) {
            var el = allElements[i];
            var id = el.id;
            var score = 0;

            for (var j = 0; j < components.length; j++) {
              if (id.toLowerCase().indexOf(components[j].toLowerCase()) !== -1) {
                score += 1;
              }
            }

            if (Math.abs(id.length - components.join('-').length) < 5) {
              score += 0.5;
            }

            if (score > 0) {
              candidates.push({ id: id, score: score });
            }
          }

          return candidates.sort(function(a, b) { return b.score - a.score; }).slice(0, 5);
        })(${JSON.stringify(idComponents)})
      `);

      if (candidateIds.length > 0) {
        const bestMatch = candidateIds[0];
        const maxScore = idComponents.length + 0.5; // Max possible score
        const confidence = Math.min(bestMatch.score / maxScore, 0.95);

        // Verify the element exists and get its info
        const element = await page.$(`#${bestMatch.id}`);
        if (element) {
          const info = await this.getElementInfo(element, page);

          // Additional validation if we have stored info
          if (storedInfo) {
            const tagMatch = info.tagName === storedInfo.tagName;
            const typeMatch = info.type === storedInfo.type;

            if (!tagMatch) {
              // Lower confidence if tag doesn't match
              return {
                found: true,
                selector: `#${bestMatch.id}`,
                confidence: confidence * 0.7,
                strategy: this.name,
                details: `Partial ID match found but tag differs (expected ${storedInfo.tagName}, got ${info.tagName})`,
                elementInfo: info,
              };
            }
          }

          return {
            found: true,
            selector: `#${bestMatch.id}`,
            confidence,
            strategy: this.name,
            details: `Partial ID match: "${originalId}" -> "${bestMatch.id}" (score: ${bestMatch.score}/${maxScore})`,
            elementInfo: info,
          };
        }
      }

      return {
        found: false,
        confidence: 0,
        strategy: this.name,
        details: 'No matching ID found',
      };
    } catch (error) {
      return {
        found: false,
        confidence: 0,
        strategy: this.name,
        details: `Error during ID healing: ${error instanceof Error ? error.message : String(error)}`,
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

export const idStrategy = new IdStrategy();
