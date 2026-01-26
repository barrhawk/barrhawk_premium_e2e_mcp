/**
 * Selector Mapping Storage
 *
 * SQLite-based storage for persisting successful selector healings.
 * Allows quick lookup of previously healed selectors.
 */
import type { SelectorMapping, HealingStats, HealingStrategy } from './types.js';
/**
 * In-memory fallback storage
 */
declare class InMemoryStorage {
    private mappings;
    private healingHistory;
    getMapping(originalSelector: string, url: string): SelectorMapping | null;
    saveMapping(mapping: Omit<SelectorMapping, 'id' | 'createdAt' | 'lastUsedAt' | 'useCount'>): void;
    recordHealing(originalSelector: string, healedSelector: string | undefined, strategy: HealingStrategy | undefined, confidence: number, url: string, success: boolean): void;
    getStats(): HealingStats;
    invalidateMapping(originalSelector: string, url: string): void;
    clearAll(): void;
    private makeKey;
}
/**
 * SQLite-backed storage
 */
declare class SqliteStorage {
    private db;
    constructor(dbPath: string);
    private init;
    getMapping(originalSelector: string, url: string): SelectorMapping | null;
    saveMapping(mapping: Omit<SelectorMapping, 'id' | 'createdAt' | 'lastUsedAt' | 'useCount'>): void;
    recordHealing(originalSelector: string, healedSelector: string | undefined, strategy: HealingStrategy | undefined, confidence: number, url: string, success: boolean, healingTimeMs?: number): void;
    getStats(): HealingStats;
    invalidateMapping(originalSelector: string, url: string): void;
    clearAll(): void;
    close(): void;
}
/**
 * Storage interface
 */
export interface ISelectorStorage {
    getMapping(originalSelector: string, url: string): SelectorMapping | null;
    saveMapping(mapping: Omit<SelectorMapping, 'id' | 'createdAt' | 'lastUsedAt' | 'useCount'>): void;
    recordHealing(originalSelector: string, healedSelector: string | undefined, strategy: HealingStrategy | undefined, confidence: number, url: string, success: boolean, healingTimeMs?: number): void;
    getStats(): HealingStats;
    invalidateMapping(originalSelector: string, url: string): void;
    clearAll(): void;
}
/**
 * Get or create storage instance
 */
export declare function getStorage(dbPath?: string): Promise<ISelectorStorage>;
/**
 * Reset storage (for testing)
 */
export declare function resetStorage(): void;
export { InMemoryStorage, SqliteStorage };
//# sourceMappingURL=storage.d.ts.map