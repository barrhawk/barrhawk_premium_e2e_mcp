/**
 * data-testid Selector Strategy
 *
 * Attempts to find an element by data-testid attribute.
 * This is typically the most reliable strategy as test IDs are
 * designed to be stable across changes.
 */
import type { IHealingStrategy, StrategyResult, ElementInfo } from '../types.js';
export declare class DataTestIdStrategy implements IHealingStrategy {
    name: "data-testid";
    priority: number;
    heal(originalSelector: string, storedInfo: ElementInfo | undefined, page: any): Promise<StrategyResult>;
    private getElementInfo;
}
export declare const dataTestIdStrategy: DataTestIdStrategy;
//# sourceMappingURL=data-testid.d.ts.map