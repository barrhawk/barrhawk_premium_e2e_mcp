/**
 * Tool: browser_get_text
 */

import { BrowserManager } from '../browser/launcher.js';
import { getText } from '../browser/actions.js';

export async function handleGetText(
  browserManager: BrowserManager,
  args: Record<string, unknown>
): Promise<{ success: boolean; message: string; text?: string }> {
  const page = browserManager.getPage();

  return getText(page, args.selector as string | undefined);
}
