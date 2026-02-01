/**
 * Tool: browser_press_key
 */

import { BrowserManager } from '../browser/launcher.js';
import { pressKey } from '../browser/actions.js';

export async function handlePressKey(
  browserManager: BrowserManager,
  args: Record<string, unknown>
): Promise<{ success: boolean; message: string }> {
  const page = browserManager.getPage();

  const key = args.key as string;

  if (!key) {
    return {
      success: false,
      message: 'Key is required (e.g., "Enter", "Tab", "Escape", "Control+a")',
    };
  }

  return pressKey(page, key);
}
