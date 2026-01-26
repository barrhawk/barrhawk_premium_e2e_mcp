#!/usr/bin/env npx tsx
/**
 * BarrHawk E2E Observability Web Viewer
 *
 * Visual dashboard for browsing test runs, logs, screenshots, and network requests.
 *
 * Usage:
 *   npx tsx packages/observability/viewer.ts [--port=3030] [--data-dir=./observability-data]
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getObservabilityStore, type TestRunRecord, type LogEntry, type ScreenshotRecord, type NetworkRecord } from './store.js';

// =============================================================================
// Configuration
// =============================================================================

const args = process.argv.slice(2);
const PORT = parseInt(args.find(a => a.startsWith('--port='))?.split('=')[1] || '3030');
const DATA_DIR = args.find(a => a.startsWith('--data-dir='))?.split('=')[1] || './observability-data';

// =============================================================================
// HTML Templates
// =============================================================================

function pageLayout(title: string, content: string, nav: string = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - BarrHawk Observability</title>
  <style>
    :root {
      --bg-primary: #0f172a;
      --bg-secondary: #1e293b;
      --bg-tertiary: #334155;
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --accent-blue: #3b82f6;
      --accent-green: #22c55e;
      --accent-red: #ef4444;
      --accent-yellow: #eab308;
      --accent-purple: #a855f7;
      --accent-cyan: #06b6d4;
      --border-color: #334155;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
    }

    header {
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      padding: 16px 0;
      margin-bottom: 24px;
    }

    header .container {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .logo {
      font-size: 1.5rem;
      font-weight: bold;
      color: var(--accent-blue);
    }

    .logo span { color: var(--text-muted); }

    nav a {
      color: var(--text-secondary);
      text-decoration: none;
      margin-left: 24px;
      transition: color 0.2s;
    }

    nav a:hover { color: var(--text-primary); }
    nav a.active { color: var(--accent-blue); }

    h1 { font-size: 1.75rem; margin-bottom: 24px; }
    h2 { font-size: 1.25rem; margin-bottom: 16px; color: var(--text-secondary); }
    h3 { font-size: 1rem; margin-bottom: 12px; }

    .card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 16px;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border-color);
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      text-align: left;
      padding: 12px;
      border-bottom: 1px solid var(--border-color);
    }

    th {
      color: var(--text-muted);
      font-weight: normal;
      font-size: 0.85rem;
      text-transform: uppercase;
    }

    tr:hover { background: var(--bg-tertiary); }

    .badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: bold;
    }

    .badge-passed { background: rgba(34, 197, 94, 0.2); color: var(--accent-green); }
    .badge-failed { background: rgba(239, 68, 68, 0.2); color: var(--accent-red); }
    .badge-running { background: rgba(234, 179, 8, 0.2); color: var(--accent-yellow); }
    .badge-cancelled { background: rgba(100, 116, 139, 0.2); color: var(--text-muted); }

    .badge-ai_agent { background: rgba(168, 85, 247, 0.2); color: var(--accent-purple); }
    .badge-human_dashboard { background: rgba(59, 130, 246, 0.2); color: var(--accent-blue); }
    .badge-human_api { background: rgba(6, 182, 212, 0.2); color: var(--accent-cyan); }
    .badge-scheduled { background: rgba(100, 116, 139, 0.2); color: var(--text-muted); }
    .badge-ci_cd { background: rgba(234, 179, 8, 0.2); color: var(--accent-yellow); }

    .log-error { color: var(--accent-red); }
    .log-warn { color: var(--accent-yellow); }
    .log-info { color: var(--accent-blue); }
    .log-debug { color: var(--text-muted); }

    .log-entry {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-color);
      font-family: monospace;
      font-size: 0.85rem;
    }

    .log-entry:hover { background: var(--bg-tertiary); }

    .log-time { color: var(--text-muted); margin-right: 12px; }
    .log-type { color: var(--text-secondary); margin-right: 12px; }

    .screenshot-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
    }

    .screenshot-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      overflow: hidden;
    }

    .screenshot-card img {
      width: 100%;
      height: 200px;
      object-fit: cover;
      border-bottom: 1px solid var(--border-color);
    }

    .screenshot-info {
      padding: 12px;
      font-size: 0.85rem;
    }

    .screenshot-info p {
      color: var(--text-secondary);
      margin-bottom: 4px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .stat-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }

    .stat-value {
      font-size: 2.5rem;
      font-weight: bold;
      color: var(--accent-blue);
    }

    .stat-label {
      color: var(--text-muted);
      font-size: 0.85rem;
      margin-top: 4px;
    }

    a { color: var(--accent-blue); text-decoration: none; }
    a:hover { text-decoration: underline; }

    .empty {
      text-align: center;
      padding: 40px;
      color: var(--text-muted);
    }

    .network-status-ok { color: var(--accent-green); }
    .network-status-redirect { color: var(--accent-yellow); }
    .network-status-error { color: var(--accent-red); }

    pre {
      background: var(--bg-primary);
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 0.85rem;
    }

    .tabs {
      display: flex;
      border-bottom: 1px solid var(--border-color);
      margin-bottom: 20px;
    }

    .tab {
      padding: 12px 24px;
      color: var(--text-secondary);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    }

    .tab:hover { color: var(--text-primary); }
    .tab.active { color: var(--accent-blue); border-bottom-color: var(--accent-blue); }

    .filter-bar {
      display: flex;
      gap: 12px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }

    .filter-bar select, .filter-bar input {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      padding: 8px 12px;
      border-radius: 4px;
      font-family: inherit;
    }

    .refresh-btn {
      background: var(--accent-blue);
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
    }

    .refresh-btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <header>
    <div class="container">
      <div class="logo">BarrHawk <span>Observability</span></div>
      <nav>
        <a href="/" class="${nav === 'home' ? 'active' : ''}">Dashboard</a>
        <a href="/runs" class="${nav === 'runs' ? 'active' : ''}">Test Runs</a>
        <a href="/stats" class="${nav === 'stats' ? 'active' : ''}">Statistics</a>
      </nav>
    </div>
  </header>
  <main class="container">
    ${content}
  </main>
</body>
</html>`;
}

function formatDate(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '').substring(0, 19);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// =============================================================================
// Page Handlers
// =============================================================================

async function homePage(): Promise<string> {
  const store = await getObservabilityStore(DATA_DIR);
  const runs = await store.getRuns({ limit: 10 });
  const stats = await store.getStats();

  const runsHtml = runs.length === 0
    ? '<div class="empty">No test runs yet</div>'
    : `<table>
        <thead>
          <tr>
            <th>Run ID</th>
            <th>Status</th>
            <th>Origin</th>
            <th>Started</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          ${runs.map(run => `
            <tr>
              <td><a href="/run/${run.runId}">${run.runId.substring(0, 20)}...</a></td>
              <td><span class="badge badge-${run.status}">${run.status.toUpperCase()}</span></td>
              <td><span class="badge badge-${run.origin}">${run.origin}</span></td>
              <td>${formatDate(run.startedAt)}</td>
              <td>${run.duration ? formatDuration(run.duration) : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;

  return pageLayout('Dashboard', `
    <h1>Observability Dashboard</h1>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${stats.totalRuns}</div>
        <div class="stat-label">Total Runs</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.totalLogs}</div>
        <div class="stat-label">Log Entries</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.totalScreenshots}</div>
        <div class="stat-label">Screenshots</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.totalNetworkRequests}</div>
        <div class="stat-label">Network Requests</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2>Recent Test Runs</h2>
        <a href="/runs">View All</a>
      </div>
      ${runsHtml}
    </div>
  `, 'home');
}

async function runsPage(query: URLSearchParams): Promise<string> {
  const store = await getObservabilityStore(DATA_DIR);
  const status = query.get('status') || undefined;
  const origin = query.get('origin') || undefined;
  const runs = await store.getRuns({ status, origin, limit: 50 });

  const runsHtml = runs.length === 0
    ? '<div class="empty">No test runs found</div>'
    : `<table>
        <thead>
          <tr>
            <th>Run ID</th>
            <th>Project</th>
            <th>Status</th>
            <th>Origin</th>
            <th>Started</th>
            <th>Duration</th>
            <th>Tests</th>
          </tr>
        </thead>
        <tbody>
          ${runs.map(run => `
            <tr>
              <td><a href="/run/${run.runId}">${run.runId.substring(0, 20)}...</a></td>
              <td>${run.projectId}</td>
              <td><span class="badge badge-${run.status}">${run.status.toUpperCase()}</span></td>
              <td><span class="badge badge-${run.origin}">${run.origin}</span></td>
              <td>${formatDate(run.startedAt)}</td>
              <td>${run.duration ? formatDuration(run.duration) : '-'}</td>
              <td>${run.summary ? `${run.summary.passed}/${run.summary.total}` : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;

  return pageLayout('Test Runs', `
    <h1>Test Runs</h1>

    <div class="filter-bar">
      <select onchange="location.href='/runs?status='+this.value+'&origin=${origin || ''}'">
        <option value="">All Statuses</option>
        <option value="passed" ${status === 'passed' ? 'selected' : ''}>Passed</option>
        <option value="failed" ${status === 'failed' ? 'selected' : ''}>Failed</option>
        <option value="running" ${status === 'running' ? 'selected' : ''}>Running</option>
      </select>
      <select onchange="location.href='/runs?status=${status || ''}&origin='+this.value">
        <option value="">All Origins</option>
        <option value="ai_agent" ${origin === 'ai_agent' ? 'selected' : ''}>AI Agent</option>
        <option value="human_dashboard" ${origin === 'human_dashboard' ? 'selected' : ''}>Dashboard</option>
        <option value="human_api" ${origin === 'human_api' ? 'selected' : ''}>API</option>
        <option value="ci_cd" ${origin === 'ci_cd' ? 'selected' : ''}>CI/CD</option>
      </select>
      <button class="refresh-btn" onclick="location.reload()">Refresh</button>
    </div>

    <div class="card">
      ${runsHtml}
    </div>
  `, 'runs');
}

async function runDetailPage(runId: string): Promise<string> {
  const store = await getObservabilityStore(DATA_DIR);
  const summary = await store.getRunSummary(runId);

  if (!summary) {
    return pageLayout('Run Not Found', '<div class="empty">Test run not found</div>');
  }

  const { run } = summary;
  const logs = await store.getLogs(runId, { limit: 200 });
  const screenshots = await store.getScreenshots(runId);
  const network = await store.getNetworkRequests(runId);

  const logsHtml = logs.map(log => {
    const levelClass = log.level ? `log-${log.level}` : '';
    const time = formatDate(log.timestamp).substring(11, 19);
    return `<div class="log-entry ${levelClass}">
      <span class="log-time">${time}</span>
      <span class="log-type">[${log.type}]</span>
      <span class="log-message">${escapeHtml(log.message)}</span>
    </div>`;
  }).join('');

  const screenshotsHtml = screenshots.length === 0
    ? '<div class="empty">No screenshots captured</div>'
    : `<div class="screenshot-grid">
        ${screenshots.map(ss => `
          <div class="screenshot-card">
            <a href="/screenshot/${runId}/${ss.id}" target="_blank">
              <img src="/screenshot/${runId}/${ss.id}/thumb" alt="Screenshot" onerror="this.style.display='none'">
            </a>
            <div class="screenshot-info">
              <p><strong>${ss.type}</strong> - ${ss.width}x${ss.height}</p>
              <p>${formatSize(ss.sizeBytes)} - ${formatDate(ss.timestamp).substring(11, 19)}</p>
              <p><a href="${ss.url}" target="_blank">View Full</a></p>
            </div>
          </div>
        `).join('')}
      </div>`;

  const networkHtml = network.length === 0
    ? '<div class="empty">No network requests captured</div>'
    : `<table>
        <thead>
          <tr>
            <th>Method</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Size</th>
            <th>URL</th>
          </tr>
        </thead>
        <tbody>
          ${network.slice(0, 100).map(req => {
            const statusClass = !req.status ? '' :
              req.status < 300 ? 'network-status-ok' :
              req.status < 400 ? 'network-status-redirect' : 'network-status-error';
            return `<tr>
              <td>${req.method}</td>
              <td class="${statusClass}">${req.status || '-'}</td>
              <td>${req.duration ? formatDuration(req.duration) : '-'}</td>
              <td>${req.responseSize ? formatSize(req.responseSize) : '-'}</td>
              <td title="${escapeHtml(req.url)}">${escapeHtml(req.url.substring(0, 60))}${req.url.length > 60 ? '...' : ''}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;

  return pageLayout(`Run ${runId.substring(0, 12)}`, `
    <h1>Test Run Details</h1>

    <div class="card">
      <div class="card-header">
        <h2>Run Information</h2>
        <span class="badge badge-${run.status}">${run.status.toUpperCase()}</span>
      </div>
      <table>
        <tr><td><strong>Run ID</strong></td><td>${run.runId}</td></tr>
        <tr><td><strong>Project</strong></td><td>${run.projectId}</td></tr>
        <tr><td><strong>Origin</strong></td><td><span class="badge badge-${run.origin}">${run.origin}</span></td></tr>
        <tr><td><strong>Started</strong></td><td>${formatDate(run.startedAt)}</td></tr>
        ${run.completedAt ? `<tr><td><strong>Completed</strong></td><td>${formatDate(run.completedAt)}</td></tr>` : ''}
        ${run.duration ? `<tr><td><strong>Duration</strong></td><td>${formatDuration(run.duration)}</td></tr>` : ''}
        ${run.summary ? `
          <tr><td><strong>Tests</strong></td><td>
            <span style="color: var(--accent-green)">${run.summary.passed} passed</span> /
            <span style="color: var(--accent-red)">${run.summary.failed} failed</span> /
            ${run.summary.skipped} skipped
          </td></tr>
        ` : ''}
      </table>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${summary.logCount}</div>
        <div class="stat-label">Log Entries</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${summary.consoleLogCount}</div>
        <div class="stat-label">Console Logs</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: ${summary.errorCount > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}">${summary.errorCount}</div>
        <div class="stat-label">Errors</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${summary.screenshotCount}</div>
        <div class="stat-label">Screenshots</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${summary.networkRequestCount}</div>
        <div class="stat-label">Network Requests</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2>Screenshots (${screenshots.length})</h2>
      </div>
      ${screenshotsHtml}
    </div>

    <div class="card">
      <div class="card-header">
        <h2>Logs (${logs.length})</h2>
      </div>
      <div style="max-height: 500px; overflow-y: auto;">
        ${logsHtml || '<div class="empty">No logs captured</div>'}
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2>Network Requests (${network.length})</h2>
      </div>
      <div style="max-height: 400px; overflow-y: auto;">
        ${networkHtml}
      </div>
    </div>
  `);
}

async function statsPage(): Promise<string> {
  const store = await getObservabilityStore(DATA_DIR);
  const stats = await store.getStats();

  const statusChart = Object.entries(stats.runsByStatus).map(([status, count]) =>
    `<div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-color);">
      <span class="badge badge-${status}">${status.toUpperCase()}</span>
      <span>${count}</span>
    </div>`
  ).join('');

  const originChart = Object.entries(stats.runsByOrigin).map(([origin, count]) =>
    `<div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-color);">
      <span class="badge badge-${origin}">${origin}</span>
      <span>${count}</span>
    </div>`
  ).join('');

  return pageLayout('Statistics', `
    <h1>Statistics</h1>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${stats.totalRuns}</div>
        <div class="stat-label">Total Test Runs</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.totalLogs}</div>
        <div class="stat-label">Total Log Entries</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.totalScreenshots}</div>
        <div class="stat-label">Total Screenshots</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.totalNetworkRequests}</div>
        <div class="stat-label">Total Network Requests</div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
      <div class="card">
        <div class="card-header">
          <h2>Runs by Status</h2>
        </div>
        ${statusChart || '<div class="empty">No data</div>'}
      </div>

      <div class="card">
        <div class="card-header">
          <h2>Runs by Origin</h2>
        </div>
        ${originChart || '<div class="empty">No data</div>'}
      </div>
    </div>
  `, 'stats');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// =============================================================================
// HTTP Server
// =============================================================================

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    // API endpoints
    if (pathname.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json');

      if (pathname === '/api/runs') {
        const store = await getObservabilityStore(DATA_DIR);
        const runs = await store.getRuns({ limit: 100 });
        res.end(JSON.stringify(runs));
        return;
      }

      if (pathname.startsWith('/api/run/')) {
        const runId = pathname.split('/')[3];
        const store = await getObservabilityStore(DATA_DIR);
        const summary = await store.getRunSummary(runId);
        res.end(JSON.stringify(summary));
        return;
      }

      if (pathname.startsWith('/api/logs/')) {
        const runId = pathname.split('/')[3];
        const store = await getObservabilityStore(DATA_DIR);
        const logs = await store.getLogs(runId, { limit: 500 });
        res.end(JSON.stringify(logs));
        return;
      }

      if (pathname.startsWith('/api/screenshots/')) {
        const runId = pathname.split('/')[3];
        const store = await getObservabilityStore(DATA_DIR);
        const screenshots = await store.getScreenshots(runId);
        res.end(JSON.stringify(screenshots));
        return;
      }

      if (pathname.startsWith('/api/network/')) {
        const runId = pathname.split('/')[3];
        const store = await getObservabilityStore(DATA_DIR);
        const network = await store.getNetworkRequests(runId);
        res.end(JSON.stringify(network));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Screenshot serving
    if (pathname.startsWith('/screenshot/')) {
      const parts = pathname.split('/');
      const runId = parts[2];
      const ssId = parts[3];

      const store = await getObservabilityStore(DATA_DIR);
      const screenshots = await store.getScreenshots(runId);
      const ss = screenshots.find(s => s.id === ssId);

      if (ss && ss.url && existsSync(ss.url)) {
        const content = await readFile(ss.url);
        res.setHeader('Content-Type', 'image/png');
        res.end(content);
        return;
      }

      res.statusCode = 404;
      res.end('Screenshot not found');
      return;
    }

    // HTML pages
    res.setHeader('Content-Type', 'text/html');

    if (pathname === '/') {
      res.end(await homePage());
      return;
    }

    if (pathname === '/runs') {
      res.end(await runsPage(url.searchParams));
      return;
    }

    if (pathname.startsWith('/run/')) {
      const runId = pathname.substring(5);
      res.end(await runDetailPage(runId));
      return;
    }

    if (pathname === '/stats') {
      res.end(await statsPage());
      return;
    }

    res.statusCode = 404;
    res.end(pageLayout('Not Found', '<div class="empty">Page not found</div>'));

  } catch (error) {
    console.error('Request error:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html');
    res.end(pageLayout('Error', `<div class="empty">Server error: ${error instanceof Error ? error.message : 'Unknown'}</div>`));
  }
}

// =============================================================================
// Main
// =============================================================================

const server = createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║          BarrHawk Observability Viewer                    ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║   Dashboard: http://localhost:${PORT.toString().padEnd(4)}                        ║
║   Data Dir:  ${DATA_DIR.padEnd(42)} ║
║                                                           ║
║   Press Ctrl+C to stop                                    ║
╚═══════════════════════════════════════════════════════════╝
`);
});
