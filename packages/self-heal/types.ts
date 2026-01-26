/**
 * Self-Healing Selector Types
 *
 * Type definitions for the self-healing selector system.
 * Enables automatic selector recovery when DOM changes.
 */

// =============================================================================
// Strategy Types
// =============================================================================

/**
 * Available healing strategies
 */
export type HealingStrategy =
  | 'id'
  | 'data-testid'
  | 'aria-label'
  | 'text'
  | 'css-path'
  | 'xpath'
  | 'proximity';

/**
 * Result from a healing strategy
 */
export interface StrategyResult {
  /** Whether the strategy found a candidate */
  found: boolean;
  /** The new selector if found */
  selector?: string;
  /** Confidence score 0-1 */
  confidence: number;
  /** Which strategy produced this result */
  strategy: HealingStrategy;
  /** Details about how the match was made */
  details?: string;
  /** The matched element's attributes for reference */
  elementInfo?: ElementInfo;
}

/**
 * Element information for storage and matching
 */
export interface ElementInfo {
  /** Element tag name */
  tagName: string;
  /** Element ID if present */
  id?: string;
  /** Element class list */
  classes?: string[];
  /** data-testid attribute */
  testId?: string;
  /** aria-label attribute */
  ariaLabel?: string;
  /** aria-role attribute */
  ariaRole?: string;
  /** Inner text content (truncated) */
  textContent?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Name attribute */
  name?: string;
  /** Href for links */
  href?: string;
  /** Type for inputs */
  type?: string;
  /** CSS path to element */
  cssPath?: string;
  /** XPath to element */
  xpath?: string;
  /** Parent element info for proximity matching */
  parent?: {
    tagName: string;
    id?: string;
    classes?: string[];
  };
  /** Sibling info for proximity matching */
  siblings?: {
    before?: string[];
    after?: string[];
  };
}

// =============================================================================
// Healing Types
// =============================================================================

/**
 * Healing request configuration
 */
export interface HealingRequest {
  /** Original selector that failed */
  originalSelector: string;
  /** The page URL where healing is needed */
  url: string;
  /** Optional stored element info from previous successful match */
  storedInfo?: ElementInfo;
  /** Strategies to try (default: all) */
  strategies?: HealingStrategy[];
  /** Minimum confidence to accept (default: 0.7) */
  minConfidence?: number;
  /** Maximum candidates to consider */
  maxCandidates?: number;
}

/**
 * Healing result
 */
export interface HealingResult {
  /** Whether healing was successful */
  healed: boolean;
  /** The new selector if healed */
  newSelector?: string;
  /** Confidence score 0-1 */
  confidence: number;
  /** Which strategy succeeded */
  strategy?: HealingStrategy;
  /** All candidates considered with scores */
  candidates: StrategyResult[];
  /** Time taken to heal in ms */
  healingTimeMs: number;
  /** Details about the healing process */
  details: string;
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Self-healing configuration
 */
export interface SelfHealConfig {
  /** Enable self-healing globally */
  enabled: boolean;
  /** Strategies to use in order of preference */
  strategies: HealingStrategy[];
  /** Minimum confidence score to accept (0-1) */
  minConfidence: number;
  /** Maximum time to spend healing in ms */
  timeoutMs: number;
  /** Whether to persist successful healings */
  persistHealings: boolean;
  /** Path to SQLite database for persistence */
  dbPath?: string;
  /** Whether to emit events for healed selectors */
  emitEvents: boolean;
  /** Custom weights for scoring factors */
  scoringWeights?: ScoringWeights;
}

/**
 * Weights for different scoring factors
 */
export interface ScoringWeights {
  /** Weight for exact attribute matches */
  exactMatch: number;
  /** Weight for partial text matches */
  partialMatch: number;
  /** Weight for structural similarity */
  structure: number;
  /** Weight for proximity to original location */
  proximity: number;
  /** Weight for semantic similarity */
  semantic: number;
}

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: SelfHealConfig = {
  enabled: true,
  strategies: ['id', 'data-testid', 'aria-label', 'text', 'css-path'],
  minConfidence: 0.7,
  timeoutMs: 5000,
  persistHealings: true,
  emitEvents: true,
  scoringWeights: {
    exactMatch: 1.0,
    partialMatch: 0.6,
    structure: 0.4,
    proximity: 0.3,
    semantic: 0.5,
  },
};

// =============================================================================
// Storage Types
// =============================================================================

/**
 * Stored selector mapping
 */
export interface SelectorMapping {
  /** Unique ID */
  id: string;
  /** Original selector */
  originalSelector: string;
  /** Healed selector */
  healedSelector: string;
  /** URL pattern (can include wildcards) */
  urlPattern: string;
  /** Strategy that was used */
  strategy: HealingStrategy;
  /** Confidence when healed */
  confidence: number;
  /** Element info at time of healing */
  elementInfo: ElementInfo;
  /** Number of times this mapping was used */
  useCount: number;
  /** Last time this mapping was used */
  lastUsedAt: Date;
  /** When the mapping was created */
  createdAt: Date;
  /** Whether this mapping is currently valid */
  isValid: boolean;
}

/**
 * Healing statistics
 */
export interface HealingStats {
  /** Total healing attempts */
  totalAttempts: number;
  /** Successful healings */
  successCount: number;
  /** Failed healings */
  failureCount: number;
  /** Success rate percentage */
  successRate: number;
  /** Average confidence of successful healings */
  avgConfidence: number;
  /** Average healing time in ms */
  avgHealingTimeMs: number;
  /** Breakdown by strategy */
  byStrategy: Record<HealingStrategy, {
    attempts: number;
    successes: number;
    avgConfidence: number;
  }>;
  /** Recent healings */
  recentHealings: Array<{
    originalSelector: string;
    healedSelector: string;
    strategy: HealingStrategy;
    confidence: number;
    url: string;
    timestamp: Date;
  }>;
}

// =============================================================================
// Strategy Interface
// =============================================================================

/**
 * Interface for healing strategies
 */
export interface IHealingStrategy {
  /** Strategy name */
  name: HealingStrategy;
  /** Strategy priority (lower = higher priority) */
  priority: number;
  /**
   * Attempt to find the element using this strategy
   * @param originalSelector - The selector that failed
   * @param storedInfo - Stored element info if available
   * @param page - Playwright page object (passed as any to avoid coupling)
   */
  heal(
    originalSelector: string,
    storedInfo: ElementInfo | undefined,
    page: any
  ): Promise<StrategyResult>;
}
