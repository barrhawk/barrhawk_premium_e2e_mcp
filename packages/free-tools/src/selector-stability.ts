/**
 * Selector Stability Scoring - Free Tier
 *
 * Heuristic-based selector reliability scoring without AI.
 * Rates selectors by how likely they are to break over time.
 */

import type { Page } from 'playwright';

// ============================================================================
// Types
// ============================================================================

export interface StabilityScoreOptions {
  page: Page;
  selector: string;
}

export interface StabilityFactors {
  type: 'id' | 'data-testid' | 'aria' | 'name' | 'role' | 'class' | 'tag' | 'xpath' | 'css-complex' | 'text';
  hasId: boolean;
  hasDataTestId: boolean;
  hasAriaLabel: boolean;
  hasName: boolean;
  hasRole: boolean;
  depth: number;
  specificity: number;
  isDynamic: boolean;
  hasPositionalIndex: boolean;
  classCount: number;
  isUnique: boolean;
}

export interface StabilityScoreResult {
  score: number;  // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  factors: StabilityFactors;
  risks: string[];
  suggestions: string[];
  message: string;
}

// ============================================================================
// Scoring Weights
// ============================================================================

const SELECTOR_TYPE_SCORES: Record<string, number> = {
  'id': 95,
  'data-testid': 92,
  'aria': 85,
  'name': 80,
  'role': 75,
  'text': 60,
  'class': 50,
  'tag': 40,
  'css-complex': 35,
  'xpath': 25,
};

const PENALTIES = {
  dynamic: -20,        // Contains dynamic-looking patterns
  positional: -15,     // Uses nth-child, :first, etc.
  deepNesting: -10,    // More than 3 levels deep
  multiClass: -5,      // Multiple classes (per extra class)
  notUnique: -10,      // Matches multiple elements
  fragileClass: -8,    // Class looks auto-generated
};

const BONUSES = {
  hasDataTestId: 10,
  hasAriaLabel: 8,
  hasId: 5,
  hasName: 5,
  isUnique: 5,
};

// ============================================================================
// Implementation
// ============================================================================

/**
 * Calculate stability score for a selector
 */
