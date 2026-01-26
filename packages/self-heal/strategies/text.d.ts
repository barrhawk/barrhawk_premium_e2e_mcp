/**
 * Text Content Selector Strategy
 *
 * Attempts to find an element by its text content.
 * Uses Playwright's text= selector pattern with fuzzy matching fallbacks.
 */
import type { IHealingStrategy, StrategyResult, ElementInfo } from '../types.js';
export declare class TextStrategy implements IHealingStrategy {
    name: "text";
    priority: number;
    heal(originalSelector: string, storedInfo: ElementInfo | undefined, page: any): Promise<StrategyResult>;
    private normalizeText;
    private getElementInfo;
}
export declare const textStrategy: TextStrategy;
//# sourceMappingURL=text.d.ts.map