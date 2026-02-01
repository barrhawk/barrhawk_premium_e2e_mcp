/**
 * Tool: browser_click
 */

import { BrowserManager } from '../browser/launcher.js';
import { click } from '../browser/actions.js';

export async function handleClick(
  browserManager: BrowserManager,
  args: Record<string, unknown>
): Promise<{ success: boolean; message: string; healed?: unknown }> {
  const page = browserManager.getPage();
  const healingConfig = browserManager.getSelfHealingConfig();

  return click(page, {
    selector: args.selector as string | undefined,
    text: args.text as string | undefined,
    x: args.x as number | undefined,
    y: args.y as number | undefined,
    button: (args.button as 'left' | 'right' | 'middle') || 'left',
    selfHeal: args.selfHeal !== false && healingConfig.enabled,
    timeout: browserManager.getTimeout(),
    minConfidence: healingConfig.minConfidence,
  });
}
