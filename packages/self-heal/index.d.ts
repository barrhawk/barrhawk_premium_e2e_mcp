/**
 * BarrHawk Self-Healing Selectors
 *
 * Automatic selector recovery when DOM changes.
 * Uses multiple strategies to find elements when original selectors fail.
 *
 * @packageDocumentation
 */
export type { HealingStrategy, StrategyResult, IHealingStrategy, ElementInfo, HealingRequest, HealingResult, SelfHealConfig, ScoringWeights, SelectorMapping, HealingStats, } from './types.js';
export { DEFAULT_CONFIG } from './types.js';
export { SelfHealingManager, getSelfHealingManager, resetSelfHealingManager, healSelector, captureElement, } from './healer.js';
export { IdStrategy, DataTestIdStrategy, AriaStrategy, TextStrategy, CssPathStrategy, idStrategy, dataTestIdStrategy, ariaStrategy, textStrategy, cssPathStrategy, allStrategies, getStrategies, getStrategyNames, } from './strategies/index.js';
export { DEFAULT_WEIGHTS, calculateScore, rankCandidates, meetsThreshold, type ScoreFactors, type ScoreBreakdown, } from './scoring.js';
export { getStorage, resetStorage, type ISelectorStorage, InMemoryStorage, SqliteStorage, } from './storage.js';
//# sourceMappingURL=index.d.ts.map