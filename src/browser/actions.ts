/**
 * Browser Actions - Core action implementations
 */

import { Page, ElementHandle } from 'playwright';
import { healSelector, type HealingResult } from '../self-heal/index.js';

export interface ActionResult {
  success: boolean;
  message: string;
  healed?: HealingResult;
  [key: string]: unknown;
}

/**
 * Click on an element
 */
export async function click(
  page: Page,
  options: {
    selector?: string;
    text?: string;
    x?: number;
    y?: number;
    button?: 'left' | 'right' | 'middle';
    selfHeal?: boolean;
    timeout?: number;
    minConfidence?: number;
  }
): Promise<ActionResult> {
  const { selector, text, x, y, button = 'left', selfHeal = true, timeout = 30000, minConfidence = 0.7 } = options;

  try {
    // Coordinate-based click
    if (x !== undefined && y !== undefined) {
      await page.mouse.click(x, y, { button });
      return {
        success: true,
        message: `Clicked at coordinates (${x}, ${y})`,
      };
    }

    // Text-based click
    if (text) {
      const element = page.getByText(text, { exact: false }).first();
      await element.click({ button, timeout });
      return {
        success: true,
        message: `Clicked element with text "${text}"`,
      };
    }

    // Selector-based click
    if (selector) {
      console.error(`[CLICK] Attempting selector: ${selector}, selfHeal: ${selfHeal}`);

      // First check if element exists with a short timeout
      let elementExists = false;
      try {
        await page.waitForSelector(selector, { timeout: 2000, state: 'visible' });
        elementExists = true;
        console.error(`[CLICK] Element found directly`);
      } catch {
        elementExists = false;
        console.error(`[CLICK] Element NOT found, will try healing`);
      }

      if (elementExists) {
        // Element found, click it
        await page.click(selector, { button, timeout });
        return {
          success: true,
          message: `Clicked "${selector}"`,
        };
      }

      // Element not found, try self-healing if enabled
      if (selfHeal) {
        console.error(`[CLICK] Starting self-healing for: ${selector}`);
        const url = page.url();
        const healResult = await healSelector(selector, url, page);
        console.error(`[CLICK] Healing result: healed=${healResult.healed}, newSelector=${healResult.newSelector}, strategy=${healResult.strategy}`);
        if (healResult.healed && healResult.newSelector) {
          // Handle text= selectors specially
          if (healResult.newSelector.startsWith('text=')) {
            const text = healResult.newSelector.substring(5).replace(/^["']|["']$/g, '');
            await page.getByText(text, { exact: false }).first().click({ button, timeout });
          } else {
            await page.click(healResult.newSelector, { button, timeout });
          }
          return {
            success: true,
            message: `Clicked "${healResult.newSelector}" (healed from "${selector}" via ${healResult.strategy})`,
            healed: healResult,
          };
        }
      }

      // No healing or healing failed
      throw new Error(`Element not found: ${selector}`);
    }

    return {
      success: false,
      message: 'Must provide selector, text, or coordinates (x, y)',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Click failed: ${message}`,
    };
  }
}

/**
 * Type text into an element
 */
export async function type(
  page: Page,
  options: {
    selector: string;
    text: string;
    clear?: boolean;
    pressEnter?: boolean;
    selfHeal?: boolean;
    timeout?: number;
    minConfidence?: number;
  }
): Promise<ActionResult> {
  const { selector, text, clear = true, pressEnter = false, selfHeal = true, timeout = 30000, minConfidence = 0.7 } = options;

  try {
    let targetSelector = selector;
    let healResult: HealingResult | undefined;

    // Try to find element, with self-healing
    try {
      await page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
    } catch {
      if (selfHeal) {
        const url = page.url();
        healResult = await healSelector(selector, url, page);
        if (healResult.healed && healResult.newSelector) {
          targetSelector = healResult.newSelector;
        } else {
          throw new Error(`Selector not found: ${selector}`);
        }
      } else {
        throw new Error(`Selector not found: ${selector}`);
      }
    }

    // Clear existing text if requested
    if (clear) {
      await page.fill(targetSelector, '');
    }

    // Type the text
    await page.fill(targetSelector, text);

    // Press Enter if requested
    if (pressEnter) {
      await page.press(targetSelector, 'Enter');
    }

    const result: ActionResult = {
      success: true,
      message: `Typed "${text.length > 50 ? text.substring(0, 50) + '...' : text}" into "${targetSelector}"${pressEnter ? ' and pressed Enter' : ''}`,
    };

    if (healResult?.healed) {
      result.healed = healResult;
      result.message = `Typed into "${targetSelector}" (healed from "${selector}")`;
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Type failed: ${message}`,
    };
  }
}

/**
 * Navigate to a URL
 */
export async function navigate(
  page: Page,
  url: string,
  timeout: number = 30000
): Promise<ActionResult> {
  try {
    // Ensure URL has protocol
    let targetUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      targetUrl = 'https://' + url;
    }

    const response = await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout,
    });

    const finalUrl = page.url();
    const status = response?.status() ?? 0;

    return {
      success: true,
      message: `Navigated to ${finalUrl}`,
      url: finalUrl,
      status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Navigation failed: ${message}`,
    };
  }
}

/**
 * Take a screenshot
 */
export async function screenshot(
  page: Page,
  options: {
    fullPage?: boolean;
    selector?: string;
    path?: string;
  } = {}
): Promise<{ success: boolean; message: string; image?: string; path?: string }> {
  const { fullPage = false, selector, path } = options;

  try {
    let buffer: Buffer;

    if (selector) {
      const element = await page.$(selector);
      if (!element) {
        return {
          success: false,
          message: `Element not found: ${selector}`,
        };
      }
      buffer = await element.screenshot({ type: 'png' });
    } else {
      buffer = await page.screenshot({
        type: 'png',
        fullPage,
      });
    }

    // Save to disk if path provided
    if (path) {
      const fs = await import('fs');
      fs.writeFileSync(path, buffer);
    }

    return {
      success: true,
      message: `Screenshot captured${selector ? ` of "${selector}"` : ''}${fullPage ? ' (full page)' : ''}`,
      image: buffer.toString('base64'),
      path: path,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Screenshot failed: ${message}`,
    };
  }
}