export async function selectorStabilityScore(options: StabilityScoreOptions): Promise<StabilityScoreResult> {
  const { page, selector } = options;
  const risks: string[] = [];
  const suggestions: string[] = [];

  // Analyze selector syntax
  const selectorType = detectSelectorType(selector);
  const isDynamic = detectDynamicPatterns(selector);
  const hasPositionalIndex = detectPositionalIndex(selector);
  const depth = calculateDepth(selector);
  const specificity = calculateSpecificity(selector);
  const classCount = countClasses(selector);

  // Check element on page
  let isUnique = false;
  let hasId = false;
  let hasDataTestId = false;
  let hasAriaLabel = false;
  let hasName = false;
  let hasRole = false;

  try {
    const elements = await page.$$(selector);
    isUnique = elements.length === 1;

    if (!isUnique && elements.length === 0) {
      return {
        score: 0,
        grade: 'F',
        factors: {
          type: selectorType,
          hasId: false,
          hasDataTestId: false,
          hasAriaLabel: false,
          hasName: false,
          hasRole: false,
          depth,
          specificity,
          isDynamic,
          hasPositionalIndex,
          classCount,
          isUnique: false,
        },
        risks: ['Selector does not match any elements'],
        suggestions: ['Verify the selector is correct for the current page state'],
        message: 'Selector not found - score: 0/100 (F)',
      };
    }

    if (elements.length > 0) {
      const attrs = await elements[0].evaluate((el: Element) => ({
        id: el.id,
        dataTestId: el.getAttribute('data-testid'),
        ariaLabel: el.getAttribute('aria-label'),
        name: el.getAttribute('name'),
        role: el.getAttribute('role'),
      }));

      hasId = !!attrs.id;
      hasDataTestId = !!attrs.dataTestId;
      hasAriaLabel = !!attrs.ariaLabel;
      hasName = !!attrs.name;
      hasRole = !!attrs.role;
    }
  } catch {
    risks.push('Selector syntax may be invalid');
  }

  // Calculate base score
  let score = SELECTOR_TYPE_SCORES[selectorType] || 50;

  // Apply penalties
  if (isDynamic) {
    score += PENALTIES.dynamic;
    risks.push('Selector contains dynamic-looking patterns (may change between runs)');
  }

  if (hasPositionalIndex) {
    score += PENALTIES.positional;
    risks.push('Positional selectors break when DOM order changes');
    suggestions.push('Use data-testid or aria-label instead of positional selectors');
  }

  if (depth > 3) {
    score += PENALTIES.deepNesting;
    risks.push('Deeply nested selector is fragile to DOM restructuring');
    suggestions.push('Target the element directly with a unique attribute');
  }

  if (classCount > 2) {
    score += PENALTIES.multiClass * (classCount - 2);
    risks.push('Multiple class dependencies increase fragility');
  }

  if (!isUnique) {
    score += PENALTIES.notUnique;
    risks.push('Selector matches multiple elements');
    suggestions.push('Add more specificity or use a unique identifier');
  }

  if (hasFragileClasses(selector)) {
    score += PENALTIES.fragileClass;
    risks.push('Class names appear auto-generated or framework-specific');
    suggestions.push('Use data-testid for stable test selectors');
  }

  // Apply bonuses
  if (hasDataTestId && !selector.includes('data-testid')) {
    score += BONUSES.hasDataTestId;
    suggestions.push('Element has data-testid - consider using it: [data-testid="..."]');
  }

  if (hasAriaLabel && !selector.includes('aria-label')) {
    score += BONUSES.hasAriaLabel;
    suggestions.push('Element has aria-label - consider using it for accessibility');
  }

  if (hasId && !selector.startsWith('#')) {
    score += BONUSES.hasId;
    suggestions.push(`Element has ID - consider using: #${selector}`);
  }

  if (isUnique) {
    score += BONUSES.isUnique;
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  // Determine grade
  const grade = scoreToGrade(score);

  // Build factors object
  const factors: StabilityFactors = {
    type: selectorType,
    hasId,
    hasDataTestId,
    hasAriaLabel,
    hasName,
    hasRole,
    depth,
    specificity,
    isDynamic,
    hasPositionalIndex,
    classCount,
    isUnique,
  };

  return {
    score,
    grade,
    factors,
    risks,
    suggestions,
    message: `Stability score: ${score}/100 (${grade}) - ${getGradeDescription(grade)}`,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function detectSelectorType(selector: string): StabilityFactors['type'] {
  if (selector.startsWith('#') && !selector.includes(' ')) {
    return 'id';
  }
  if (selector.includes('[data-testid') || selector.includes('[data-test')) {
    return 'data-testid';
  }
  if (selector.includes('[aria-label') || selector.includes('[aria-')) {
    return 'aria';
  }
  if (selector.includes('[name=')) {
    return 'name';
  }
  if (selector.includes('[role=')) {
    return 'role';
  }
  if (selector.startsWith('text=') || selector.includes(':has-text(')) {
    return 'text';
  }
  if (selector.startsWith('//') || selector.startsWith('xpath=')) {
    return 'xpath';
  }
  if (selector.includes('.') && !selector.includes(' ')) {
    return 'class';
  }
  if (/^[a-z]+$/i.test(selector)) {
    return 'tag';
  }
  return 'css-complex';
}

function detectDynamicPatterns(selector: string): boolean {
  const dynamicPatterns = [
    /[a-z]+[-_][a-f0-9]{6,}/i,  // hash suffixes like btn-a3f2c1
    /[a-z]+\d{10,}/i,            // timestamp-like numbers
    /css-[a-z0-9]+/i,            // CSS-in-JS patterns
    /sc-[a-z]+/i,                // styled-components
    /emotion-[a-z0-9]+/i,        // emotion CSS
    /MuiBox-root-\d+/,           // Material UI
    /chakra-[a-z]+/i,            // Chakra UI
    /__[a-z]+_[a-z0-9]+/i,       // CSS modules
  ];

  return dynamicPatterns.some(pattern => pattern.test(selector));
}

function detectPositionalIndex(selector: string): boolean {
  const positionalPatterns = [
    /:nth-child/,
    /:nth-of-type/,
    /:first-child/,
    /:last-child/,
    /:first-of-type/,
    /:last-of-type/,
    /\[\d+\]/,  // XPath index
    /:eq\(/,    // jQuery-style
  ];

  return positionalPatterns.some(pattern => pattern.test(selector));
}

function calculateDepth(selector: string): number {
  // Count combinators (space, >, +, ~)
  const combinators = selector.match(/[\s>+~]+/g) || [];
  return combinators.length + 1;
}

function calculateSpecificity(selector: string): number {
  // Simplified specificity calculation
  const ids = (selector.match(/#[a-z][a-z0-9_-]*/gi) || []).length;
  const classes = (selector.match(/\.[a-z][a-z0-9_-]*/gi) || []).length;
  const attributes = (selector.match(/\[[^\]]+\]/g) || []).length;
  const elements = (selector.match(/^[a-z]+|[\s>+~][a-z]+/gi) || []).length;

  return ids * 100 + (classes + attributes) * 10 + elements;
}

function countClasses(selector: string): number {
  return (selector.match(/\./g) || []).length;
}

function hasFragileClasses(selector: string): boolean {
  const fragilePatterns = [
    /\.[a-z]{1,3}[A-Z][a-zA-Z]+/,  // camelCase (CSS-in-JS)
    /\.[a-z]+-[a-f0-9]{4,}/i,      // hash suffix
    /\._{1,2}[a-z]+/,              // underscore prefix (CSS modules)
  ];

  return fragilePatterns.some(pattern => pattern.test(selector));
}

function scoreToGrade(score: number): StabilityScoreResult['grade'] {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function getGradeDescription(grade: StabilityScoreResult['grade']): string {
  switch (grade) {
    case 'A': return 'Excellent - highly stable selector';
    case 'B': return 'Good - reasonably stable';
    case 'C': return 'Fair - may need attention';
    case 'D': return 'Poor - likely to break';
    case 'F': return 'Critical - very fragile';
  }
}

/**
 * Format stability result for display
 */
export function formatStabilityResult(result: StabilityScoreResult): string {
  const lines: string[] = [];
  const icon = result.grade === 'A' || result.grade === 'B' ? '✅' :
               result.grade === 'C' ? '⚠️' : '❌';

  lines.push(`${icon} ${result.message}`);
  lines.push('');
  lines.push(`**Type:** ${result.factors.type}`);
  lines.push(`**Unique:** ${result.factors.isUnique ? 'Yes' : 'No'}`);
  lines.push(`**Depth:** ${result.factors.depth} levels`);

  if (result.risks.length > 0) {
    lines.push('');
    lines.push('**Risks:**');
    for (const risk of result.risks) {
      lines.push(`- ${risk}`);
    }
  }

  if (result.suggestions.length > 0) {
    lines.push('');
    lines.push('**Suggestions:**');
    for (const suggestion of result.suggestions) {
      lines.push(`- ${suggestion}`);
    }
  }

  return lines.join('\n');
}
