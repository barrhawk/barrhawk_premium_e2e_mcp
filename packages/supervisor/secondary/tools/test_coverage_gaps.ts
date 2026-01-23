/**
 * Dynamic Tool: test_coverage_gaps
 * Created: 2026-01-23T14:31:08.455Z
 * Permissions: none
 *
 * Analyze tests to find potential coverage gaps in authentication, forms, navigation, error handling, and more.
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'test_coverage_gaps',
  description: "Analyze tests to find potential coverage gaps in authentication, forms, navigation, error handling, and more.",
  schema: {
      "type": "object",
      "properties": {
          "tests": {
              "type": "array",
              "description": "Array of tests with steps"
          },
          "categories": {
              "type": "array",
              "items": {
                  "type": "string"
              },
              "description": "Categories to check: authentication, forms, navigation, data, errors, accessibility, security, performance"
          }
      },
      "required": [
          "tests"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const tests = args.tests as Array<{name: string, steps: Array<{action: string, selector?: string, url?: string, value?: string}>}>;
    const categories = (args.categories as string[]) || ['authentication', 'forms', 'navigation', 'data', 'errors', 'accessibility', 'security'];
    
    // Flatten all steps for analysis
    const allSteps = tests.flatMap(t => t.steps || []);
    const allSelectors = allSteps.map(s => s.selector || '').filter(Boolean);
    const allUrls = allSteps.map(s => s.url || '').filter(Boolean);
    const allActions = allSteps.map(s => s.action);
    
    const gaps: Array<{area: string, severity: 'high' | 'medium' | 'low', description: string, suggestedTests: string[]}> = [];
    
    const checks: Record<string, () => void> = {
      authentication: () => {
        const hasLogin = allSelectors.some(s => /login|signin|email|password/i.test(s)) || allUrls.some(u => /login|signin|auth/i.test(u));
        const hasLogout = allSelectors.some(s => /logout|signout/i.test(s));
        if (!hasLogin) gaps.push({ area: 'Authentication', severity: 'high', description: 'No login tests found', suggestedTests: ['Login with valid credentials', 'Login with invalid credentials', 'Password reset flow'] });
        if (hasLogin && !hasLogout) gaps.push({ area: 'Authentication', severity: 'medium', description: 'No logout tests found', suggestedTests: ['Logout flow', 'Session expiration'] });
      },
      forms: () => {
        const hasFormSubmit = allActions.includes('submit') || allSelectors.some(s => /submit|form/i.test(s));
        const hasValidation = allSelectors.some(s => /error|invalid|required/i.test(s));
        if (!hasFormSubmit) gaps.push({ area: 'Forms', severity: 'medium', description: 'No form submission tests', suggestedTests: ['Form submit with valid data', 'Form submit with empty fields'] });
        if (hasFormSubmit && !hasValidation) gaps.push({ area: 'Forms', severity: 'medium', description: 'No validation error tests', suggestedTests: ['Required field validation', 'Email format validation'] });
      },
      navigation: () => {
        const uniqueUrls = new Set(allUrls);
        if (uniqueUrls.size < 3) gaps.push({ area: 'Navigation', severity: 'low', description: 'Limited URL coverage', suggestedTests: ['Navigation between main pages', 'Deep link access', 'Browser back/forward'] });
      },
      errors: () => {
        const hasErrorHandling = allSelectors.some(s => /error|alert|warning|fail/i.test(s));
        if (!hasErrorHandling) gaps.push({ area: 'Error Handling', severity: 'high', description: 'No error state tests', suggestedTests: ['Network error handling', 'Invalid input errors', '404 page handling'] });
      },
      accessibility: () => {
        const hasA11y = tests.some(t => /a11y|accessibility|aria|screen.?reader/i.test(t.name));
        if (!hasA11y) gaps.push({ area: 'Accessibility', severity: 'medium', description: 'No accessibility tests', suggestedTests: ['Keyboard navigation', 'Screen reader compatibility', 'Color contrast'] });
      },
      security: () => {
        const hasSecurity = tests.some(t => /security|xss|injection|csrf/i.test(t.name));
        if (!hasSecurity) gaps.push({ area: 'Security', severity: 'high', description: 'No security tests', suggestedTests: ['XSS prevention', 'CSRF protection', 'Input sanitization'] });
      },
    };
    
    for (const cat of categories) {
      if (checks[cat]) checks[cat]();
    }
    
    const coverageScore = Math.max(0, 100 - gaps.reduce((sum, g) => sum + (g.severity === 'high' ? 20 : g.severity === 'medium' ? 10 : 5), 0));
    
    let output = `Coverage Gap Analysis\n\n`;
    output += `Coverage score: ${coverageScore}/100\n`;
    output += `Gaps found: ${gaps.length}\n\n`;
    for (const gap of gaps) {
      const icon = gap.severity === 'high' ? '[HIGH]' : gap.severity === 'medium' ? '[MED]' : '[LOW]';
      output += `${icon} ${gap.area}: ${gap.description}\n`;
      output += `   Suggested: ${gap.suggestedTests.join(', ')}\n\n`;
    }
    
    return { coverageScore, gaps, output };
  },
};
