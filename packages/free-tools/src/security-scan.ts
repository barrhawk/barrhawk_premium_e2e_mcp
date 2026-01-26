/**
 * Security Scan Tool - Free Tier
 *
 * Basic security checks without AI.
 * Checks for common vulnerabilities based on OWASP guidelines.
 */

import type { Page } from 'playwright';

// ============================================================================
// Types
// ============================================================================

export interface SecurityIssue {
  id: string;
  category: SecurityCategory;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  location?: string;
  evidence?: string;
  remediation: string;
  owaspRef?: string;
}

export type SecurityCategory =
  | 'xss'
  | 'injection'
  | 'authentication'
  | 'sensitive-data'
  | 'security-headers'
  | 'cookies'
  | 'forms'
  | 'mixed-content'
  | 'information-disclosure';

export interface SecurityScanOptions {
  page: Page;
  checks?: SecurityCategory[];
  includeInfoIssues?: boolean;
}

export interface SecurityScanResult {
  url: string;
  timestamp: string;
  issues: SecurityIssue[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    total: number;
  };
  score: number;  // 0-100, higher is more secure
  passed: boolean;
  message: string;
}

// ============================================================================
// Security Check Implementations
// ============================================================================

/**
 * Run security scan on the current page
 */
export async function securityScan(options: SecurityScanOptions): Promise<SecurityScanResult> {
  const { page, checks, includeInfoIssues = false } = options;
  const issues: SecurityIssue[] = [];

  const allCategories: SecurityCategory[] = [
    'security-headers',
    'cookies',
    'forms',
    'xss',
    'sensitive-data',
    'mixed-content',
    'information-disclosure',
    'authentication',
  ];

  const categoriesToCheck = checks || allCategories;

  // Run applicable checks
  if (categoriesToCheck.includes('security-headers')) {
    issues.push(...await checkSecurityHeaders(page));
  }

  if (categoriesToCheck.includes('cookies')) {
    issues.push(...await checkCookies(page));
  }

  if (categoriesToCheck.includes('forms')) {
    issues.push(...await checkForms(page));
  }

  if (categoriesToCheck.includes('xss')) {
    issues.push(...await checkXssVulnerabilities(page));
  }

  if (categoriesToCheck.includes('sensitive-data')) {
    issues.push(...await checkSensitiveData(page));
  }

  if (categoriesToCheck.includes('mixed-content')) {
    issues.push(...await checkMixedContent(page));
  }

  if (categoriesToCheck.includes('information-disclosure')) {
    issues.push(...await checkInformationDisclosure(page));
  }

  if (categoriesToCheck.includes('authentication')) {
    issues.push(...await checkAuthentication(page));
  }

  // Filter info issues if not requested
  const filteredIssues = includeInfoIssues
    ? issues
    : issues.filter(i => i.severity !== 'info');

  // Calculate summary
  const summary = {
    critical: filteredIssues.filter(i => i.severity === 'critical').length,
    high: filteredIssues.filter(i => i.severity === 'high').length,
    medium: filteredIssues.filter(i => i.severity === 'medium').length,
    low: filteredIssues.filter(i => i.severity === 'low').length,
    info: filteredIssues.filter(i => i.severity === 'info').length,
    total: filteredIssues.length,
  };

  // Calculate score (penalize by severity)
  let score = 100;
  score -= summary.critical * 20;
  score -= summary.high * 10;
  score -= summary.medium * 5;
  score -= summary.low * 2;
  score = Math.max(0, Math.min(100, score));

  const passed = summary.critical === 0 && summary.high === 0;

  return {
    url: page.url(),
    timestamp: new Date().toISOString(),
    issues: filteredIssues,
    summary,
    score,
    passed,
    message: passed
      ? `Security scan passed with score ${score}/100`
      : `Security issues found: ${summary.critical} critical, ${summary.high} high, ${summary.medium} medium`,
  };
}

// ============================================================================
// Individual Security Checks
// ============================================================================

