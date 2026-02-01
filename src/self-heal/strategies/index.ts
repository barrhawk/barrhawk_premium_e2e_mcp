/**
 * Self-Healing Strategies Index
 *
 * Exports all healing strategies and provides a unified interface
 * for strategy management.
 */

export { IdStrategy, idStrategy } from './id.js';
export { DataTestIdStrategy, dataTestIdStrategy } from './data-testid.js';
export { AriaStrategy, ariaStrategy } from './aria.js';
export { TextStrategy, textStrategy } from './text.js';
export { CssPathStrategy, cssPathStrategy } from './css-path.js';

import type { IHealingStrategy, HealingStrategy } from '../types.js';
import { idStrategy } from './id.js';
import { dataTestIdStrategy } from './data-testid.js';
import { ariaStrategy } from './aria.js';
import { textStrategy } from './text.js';
import { cssPathStrategy } from './css-path.js';

/**
 * All available strategies in priority order
 */
export const allStrategies: IHealingStrategy[] = [
  idStrategy,
  dataTestIdStrategy,
  ariaStrategy,
  textStrategy,
  cssPathStrategy,
];

/**
 * Get strategies by name
 */
export function getStrategies(names: HealingStrategy[]): IHealingStrategy[] {
  const strategyMap: Record<HealingStrategy, IHealingStrategy> = {
    'id': idStrategy,
    'data-testid': dataTestIdStrategy,
    'aria-label': ariaStrategy,
    'text': textStrategy,
    'css-path': cssPathStrategy,
    'xpath': cssPathStrategy, // Fall back to CSS path for now
    'proximity': cssPathStrategy, // Fall back to CSS path for now
  };

  return names.map(name => strategyMap[name]).filter(Boolean);
}

/**
 * Get all strategy names
 */
export function getStrategyNames(): HealingStrategy[] {
  return allStrategies.map(s => s.name);
}
