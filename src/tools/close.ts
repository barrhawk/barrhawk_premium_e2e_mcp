/**
 * Tool: browser_close
 */

import { BrowserManager } from '../browser/launcher.js';

export async function handleClose(
  browserManager: BrowserManager
): Promise<{ success: boolean; message: string }> {
  return browserManager.closeAll();
}
