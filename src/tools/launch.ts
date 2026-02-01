/**
 * Tool: browser_launch
 */

import { BrowserManager } from '../browser/launcher.js';
import { Config } from '../config.js';

export async function handleLaunch(
  browserManager: BrowserManager,
  args: Record<string, unknown>,
  config: Config
): Promise<{ success: boolean; message: string }> {
  const headless = typeof args.headless === 'boolean' ? args.headless : config.browser.headless;
  const url = typeof args.url === 'string' ? args.url : undefined;

  return browserManager.launch({ headless, url });
}
