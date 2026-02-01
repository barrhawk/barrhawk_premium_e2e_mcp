"use strict";
/**
 * Self-Healing Selector Types
 *
 * Type definitions for the self-healing selector system.
 * Enables automatic selector recovery when DOM changes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = void 0;
/**
 * Default configuration
 */
exports.DEFAULT_CONFIG = {
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
//# sourceMappingURL=types.js.map