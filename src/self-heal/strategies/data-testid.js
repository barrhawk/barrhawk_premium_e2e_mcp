"use strict";
/**
 * data-testid Selector Strategy
 *
 * Attempts to find an element by data-testid attribute.
 * This is typically the most reliable strategy as test IDs are
 * designed to be stable across changes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.dataTestIdStrategy = exports.DataTestIdStrategy = void 0;
class DataTestIdStrategy {
    name = 'data-testid';
    priority = 2;
    async heal(originalSelector, storedInfo, page) {
        // Extract data-testid from original selector or stored info
        const testIdMatch = originalSelector.match(/\[data-testid=["']?([^"'\]]+)["']?\]/);
        const originalTestId = testIdMatch?.[1] || storedInfo?.testId;
        try {
            // If we have a stored testId, try to find it directly
            if (originalTestId) {
                // Strategy 1: Exact match
                const exactElement = await page.$(`[data-testid="${originalTestId}"]`);
                if (exactElement) {
                    const info = await this.getElementInfo(exactElement, page);
                    return {
                        found: true,
                        selector: `[data-testid="${originalTestId}"]`,
                        confidence: 1.0,
                        strategy: this.name,
                        details: 'Exact data-testid match found',
                        elementInfo: info,
                    };
                }
                // Strategy 2: Partial/similar match
                const candidates = await page.evaluate((originalId) => {
                    const allElements = document.querySelectorAll('[data-testid]');
                    const results = [];
                    const normalize = (s) => s.toLowerCase().replace(/[-_]/g, '');
                    const normalizedOriginal = normalize(originalId);
                    for (const el of allElements) {
                        const testId = el.getAttribute('data-testid');
                        const normalizedTest = normalize(testId);
                        // Calculate similarity
                        let similarity = 0;
                        // Exact normalized match
                        if (normalizedTest === normalizedOriginal) {
                            similarity = 0.95;
                        }
                        // Contains original
                        else if (normalizedTest.includes(normalizedOriginal)) {
                            similarity = 0.8;
                        }
                        // Original contains this
                        else if (normalizedOriginal.includes(normalizedTest)) {
                            similarity = 0.7;
                        }
                        // Levenshtein-like simple comparison
                        else {
                            const commonChars = [...normalizedOriginal].filter(c => normalizedTest.includes(c)).length;
                            similarity = commonChars / Math.max(normalizedOriginal.length, normalizedTest.length);
                        }
                        if (similarity > 0.4) {
                            results.push({ testId, similarity });
                        }
                    }
                    return results.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
                }, originalTestId);
                if (candidates.length > 0) {
                    const best = candidates[0];
                    const element = await page.$(`[data-testid="${best.testId}"]`);
                    if (element) {
                        const info = await this.getElementInfo(element, page);
                        // Validate tag match if we have stored info
                        let confidence = best.similarity;
                        if (storedInfo && info.tagName !== storedInfo.tagName) {
                            confidence *= 0.8;
                        }
                        return {
                            found: true,
                            selector: `[data-testid="${best.testId}"]`,
                            confidence,
                            strategy: this.name,
                            details: `Similar data-testid found: "${originalTestId}" -> "${best.testId}" (similarity: ${(best.similarity * 100).toFixed(0)}%)`,
                            elementInfo: info,
                        };
                    }
                }
            }
            // Strategy 3: If we have stored element info, try to find any element with similar attributes
            // that also has a data-testid
            if (storedInfo) {
                const candidates = await page.evaluate((info) => {
                    const results = [];
                    const elements = document.querySelectorAll('[data-testid]');
                    for (const el of elements) {
                        let score = 0;
                        // Tag match
                        if (el.tagName.toLowerCase() === info.tagName) {
                            score += 2;
                        }
                        // Text content match
                        if (info.textContent && el.textContent?.includes(info.textContent.slice(0, 20))) {
                            score += 1.5;
                        }
                        // Aria label match
                        if (info.ariaLabel && el.getAttribute('aria-label') === info.ariaLabel) {
                            score += 2;
                        }
                        // Class overlap
                        if (info.classes && el.className) {
                            const elClasses = el.className.split(' ');
                            const overlap = info.classes.filter(c => elClasses.includes(c)).length;
                            score += overlap * 0.5;
                        }
                        // Type match for inputs
                        if (info.type && el.getAttribute('type') === info.type) {
                            score += 1;
                        }
                        if (score > 0) {
                            results.push({ testId: el.getAttribute('data-testid'), score });
                        }
                    }
                    return results.sort((a, b) => b.score - a.score).slice(0, 5);
                }, storedInfo);
                if (candidates.length > 0) {
                    const best = candidates[0];
                    const maxScore = 7.5; // Rough max possible
                    const confidence = Math.min(best.score / maxScore, 0.85);
                    const element = await page.$(`[data-testid="${best.testId}"]`);
                    if (element) {
                        const info = await this.getElementInfo(element, page);
                        return {
                            found: true,
                            selector: `[data-testid="${best.testId}"]`,
                            confidence,
                            strategy: this.name,
                            details: `Found data-testid by attribute matching (score: ${best.score.toFixed(1)})`,
                            elementInfo: info,
                        };
                    }
                }
            }
            return {
                found: false,
                confidence: 0,
                strategy: this.name,
                details: 'No matching data-testid found',
            };
        }
        catch (error) {
            return {
                found: false,
                confidence: 0,
                strategy: this.name,
                details: `Error during data-testid healing: ${error instanceof Error ? error.message : String(error)}`,
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
exports.DataTestIdStrategy = DataTestIdStrategy;
exports.dataTestIdStrategy = new DataTestIdStrategy();
//# sourceMappingURL=data-testid.js.map