async function checkSecurityHeaders(page: Page): Promise<SecurityIssue[]> {
  const issues: SecurityIssue[] = [];

  // We need to check response headers - get them from the page's main response
  const response = await page.evaluate(() => {
    // We can't access response headers from page context
    // So we'll check for meta tags and infer
    const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    const xfo = document.querySelector('meta[http-equiv="X-Frame-Options"]');

    return {
      hasCSPMeta: !!csp,
      hasXFOMeta: !!xfo,
      isHttps: location.protocol === 'https:',
    };
  });

  // Check HTTPS
  if (!response.isHttps) {
    issues.push({
      id: 'no-https',
      category: 'security-headers',
      severity: 'high',
      title: 'Page not served over HTTPS',
      description: 'The page is served over HTTP, which transmits data in plain text.',
      remediation: 'Configure your server to use HTTPS with a valid SSL certificate.',
      owaspRef: 'A02:2021 - Cryptographic Failures',
    });
  }

  // Note: Full header checks would require intercepting network requests
  // which would need to be done before navigation. For now, we check what we can.

  if (!response.hasCSPMeta) {
    issues.push({
      id: 'no-csp',
      category: 'security-headers',
      severity: 'medium',
      title: 'No Content Security Policy detected',
      description: 'No CSP meta tag found. CSP helps prevent XSS attacks.',
      remediation: 'Add a Content-Security-Policy header or meta tag to restrict resource loading.',
      owaspRef: 'A03:2021 - Injection',
    });
  }

  return issues;
}

async function checkCookies(page: Page): Promise<SecurityIssue[]> {
  const issues: SecurityIssue[] = [];

  const context = page.context();
  const cookies = await context.cookies();
  const pageUrl = new URL(page.url());
  const isHttps = pageUrl.protocol === 'https:';

  for (const cookie of cookies) {
    // Check for missing HttpOnly on session-like cookies
    const isSessionCookie = /session|token|auth|jwt|sid/i.test(cookie.name);

    if (isSessionCookie && !cookie.httpOnly) {
      issues.push({
        id: `cookie-no-httponly-${cookie.name}`,
        category: 'cookies',
        severity: 'high',
        title: `Session cookie "${cookie.name}" missing HttpOnly flag`,
        description: 'Session cookies without HttpOnly can be accessed by JavaScript, enabling XSS attacks to steal sessions.',
        location: cookie.name,
        remediation: 'Set the HttpOnly flag on all session-related cookies.',
        owaspRef: 'A05:2021 - Security Misconfiguration',
      });
    }

    // Check for missing Secure flag on HTTPS
    if (isHttps && isSessionCookie && !cookie.secure) {
      issues.push({
        id: `cookie-no-secure-${cookie.name}`,
        category: 'cookies',
        severity: 'medium',
        title: `Cookie "${cookie.name}" missing Secure flag`,
        description: 'Cookies without the Secure flag can be transmitted over HTTP, exposing them to interception.',
        location: cookie.name,
        remediation: 'Set the Secure flag on cookies, especially for session cookies.',
        owaspRef: 'A02:2021 - Cryptographic Failures',
      });
    }

    // Check for missing SameSite
    if (isSessionCookie && cookie.sameSite === 'None') {
      issues.push({
        id: `cookie-samesite-none-${cookie.name}`,
        category: 'cookies',
        severity: 'medium',
        title: `Cookie "${cookie.name}" has SameSite=None`,
        description: 'Cookies with SameSite=None can be sent in cross-site requests, potentially enabling CSRF attacks.',
        location: cookie.name,
        remediation: 'Use SameSite=Strict or SameSite=Lax for session cookies.',
        owaspRef: 'A01:2021 - Broken Access Control',
      });
    }
  }

  return issues;
}

