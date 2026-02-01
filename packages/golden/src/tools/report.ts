/**
 * Golden Report Tool
 *
 * Generate quality reports from golden test results.
 */

import type { ReportOptions, GoldenRunResult } from '../types.js';
import { getRunResult } from './run.js';

/**
 * Generate a report from golden test results
 */
export function generateReport(options: ReportOptions): string {
  const result = getRunResult(options.runId);
  if (!result) {
    return `Run not found: ${options.runId}`;
  }

  switch (options.format) {
    case 'json':
      return generateJsonReport(result);
    case 'html':
      return generateHtmlReport(result);
    case 'detailed':
      return generateDetailedReport(result);
    case 'summary':
    default:
      return generateSummaryReport(result);
  }
}

function generateSummaryReport(result: GoldenRunResult): string {
  const passRate = ((result.summary.passed / result.summary.total) * 100).toFixed(1);

  let output = `\n╔══════════════════════════════════════════════════╗\n`;
  output += `║           GOLDEN GIRL QUALITY REPORT             ║\n`;
  output += `╚══════════════════════════════════════════════════╝\n\n`;

  output += `Run ID: ${result.runId}\n`;
  output += `Suite: ${result.suite}\n`;
  output += `Timestamp: ${result.timestamp}\n`;
  output += `Duration: ${(result.duration / 1000).toFixed(2)}s\n\n`;

  output += `┌─────────────────────────────────────────────────┐\n`;
  output += `│ RESULTS                                         │\n`;
  output += `├─────────────────────────────────────────────────┤\n`;
  output += `│ Total Tests:    ${String(result.summary.total).padStart(4)}                          │\n`;
  output += `│ Passed:         ${String(result.summary.passed).padStart(4)} ✅                       │\n`;
  output += `│ Failed:         ${String(result.summary.failed).padStart(4)} ❌                       │\n`;
  output += `│ Skipped:        ${String(result.summary.skipped).padStart(4)} ⏭️                        │\n`;
  output += `│ Pass Rate:      ${passRate.padStart(5)}%                       │\n`;
  output += `│ Avg Score:      ${(result.summary.averageScore * 100).toFixed(1).padStart(5)}%                       │\n`;
  output += `└─────────────────────────────────────────────────┘\n`;

  // Quick breakdown by status
  const failed = result.results.filter(r => !r.score.passed && !r.error);
  if (failed.length > 0) {
    output += `\n⚠️  FAILED TESTS:\n`;
    for (const r of failed.slice(0, 5)) {
      output += `   • ${r.testCase.name}: ${(r.score.score * 100).toFixed(0)}%\n`;
    }
    if (failed.length > 5) {
      output += `   ... and ${failed.length - 5} more\n`;
    }
  }

  return output;
}

function generateDetailedReport(result: GoldenRunResult): string {
  let output = generateSummaryReport(result);

  output += `\n${'═'.repeat(50)}\n`;
  output += `DETAILED BREAKDOWN\n`;
  output += `${'═'.repeat(50)}\n\n`;

  for (const r of result.results) {
    const icon = r.score.passed ? '✅' : r.error ? '⏭️' : '❌';
    const scoreStr = (r.score.score * 100).toFixed(0);

    output += `${icon} ${r.testCase.name}\n`;
    output += `   Score: ${scoreStr}% | Mode: ${r.testCase.matchMode} | Threshold: ${(r.testCase.threshold * 100).toFixed(0)}%\n`;

    if (r.error) {
      output += `   Error: ${r.error}\n`;
    }

    if (r.score.breakdown.length > 0) {
      output += `   Checks:\n`;
      for (const b of r.score.breakdown) {
        const checkIcon = b.score >= 0.5 ? '✓' : '✗';
        output += `     ${checkIcon} ${b.check}\n`;
        output += `       ${b.details}\n`;
      }
    }

    output += '\n';
  }

  return output;
}

function generateJsonReport(result: GoldenRunResult): string {
  return JSON.stringify(result, null, 2);
}

