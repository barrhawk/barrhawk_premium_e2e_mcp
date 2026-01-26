"use strict";
/**
 * ARIA Selector Strategy
 *
 * Attempts to find an element by aria-label, role, or other ARIA attributes.
 * ARIA labels are often stable as they're tied to accessibility requirements.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ariaStrategy = exports.AriaStrategy = void 0;
class AriaStrategy {
    name = 'aria-label';
    priority = 3;
    async heal(originalSelector, storedInfo, page) {
        // Extract aria info from selector or stored info
        const ariaLabelMatch = originalSelector.match(/\[aria-label=["']?([^"'\]]+)["']?\]/);
        const roleMatch = originalSelector.match(/\[role=["']?([^"'\]]+)["']?\]/);
        const originalAriaLabel = ariaLabelMatch?.[1] || storedInfo?.ariaLabel;
        const originalRole = roleMatch?.[1] || storedInfo?.ariaRole;
        try {
            // Strategy 1: Exact aria-label match
            if (originalAriaLabel) {
                const exactElement = await page.$(`[aria-label="${originalAriaLabel}"]`);
                if (exactElement) {
                    const info = await this.getElementInfo(exactElement, page);
                    return {
                        found: true,
                        selector: `[aria-label="${originalAriaLabel}"]`,
                        confidence: 1.0,
                        strategy: this.name,
                        details: 'Exact aria-label match found',
                        elementInfo: info,
                    };
                }
            }
            // Strategy 2: Find by role + similar label
            if (originalRole && originalAriaLabel) {
                const candidates = await page.evaluate(({ role, label }) => {
                    const elements = document.querySelectorAll(`[role="${role}"]`);
                    const results = [];
                    const normalize = (s) => s.toLowerCase().trim();
                    const normalizedLabel = normalize(label);
                    for (const el of elements) {
                        const elLabel = el.getAttribute('aria-label');
                        if (!elLabel)
                            continue;
                        const normalizedElLabel = normalize(elLabel);
                        let similarity = 0;
                        if (normalizedElLabel === normalizedLabel) {
                            similarity = 1.0;
                        }
                        else if (normalizedElLabel.includes(normalizedLabel)) {
                            similarity = 0.85;
                        }
                        else if (normalizedLabel.includes(normalizedElLabel)) {
                            similarity = 0.8;
                        }
                        else {
                            // Word overlap
                            const labelWords = normalizedLabel.split(/\s+/);
                            const elWords = normalizedElLabel.split(/\s+/);
                            const overlap = labelWords.filter(w => elWords.includes(w)).length;
                            similarity = overlap / Math.max(labelWords.length, elWords.length);
                        }
                        if (similarity > 0.4) {
                            results.push({
                                selector: `[role="${role}"][aria-label="${elLabel}"]`,
                                similarity,
                                label: elLabel,
                            });
                        }
                    }
                    return results.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
                }, { role: originalRole, label: originalAriaLabel });
                if (candidates.length > 0) {
                    const best = candidates[0];
                    const element = await page.$(best.selector);
                    if (element) {
                        const info = await this.getElementInfo(element, page);
                        return {
                            found: true,
                            selector: best.selector,
                            confidence: best.similarity * 0.95,
                            strategy: this.name,
                            details: `Found by role + similar aria-label: "${originalAriaLabel}" -> "${best.label}"`,
                            elementInfo: info,
                        };
                    }
                }
            }
            // Strategy 3: Fuzzy aria-label search across all elements
            if (originalAriaLabel) {
                const candidates = await page.evaluate((label) => {
                    const elements = document.querySelectorAll('[aria-label]');
                    const results = [];
                    const normalize = (s) => s.toLowerCase().trim();
                    const normalizedLabel = normalize(label);
                    for (const el of elements) {
                        const elLabel = el.getAttribute('aria-label');
                        const normalizedElLabel = normalize(elLabel);
                        let similarity = 0;
                        if (normalizedElLabel === normalizedLabel) {
                            similarity = 1.0;
                        }
                        else if (normalizedElLabel.includes(normalizedLabel)) {
                            similarity = 0.85;
                        }
                        else if (normalizedLabel.includes(normalizedElLabel)) {
                            similarity = 0.75;
                        }
                        else {
                            // Character-level similarity
                            const common = [...normalizedLabel].filter(c => normalizedElLabel.includes(c)).length;
                            similarity = common / Math.max(normalizedLabel.length, normalizedElLabel.length);
                        }
                        if (similarity > 0.5) {
                            results.push({
                                label: elLabel,
                                similarity,
                                tag: el.tagName.toLowerCase(),
                            });
                        }
                    }
                    return results.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
                }, originalAriaLabel);
                if (candidates.length > 0) {
                    const best = candidates[0];
                    // Validate tag if we have stored info
                    let confidence = best.similarity * 0.9;
                    if (storedInfo && best.tag !== storedInfo.tagName) {
                        confidence *= 0.8;
                    }
                    const element = await page.$(`[aria-label="${best.label}"]`);
                    if (element) {
                        const info = await this.getElementInfo(element, page);
                        return {
                            found: true,
                            selector: `[aria-label="${best.label}"]`,
                            confidence,
                            strategy: this.name,
                            details: `Fuzzy aria-label match: "${originalAriaLabel}" -> "${best.label}" (${(best.similarity * 100).toFixed(0)}%)`,
                            elementInfo: info,
                        };
                    }
                }
            }
            // Strategy 4: Find by role alone with additional validation
            if (originalRole && storedInfo) {
                const candidates = await page.evaluate(({ role, info }) => {
                    const elements = document.querySelectorAll(`[role="${role}"]`);
                    const results = [];
                    for (let i = 0; i < elements.length; i++) {
                        const el = elements[i];
                        let score = 0;
                        // Tag match
                        if (el.tagName.toLowerCase() === info.tagName) {
                            score += 2;
                        }
                        // Text content match
                        if (info.textContent && el.textContent?.includes(info.textContent.slice(0, 20))) {
                            score += 1.5;
                        }
                        // Has aria-label
                        if (el.hasAttribute('aria-label')) {
                            score += 0.5;
                        }
                        if (score > 1) {
                            // Use nth-of-type selector if multiple matches
                            const nthSelector = `[role="${role}"]:nth-of-type(${i + 1})`;
                            const ariaLabel = el.getAttribute('aria-label');
                            const selector = ariaLabel
                                ? `[role="${role}"][aria-label="${ariaLabel}"]`
                                : nthSelector;
                            results.push({ selector, score });
                        }
                    }
                    return results.sort((a, b) => b.score - a.score).slice(0, 3);
                }, { role: originalRole, info: storedInfo });
                if (candidates.length > 0) {
                    const best = candidates[0];
                    const element = await page.$(best.selector);
                    if (element) {
                        const info = await this.getElementInfo(element, page);
                        return {
                            found: true,
                            selector: best.selector,
                            confidence: Math.min(best.score / 4, 0.75),
                            strategy: this.name,
                            details: `Found by role with attribute validation (score: ${best.score.toFixed(1)})`,
                            elementInfo: info,
                        };
                    }
                }
            }
            return {
                found: false,
                confidence: 0,
                strategy: this.name,
                details: 'No matching ARIA element found',
            };
        }
        catch (error) {
            return {
                found: false,
                confidence: 0,
                strategy: this.name,
                details: `Error during ARIA healing: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
    async getElementInfo(element, page) {
        return await page.evaluate((el) => {
            return {
                tagName: el.tagName.toLowerCase(),
                id: el.id || undefined,
                classes: el.className ? el.className.split(' ').filter(Boolean) : undefined,
                testId: el.getAttribute('data-testid') || undefined,
                ariaLabel: el.getAttribute('aria-label') || undefined,
                ariaRole: el.getAttribute('role') || undefined,
                textContent: el.textContent?.trim().slice(0, 100) || undefined,
                placeholder: el.getAttribute('placeholder') || undefined,
                name: el.getAttribute('name') || undefined,
                href: el.getAttribute('href') || undefined,
                type: el.getAttribute('type') || undefined,
            };
        }, element);
    }
}
exports.AriaStrategy = AriaStrategy;
exports.ariaStrategy = new AriaStrategy();
//# sourceMappingURL=aria.js.map