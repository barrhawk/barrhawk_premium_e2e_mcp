/**
 * Self-Healing Orchestrator
 *
 * Main entry point for self-healing selectors.
 * Coordinates strategies, scoring, and storage.
 */

import type {
  SelfHealConfig,
  HealingRequest,
  HealingResult,
  ElementInfo,
  HealingStats,
  StrategyResult,
  DEFAULT_CONFIG,
} from './types.js';
import { allStrategies, getStrategies } from './strategies/index.js';
import { calculateScore, rankCandidates, meetsThreshold } from './scoring.js';
import { getStorage, type ISelectorStorage } from './storage.js';

// Default configuration
const defaultConfig: SelfHealConfig = {
  enabled: true,
  strategies: ['id', 'data-testid', 'aria-label', 'text', 'css-path'],
  minConfidence: 0.7,
  timeoutMs: 5000,
  persistHealings: true,
  emitEvents: true,
};

/**
 * Self-Healing Selector Manager
 */
export class SelfHealingManager {
  private config: SelfHealConfig;
  private storage: ISelectorStorage | null = null;
  private initialized: boolean = false;

  constructor(config: Partial<SelfHealConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Initialize the manager (loads storage if configured)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.persistHealings) {
      this.storage = await getStorage(this.config.dbPath);
    }