function generateHtmlReport(result: GoldenRunResult): string {
  const passRate = ((result.summary.passed / result.summary.total) * 100).toFixed(1);
  const avgScore = (result.summary.averageScore * 100).toFixed(1);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Golden Girl Report - ${result.suite}</title>
    <style>
        :root {
            --bg: #0d1117;
            --card: #161b22;
            --border: #30363d;
            --text: #c9d1d9;
            --muted: #8b949e;
            --success: #3fb950;
            --danger: #f85149;
            --warning: #d29922;
            --accent: #58a6ff;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: var(--bg);
            color: var(--text);
            padding: 2rem;
            line-height: 1.6;
        }
        .container { max-width: 1000px; margin: 0 auto; }
        h1 { font-size: 2rem; margin-bottom: 0.5rem; }
        .subtitle { color: var(--muted); margin-bottom: 2rem; }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }
        .stat {
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 1.5rem;
            text-align: center;
        }
        .stat-value {
            font-size: 2rem;
            font-weight: bold;
            color: var(--accent);
        }
        .stat-value.pass { color: var(--success); }
        .stat-value.fail { color: var(--danger); }
        .stat-label { color: var(--muted); margin-top: 0.5rem; }
        .results {
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 8px;
            overflow: hidden;
        }
        .result-header {
            padding: 1rem;
            background: rgba(255,255,255,0.05);
            border-bottom: 1px solid var(--border);
            font-weight: 600;
        }
        .result-item {
            padding: 1rem;
            border-bottom: 1px solid var(--border);
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        .result-item:last-child { border-bottom: none; }
        .result-icon { font-size: 1.5rem; }
        .result-name { flex: 1; font-weight: 500; }
        .result-score {
            font-family: monospace;
            padding: 0.25rem 0.75rem;
            border-radius: 4px;
            background: rgba(255,255,255,0.1);
        }
        .result-score.pass { background: rgba(63, 185, 80, 0.2); color: var(--success); }
        .result-score.fail { background: rgba(248, 81, 73, 0.2); color: var(--danger); }
        .breakdown {
            margin-top: 0.5rem;
            font-size: 0.875rem;
            color: var(--muted);
        }
        .check { margin-left: 2rem; }
        .check.pass::before { content: '✓ '; color: var(--success); }
        .check.fail::before { content: '✗ '; color: var(--danger); }
    </style>
</head>
<body>
    <div class="container">
        <h1>Golden Girl Quality Report</h1>
        <p class="subtitle">Suite: ${result.suite} | ${result.timestamp}</p>

        <div class="stats">
            <div class="stat">
                <div class="stat-value">${result.summary.total}</div>
                <div class="stat-label">Total Tests</div>
            </div>
            <div class="stat">
                <div class="stat-value pass">${result.summary.passed}</div>
                <div class="stat-label">Passed</div>
            </div>
            <div class="stat">
                <div class="stat-value fail">${result.summary.failed}</div>
                <div class="stat-label">Failed</div>
            </div>
            <div class="stat">
                <div class="stat-value">${passRate}%</div>
                <div class="stat-label">Pass Rate</div>
            </div>
            <div class="stat">
                <div class="stat-value">${avgScore}%</div>
                <div class="stat-label">Avg Score</div>
            </div>
        </div>

        <div class="results">
            <div class="result-header">Test Results</div>
            ${result.results.map(r => `
            <div class="result-item">
                <span class="result-icon">${r.score.passed ? '✅' : r.error ? '⏭️' : '❌'}</span>
                <span class="result-name">${r.testCase.name}</span>
                <span class="result-score ${r.score.passed ? 'pass' : 'fail'}">${(r.score.score * 100).toFixed(0)}%</span>
            </div>
            ${r.score.breakdown.length > 0 ? `
            <div class="breakdown">
                ${r.score.breakdown.map(b => `
                <div class="check ${b.score >= 0.5 ? 'pass' : 'fail'}">${b.check}: ${b.details}</div>
                `).join('')}
            </div>
            ` : ''}
            `).join('')}
        </div>
    </div>
</body>
</html>`;
}
