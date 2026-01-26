"use strict";
/**
 * Confidence Scoring Algorithm
 *
 * Provides unified scoring and ranking for healing candidates.
 * Combines multiple factors to determine the best match.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_WEIGHTS = void 0;
exports.calculateScore = calculateScore;
exports.rankCandidates = rankCandidates;
exports.meetsThreshold = meetsThreshold;
/**
 * Default scoring weights
 */
exports.DEFAULT_WEIGHTS = {
    exactMatch: 1.0,
    partialMatch: 0.6,
    structure: 0.4,
    proximity: 0.3,
    semantic: 0.5,
};
/**
 * Calculate combined score for a healing candidate
 */
function calculateScore(result, storedInfo, weights = exports.DEFAULT_WEIGHTS) {
    const factors = {
        strategyConfidence: result.confidence,
        attributeMatch: 0,
        textSimilarity: 0,
        structuralMatch: 0,
        priorityBonus: 0,
    };
    // Calculate attribute match if we have both stored and found info
    if (storedInfo && result.elementInfo) {
        factors.attributeMatch = calculateAttributeMatch(result.elementInfo, storedInfo);
        factors.textSimilarity = calculateTextSimilarity(result.elementInfo, storedInfo);
        factors.structuralMatch = calculateStructuralMatch(result.elementInfo, storedInfo);
    }
    // Priority bonus based on strategy reliability
    const priorityMap = {
        'id': 0.15,
        'data-testid': 0.12,
        'aria-label': 0.10,
        'text': 0.05,
        'css-path': 0.02,
    };
    factors.priorityBonus = priorityMap[result.strategy] || 0;
    // Calculate weighted final score
    const finalScore = calculateWeightedScore(factors, weights);
    // Generate explanation
    const explanation = generateExplanation(factors, result.strategy);
    return {
        finalScore,
        factors,
        explanation,
    };
}
/**
 * Calculate attribute match score between found and stored element info
 */
function calculateAttributeMatch(found, stored) {
    let matches = 0;
    let total = 0;
    // Tag name (required match, but counted)
    if (stored.tagName) {
        total += 1;
        if (found.tagName === stored.tagName)
            matches += 1;
    }
    // ID match
    if (stored.id) {
        total += 2; // ID is important
        if (found.id === stored.id)
            matches += 2;
        else if (found.id && found.id.includes(stored.id))
            matches += 1;
    }
    // data-testid match
    if (stored.testId) {
        total += 2;
        if (found.testId === stored.testId)
            matches += 2;
        else if (found.testId && found.testId.includes(stored.testId))
            matches += 1;
    }
    // aria-label match
    if (stored.ariaLabel) {
        total += 1.5;
        if (found.ariaLabel === stored.ariaLabel)
            matches += 1.5;
        else if (found.ariaLabel && found.ariaLabel.includes(stored.ariaLabel))
            matches += 0.75;
    }
    // Type match (important for inputs)
    if (stored.type) {
        total += 1;
        if (found.type === stored.type)
            matches += 1;
    }
    // Name match
    if (stored.name) {
        total += 1;
        if (found.name === stored.name)
            matches += 1;
    }
    // Placeholder match
    if (stored.placeholder) {
        total += 0.5;
        if (found.placeholder === stored.placeholder)
            matches += 0.5;
    }
    // Class overlap
    if (stored.classes && stored.classes.length > 0) {
        const foundClasses = found.classes || [];
        const overlap = stored.classes.filter(c => foundClasses.includes(c)).length;
        total += 1;
        matches += overlap / stored.classes.length;
    }
    return total > 0 ? matches / total : 0;
}
/**
 * Calculate text similarity score
 */
