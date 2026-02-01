/**
 * Self-Healing Orchestrator
 *
 * Main entry point for self-healing selectors.
 * Coordinates strategies, scoring, and storage.
 */
import type { SelfHealConfig, HealingRequest, HealingResult, ElementInfo, HealingStats } from './types.js';
/**
 * Self-Healing Selector Manager
 */
export declare class SelfHealingManager {
    private config;
    private storage;
    private initialized;
    constructor(config?: Partial<SelfHealConfig>);
    /**
     * Initialize the manager (loads storage if configured)
     */
    initialize(): Promise<void>;
    /**
     * Update configuration
     */
    configure(config: Partial<SelfHealConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): SelfHealConfig;
    /**
     * Check if self-healing is enabled
     */
    isEnabled(): boolean;
    /**
     * Enable or disable self-healing
     */
    setEnabled(enabled: boolean): void;
    /**
     * Attempt to heal a failed selector
     */
    heal(request: HealingRequest, page: any): Promise<HealingResult>;
    /**
     * Capture element info for future healing
     */
    captureElementInfo(selector: string, page: any): Promise<ElementInfo | null>;
    /**
     * Get healing statistics
     */
    getStats(): Promise<HealingStats>;
    /**
     * Clear all stored mappings and history
     */
    clearStorage(): Promise<void>;
}
/**
 * Get global self-healing manager instance
 */
export declare function getSelfHealingManager(config?: Partial<SelfHealConfig>): SelfHealingManager;
/**
 * Reset global manager (for testing)
 */
export declare function resetSelfHealingManager(): void;
/**
 * Convenience function to heal a selector
 */
export declare function healSelector(originalSelector: string, url: string, page: any, storedInfo?: ElementInfo): Promise<HealingResult>;
/**
 * Convenience function to capture element info
 */
export declare function captureElement(selector: string, page: any): Promise<ElementInfo | null>;
//# sourceMappingURL=healer.d.ts.map