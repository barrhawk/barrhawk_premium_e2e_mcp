/**
 * Bridge Dashboard - Integrated UI served directly from Bridge
 *
 * No separate process - direct access to Bridge internals
 */

import type { BridgeHealth } from '../shared/types.js';

// =============================================================================
// Types
// =============================================================================

export interface DashboardContext {
  getHealth: () => BridgeHealth;
  getComponents: () => any[];
  getMessages: (limit: number) => any[];
  getDlqStats: () => { stats: any; recent: any[] };
  getCircuits: () => any[];
  getMetrics: () => any;
  getSwarms: () => any[];
  getReports: () => any[];
}

// =============================================================================
// Styles
// =============================================================================

const styles = `
* { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0a0a0f;
  --bg2: #111118;
  --card: rgba(39,39,42,0.6);
  --text: #e4e4e7;
  --muted: #71717a;
  --accent: #8b5cf6;
  --success: #22c55e;
  --error: #ef4444;
  --warning: #fbbf24;
  --border: rgba(63,63,70,0.5);
}
body {
  font-family: -apple-system, system-ui, sans-serif;
  background: linear-gradient(135deg, var(--bg) 0%, var(--bg2) 100%);
  color: var(--text);
  min-height: 100vh;
  padding: 2rem;
}
.container { max-width: 1400px; margin: 0 auto; }
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border);
}
.logo { font-size: 1.5rem; font-weight: 700; }
.logo span { color: var(--accent); }
.nav { display: flex; gap: 1rem; }
.nav a {
  color: var(--muted);
  text-decoration: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  transition: all 0.2s;
}
.nav a:hover, .nav a.active { color: var(--text); background: var(--card); }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; }
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.25rem;
}
.card-title {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--muted);
  margin-bottom: 1rem;
}
.stat { font-size: 2rem; font-weight: 700; }
.stat.success { color: var(--success); }
.stat.error { color: var(--error); }
.stat.warning { color: var(--warning); }
.list { display: flex; flex-direction: column; gap: 0.5rem; }
.list-item {
  padding: 0.75rem;
  background: rgba(0,0,0,0.2);
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.badge {
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
}
.badge-success { background: rgba(34,197,94,0.2); color: #4ade80; }
.badge-error { background: rgba(239,68,68,0.2); color: #f87171; }
.badge-warning { background: rgba(251,191,36,0.2); color: #fcd34d; }
.badge-info { background: rgba(59,130,246,0.2); color: #60a5fa; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid var(--border); }
th { color: var(--muted); font-size: 0.75rem; text-transform: uppercase; }
.mono { font-family: monospace; font-size: 0.85rem; }
.refresh-btn {
  background: var(--accent);
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
}
.refresh-btn:hover { opacity: 0.9; }
`;

// =============================================================================
// Components
// =============================================================================

