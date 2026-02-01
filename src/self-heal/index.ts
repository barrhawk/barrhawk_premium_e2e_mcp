/**
 * BarrHawk Self-Healing Selectors
 *
 * Automatic selector recovery when DOM changes.
 * Uses multiple strategies to find elements when original selectors fail.
 *
 * @packageDocumentation
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // Strategy types
  HealingStrategy,
  StrategyResult,
  IHealingStrategy,
  ElementInfo,

  // Healing types
  HealingRequest,
  HealingResult,

  // Configuration
  SelfHealConfig,
  ScoringWeights,

  // Storage types
  SelectorMapping,
  HealingStats,
} from './types.js';

export { DEFAULT_CONFIG } from './types.js';

// =============================================================================
// Healer
// =============================================================================

export {
  SelfHealingManager,
  getSelfHealingManager,
  resetSelfHealingManager,
  healSelector,
  captureElement,
} from './healer.js';

// =============================================================================
// Strategies
// =============================================================================

export {
  // Strategy classes
  IdStrategy,
  DataTestIdStrategy,
  AriaStrategy,
  TextStrategy,
  CssPathStrategy,

  // Strategy instances
  idStrategy,
  dataTestIdStrategy,
  ariaStrategy,
  textStrategy,
  cssPathStrategy,

  // Strategy utilities
  allStrategies,
  getStrategies,
  getStrategyNames,
} from './strategies/index.js';

// =============================================================================
// Scoring
// =============================================================================

export {
  DEFAULT_WEIGHTS,
  calculateScore,
  rankCandidates,
  meetsThreshold,
  type ScoreFactors,
  type ScoreBreakdown,
} from './scoring.js';

// =============================================================================
// Storage
// =============================================================================

export {
  getStorage,
  resetStorage,
  type ISelectorStorage,
  InMemoryStorage,
  SqliteStorage,
} from './storage.js';
