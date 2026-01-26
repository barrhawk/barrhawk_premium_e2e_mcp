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
/**
 * All available strategies in priority order
 */
export declare const allStrategies: IHealingStrategy[];
/**
 * Get strategies by name
 */
export declare function getStrategies(names: HealingStrategy[]): IHealingStrategy[];
/**
 * Get all strategy names
 */
export declare function getStrategyNames(): HealingStrategy[];
//# sourceMappingURL=index.d.ts.map