function Layout(title: string, activePage: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Bridge Dashboard</title>
  <style>${styles}</style>
  <script src="https://unpkg.com/htmx.org@1.9.10"></script>
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="logo">🌉 <span>Bridge</span> Dashboard</div>
      <nav class="nav">
        <a href="/dashboard" class="${activePage === 'overview' ? 'active' : ''}">Overview</a>
        <a href="/dashboard/components" class="${activePage === 'components' ? 'active' : ''}">Components</a>
        <a href="/dashboard/messages" class="${activePage === 'messages' ? 'active' : ''}">Messages</a>
        <a href="/dashboard/circuits" class="${activePage === 'circuits' ? 'active' : ''}">Circuits</a>
        <a href="/dashboard/hub" class="${activePage === 'hub' ? 'active' : ''}">Hub</a>
      </nav>
    </header>
    ${content}
  </div>
  <script>
    // Auto-refresh every 5 seconds
    setInterval(() => {
      htmx.trigger(document.body, 'refresh');
    }, 5000);
  </script>
</body>
</html>`;
}

// =============================================================================
// Pages
// =============================================================================

export function renderOverview(ctx: DashboardContext): string {
  const health = ctx.getHealth();
  const components = ctx.getComponents();
  const dlq = ctx.getDlqStats();

  const content = `
    <div class="grid">
      <div class="card">
        <div class="card-title">Status</div>
        <div class="stat ${health.status === 'healthy' ? 'success' : 'error'}">${health.status.toUpperCase()}</div>
      </div>
      <div class="card">
        <div class="card-title">Components</div>
        <div class="stat">${components.length}</div>
      </div>
      <div class="card">
        <div class="card-title">Messages Processed</div>
        <div class="stat">${health.messagesProcessed.toLocaleString()}</div>
      </div>
      <div class="card">
        <div class="card-title">Dead Letters</div>
        <div class="stat ${dlq.stats.total > 0 ? 'warning' : ''}">${dlq.stats.total}</div>
      </div>
    </div>

    <div class="grid" style="margin-top: 1rem;">
      <div class="card">
        <div class="card-title">Connected Components</div>
        <div class="list">
          ${components.length === 0 ? '<div style="color: var(--muted);">No components connected</div>' :
            components.map((c: any) => `
              <div class="list-item">
                <div>
                  <strong>${c.id}</strong>
                  <div style="font-size: 0.8rem; color: var(--muted);">v${c.version || 'unknown'}</div>
                </div>
                <span class="badge badge-success">CONNECTED</span>
              </div>
            `).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-title">Memory</div>
        <div style="margin-bottom: 1rem;">
          <div style="color: var(--muted); font-size: 0.85rem;">RSS</div>
          <div class="stat" style="font-size: 1.5rem;">${(health.memoryUsage.rss / 1024 / 1024).toFixed(0)} MB</div>
        </div>
        <div>
          <div style="color: var(--muted); font-size: 0.85rem;">Heap Used</div>
          <div class="stat" style="font-size: 1.5rem;">${(health.memoryUsage.heapUsed / 1024 / 1024).toFixed(0)} MB</div>
        </div>
      </div>
    </div>
  `;

  return Layout('Overview', 'overview', content);
}

export function renderComponents(ctx: DashboardContext): string {
  const components = ctx.getComponents();

  const content = `
    <div class="card">
      <div class="card-title">Connected Components</div>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Version</th>
            <th>Health Score</th>
            <th>Messages Sent</th>
            <th>Connected At</th>
            <th>Last Activity</th>
          </tr>
        </thead>
        <tbody>
          ${components.length === 0 ? '<tr><td colspan="6" style="color: var(--muted); text-align: center;">No components connected</td></tr>' :
            components.map((c: any) => `
              <tr>
                <td class="mono">${c.id}</td>
                <td>${c.version || '-'}</td>
                <td>
                  <span class="badge ${c.healthScore > 80 ? 'badge-success' : c.healthScore > 50 ? 'badge-warning' : 'badge-error'}">
                    ${c.healthScore}%
                  </span>
                </td>
                <td>${c.messagesSent}</td>
                <td class="mono">${c.connectedAt ? new Date(c.connectedAt).toLocaleTimeString() : '-'}</td>
                <td class="mono">${c.lastActivity ? new Date(c.lastActivity).toLocaleTimeString() : '-'}</td>
              </tr>
            `).join('')}
        </tbody>
      </table>
    </div>
  `;

  return Layout('Components', 'components', content);
}

export function renderMessages(ctx: DashboardContext): string {
  const messages = ctx.getMessages(50);

  const content = `
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <div class="card-title" style="margin: 0;">Recent Messages</div>
        <button class="refresh-btn" onclick="location.reload()">Refresh</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Type</th>
            <th>Source</th>
            <th>Target</th>
            <th>ID</th>
          </tr>
        </thead>
        <tbody>
          ${messages.length === 0 ? '<tr><td colspan="5" style="color: var(--muted); text-align: center;">No messages yet</td></tr>' :
            messages.map((m: any) => `
              <tr>
                <td class="mono">${new Date(m.timestamp).toLocaleTimeString()}</td>
                <td><span class="badge badge-info">${m.type}</span></td>
                <td class="mono">${m.source}</td>
                <td class="mono">${m.target}</td>
                <td class="mono" style="font-size: 0.75rem;">${m.id?.slice(0, 12) || '-'}...</td>
              </tr>
            `).join('')}
        </tbody>
      </table>
    </div>
  `;

  return Layout('Messages', 'messages', content);
}

export function renderCircuits(ctx: DashboardContext): string {
  const circuits = ctx.getCircuits();

  const content = `
    <div class="card">
      <div class="card-title">Circuit Breakers</div>
      <table>
        <thead>
          <tr>
            <th>Component</th>
            <th>State</th>
            <th>Failures</th>
            <th>Successes</th>
            <th>Last Failure</th>
          </tr>
        </thead>
        <tbody>
          ${circuits.length === 0 ? '<tr><td colspan="5" style="color: var(--muted); text-align: center;">No circuit breakers</td></tr>' :
            circuits.map((c: any) => `
              <tr>
                <td class="mono">${c.componentId}</td>
                <td>
                  <span class="badge ${c.state === 'CLOSED' ? 'badge-success' : c.state === 'OPEN' ? 'badge-error' : 'badge-warning'}">
                    ${c.state}
                  </span>
                </td>
                <td>${c.failures}</td>
                <td>${c.successes}</td>
                <td class="mono">${c.lastFailure ? new Date(c.lastFailure).toLocaleTimeString() : '-'}</td>
              </tr>
            `).join('')}
        </tbody>
      </table>
    </div>
  `;

  return Layout('Circuit Breakers', 'circuits', content);
}

export function renderHub(ctx: DashboardContext): string {
  const content = `
    <div class="grid">
      <div class="card">
        <div class="card-title">Projects</div>
        <div id="hub-projects" hx-get="/dashboard/api/hub/projects" hx-trigger="load, refresh" hx-swap="innerHTML">
          <div style="color: var(--muted);">Loading...</div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Recent Runs</div>
        <div id="hub-runs" hx-get="/dashboard/api/hub/runs" hx-trigger="load, refresh" hx-swap="innerHTML">
          <div style="color: var(--muted);">Loading...</div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top: 1rem;">
      <div class="card-title">Targets</div>
      <div id="hub-targets" hx-get="/dashboard/api/hub/targets" hx-trigger="load, refresh" hx-swap="innerHTML">
        <div style="color: var(--muted);">Loading...</div>
      </div>
    </div>
  `;

  return Layout('Hub', 'hub', content);
}

// =============================================================================
// Hub API HTML Fragments
// =============================================================================

const HUB_URL = process.env.HUB_URL || 'http://localhost:7010';

export async function fetchHubProjects(): Promise<string> {
  try {
    const res = await fetch(`${HUB_URL}/projects`);
    const data = await res.json() as { projects: any[] };

    if (!data.projects?.length) {
      return '<div style="color: var(--muted);">No projects yet.</div>';
    }

    return `<div class="list">${data.projects.map((p: any) => `
      <div class="list-item">
        <div>
          <strong>${p.name}</strong>
          <div style="font-size: 0.8rem; color: var(--muted);">${p.baseUrl}</div>
        </div>
        <span class="badge badge-info">${p.id.slice(0, 8)}</span>
      </div>
    `).join('')}</div>`;
  } catch (e: any) {
    return `<div class="badge badge-error">Hub offline: ${e.message}</div>`;
  }
}

export async function fetchHubTargets(): Promise<string> {
  try {
    const res = await fetch(`${HUB_URL}/targets`);
    const data = await res.json() as { targets: any[] };

    if (!data.targets?.length) {
      return '<div style="color: var(--muted);">No targets yet.</div>';
    }

    return `<table>
      <thead><tr><th>Name</th><th>Trigger</th><th>Watchers</th><th>Status</th></tr></thead>
      <tbody>${data.targets.map((t: any) => `
        <tr>
          <td>${t.name}</td>
          <td><span class="badge badge-info">${t.trigger.type}</span></td>
          <td>${t.watchers.length}</td>
          <td>${t.lastRunStatus ?
            `<span class="badge ${t.lastRunStatus === 'passed' ? 'badge-success' : 'badge-error'}">${t.lastRunStatus}</span>` :
            '<span style="color: var(--muted);">-</span>'}</td>
        </tr>
      `).join('')}</tbody>
    </table>`;
  } catch (e: any) {
    return `<div class="badge badge-error">Hub offline: ${e.message}</div>`;
  }
}

export async function fetchHubRuns(): Promise<string> {
  try {
    const res = await fetch(`${HUB_URL}/runs?limit=10`);
    const data = await res.json() as { runs: any[] };

    if (!data.runs?.length) {
      return '<div style="color: var(--muted);">No runs yet.</div>';
    }

    return `<div class="list">${data.runs.map((r: any) => `
      <div class="list-item">
        <div>
          <span class="badge ${r.status === 'passed' ? 'badge-success' : r.status === 'failed' ? 'badge-error' : 'badge-info'}">${r.status}</span>
          <span style="margin-left: 0.5rem; font-size: 0.8rem; color: var(--muted);">${new Date(r.startedAt).toLocaleTimeString()}</span>
        </div>
        ${r.durationMs ? `<span style="color: var(--muted);">${r.durationMs}ms</span>` : ''}
      </div>
    `).join('')}</div>`;
  } catch (e: any) {
    return `<div class="badge badge-error">Hub offline: ${e.message}</div>`;
  }
}
