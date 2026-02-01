"use strict";
/**
 * Text Content Selector Strategy
 *
 * Attempts to find an element by its text content.
 * Uses Playwright's text= selector pattern with fuzzy matching fallbacks.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.textStrategy = exports.TextStrategy = void 0;
class TextStrategy {
    name = 'text';
    priority = 4;
    async heal(originalSelector, storedInfo, page) {
        // Extract text from selector or stored info
        let originalText;
        // Handle text= selector
        const textMatch = originalSelector.match(/^text=["']?(.+?)["']?$/);
        if (textMatch) {
            originalText = textMatch[1];
        }
        // Handle :has-text() pseudo-selector
        const hasTextMatch = originalSelector.match(/:has-text\(["']?(.+?)["']?\)/);
        if (hasTextMatch) {
            originalText = hasTextMatch[1];
        }
        // Fall back to stored text
        if (!originalText) {
            originalText = storedInfo?.textContent;
        }
        if (!originalText) {
            return {
                found: false,
                confidence: 0,
                strategy: this.name,
                details: 'No text content found in selector or stored info',
            };
        }
        // Clean and normalize text for matching
        const normalizedOriginal = this.normalizeText(originalText);
        try {
            // Strategy 1: Exact text match with Playwright's text= selector
            const exactElement = await page.$(`text="${originalText}"`);
            if (exactElement) {
                const info = await this.getElementInfo(exactElement, page);
                // Validate tag if we have stored info
                let confidence = 1.0;
                if (storedInfo && info.tagName !== storedInfo.tagName) {
                    confidence = 0.85;
                }
                return {
                    found: true,
                    selector: `text="${originalText}"`,
                    confidence,
                    strategy: this.name,
                    details: 'Exact text match found',
                    elementInfo: info,
                };
            }
            // Strategy 2: Case-insensitive match
            const caseInsensitiveElement = await page.$(`text="${originalText}"i`);
            if (caseInsensitiveElement) {
                const info = await this.getElementInfo(caseInsensitiveElement, page);
                return {
                    found: true,
                    selector: `text="${originalText}"i`,
                    confidence: 0.95,
                    strategy: this.name,
                    details: 'Case-insensitive text match found',
                    elementInfo: info,
                };
            }
            // Strategy 3: Substring match - find elements containing the text
            const tagFilter = storedInfo?.tagName || '*';
            const candidates = await page.evaluate(({ text, tag, normalized }) => {
                const selector = tag === '*' ? '*' : tag;
                const elements = document.querySelectorAll(selector);
                const results = [];
                const normalizeText = (s) => s
                    .toLowerCase()
                    .replace(/\s+/g, ' ')
                    .trim();
                for (let i = 0; i < elements.length; i++) {
                    const el = elements[i];
                    // Only use direct text content to avoid matching parent containers
                    const directText = Array.from(el.childNodes)
                        .filter(n => n.nodeType === Node.TEXT_NODE)
                        .map(n => n.textContent || '')
                        .join('')
                        .trim();
                    const fullText = el.textContent?.trim() || '';
                    // Prefer direct text, fall back to full text
                    const elText = directText || fullText;
                    if (!elText)
                        continue;
                    const normalizedEl = normalizeText(elText);
                    // Calculate similarity
                    let similarity = 0;
                    // Exact match
                    if (normalizedEl === normalized) {
                        similarity = 1.0;
                    }
                    // Direct text match
                    else if (normalizeText(directText) === normalized) {
                        similarity = 0.98;
                    }
                    // Contains (element contains search text)
                    else if (normalizedEl.includes(normalized)) {
                        // Shorter matches are better (less extra content)
                        const ratio = normalized.length / normalizedEl.length;
                        similarity = 0.7 + ratio * 0.25;
                    }
                    // Reverse contains (search text contains element text)
                    else if (normalized.includes(normalizedEl) && normalizedEl.length > 5) {
                        similarity = 0.6 + (normalizedEl.length / normalized.length) * 0.2;
                    }
                    // Word overlap
                    else {
                        const searchWords = normalized.split(/\s+/);
                        const elWords = normalizedEl.split(/\s+/);
                        const overlap = searchWords.filter(w => elWords.some(ew => ew.includes(w) || w.includes(ew))).length;
                        if (overlap > 0) {
                            similarity = 0.3 + (overlap / searchWords.length) * 0.3;
                        }
                    }
                    if (similarity > 0.4) {
                        results.push({
                            text: elText.slice(0, 100),
                            similarity,
                            tag: el.tagName.toLowerCase(),
                            index: i,
                        });
                    }
                }
                return results.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
            }, { text: originalText, tag: tagFilter, normalized: normalizedOriginal });
            if (candidates.length > 0) {
                const best = candidates[0];
                // Build a reliable selector for this element
                let selector;
                if (best.similarity > 0.9) {
                    selector = `${best.tag}:has-text("${best.text.slice(0, 50)}")`;
                }
                else {
                    selector = `text="${best.text.slice(0, 50)}"`;
                }
                // Try to get the element with this selector
                const element = await page.$(selector);
                if (element) {
                    const info = await this.getElementInfo(element, page);
                    // Additional validation
                    let confidence = best.similarity;
                    if (storedInfo) {
                        if (info.tagName !== storedInfo.tagName) {
                            confidence *= 0.85;
                        }
                        // Bonus if other attributes match
                        if (info.id && info.id === storedInfo.id) {
                            confidence = Math.min(confidence + 0.1, 1.0);
                        }
                    }
                    return {
                        found: true,
                        selector,
                        confidence: Math.min(confidence, 0.95),
                        strategy: this.name,
                        details: `Text similarity match: "${originalText.slice(0, 30)}..." -> "${best.text.slice(0, 30)}..." (${(best.similarity * 100).toFixed(0)}%)`,
                        elementInfo: info,
                    };
                }
            }
            // Strategy 4: Try Playwright's built-in getByText with regex
            if (originalText.length > 3) {
                // Create a flexible regex pattern
                const words = normalizedOriginal.split(/\s+/).filter(w => w.length > 2);
                if (words.length > 0) {
                    const pattern = words.slice(0, 3).join('.*');
                    try {
                        const regexElement = await page.$(`text=/${pattern}/i`);
                        if (regexElement) {
                            const info = await this.getElementInfo(regexElement, page);
                            return {
                                found: true,
                                selector: `text=/${pattern}/i`,
                                confidence: 0.7,
                                strategy: this.name,
                                details: `Regex text match using pattern: /${pattern}/i`,
                                elementInfo: info,
                            };
                        }
                    }
                    catch {
                        // Regex may be invalid, continue
                    }
                }
            }
            return {
                found: false,
                confidence: 0,
                strategy: this.name,
                details: 'No matching text element found',
            };
        }
        catch (error) {
            return {
                found: false,
                confidence: 0,
                strategy: this.name,
                details: `Error during text healing: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
    normalizeText(text) {
        return text.toLowerCase().replace(/\s+/g, ' ').trim();
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
exports.TextStrategy = TextStrategy;
exports.textStrategy = new TextStrategy();
//# sourceMappingURL=text.js.map