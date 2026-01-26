/**
 * Accessibility Report Tool
 *
 * Generates comprehensive HTML/PDF accessibility reports.
 * Includes executive summary, detailed findings, and remediation guidance.
 */

import type { A11yAuditResult, A11yIssue } from './types.js';

export interface AccessibilityReportOptions {
  auditResult: A11yAuditResult;
  pageTitle?: string;
  pageUrl?: string;
  reportTitle?: string;
  includeScreenshots?: boolean;
  includeFixes?: boolean;
  format?: 'html' | 'markdown' | 'json';
  branding?: {
    logo?: string;
    companyName?: string;
    primaryColor?: string;
  };
}

export interface AccessibilityReport {
  format: string;
  content: string;
  summary: ReportSummary;
  timestamp: string;
}

export interface ReportSummary {
  totalIssues: number;
  byImpact: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  };
  passRate: number;
  wcagCompliance: {
    levelA: number;
    levelAA: number;
    levelAAA: number;
  };
  topIssues: string[];
}

/**
 * Generate accessibility report
 */
export function generateAccessibilityReport(options: AccessibilityReportOptions): AccessibilityReport {
  const {
    auditResult,
    pageTitle = 'Accessibility Report',
    pageUrl,
    reportTitle = 'WCAG Accessibility Audit Report',
    includeFixes = true,
    format = 'html',
    branding = {},
  } = options;

  // Generate summary
  const summary = generateSummary(auditResult);

  // Generate content based on format
  let content: string;

  switch (format) {
    case 'html':
      content = generateHtmlReport(auditResult, summary, {
        pageTitle,
        pageUrl,
        reportTitle,
        includeFixes,
        branding,
      });
      break;
    case 'markdown':
      content = generateMarkdownReport(auditResult, summary, {
        pageTitle,
        pageUrl,
        reportTitle,
        includeFixes,
      });
      break;
    case 'json':
      content = JSON.stringify({
        meta: { pageTitle, pageUrl, reportTitle, timestamp: new Date().toISOString() },
        summary,
        issues: auditResult.issues,
        passes: auditResult.passes,
      }, null, 2);
      break;
    default:
      content = generateHtmlReport(auditResult, summary, {
        pageTitle,
        pageUrl,
        reportTitle,
        includeFixes,
        branding,
      });
  }

  return {
    format,
    content,
    summary,
    timestamp: new Date().toISOString(),
  };
}

function generateSummary(auditResult: A11yAuditResult): ReportSummary {
  const issues = auditResult.issues;

  const byImpact = {
    critical: issues.filter(i => i.impact === 'critical').length,
    serious: issues.filter(i => i.impact === 'serious').length,
    moderate: issues.filter(i => i.impact === 'moderate').length,
    minor: issues.filter(i => i.impact === 'minor').length,
  };

  const totalChecks = issues.length + (auditResult.passes?.length || 0);
  const passRate = totalChecks > 0 ? ((auditResult.passes?.length || 0) / totalChecks) * 100 : 100;

  // Group issues by rule for top issues
  const issuesByRule = new Map<string, number>();
  for (const issue of issues) {
    issuesByRule.set(issue.rule, (issuesByRule.get(issue.rule) || 0) + 1);
  }

  const topIssues = Array.from(issuesByRule.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([rule, count]) => `${rule} (${count})`);

  // Estimate WCAG compliance
  const wcagCompliance = {
    levelA: estimateCompliance(issues, 'A'),
    levelAA: estimateCompliance(issues, 'AA'),
    levelAAA: estimateCompliance(issues, 'AAA'),
  };

  return {
    totalIssues: issues.length,
    byImpact,
    passRate: Math.round(passRate),
    wcagCompliance,
    topIssues,
  };
}

