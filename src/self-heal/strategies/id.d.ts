/**
 * ID Selector Strategy
 *
 * Attempts to find an element by ID, falling back to partial ID matching
 * when the exact ID has changed but contains similar components.
 */
import type { IHealingStrategy, StrategyResult, ElementInfo } from '../types.js';
export declare class IdStrategy implements IHealingStrategy {
    name: "id";
    priority: number;
    heal(originalSelector: string, storedInfo: ElementInfo | undefined, page: any): Promise<StrategyResult>;
    private getElementInfo;
}
export declare const idStrategy: IdStrategy;
//# sourceMappingURL=id.d.ts.map