function calculateTextSimilarity(found, stored) {
    if (!stored.textContent || !found.textContent) {
        return 0;
    }
    const storedText = stored.textContent.toLowerCase().trim();
    const foundText = found.textContent.toLowerCase().trim();
    // Exact match
    if (storedText === foundText) {
        return 1.0;
    }
    // Contains relationship
    if (foundText.includes(storedText)) {
        return 0.8 + (storedText.length / foundText.length) * 0.15;
    }
    if (storedText.includes(foundText)) {
        return 0.7 + (foundText.length / storedText.length) * 0.15;
    }
    // Word overlap
    const storedWords = new Set(storedText.split(/\s+/));
    const foundWords = new Set(foundText.split(/\s+/));
    const intersection = [...storedWords].filter(w => foundWords.has(w));
    if (intersection.length > 0) {
        return (intersection.length / Math.max(storedWords.size, foundWords.size)) * 0.6;
    }
    // Character-level Jaccard similarity
    const storedChars = new Set(storedText.replace(/\s/g, ''));
    const foundChars = new Set(foundText.replace(/\s/g, ''));
    const charIntersection = [...storedChars].filter(c => foundChars.has(c));
    const charUnion = new Set([...storedChars, ...foundChars]);
    return (charIntersection.length / charUnion.size) * 0.4;
}
/**
 * Calculate structural similarity (parent, position, etc.)
 */
function calculateStructuralMatch(found, stored) {
    let score = 0;
    let factors = 0;
    // Parent tag match
    if (stored.parent && found.parent) {
        factors += 1;
        if (stored.parent.tagName === found.parent.tagName) {
            score += 0.5;
            // Parent ID match
            if (stored.parent.id && found.parent.id === stored.parent.id) {
                score += 0.3;
            }
            // Parent class overlap
            if (stored.parent.classes && found.parent.classes) {
                const overlap = stored.parent.classes.filter(c => found.parent.classes.includes(c)).length;
                if (overlap > 0) {
                    score += 0.2 * (overlap / stored.parent.classes.length);
                }
            }
        }
    }
    // Same nesting level check via cssPath length
    if (stored.cssPath && found.cssPath) {
        factors += 0.5;
        const storedDepth = (stored.cssPath.match(/>/g) || []).length;
        const foundDepth = (found.cssPath.match(/>/g) || []).length;
        if (storedDepth === foundDepth) {
            score += 0.5;
        }
        else if (Math.abs(storedDepth - foundDepth) <= 1) {
            score += 0.25;
        }
    }
    return factors > 0 ? score / factors : 0;
}
/**
 * Calculate final weighted score
 */
function calculateWeightedScore(factors, weights) {
    // Base is strategy confidence
    let score = factors.strategyConfidence * 0.5;
    // Add weighted factors
    score += factors.attributeMatch * weights.exactMatch * 0.2;
    score += factors.textSimilarity * weights.semantic * 0.15;
    score += factors.structuralMatch * weights.structure * 0.1;
    // Add priority bonus
    score += factors.priorityBonus;
    // Ensure bounds
    return Math.min(Math.max(score, 0), 1);
}
/**
 * Generate human-readable explanation
 */
function generateExplanation(factors, strategy) {
    const parts = [];
    parts.push(`Strategy: ${strategy} (confidence: ${(factors.strategyConfidence * 100).toFixed(0)}%)`);
    if (factors.attributeMatch > 0) {
        parts.push(`Attributes: ${(factors.attributeMatch * 100).toFixed(0)}% match`);
    }
    if (factors.textSimilarity > 0) {
        parts.push(`Text: ${(factors.textSimilarity * 100).toFixed(0)}% similar`);
    }
    if (factors.structuralMatch > 0) {
        parts.push(`Structure: ${(factors.structuralMatch * 100).toFixed(0)}% match`);
    }
    return parts.join(' | ');
}
/**
 * Rank multiple healing candidates
 */
function rankCandidates(results, storedInfo, weights = exports.DEFAULT_WEIGHTS) {
    const scored = results
        .filter(r => r.found)
        .map(result => ({
        result,
        score: calculateScore(result, storedInfo, weights),
    }));
    // Sort by final score descending
    scored.sort((a, b) => b.score.finalScore - a.score.finalScore);
    return scored;
}
/**
 * Check if a score meets the minimum threshold
 */
function meetsThreshold(score, threshold = 0.7) {
    return score >= threshold;
}
//# sourceMappingURL=scoring.js.map