/**
 * Get text content from page or element
 */
export async function getText(
  page: Page,
  selector?: string
): Promise<ActionResult & { text?: string }> {
  try {
    let text: string;

    if (selector) {
      const element = await page.$(selector);
      if (!element) {
        return {
          success: false,
          message: `Element not found: ${selector}`,
        };
      }
      text = (await element.textContent()) ?? '';
    } else {
      text = await page.evaluate(() => document.body.innerText);
    }

    // Truncate if very long
    const truncated = text.length > 10000;
    const displayText = truncated ? text.substring(0, 10000) + '...' : text;

    return {
      success: true,
      message: `Got text${selector ? ` from "${selector}"` : ' from page'}${truncated ? ' (truncated)' : ''}`,
      text: displayText,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Get text failed: ${message}`,
    };
  }
}

/**
 * Wait for a condition
 */
export async function waitFor(
  page: Page,
  options: {
    selector?: string;
    state?: 'visible' | 'hidden' | 'attached' | 'detached';
    timeout?: number;
  }
): Promise<ActionResult> {
  const { selector, state = 'visible', timeout = 30000 } = options;

  try {
    if (selector) {
      await page.waitForSelector(selector, { state, timeout });
      return {
        success: true,
        message: `Element "${selector}" is ${state}`,
      };
    } else {
      // Just wait for timeout
      await page.waitForTimeout(timeout);
      return {
        success: true,
        message: `Waited ${timeout}ms`,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Wait failed: ${message}`,
    };
  }
}

/**
 * Scroll the page or element
 */
export async function scroll(
  page: Page,
  options: {
    direction: 'up' | 'down' | 'left' | 'right';
    amount?: number;
    selector?: string;
  }
): Promise<ActionResult> {
  const { direction, amount = 500, selector } = options;

  try {
    const scrollX = direction === 'left' ? -amount : direction === 'right' ? amount : 0;
    const scrollY = direction === 'up' ? -amount : direction === 'down' ? amount : 0;

    if (selector) {
      await page.$eval(
        selector,
        (el, { x, y }) => {
          el.scrollBy(x, y);
        },
        { x: scrollX, y: scrollY }
      );
    } else {
      await page.evaluate(
        ({ x, y }) => {
          window.scrollBy(x, y);
        },
        { x: scrollX, y: scrollY }
      );
    }

    return {
      success: true,
      message: `Scrolled ${direction} by ${amount}px${selector ? ` in "${selector}"` : ''}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Scroll failed: ${message}`,
    };
  }
}

/**
 * Press a keyboard key
 */
export async function pressKey(
  page: Page,
  key: string
): Promise<ActionResult> {
  try {
    await page.keyboard.press(key);
    return {
      success: true,
      message: `Pressed key "${key}"`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Press key failed: ${message}`,
    };
  }
}

/**
 * Get elements matching a selector
 */
export async function getElements(
  page: Page,
  selector: string,
  limit: number = 20
): Promise<ActionResult & { elements?: Array<{ text: string; tag: string; attributes: Record<string, string> }> }> {
  try {
    const elements = await page.$$(selector);
    const results: Array<{ text: string; tag: string; attributes: Record<string, string> }> = [];

    for (const element of elements.slice(0, limit)) {
      const text = (await element.textContent())?.trim() ?? '';
      const tag = await element.evaluate((el) => el.tagName.toLowerCase());
      const attributes: Record<string, string> = await element.evaluate((el) => {
        const attrs: Record<string, string> = {};
        for (const attr of el.attributes) {
          attrs[attr.name] = attr.value;
        }
        return attrs;
      });

      results.push({ text: text.substring(0, 200), tag, attributes });
    }

    return {
      success: true,
      message: `Found ${elements.length} elements matching "${selector}"${elements.length > limit ? ` (showing first ${limit})` : ''}`,
      elements: results,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Get elements failed: ${message}`,
    };
  }
}