async function checkForms(page: Page): Promise<SecurityIssue[]> {
  const issues: SecurityIssue[] = [];

  const formAnalysis = await page.evaluate(() => {
    const forms = document.querySelectorAll('form');
    const results: Array<{
      action: string;
      method: string;
      hasPassword: boolean;
      hasCSRFToken: boolean;
      autocompleteOff: boolean;
      isHttpAction: boolean;
    }> = [];

    forms.forEach(form => {
      const action = form.action || window.location.href;
      const method = form.method.toUpperCase() || 'GET';
      const hasPassword = form.querySelector('input[type="password"]') !== null;

      // Look for CSRF tokens
      const csrfPatterns = ['csrf', 'token', '_token', 'authenticity'];
      const hiddenInputs = form.querySelectorAll('input[type="hidden"]');
      const hasCSRFToken = Array.from(hiddenInputs).some(input =>
        csrfPatterns.some(pattern => (input as HTMLInputElement).name?.toLowerCase().includes(pattern))
      );

      const autocompleteOff = form.getAttribute('autocomplete') === 'off';
      const isHttpAction = action.startsWith('http:');

      results.push({
        action,
        method,
        hasPassword,
        hasCSRFToken,
        autocompleteOff,
        isHttpAction,
      });
    });

    return results;
  });

  for (const form of formAnalysis) {
    // Check for forms posting to HTTP
    if (form.isHttpAction) {
      issues.push({
        id: 'form-http-action',
        category: 'forms',
        severity: 'high',
        title: 'Form submits to HTTP URL',
        description: 'Form data will be transmitted in plain text.',
        location: form.action,
        remediation: 'Change form action to use HTTPS.',
        owaspRef: 'A02:2021 - Cryptographic Failures',
      });
    }

    // Check for password forms without autocomplete=off
    if (form.hasPassword && !form.autocompleteOff) {
      issues.push({
        id: 'form-password-autocomplete',
        category: 'forms',
        severity: 'low',
        title: 'Password form allows autocomplete',
        description: 'Password fields may be cached by the browser.',
        location: form.action,
        remediation: 'Consider adding autocomplete="off" to sensitive forms.',
        owaspRef: 'A04:2021 - Insecure Design',
      });
    }

    // Check for POST forms without CSRF token
    if (form.method === 'POST' && !form.hasCSRFToken) {
      issues.push({
        id: 'form-no-csrf',
        category: 'forms',
        severity: 'medium',
        title: 'Form missing CSRF token',
        description: 'POST form without visible CSRF protection may be vulnerable to CSRF attacks.',
        location: form.action,
        remediation: 'Add a CSRF token to all state-changing forms.',
        owaspRef: 'A01:2021 - Broken Access Control',
      });
    }
  }

  return issues;
}

async function checkXssVulnerabilities(page: Page): Promise<SecurityIssue[]> {
  const issues: SecurityIssue[] = [];

  const xssAnalysis = await page.evaluate(() => {
    const results: Array<{
      type: string;
      element: string;
      evidence: string;
    }> = [];

    // Check for inline event handlers
    const eventAttrs = ['onclick', 'onerror', 'onload', 'onmouseover', 'onfocus', 'onblur'];
    for (const attr of eventAttrs) {
      const elements = document.querySelectorAll(`[${attr}]`);
      elements.forEach(el => {
        results.push({
          type: 'inline-event',
          element: el.tagName.toLowerCase(),
          evidence: `${attr}="${el.getAttribute(attr)?.substring(0, 50)}"`,
        });
      });
    }

    // Check for javascript: URLs
    const links = document.querySelectorAll('a[href^="javascript:"]');
    links.forEach(link => {
      results.push({
        type: 'javascript-url',
        element: 'a',
        evidence: link.getAttribute('href')?.substring(0, 50) || '',
      });
    });

    // Check for dangerous innerHTML usage patterns (limited detection)
    const scripts = document.querySelectorAll('script');
    scripts.forEach(script => {
      const content = script.textContent || '';
      if (content.includes('innerHTML') || content.includes('outerHTML')) {
        results.push({
          type: 'innerhtml-usage',
          element: 'script',
          evidence: 'Script uses innerHTML/outerHTML',
        });
      }
      if (content.includes('document.write')) {
        results.push({
          type: 'document-write',
          element: 'script',
          evidence: 'Script uses document.write',
        });
      }
    });

    return results;
  });

  // Report inline event handlers
  const inlineEvents = xssAnalysis.filter(x => x.type === 'inline-event');
  if (inlineEvents.length > 0) {
    issues.push({
      id: 'inline-event-handlers',
      category: 'xss',
      severity: 'low',
      title: `${inlineEvents.length} inline event handlers found`,
      description: 'Inline event handlers can make XSS exploitation easier.',
      evidence: inlineEvents.slice(0, 3).map(e => e.evidence).join(', '),
      remediation: 'Use addEventListener instead of inline event handlers.',
      owaspRef: 'A03:2021 - Injection',
    });
  }

  // Report javascript: URLs
  const jsUrls = xssAnalysis.filter(x => x.type === 'javascript-url');
  if (jsUrls.length > 0) {
    issues.push({
      id: 'javascript-urls',
      category: 'xss',
      severity: 'medium',
      title: `${jsUrls.length} javascript: URLs found`,
      description: 'javascript: URLs can be used for XSS attacks.',
      evidence: jsUrls.slice(0, 3).map(e => e.evidence).join(', '),
      remediation: 'Avoid using javascript: URLs. Use event handlers instead.',
      owaspRef: 'A03:2021 - Injection',
    });
  }

  // Report document.write usage
  const docWrite = xssAnalysis.filter(x => x.type === 'document-write');
  if (docWrite.length > 0) {
    issues.push({
      id: 'document-write',
      category: 'xss',
      severity: 'medium',
      title: 'document.write() usage detected',
      description: 'document.write() can enable DOM-based XSS attacks.',
      remediation: 'Use DOM manipulation methods instead of document.write().',
      owaspRef: 'A03:2021 - Injection',
    });
  }

  return issues;
}

