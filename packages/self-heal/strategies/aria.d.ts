/**
 * ARIA Selector Strategy
 *
 * Attempts to find an element by aria-label, role, or other ARIA attributes.
 * ARIA labels are often stable as they're tied to accessibility requirements.
 */
import type { IHealingStrategy, StrategyResult, ElementInfo } from '../types.js';
export declare class AriaStrategy implements IHealingStrategy {
    name: "aria-label";
    priority: number;
    heal(originalSelector: string, storedInfo: ElementInfo | undefined, page: any): Promise<StrategyResult>;
    private getElementInfo;
}
export declare const ariaStrategy: AriaStrategy;
//# sourceMappingURL=aria.d.ts.map