function estimateCompliance(issues: A11yIssue[], level: string): number {
  // Count issues that affect each WCAG level
  const levelIssues = issues.filter(i => {
    const rule = i.rule.toLowerCase();
    // Level A issues (basic)
    const levelAIssues = ['image-alt', 'label', 'link-name', 'button-name', 'document-title', 'html-lang', 'keyboard'];
    // Level AA issues
    const levelAAIssues = ['color-contrast', 'focus-visible', 'heading-order', 'meta-viewport'];
    // Level AAA issues
    const levelAAAIssues = ['color-contrast-enhanced'];

    if (level === 'A') {
      return levelAIssues.some(l => rule.includes(l));
    } else if (level === 'AA') {
      return levelAAIssues.some(l => rule.includes(l)) || levelAIssues.some(l => rule.includes(l));
    } else {
      return true; // All issues affect AAA
    }
  });

  // Rough compliance estimation
  if (levelIssues.length === 0) return 100;
  if (levelIssues.length <= 2) return 90;
  if (levelIssues.length <= 5) return 75;
  if (levelIssues.length <= 10) return 50;
  return 25;
}

function generateHtmlReport(
  auditResult: A11yAuditResult,
  summary: ReportSummary,
  options: {
    pageTitle: string;
    pageUrl?: string;
    reportTitle: string;
    includeFixes: boolean;
    branding: AccessibilityReportOptions['branding'];
  }
): string {
  const { pageTitle, pageUrl, reportTitle, includeFixes, branding } = options;
  const primaryColor = branding?.primaryColor || '#2563eb';
  const companyName = branding?.companyName || 'BarrHawk';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${reportTitle}</title>
  <style>
    :root {
      --primary: ${primaryColor};
      --critical: #dc2626;
      --serious: #ea580c;
      --moderate: #ca8a04;
      --minor: #16a34a;
      --bg: #f8fafc;
      --card: #ffffff;
      --text: #1e293b;
      --muted: #64748b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    header {
      background: var(--primary);
      color: white;
      padding: 2rem;
      margin-bottom: 2rem;
      border-radius: 12px;
    }
    header h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    header .meta { opacity: 0.9; font-size: 0.875rem; }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .summary-card {
      background: var(--card);
      padding: 1.5rem;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .summary-card h3 { color: var(--muted); font-size: 0.875rem; text-transform: uppercase; margin-bottom: 0.5rem; }
    .summary-card .value { font-size: 2rem; font-weight: 700; }
    .summary-card .value.critical { color: var(--critical); }
    .summary-card .value.serious { color: var(--serious); }
    .summary-card .value.moderate { color: var(--moderate); }
    .summary-card .value.minor { color: var(--minor); }
    .compliance-bar {
      display: flex;
      gap: 1rem;
      margin-top: 1rem;
    }
    .compliance-item {
      flex: 1;
      text-align: center;
    }
    .compliance-item .level { font-weight: 600; margin-bottom: 0.25rem; }
    .compliance-item .percent { font-size: 1.5rem; font-weight: 700; color: var(--primary); }
    .section { margin-bottom: 2rem; }
    .section h2 {
      font-size: 1.5rem;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid var(--primary);
    }
    .issue {
      background: var(--card);
      padding: 1.5rem;
      border-radius: 12px;
      margin-bottom: 1rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border-left: 4px solid var(--muted);
    }
    .issue.critical { border-left-color: var(--critical); }
    .issue.serious { border-left-color: var(--serious); }
    .issue.moderate { border-left-color: var(--moderate); }
    .issue.minor { border-left-color: var(--minor); }
    .issue-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.75rem;
    }
    .issue-title { font-weight: 600; font-size: 1.1rem; }
    .impact-badge {
      font-size: 0.75rem;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .impact-badge.critical { background: #fef2f2; color: var(--critical); }
    .impact-badge.serious { background: #fff7ed; color: var(--serious); }
    .impact-badge.moderate { background: #fefce8; color: var(--moderate); }
    .impact-badge.minor { background: #f0fdf4; color: var(--minor); }
    .issue-description { color: var(--muted); margin-bottom: 0.75rem; }
    .issue-details { font-size: 0.875rem; }
    .issue-details dt { font-weight: 600; margin-top: 0.5rem; }
    .issue-details dd { color: var(--muted); }
    .code-block {
      background: #1e293b;
      color: #e2e8f0;
      padding: 1rem;
      border-radius: 8px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 0.875rem;
      overflow-x: auto;
      margin-top: 0.5rem;
    }
    .fix-section {
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid #e2e8f0;
    }
    .fix-section h4 { color: var(--primary); margin-bottom: 0.5rem; }
    .passes-summary {
      background: #f0fdf4;
      border: 1px solid #86efac;
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 1rem;
    }
    .footer {
      text-align: center;
      padding: 2rem;
      color: var(--muted);
      font-size: 0.875rem;
    }
    @media print {
      body { background: white; }
      .container { padding: 0; }
      .issue { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${reportTitle}</h1>
      <div class="meta">
        <p><strong>Page:</strong> ${pageTitle}${pageUrl ? ` (${pageUrl})` : ''}</p>
        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>By:</strong> ${companyName} E2E Testing Platform</p>
      </div>
    </header>

    <section class="section">
      <h2>Executive Summary</h2>
      <div class="summary-grid">
        <div class="summary-card">
          <h3>Total Issues</h3>
          <div class="value">${summary.totalIssues}</div>
        </div>
        <div class="summary-card">
          <h3>Critical</h3>
          <div class="value critical">${summary.byImpact.critical}</div>
        </div>
        <div class="summary-card">
          <h3>Serious</h3>
          <div class="value serious">${summary.byImpact.serious}</div>
        </div>
        <div class="summary-card">
          <h3>Moderate</h3>
          <div class="value moderate">${summary.byImpact.moderate}</div>
        </div>
        <div class="summary-card">
          <h3>Minor</h3>
          <div class="value minor">${summary.byImpact.minor}</div>
        </div>
        <div class="summary-card">
          <h3>Pass Rate</h3>
          <div class="value">${summary.passRate}%</div>
        </div>
      </div>

      <div class="summary-card">
        <h3>WCAG Compliance Estimate</h3>
        <div class="compliance-bar">
          <div class="compliance-item">
            <div class="level">Level A</div>
            <div class="percent">${summary.wcagCompliance.levelA}%</div>
          </div>
          <div class="compliance-item">
            <div class="level">Level AA</div>
            <div class="percent">${summary.wcagCompliance.levelAA}%</div>
          </div>
          <div class="compliance-item">
            <div class="level">Level AAA</div>
            <div class="percent">${summary.wcagCompliance.levelAAA}%</div>
          </div>
        </div>
      </div>
    </section>

    ${summary.topIssues.length > 0 ? `
    <section class="section">
      <h2>Top Issues to Address</h2>
      <ol>
        ${summary.topIssues.map(issue => `<li>${issue}</li>`).join('\n        ')}
      </ol>
    </section>
    ` : ''}

    <section class="section">
      <h2>Detailed Findings (${auditResult.issues.length})</h2>
      ${auditResult.issues.length === 0 ? `
      <div class="passes-summary">
        ✅ No accessibility issues found! Great job maintaining accessibility.
      </div>
      ` : ''}
      ${auditResult.issues.map((issue, index) => `
      <div class="issue ${issue.impact || 'moderate'}">
        <div class="issue-header">
          <span class="issue-title">${index + 1}. ${issue.rule}</span>
          <span class="impact-badge ${issue.impact || 'moderate'}">${issue.impact || 'moderate'}</span>
        </div>
        <p class="issue-description">${issue.description || 'Accessibility issue detected'}</p>
        <dl class="issue-details">
          ${issue.selector ? `<dt>Selector</dt><dd><code>${escapeHtml(issue.selector)}</code></dd>` : ''}
          ${issue.html ? `<dt>Element</dt><dd><div class="code-block">${escapeHtml(issue.html)}</div></dd>` : ''}
          ${issue.wcag ? `<dt>WCAG</dt><dd>${issue.wcag}</dd>` : ''}
        </dl>
        ${includeFixes && issue.fix ? `
        <div class="fix-section">
          <h4>Recommended Fix</h4>
          <p>${issue.fix}</p>
        </div>
        ` : ''}
      </div>
      `).join('\n')}
    </section>

    ${auditResult.passes && auditResult.passes.length > 0 ? `
    <section class="section">
      <h2>Passed Checks (${auditResult.passes.length})</h2>
      <div class="passes-summary">
        ✅ The following accessibility checks passed:
        <ul>
          ${auditResult.passes.slice(0, 10).map(pass => `<li>${pass}</li>`).join('\n          ')}
          ${auditResult.passes.length > 10 ? `<li>...and ${auditResult.passes.length - 10} more</li>` : ''}
        </ul>
      </div>
    </section>
    ` : ''}

    <footer class="footer">
      <p>Generated by ${companyName} E2E Testing Platform</p>
      <p>For questions about this report, contact your development team.</p>
    </footer>
  </div>
</body>
</html>`;
}

function generateMarkdownReport(
  auditResult: A11yAuditResult,
  summary: ReportSummary,
  options: {
    pageTitle: string;
    pageUrl?: string;
    reportTitle: string;
    includeFixes: boolean;
  }
): string {
  const { pageTitle, pageUrl, reportTitle, includeFixes } = options;

  const lines: string[] = [];

  lines.push(`# ${reportTitle}`);
  lines.push('');
  lines.push(`**Page:** ${pageTitle}${pageUrl ? ` (${pageUrl})` : ''}`);
  lines.push(`**Generated:** ${new Date().toLocaleString()}`);
  lines.push('');

  lines.push('## Executive Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Issues | ${summary.totalIssues} |`);
  lines.push(`| Critical | ${summary.byImpact.critical} |`);
  lines.push(`| Serious | ${summary.byImpact.serious} |`);
  lines.push(`| Moderate | ${summary.byImpact.moderate} |`);
  lines.push(`| Minor | ${summary.byImpact.minor} |`);
  lines.push(`| Pass Rate | ${summary.passRate}% |`);
  lines.push('');

  lines.push('### WCAG Compliance');
  lines.push('');
  lines.push(`- Level A: ${summary.wcagCompliance.levelA}%`);
  lines.push(`- Level AA: ${summary.wcagCompliance.levelAA}%`);
  lines.push(`- Level AAA: ${summary.wcagCompliance.levelAAA}%`);
  lines.push('');

  if (summary.topIssues.length > 0) {
    lines.push('### Top Issues');
    lines.push('');
    summary.topIssues.forEach((issue, i) => lines.push(`${i + 1}. ${issue}`));
    lines.push('');
  }

  lines.push('## Detailed Findings');
  lines.push('');

  if (auditResult.issues.length === 0) {
    lines.push('✅ No accessibility issues found!');
  } else {
    auditResult.issues.forEach((issue, index) => {
      lines.push(`### ${index + 1}. ${issue.rule}`);
      lines.push('');
      lines.push(`**Impact:** ${issue.impact || 'moderate'}`);
      lines.push('');
      lines.push(issue.description || 'Accessibility issue detected');
      lines.push('');

      if (issue.selector) {
        lines.push(`**Selector:** \`${issue.selector}\``);
        lines.push('');
      }

      if (issue.html) {
        lines.push('**Element:**');
        lines.push('```html');
        lines.push(issue.html);
        lines.push('```');
        lines.push('');
      }

      if (issue.wcag) {
        lines.push(`**WCAG:** ${issue.wcag}`);
        lines.push('');
      }

      if (includeFixes && issue.fix) {
        lines.push('**Recommended Fix:**');
        lines.push(issue.fix);
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    });
  }

  if (auditResult.passes && auditResult.passes.length > 0) {
    lines.push('## Passed Checks');
    lines.push('');
    auditResult.passes.forEach(pass => lines.push(`- ✅ ${pass}`));
    lines.push('');
  }

  lines.push('---');
  lines.push('*Generated by BarrHawk E2E Testing Platform*');

  return lines.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Save report to file
 */
export function getReportFilename(format: string, pageTitle?: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const pageName = pageTitle?.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 30) || 'page';
  const extension = format === 'html' ? 'html' : format === 'markdown' ? 'md' : 'json';

  return `a11y-report-${pageName}-${timestamp}.${extension}`;
}
