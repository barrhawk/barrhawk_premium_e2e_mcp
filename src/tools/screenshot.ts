/**
 * Tool: browser_screenshot
 */

import { join } from 'path';
import { BrowserManager } from '../browser/launcher.js';
import { screenshot } from '../browser/actions.js';
import { Config } from '../config.js';

export async function handleScreenshot(
  browserManager: BrowserManager,
  args: Record<string, unknown>,
  config: Config
): Promise<{ success: boolean; message: string; image?: string; path?: string }> {
  const page = browserManager.getPage();

  // Determine save path if requested
  let savePath: string | undefined;
  if (args.savePath) {
    savePath = args.savePath as string;
  } else if (args.save === true) {
    // Auto-generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    savePath = join(config.screenshotDir, `screenshot-${timestamp}.png`);
  }

  return screenshot(page, {
    fullPage: args.fullPage === true,
    selector: args.selector as string | undefined,
    path: savePath,
  });
}