async function checkSensitiveData(page: Page): Promise<SecurityIssue[]> {
  const issues: SecurityIssue[] = [];

  const sensitiveData = await page.evaluate(() => {
    const text = document.body.innerText;
    const html = document.documentElement.outerHTML;
    const results: Array<{ type: string; evidence: string }> = [];

    // Check for exposed API keys (common patterns)
    const apiKeyPatterns = [
      /['"](sk_live_[a-zA-Z0-9]{24,})['"]/,  // Stripe
      /['"](pk_live_[a-zA-Z0-9]{24,})['"]/,  // Stripe public
      /['"](AKIA[A-Z0-9]{16})['"]/,          // AWS
      /['"]([a-zA-Z0-9]{32,})['"].*api[_-]?key/i,  // Generic
    ];

    for (const pattern of apiKeyPatterns) {
      const match = html.match(pattern);
      if (match) {
        results.push({
          type: 'api-key',
          evidence: match[1].substring(0, 20) + '...',
        });
      }
    }

    // Check for exposed passwords in HTML
    if (/password\s*[=:]\s*['"][^'"]+['"]/.test(html)) {
      results.push({
        type: 'password-in-html',
        evidence: 'Password found in HTML source',
      });
    }

    // Check for credit card numbers (basic pattern)
    const ccPattern = /\b(?:\d{4}[-\s]?){3}\d{4}\b/;
    if (ccPattern.test(text)) {
      results.push({
        type: 'credit-card',
        evidence: 'Possible credit card number in page content',
      });
    }

    // Check for SSN patterns
    const ssnPattern = /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/;
    if (ssnPattern.test(text)) {
      results.push({
        type: 'ssn',
        evidence: 'Possible SSN in page content',
      });
    }

    // Check for email addresses in visible content (info level)
    const emailCount = (text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []).length;
    if (emailCount > 5) {
      results.push({
        type: 'emails-exposed',
        evidence: `${emailCount} email addresses found`,
      });
    }

    return results;
  });

  for (const data of sensitiveData) {
    switch (data.type) {
      case 'api-key':
        issues.push({
          id: 'exposed-api-key',
          category: 'sensitive-data',
          severity: 'critical',
          title: 'Exposed API key detected',
          description: 'An API key appears to be exposed in the page source.',
          evidence: data.evidence,
          remediation: 'Remove API keys from client-side code. Use environment variables and backend proxies.',
          owaspRef: 'A02:2021 - Cryptographic Failures',
        });
        break;

      case 'password-in-html':
        issues.push({
          id: 'password-in-source',
          category: 'sensitive-data',
          severity: 'critical',
          title: 'Password exposed in HTML',
          description: 'A password appears in the page source code.',
          evidence: data.evidence,
          remediation: 'Never include passwords in client-side code.',
          owaspRef: 'A02:2021 - Cryptographic Failures',
        });
        break;

      case 'credit-card':
        issues.push({
          id: 'credit-card-exposed',
          category: 'sensitive-data',
          severity: 'high',
          title: 'Possible credit card number exposed',
          description: 'A pattern matching a credit card number was found.',
          evidence: data.evidence,
          remediation: 'Mask credit card numbers (show only last 4 digits).',
          owaspRef: 'A02:2021 - Cryptographic Failures',
        });
        break;

      case 'ssn':
        issues.push({
          id: 'ssn-exposed',
          category: 'sensitive-data',
          severity: 'high',
          title: 'Possible SSN exposed',
          description: 'A pattern matching a Social Security Number was found.',
          evidence: data.evidence,
          remediation: 'Never display full SSNs. Mask all but last 4 digits.',
          owaspRef: 'A02:2021 - Cryptographic Failures',
        });
        break;

      case 'emails-exposed':
        issues.push({
          id: 'emails-exposed',
          category: 'sensitive-data',
          severity: 'info',
          title: 'Multiple email addresses visible',
          description: 'Many email addresses are visible on the page.',
          evidence: data.evidence,
          remediation: 'Consider if all emails need to be publicly visible.',
          owaspRef: 'A01:2021 - Broken Access Control',
        });
        break;
    }
  }

  return issues;
}

async function checkMixedContent(page: Page): Promise<SecurityIssue[]> {
  const issues: SecurityIssue[] = [];

  const mixedContent = await page.evaluate(() => {
    const isHttps = location.protocol === 'https:';
    if (!isHttps) return [];

    const results: Array<{ type: string; url: string }> = [];

    // Check images
    document.querySelectorAll('img[src^="http:"]').forEach(img => {
      results.push({ type: 'image', url: img.getAttribute('src') || '' });
    });

    // Check scripts
    document.querySelectorAll('script[src^="http:"]').forEach(script => {
      results.push({ type: 'script', url: script.getAttribute('src') || '' });
    });

    // Check stylesheets
    document.querySelectorAll('link[href^="http:"]').forEach(link => {
      if (link.getAttribute('rel') === 'stylesheet') {
        results.push({ type: 'stylesheet', url: link.getAttribute('href') || '' });
      }
    });

    // Check iframes
    document.querySelectorAll('iframe[src^="http:"]').forEach(iframe => {
      results.push({ type: 'iframe', url: iframe.getAttribute('src') || '' });
    });

    return results;
  });

  for (const mc of mixedContent) {
    const severity = mc.type === 'script' ? 'high' : 'medium';

    issues.push({
      id: `mixed-content-${mc.type}`,
      category: 'mixed-content',
      severity,
      title: `Mixed content: HTTP ${mc.type} on HTTPS page`,
      description: `An HTTP ${mc.type} is loaded on an HTTPS page, which can be blocked or intercepted.`,
      location: mc.url.substring(0, 100),
      remediation: `Update the ${mc.type} URL to use HTTPS or use protocol-relative URLs.`,
      owaspRef: 'A02:2021 - Cryptographic Failures',
    });
  }

  return issues;
}

async function checkInformationDisclosure(page: Page): Promise<SecurityIssue[]> {
  const issues: SecurityIssue[] = [];

  const disclosures = await page.evaluate(() => {
    const results: Array<{ type: string; evidence: string }> = [];
    const html = document.documentElement.outerHTML;
    const comments = html.match(/<!--[\s\S]*?-->/g) || [];

    // Check for sensitive comments
    const sensitivePatterns = [
      /todo|fixme|hack|bug|password|secret|key|token/i,
      /version\s*[:=]\s*[\d.]+/i,
      /debug|test|staging|development/i,
    ];

    for (const comment of comments) {
      for (const pattern of sensitivePatterns) {
        if (pattern.test(comment)) {
          results.push({
            type: 'sensitive-comment',
            evidence: comment.substring(0, 100),
          });
          break;
        }
      }
    }

    // Check for version disclosure in meta tags
    const generator = document.querySelector('meta[name="generator"]');
    if (generator) {
      results.push({
        type: 'generator-meta',
        evidence: generator.getAttribute('content') || '',
      });
    }

    // Check for debug output
    if (/stack\s*trace|exception|error\s*at|line\s*\d+/i.test(html)) {
      results.push({
        type: 'stack-trace',
        evidence: 'Possible stack trace or error details in page',
      });
    }

    return results;
  });

  for (const disc of disclosures) {
    switch (disc.type) {
      case 'sensitive-comment':
        issues.push({
          id: 'sensitive-comments',
          category: 'information-disclosure',
          severity: 'low',
          title: 'Sensitive HTML comments found',
          description: 'HTML comments may reveal internal information.',
          evidence: disc.evidence,
          remediation: 'Remove or sanitize HTML comments in production.',
          owaspRef: 'A05:2021 - Security Misconfiguration',
        });
        break;

      case 'generator-meta':
        issues.push({
          id: 'generator-disclosure',
          category: 'information-disclosure',
          severity: 'info',
          title: 'Generator meta tag reveals technology',
          description: 'The generator meta tag discloses the CMS or framework used.',
          evidence: disc.evidence,
          remediation: 'Remove the generator meta tag in production.',
          owaspRef: 'A05:2021 - Security Misconfiguration',
        });
        break;

      case 'stack-trace':
        issues.push({
          id: 'stack-trace-exposed',
          category: 'information-disclosure',
          severity: 'medium',
          title: 'Stack trace or error details visible',
          description: 'Error details may reveal internal architecture.',
          evidence: disc.evidence,
          remediation: 'Configure error handling to show generic messages in production.',
          owaspRef: 'A05:2021 - Security Misconfiguration',
        });
        break;
    }
  }

  return issues;
}

async function checkAuthentication(page: Page): Promise<SecurityIssue[]> {
  const issues: SecurityIssue[] = [];

  const authChecks = await page.evaluate(() => {
    const results: Array<{ type: string; evidence: string }> = [];

    // Check for password fields without HTTPS
    const hasPasswordField = document.querySelector('input[type="password"]') !== null;
    if (hasPasswordField && location.protocol !== 'https:') {
      results.push({
        type: 'password-over-http',
        evidence: 'Password field found on HTTP page',
      });
    }

    // Check for weak password requirements (based on pattern attribute)
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    passwordInputs.forEach(input => {
      const pattern = input.getAttribute('pattern');
      const minLength = input.getAttribute('minlength');

      if (minLength && parseInt(minLength) < 8) {
        results.push({
          type: 'weak-password-length',
          evidence: `Password minlength is ${minLength}`,
        });
      }
    });

    // Check for login forms
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
      const hasUsername = form.querySelector('input[type="text"], input[type="email"]');
      const hasPassword = form.querySelector('input[type="password"]');

      if (hasUsername && hasPassword) {
        // Check for "remember me" without proper security
        const rememberMe = form.querySelector('input[type="checkbox"][name*="remember"]');
        if (rememberMe) {
          results.push({
            type: 'remember-me',
            evidence: 'Login form has remember me option',
          });
        }
      }
    });

    return results;
  });

  for (const check of authChecks) {
    switch (check.type) {
      case 'password-over-http':
        issues.push({
          id: 'password-over-http',
          category: 'authentication',
          severity: 'critical',
          title: 'Password field on non-HTTPS page',
          description: 'Passwords will be transmitted in plain text.',
          evidence: check.evidence,
          remediation: 'Always serve login pages over HTTPS.',
          owaspRef: 'A02:2021 - Cryptographic Failures',
        });
        break;

      case 'weak-password-length':
        issues.push({
          id: 'weak-password-policy',
          category: 'authentication',
          severity: 'medium',
          title: 'Weak password length requirement',
          description: 'Password minimum length is below recommended 8 characters.',
          evidence: check.evidence,
          remediation: 'Require at least 8 characters for passwords.',
          owaspRef: 'A07:2021 - Identification and Authentication Failures',
        });
        break;

      case 'remember-me':
        issues.push({
          id: 'remember-me-security',
          category: 'authentication',
          severity: 'info',
          title: 'Remember me functionality detected',
          description: 'Remember me can extend session lifetime, increasing risk if device is compromised.',
          evidence: check.evidence,
          remediation: 'Ensure remember me uses secure, time-limited tokens.',
          owaspRef: 'A07:2021 - Identification and Authentication Failures',
        });
        break;
    }
  }

  return issues;
}

// ============================================================================
// Formatter
// ============================================================================

export function formatSecurityResult(result: SecurityScanResult): string {
  const lines: string[] = [];
  const icon = result.passed ? '✅' : '❌';

  lines.push(`# Security Scan Results`);
  lines.push('');
  lines.push(`${icon} **Score:** ${result.score}/100`);
  lines.push(`**URL:** ${result.url}`);
  lines.push('');

  lines.push('## Summary');
  lines.push(`- Critical: ${result.summary.critical}`);
  lines.push(`- High: ${result.summary.high}`);
  lines.push(`- Medium: ${result.summary.medium}`);
  lines.push(`- Low: ${result.summary.low}`);
  lines.push(`- Info: ${result.summary.info}`);
  lines.push('');

  if (result.issues.length > 0) {
    lines.push('## Issues');
    lines.push('');

    const severities = ['critical', 'high', 'medium', 'low', 'info'] as const;
    for (const sev of severities) {
      const sevIssues = result.issues.filter(i => i.severity === sev);
      if (sevIssues.length === 0) continue;

      const icons = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵', info: 'ℹ️' };
      lines.push(`### ${icons[sev]} ${sev.toUpperCase()}`);
      lines.push('');

      for (const issue of sevIssues) {
        lines.push(`**${issue.title}**`);
        lines.push(`- ${issue.description}`);
        if (issue.evidence) {
          lines.push(`- Evidence: \`${issue.evidence}\``);
        }
        lines.push(`- Fix: ${issue.remediation}`);
        if (issue.owaspRef) {
          lines.push(`- OWASP: ${issue.owaspRef}`);
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}
