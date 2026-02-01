/**
 * Tool: browser_wait
 */

import { BrowserManager } from '../browser/launcher.js';
import { waitFor } from '../browser/actions.js';

export async function handleWait(
  browserManager: BrowserManager,
  args: Record<string, unknown>
): Promise<{ success: boolean; message: string }> {
  const page = browserManager.getPage();

  return waitFor(page, {
    selector: args.selector as string | undefined,
    state: (args.state as 'visible' | 'hidden' | 'attached' | 'detached') || 'visible',
    timeout: (args.timeout as number) || browserManager.getTimeout(),
  });
}
