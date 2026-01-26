/**
 * Confidence Scoring Algorithm
 *
 * Provides unified scoring and ranking for healing candidates.
 * Combines multiple factors to determine the best match.
 */
import type { StrategyResult, ElementInfo, ScoringWeights } from './types.js';
/**
 * Default scoring weights
 */
export declare const DEFAULT_WEIGHTS: ScoringWeights;
/**
 * Score factors for a healing candidate
 */
export interface ScoreFactors {
    /** Strategy confidence (0-1) */
    strategyConfidence: number;
    /** Attribute match score (0-1) */
    attributeMatch: number;
    /** Text similarity score (0-1) */
    textSimilarity: number;
    /** Structural similarity (0-1) */
    structuralMatch: number;
    /** Strategy priority bonus (higher priority strategies get bonus) */
    priorityBonus: number;
}
/**
 * Detailed score breakdown
 */
export interface ScoreBreakdown {
    /** Final combined score */
    finalScore: number;
    /** Individual factors */
    factors: ScoreFactors;
    /** Human-readable explanation */
    explanation: string;
}
/**
 * Calculate combined score for a healing candidate
 */
export declare function calculateScore(result: StrategyResult, storedInfo: ElementInfo | undefined, weights?: ScoringWeights): ScoreBreakdown;
/**
 * Rank multiple healing candidates
 */
export declare function rankCandidates(results: StrategyResult[], storedInfo: ElementInfo | undefined, weights?: ScoringWeights): Array<{
    result: StrategyResult;
    score: ScoreBreakdown;
}>;
/**
 * Check if a score meets the minimum threshold
 */
export declare function meetsThreshold(score: number, threshold?: number): boolean;
//# sourceMappingURL=scoring.d.ts.map