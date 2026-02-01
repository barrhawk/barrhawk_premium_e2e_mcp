/**
 * Tool: browser_scroll
 */

import { BrowserManager } from '../browser/launcher.js';
import { scroll } from '../browser/actions.js';

export async function handleScroll(
  browserManager: BrowserManager,
  args: Record<string, unknown>
): Promise<{ success: boolean; message: string }> {
  const page = browserManager.getPage();

  const direction = args.direction as 'up' | 'down' | 'left' | 'right';

  if (!direction) {
    return {
      success: false,
      message: 'Direction is required (up, down, left, right)',
    };
  }

  return scroll(page, {
    direction,
    amount: (args.amount as number) || 500,
    selector: args.selector as string | undefined,
  });
}
