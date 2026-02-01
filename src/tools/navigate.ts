/**
 * Tool: browser_navigate
 */

import { BrowserManager } from '../browser/launcher.js';
import { navigate } from '../browser/actions.js';

export async function handleNavigate(
  browserManager: BrowserManager,
  args: Record<string, unknown>
): Promise<{ success: boolean; message: string; url?: string; status?: number }> {
  const page = browserManager.getPage();
  const url = args.url as string;

  if (!url) {
    return {
      success: false,
      message: 'URL is required',
    };
  }

  return navigate(page, url, browserManager.getTimeout());
}
