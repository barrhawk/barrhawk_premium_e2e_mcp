/**
 * Tool: browser_get_elements
 */

import { BrowserManager } from '../browser/launcher.js';
import { getElements } from '../browser/actions.js';

export async function handleGetElements(
  browserManager: BrowserManager,
  args: Record<string, unknown>
): Promise<{
  success: boolean;
  message: string;
  elements?: Array<{ text: string; tag: string; attributes: Record<string, string> }>;
}> {
  const page = browserManager.getPage();

  const selector = args.selector as string;

  if (!selector) {
    return {
      success: false,
      message: 'Selector is required',
    };
  }

  return getElements(page, selector, (args.limit as number) || 20);
}
