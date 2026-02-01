/**
 * CSS Path Selector Strategy
 *
 * Attempts to find an element using structural CSS selectors like
 * nth-child, nth-of-type, and parent-child relationships.
 * Falls back to proximity matching when structure changes.
 */
import type { IHealingStrategy, StrategyResult, ElementInfo } from '../types.js';
export declare class CssPathStrategy implements IHealingStrategy {
    name: "css-path";
    priority: number;
    heal(originalSelector: string, storedInfo: ElementInfo | undefined, page: any): Promise<StrategyResult>;
    private buildSelectors;
    private validateMatch;
    private getElementInfo;
}
export declare const cssPathStrategy: CssPathStrategy;
//# sourceMappingURL=css-path.d.ts.map