    this.initialized = true;
  }

  /**
   * Update configuration
   */
  configure(config: Partial<SelfHealConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): SelfHealConfig {
    return { ...this.config };
  }

  /**
   * Check if self-healing is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable or disable self-healing
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Attempt to heal a failed selector
   */
  async heal(request: HealingRequest, page: any): Promise<HealingResult> {
    const startTime = Date.now();

    if (!this.config.enabled) {
      return {
        healed: false,
        confidence: 0,
        candidates: [],
        healingTimeMs: 0,
        details: 'Self-healing is disabled',
      };
    }

    await this.initialize();

    const {
      originalSelector,
      url,
      storedInfo,
      strategies = this.config.strategies,
      minConfidence = this.config.minConfidence,
    } = request;

    // Check if we have a cached mapping
    if (this.storage) {
      const cached = this.storage.getMapping(originalSelector, url);
      if (cached && cached.isValid) {
        // Verify the cached selector still works
        try {
          const element = await page.$(cached.healedSelector);
          if (element) {
            const healingTimeMs = Date.now() - startTime;
            return {
              healed: true,
              newSelector: cached.healedSelector,
              confidence: cached.confidence,
              strategy: cached.strategy,
              candidates: [],
              healingTimeMs,
              details: `Used cached mapping (used ${cached.useCount} times)`,
            };
          } else {
            // Cached mapping is no longer valid
            this.storage.invalidateMapping(originalSelector, url);
          }
        } catch {
          this.storage.invalidateMapping(originalSelector, url);
        }
      }
    }

    // Get strategies to try
    const strategiesToTry = getStrategies(strategies);
    const candidates: StrategyResult[] = [];

    // Try each strategy with timeout
    const timeoutPromise = new Promise<void>(resolve =>
      setTimeout(resolve, this.config.timeoutMs)
    );

    const healingPromise = (async () => {
      for (const strategy of strategiesToTry) {
        try {
          const result = await strategy.heal(originalSelector, storedInfo, page);

          if (result.found) {
            candidates.push(result);

            // Early exit if we found a high-confidence match
            if (result.confidence >= 0.95) {
              break;
            }
          }
        } catch (error) {
          console.warn(`Strategy ${strategy.name} failed:`, error);
          candidates.push({
            found: false,
            confidence: 0,
            strategy: strategy.name,
            details: `Error: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
    })();

    // Race between healing and timeout
    await Promise.race([healingPromise, timeoutPromise]);

    const healingTimeMs = Date.now() - startTime;

    // Rank candidates
    const ranked = rankCandidates(candidates, storedInfo, this.config.scoringWeights);

    if (ranked.length === 0) {
      // No candidates found
      if (this.storage) {
        this.storage.recordHealing(originalSelector, undefined, undefined, 0, url, false, healingTimeMs);
      }

      return {
        healed: false,
        confidence: 0,
        candidates,
        healingTimeMs,
        details: 'No valid candidates found',
      };
    }

    const best = ranked[0];

    // Check if best candidate meets threshold
    if (!meetsThreshold(best.score.finalScore, minConfidence)) {
      if (this.storage) {
        this.storage.recordHealing(
          originalSelector,
          best.result.selector,
          best.result.strategy,
          best.score.finalScore,
          url,
          false,
          healingTimeMs
        );
      }

      return {
        healed: false,
        confidence: best.score.finalScore,
        strategy: best.result.strategy,
        candidates,
        healingTimeMs,
        details: `Best candidate (${(best.score.finalScore * 100).toFixed(0)}%) below threshold (${(minConfidence * 100).toFixed(0)}%)`,
      };
    }

    // Success! Save the mapping
    if (this.storage && best.result.selector && best.result.elementInfo) {
      this.storage.saveMapping({
        originalSelector,
        healedSelector: best.result.selector,
        urlPattern: url,
        strategy: best.result.strategy,
        confidence: best.score.finalScore,
        elementInfo: best.result.elementInfo,
        isValid: true,
      });

      this.storage.recordHealing(
        originalSelector,
        best.result.selector,
        best.result.strategy,
        best.score.finalScore,
        url,
        true,
        healingTimeMs
      );
    }

    return {
      healed: true,
      newSelector: best.result.selector,
      confidence: best.score.finalScore,
      strategy: best.result.strategy,
      candidates,
      healingTimeMs,
      details: `Healed via ${best.result.strategy}: ${best.score.explanation}`,
    };
  }

  /**
   * Capture element info for future healing
   */
  async captureElementInfo(selector: string, page: any): Promise<ElementInfo | null> {
    try {
      const element = await page.$(selector);
      if (!element) return null;

      return await page.evaluate((el: Element) => {
        // Get CSS path
        const getCssPath = (startElement: Element): string => {
          const parts: string[] = [];
          let node: Element | null = startElement;

          while (node && node !== document.body) {
            let sel = node.tagName.toLowerCase();

            if (node.id) {
              sel = `#${node.id}`;
              parts.unshift(sel);
              break;
            }

            const parentNode: Element | null = node.parentElement;
            if (parentNode) {
              const tag = node.tagName;
              const children = parentNode.children;
              let count = 0;
              let idx = 0;
              for (let i = 0; i < children.length; i++) {
                if (children[i].tagName === tag) {
                  count++;
                  if (children[i] === node) {
                    idx = count;
                  }
                }
              }
              if (count > 1) {
                sel += `:nth-of-type(${idx})`;
              }
            }

            parts.unshift(sel);
            node = parentNode;
          }

          return parts.join(' > ');
        };

        // Get parent info
        const elParent = el.parentElement;
        const parentInfo = elParent
          ? {
              tagName: elParent.tagName.toLowerCase(),
              id: elParent.id || undefined,
              classes: elParent.className ? elParent.className.split(' ').filter(Boolean) : undefined,
            }
          : undefined;

        // Get sibling text for context
        const siblings = {
          before: [] as string[],
          after: [] as string[],
        };

        let sibling = el.previousElementSibling;
        let count = 0;
        while (sibling && count < 2) {
          siblings.before.unshift(sibling.textContent?.trim().slice(0, 50) || '');
          sibling = sibling.previousElementSibling;
          count++;
        }

        sibling = el.nextElementSibling;
        count = 0;
        while (sibling && count < 2) {
          siblings.after.push(sibling.textContent?.trim().slice(0, 50) || '');
          sibling = sibling.nextElementSibling;
          count++;
        }

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
          cssPath: getCssPath(el),
          parent: parentInfo,
          siblings,
        };
      }, element);
    } catch (error) {
      console.warn(`Failed to capture element info for ${selector}:`, error);
      return null;
    }
  }

  /**
   * Get healing statistics
   */
  async getStats(): Promise<HealingStats> {
    await this.initialize();

    if (!this.storage) {
      return {
        totalAttempts: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        avgConfidence: 0,
        avgHealingTimeMs: 0,
        byStrategy: {
          'id': { attempts: 0, successes: 0, avgConfidence: 0 },
          'data-testid': { attempts: 0, successes: 0, avgConfidence: 0 },
          'aria-label': { attempts: 0, successes: 0, avgConfidence: 0 },
          'text': { attempts: 0, successes: 0, avgConfidence: 0 },
          'css-path': { attempts: 0, successes: 0, avgConfidence: 0 },
          'xpath': { attempts: 0, successes: 0, avgConfidence: 0 },
          'proximity': { attempts: 0, successes: 0, avgConfidence: 0 },
        },
        recentHealings: [],
      };
    }

    return this.storage.getStats();
  }

  /**
   * Clear all stored mappings and history
   */
  async clearStorage(): Promise<void> {
    await this.initialize();
    if (this.storage) {
      this.storage.clearAll();
    }
  }
}

// Global manager instance
let globalManager: SelfHealingManager | null = null;

/**
 * Get global self-healing manager instance
 */
export function getSelfHealingManager(config?: Partial<SelfHealConfig>): SelfHealingManager {
  if (!globalManager) {
    globalManager = new SelfHealingManager(config);
  } else if (config) {
    globalManager.configure(config);
  }
  return globalManager;
}

/**
 * Reset global manager (for testing)
 */
export function resetSelfHealingManager(): void {
  globalManager = null;
}

/**
 * Convenience function to heal a selector
 */
export async function healSelector(
  originalSelector: string,
  url: string,
  page: any,
  storedInfo?: ElementInfo
): Promise<HealingResult> {
  const manager = getSelfHealingManager();
  return manager.heal(
    {
      originalSelector,
      url,
      storedInfo,
    },
    page
  );
}

/**
 * Convenience function to capture element info
 */
export async function captureElement(selector: string, page: any): Promise<ElementInfo | null> {
  const manager = getSelfHealingManager();
  return manager.captureElementInfo(selector, page);
}
