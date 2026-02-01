/**
 * Tool: browser_type
 */

import { BrowserManager } from '../browser/launcher.js';
import { type } from '../browser/actions.js';

export async function handleType(
  browserManager: BrowserManager,
  args: Record<string, unknown>
): Promise<{ success: boolean; message: string; healed?: unknown }> {
  const page = browserManager.getPage();
  const healingConfig = browserManager.getSelfHealingConfig();

  const selector = args.selector as string;
  const text = args.text as string;

  if (!selector) {
    return {
      success: false,
      message: 'Selector is required',
    };
  }

  if (text === undefined) {
    return {
      success: false,
      message: 'Text is required',
    };
  }

  return type(page, {
    selector,
    text,
    clear: args.clear !== false,
    pressEnter: args.pressEnter === true,
    selfHeal: args.selfHeal !== false && healingConfig.enabled,
    timeout: browserManager.getTimeout(),
    minConfidence: healingConfig.minConfidence,
  });
}
