/** @jsxImportSource hono/jsx */
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { streamSSE } from 'hono/streaming';
import { getObservabilityStore } from '../observability/index.js';
import * as browserState from '../browser/state.js';
import { testFromDescription, formatTestAsMCPCalls } from '../ai-tools/src/test-from-description.js';
import {
  a11yCheckBasic,
  type A11yRuleSet,
  testRecordStart,
  testRecordStop,
  testReplay,
  testExport,
  getRecordingStatus,
  getLastRecording,
  type Recording,
  performanceAnalyze,
  securityScan,
  networkMock,
  networkUnmock,
  generateData,
  generateEdgeCases,
  type DataType,
} from '../free-tools/src/index.js';
import {
  runGoldenTests,
  formatRunResults,
  listGolden,
  formatListResult,
  loadAllCases,
  type RunOptions,
  SUITE_NAMES,
} from '../golden/src/index.js';

const app = new Hono();

// =============================================================================
// Helpers
// =============================================================================

function formatDuration(ms?: number) {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return (ms / 1000).toFixed(2) + 's';
}

function timeAgo(date: Date) {
  const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatTime(date: Date) {
  return new Date(date).toLocaleTimeString('en-US', { hour12: false });
}

// =============================================================================
// Shared Styles
// =============================================================================

const styles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg-primary: #0a0a0f;
    --bg-secondary: #111118;
    --bg-card: rgba(39,39,42,0.6);
    --bg-card-hover: rgba(39,39,42,0.8);
    --text-primary: #e4e4e7;
    --text-secondary: #a1a1aa;
    --text-muted: #71717a;
    --accent: #8b5cf6;
    --accent-dim: rgba(139,92,246,0.3);
    --accent-glow: rgba(139,92,246,0.15);
    --success: #22c55e;
    --warning: #fbbf24;
    --error: #ef4444;
    --info: #3b82f6;
    --border: rgba(63,63,70,0.5);
    --radius: 12px;
    --radius-sm: 8px;
    --transition: 0.2s ease;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 50%, var(--bg-primary) 100%);
    color: var(--text-primary);
    min-height: 100vh;
    display: flex;
  }

  /* Sidebar */
  .sidebar {
    width: 240px;
    background: rgba(17,17,24,0.95);
    border-right: 1px solid var(--border);
    padding: 1rem 0;
    display: flex;
    flex-direction: column;
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    z-index: 100;
    transition: transform var(--transition);
  }
  .sidebar.collapsed { width: 60px; }
  .sidebar-header {
    padding: 0.5rem 1rem 1.5rem;
    border-bottom: 1px solid var(--border);
    margin-bottom: 1rem;
  }
  .sidebar-logo {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    text-decoration: none;
    color: var(--text-primary);
  }
  .logo-icon {
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, var(--accent) 0%, #6d28d9 100%);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 0.8rem;
    box-shadow: 0 0 20px var(--accent-dim);
    flex-shrink: 0;
  }
  .logo-text { font-size: 1.1rem; font-weight: 700; }
  .logo-text span { color: var(--text-muted); font-weight: 400; font-size: 0.85rem; }

  .nav-section {
    padding: 0.5rem 0;
  }
  .nav-section-title {
    padding: 0.5rem 1rem;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    font-weight: 600;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 1rem;
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 0.85rem;
    transition: all var(--transition);
    border-left: 3px solid transparent;
    cursor: pointer;
  }
  .nav-item:hover {
    background: var(--accent-glow);
    color: var(--text-primary);
  }
  .nav-item.active {
    background: var(--accent-glow);
    color: var(--accent);
    border-left-color: var(--accent);
  }
  .nav-icon { width: 18px; text-align: center; opacity: 0.7; }

  /* Main Content */
  .main {
    margin-left: 240px;
    flex: 1;
    padding: 1.5rem;
    min-height: 100vh;
  }

  /* Header */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .header-title {
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .header-actions { display: flex; gap: 0.75rem; align-items: center; }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.8rem;
    background: var(--bg-card);
    border-radius: 20px;
    border: 1px solid var(--border);
  }
  .status-dot {
    height: 8px;
    width: 8px;
    background: var(--text-muted);
    border-radius: 50%;
    transition: all 0.3s ease;
  }
  .status-dot.live {
    background: var(--success);
    box-shadow: 0 0 12px var(--success);
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  .status-text { color: var(--text-muted); font-size: 0.7rem; font-weight: 600; text-transform: uppercase; }

  /* Stats Grid */
  .grid-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  @media (max-width: 1200px) { .grid-stats { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 600px) { .grid-stats { grid-template-columns: 1fr; } }

  .stat-card {
    background: linear-gradient(145deg, var(--bg-card) 0%, rgba(24,24,27,0.8) 100%);
    padding: 1.25rem;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    transition: all var(--transition);
  }
  .stat-card:hover {
    border-color: var(--accent-dim);
    box-shadow: 0 0 20px var(--accent-glow);
  }
  .stat-label { color: var(--text-muted); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; }
  .stat-value { font-size: 2rem; font-weight: 700; margin: 0.25rem 0; letter-spacing: -0.02em; }

  /* Cards */
  .card {
    background: linear-gradient(145deg, var(--bg-card) 0%, rgba(24,24,27,0.7) 100%);
    padding: 1.25rem;
    border-radius: var(--radius);
    border: 1px solid var(--border);
  }
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--border);
  }
  .card-title {
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
  }

  /* Grid Layouts */
  .grid-2 { display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; }
  .grid-equal { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  @media (max-width: 900px) { .grid-2, .grid-equal { grid-template-columns: 1fr; } }

  /* Run Items */
  .run-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    border-radius: var(--radius-sm);
    transition: all var(--transition);
    cursor: pointer;
    border: 1px solid transparent;
  }
  .run-item:hover {
    background: var(--accent-glow);
    border-color: var(--accent-dim);
  }
  .run-item-info { flex: 1; }
  .run-item-name { font-weight: 600; font-size: 0.9rem; margin-bottom: 0.2rem; }
  .run-item-meta { font-size: 0.75rem; color: var(--text-muted); }

  /* Status Badges */
  .badge {
    padding: 0.25rem 0.6rem;
    border-radius: 6px;
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .badge-passed { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); }
  .badge-failed { background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
  .badge-running { background: rgba(59,130,246,0.15); color: #60a5fa; border: 1px solid rgba(59,130,246,0.3); }
  .badge-success { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); }
  .badge-error { background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
  .badge-info { background: rgba(59,130,246,0.15); color: #60a5fa; border: 1px solid rgba(59,130,246,0.3); }
  .badge-muted { background: rgba(113,113,122,0.15); color: #a1a1aa; border: 1px solid rgba(113,113,122,0.3); }

  /* Modal */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .modal {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.5rem;
    width: 90%;
    max-width: 500px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.5);
  }
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }
  .modal-title { font-size: 1.1rem; font-weight: 600; }
  .modal-close {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }
  .modal-close:hover { color: var(--text-primary); }

  /* List */
  .list { display: flex; flex-direction: column; gap: 0.5rem; }
  .list-item {
    padding: 0.75rem 1rem;
    background: var(--bg-card);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
  }
  .list-item:hover { background: var(--bg-card-hover); }

  /* Tabs */
  .tabs {
    display: flex;
    gap: 0.25rem;
    border-bottom: 1px solid var(--border);
    margin-bottom: 1rem;
  }
  .tab {
    padding: 0.75rem 1rem;
    font-size: 0.85rem;
    color: var(--text-muted);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all var(--transition);
  }
  .tab:hover { color: var(--text-primary); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }

  /* Log Entries */
  .log-container { max-height: 500px; overflow-y: auto; }
  .log-container::-webkit-scrollbar { width: 4px; }
  .log-container::-webkit-scrollbar-track { background: transparent; }
  .log-container::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .log-entry {
    font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
    padding: 0.5rem 0.75rem;
    font-size: 0.8rem;
    border-radius: var(--radius-sm);
    margin-bottom: 0.25rem;
    transition: background var(--transition);
  }
  .log-entry:hover { background: var(--accent-glow); }
  .log-entry.error { color: var(--error); }
  .log-entry.warn { color: var(--warning); }
  .log-entry.info { color: var(--success); }
  .log-time { color: var(--text-muted); margin-right: 0.75rem; }
  .log-type {
    display: inline-block;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    font-size: 0.65rem;
    margin-right: 0.5rem;
    background: var(--bg-card);
  }

  /* Browser View */
  .browser-frame {
    background: #000;
    border-radius: var(--radius);
    overflow: hidden;
    border: 1px solid var(--border);
  }
  .browser-toolbar {
    background: var(--bg-card);
    padding: 0.5rem 1rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    border-bottom: 1px solid var(--border);
  }
  .browser-url {
    flex: 1;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.4rem 0.75rem;
    font-size: 0.8rem;
    color: var(--text-secondary);
  }
  .browser-screenshot {
    width: 100%;
    aspect-ratio: 16/9;
    object-fit: contain;
    background: #0a0a0a;
  }
  .browser-placeholder {
    width: 100%;
    aspect-ratio: 16/9;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 0.9rem;
    background: linear-gradient(145deg, #0a0a0a, #111);
  }

  /* Controls */
  .controls {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .btn {
    padding: 0.5rem 1rem;
    border-radius: var(--radius-sm);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--transition);
    border: 1px solid var(--border);
    background: var(--bg-card);
    color: var(--text-primary);
  }
  .btn:hover {
    background: var(--bg-card-hover);
    border-color: var(--accent-dim);
  }
  .btn-primary {
    background: linear-gradient(135deg, var(--accent) 0%, #6d28d9 100%);
    border-color: var(--accent);
  }
  .btn-primary:hover {
    box-shadow: 0 0 20px var(--accent-dim);
  }
  .btn-sm { padding: 0.35rem 0.75rem; font-size: 0.75rem; }

  /* Form Inputs */
  .input {
    width: 100%;
    padding: 0.6rem 0.75rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.85rem;
    transition: border-color var(--transition);
  }
  .input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .input::placeholder { color: var(--text-muted); }

  .textarea {
    min-height: 100px;
    resize: vertical;
    font-family: inherit;
  }

  /* Loading Skeleton */
  .skeleton {
    background: linear-gradient(90deg, var(--bg-card) 25%, var(--bg-card-hover) 50%, var(--bg-card) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: var(--radius-sm);
  }
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  .skeleton-text { height: 1rem; margin-bottom: 0.5rem; }
  .skeleton-text-sm { height: 0.75rem; width: 60%; }
  .skeleton-stat { height: 2.5rem; width: 80%; margin-top: 0.5rem; }

  /* Empty State */
  .empty-state {
    padding: 3rem 1rem;
    text-align: center;
    color: var(--text-muted);
  }
  .empty-state-icon { font-size: 2rem; margin-bottom: 1rem; opacity: 0.5; }
  .empty-state-text { font-size: 0.9rem; }

  /* Screenshot Gallery */
  .screenshot-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
  }
  .screenshot-item {
    border-radius: var(--radius-sm);
    overflow: hidden;
    border: 1px solid var(--border);
    cursor: pointer;
    transition: all var(--transition);
  }
  .screenshot-item:hover {
    border-color: var(--accent-dim);
    transform: scale(1.02);
  }
  .screenshot-item img {
    width: 100%;
    aspect-ratio: 16/10;
    object-fit: cover;
  }
  .screenshot-item-info {
    padding: 0.5rem;
    background: var(--bg-card);
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  /* Network Waterfall */
  .network-item {
    display: grid;
    grid-template-columns: 100px 1fr 80px 60px;
    gap: 0.75rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
    font-size: 0.8rem;
    align-items: center;
  }
  .network-method {
    font-weight: 600;
    font-family: monospace;
  }
  .network-url {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-secondary);
  }
  .network-status { text-align: right; }
  .network-status.ok { color: var(--success); }
  .network-status.error { color: var(--error); }
  .network-duration { text-align: right; color: var(--text-muted); }

  /* Responsive Sidebar */
  @media (max-width: 768px) {
    .sidebar { transform: translateX(-100%); }
    .sidebar.open { transform: translateX(0); }
    .main { margin-left: 0; }
  }
`;

// =============================================================================
// Layout Components
// =============================================================================

const Layout = ({ children, activePage = 'dashboard' }: { children: any; activePage?: string }) => (
  <html>
    <head>
      <title>BarrHawk Dashboard</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <script src="https://unpkg.com/htmx.org@1.9.10"></script>
      <script src="https://unpkg.com/htmx.org@1.9.10/dist/ext/sse.js"></script>
      <style>{styles}</style>
    </head>
    <body>
      <Sidebar activePage={activePage} />
      <main class="main">
        {children}
      </main>
    </body>
  </html>
);

const Sidebar = ({ activePage }: { activePage: string }) => (
  <aside class="sidebar">
    <div class="sidebar-header">
      <a href="/" class="sidebar-logo">
        <div class="logo-icon">BH</div>
        <div class="logo-text">BarrHawk</div>
      </a>
    </div>

    <nav class="nav-section">
      <div class="nav-section-title">Observe</div>
      <a href="/" class={`nav-item ${activePage === 'dashboard' ? 'active' : ''}`}>
        <span class="nav-icon">◉</span> Dashboard
      </a>
      <a href="/runs" class={`nav-item ${activePage === 'runs' ? 'active' : ''}`}>
        <span class="nav-icon">▶</span> Test Runs
      </a>
      <a href="/perf" class={`nav-item ${activePage === 'perf' ? 'active' : ''}`}>
        <span class="nav-icon">⚡</span> Performance
      </a>
      <a href="/hub" class={`nav-item ${activePage === 'hub' ? 'active' : ''}`}>
        <span class="nav-icon">⬢</span> Hub
      </a>
    </nav>

    <nav class="nav-section">
      <div class="nav-section-title">Control</div>
      <a href="/browser" class={`nav-item ${activePage === 'browser' ? 'active' : ''}`}>
        <span class="nav-icon">◧</span> Browser
      </a>
      <a href="/swarm" class={`nav-item ${activePage === 'swarm' ? 'active' : ''}`}>
        <span class="nav-icon">🐝</span> Swarm
      </a>
      <a href="/tests" class={`nav-item ${activePage === 'tests' ? 'active' : ''}`}>
        <span class="nav-icon">⚙</span> Run Tests
      </a>
      <a href="/record" class={`nav-item ${activePage === 'record' ? 'active' : ''}`}>
        <span class="nav-icon">●</span> Record
      </a>
      <a href="/network" class={`nav-item ${activePage === 'network' ? 'active' : ''}`}>
        <span class="nav-icon">⇄</span> Network
      </a>
    </nav>

    <nav class="nav-section">
      <div class="nav-section-title">Audit</div>
      <a href="/a11y" class={`nav-item ${activePage === 'a11y' ? 'active' : ''}`}>
        <span class="nav-icon">♿</span> Accessibility
      </a>
      <a href="/security" class={`nav-item ${activePage === 'security' ? 'active' : ''}`}>
        <span class="nav-icon">🔒</span> Security
      </a>
      <a href="/golden" class={`nav-item ${activePage === 'golden' ? 'active' : ''}`}>
        <span class="nav-icon">★</span> Golden Tests
      </a>
    </nav>

    <nav class="nav-section">
      <div class="nav-section-title">Utils</div>
      <a href="/data" class={`nav-item ${activePage === 'data' ? 'active' : ''}`}>
        <span class="nav-icon">⟳</span> Test Data
      </a>
      <a href="/mcp" class={`nav-item ${activePage === 'mcp' ? 'active' : ''}`}>
        <span class="nav-icon">⬡</span> MCP Tools
      </a>
    </nav>
  </aside>
);

const Skeleton = ({ type = 'text' }: { type?: 'text' | 'stat' | 'card' }) => {
  if (type === 'stat') {
    return (
      <div class="stat-card">
        <div class="skeleton skeleton-text-sm"></div>
        <div class="skeleton skeleton-stat"></div>
      </div>
    );
  }
  return <div class="skeleton skeleton-text"></div>;
};

// =============================================================================
// Pages
// =============================================================================

// Dashboard Home - WAR ROOM GLASS
app.get('/', (c) => {
  return c.html(
    <Layout activePage="dashboard">
      <div class="header">
        <h1 class="header-title">War Room</h1>
        <div class="header-actions">
          <div class="status-indicator" hx-ext="sse" sse-connect="/events" sse-swap="status-update">
            <span id="status-dot" class="status-dot"></span>
            <span class="status-text">Connecting...</span>
          </div>
        </div>
      </div>

      {/* TRIPARTITE STACK STATUS - Live */}
      <div style="margin-bottom: 1.5rem;" hx-get="/api/glass/stack" hx-trigger="load, every 3s" hx-swap="innerHTML">
        <div style="display: flex; gap: 1rem; justify-content: center;">
          <div class="stat-card" style="opacity: 0.5;"><div class="stat-label">Loading stack...</div></div>
        </div>
      </div>

      {/* KEY METRICS ROW */}
      <div class="grid-stats" hx-get="/api/glass/metrics" hx-trigger="load, every 3s" hx-swap="innerHTML">
        <Skeleton type="stat" />
        <Skeleton type="stat" />
        <Skeleton type="stat" />
        <Skeleton type="stat" />
        <Skeleton type="stat" />
        <Skeleton type="stat" />
      </div>

      {/* MAIN GRID: Swarms + Browser + Activity */}
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; margin-top: 1rem;">

        {/* ACTIVE SWARMS */}
        <div class="card" style="max-height: 400px; overflow-y: auto;">
          <div class="card-header">
            <span class="card-title">Active Swarms</span>
            <span class="badge badge-info" hx-get="/api/glass/swarm-count" hx-trigger="load, every 3s" hx-swap="innerHTML">-</span>
          </div>
          <div hx-get="/api/glass/swarms" hx-trigger="load, every 3s" hx-swap="innerHTML">
            <div class="empty-state">Loading swarms...</div>
          </div>
        </div>

        {/* BROWSER STATE */}
        <div class="card">
          <div class="card-header">
            <span class="card-title">Browser</span>
            <span class="badge" hx-get="/api/glass/browser-status" hx-trigger="load, every 2s" hx-swap="innerHTML">-</span>
          </div>
          <div style="background: #000; border-radius: 8px; min-height: 200px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
            <div hx-get="/api/glass/browser-preview" hx-trigger="load, every 2s" hx-swap="innerHTML">
              <div style="color: var(--text-muted); text-align: center;">
                <div style="font-size: 2rem; opacity: 0.3;">🖥️</div>
                <div style="font-size: 0.8rem;">No browser active</div>
              </div>
            </div>
          </div>
        </div>

        {/* LIVE ACTIVITY FEED */}
        <div class="card" style="max-height: 400px; overflow-y: auto;">
          <div class="card-header">
            <span class="card-title">Live Feed</span>
          </div>
          <div class="log-container" id="live-feed" hx-get="/api/glass/feed" hx-trigger="load, every 2s" hx-swap="innerHTML">
          </div>
        </div>
      </div>

      {/* BOTTOM ROW: Plans + Igors */}
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">

        {/* ACTIVE PLANS */}
        <div class="card">
          <div class="card-header">
            <span class="card-title">Active Plans</span>
          </div>
          <div hx-get="/api/glass/plans" hx-trigger="load, every 3s" hx-swap="innerHTML">
            <div class="empty-state" style="padding: 1rem;">No active plans</div>
          </div>
        </div>

        {/* IGOR AGENTS */}
        <div class="card">
          <div class="card-header">
            <span class="card-title">Igor Agents</span>
          </div>
          <div hx-get="/api/glass/igors" hx-trigger="load, every 3s" hx-swap="innerHTML">
            <div class="empty-state" style="padding: 1rem;">No active Igors</div>
          </div>
        </div>
      </div>
    </Layout>
  );
});

// Runs List Page
app.get('/runs', (c) => {
  return c.html(
    <Layout activePage="runs">
      <div class="header">
        <h1 class="header-title">Test Runs</h1>
      </div>
      <div class="card">
        <div hx-get="/api/runs?limit=50" hx-trigger="load" hx-swap="innerHTML">
          <div class="empty-state">Loading runs...</div>
        </div>
      </div>
    </Layout>
  );
});

// Run Detail Page
app.get('/run/:id', async (c) => {
  const runId = c.req.param('id');
  return c.html(
    <Layout activePage="runs">
      <div class="header">
        <h1 class="header-title">Run Details</h1>
        <a href="/runs" class="btn btn-sm">← Back to Runs</a>
      </div>

      <div hx-get={`/api/run/${runId}`} hx-trigger="load" hx-swap="innerHTML">
        <div class="card">
          <div class="empty-state">Loading run details...</div>
        </div>
      </div>
    </Layout>
  );
});

// Browser Control Page
app.get('/browser', (c) => {
  return c.html(
    <Layout activePage="browser">
      <div class="header">
        <h1 class="header-title">Browser Control</h1>
        <div class="header-actions">
          <button class="btn btn-primary" hx-post="/api/browser/launch" hx-swap="none">
            Launch Browser
          </button>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Live View</span>
            <div class="controls">
              <button class="btn btn-sm" hx-get="/api/browser/screenshot" hx-target="#browser-view" hx-swap="innerHTML">
                Refresh
              </button>
            </div>
          </div>
          <div class="browser-frame">
            <div class="browser-toolbar">
              <span>●</span>
              <span>●</span>
              <span>●</span>
              <input type="text" class="browser-url" id="browser-url" placeholder="No page loaded" readonly />
            </div>
            <div id="browser-view" hx-get="/api/browser/screenshot" hx-trigger="load, every 3s" hx-swap="innerHTML">
              <div class="browser-placeholder">No browser session active</div>
            </div>
          </div>
        </div>

        <div>
          <div class="card" style="margin-bottom: 1rem;">
            <div class="card-header">
              <span class="card-title">Navigate</span>
            </div>
            <form hx-post="/api/browser/navigate" hx-swap="none">
              <input type="text" name="url" class="input" placeholder="https://example.com" style="margin-bottom: 0.75rem;" />
              <button type="submit" class="btn btn-primary" style="width: 100%;">Go</button>
            </form>
          </div>

          <div class="card" style="margin-bottom: 1rem;">
            <div class="card-header">
              <span class="card-title">Actions</span>
            </div>
            <div class="controls" style="flex-direction: column;">
              <input type="text" id="selector" class="input" placeholder="CSS Selector" style="margin-bottom: 0.5rem;" />
              <div style="display: flex; gap: 0.5rem;">
                <button class="btn" style="flex: 1;" hx-post="/api/browser/click" hx-include="#selector">Click</button>
                <button class="btn" style="flex: 1;" hx-post="/api/browser/screenshot" hx-swap="none">Screenshot</button>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <span class="card-title">Type Text</span>
            </div>
            <form hx-post="/api/browser/type" hx-swap="none">
              <input type="text" name="selector" class="input" placeholder="CSS Selector" style="margin-bottom: 0.5rem;" />
              <input type="text" name="text" class="input" placeholder="Text to type" style="margin-bottom: 0.75rem;" />
              <button type="submit" class="btn" style="width: 100%;">Type</button>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
});

// Swarm Page - Multi-Agent Orchestration
app.get('/swarm', (c) => {
  return c.html(
    <Layout activePage="swarm">
      <div class="header">
        <h1 class="header-title">Swarm Mode</h1>
        <span class="badge badge-info">Multi-Agent Orchestration</span>
      </div>

      <div class="stats-grid" hx-get="/api/swarm/stats" hx-trigger="load, every 5s" hx-swap="innerHTML">
        <div class="stat-card"><div class="stat-label">Loading...</div></div>
      </div>

      <div class="grid-equal">
        <div class="card" style="grid-column: span 2;">
          <div class="card-header">
            <span class="card-title">Active Swarms</span>
            <button class="btn btn-sm" hx-get="/api/swarms" hx-target="#swarm-list" hx-swap="innerHTML">Refresh</button>
          </div>
          <div id="swarm-list" hx-get="/api/swarms" hx-trigger="load, every 5s" hx-swap="innerHTML">
            <div class="empty-state">
              <div class="empty-state-icon">🐝</div>
              <div class="empty-state-text">No swarms running</div>
              <div class="empty-state-sub">Use frank_swarm_execute to start a swarm</div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
});

// Test Execution Page
app.get('/tests', (c) => {
  return c.html(
    <Layout activePage="tests">
      <div class="header">
        <h1 class="header-title">Run Tests</h1>
      </div>

      <div class="grid-equal">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Test from Description</span>
          </div>
          <form hx-post="/api/test/run" hx-target="#test-result" hx-swap="innerHTML">
            <textarea
              name="description"
              class="input textarea"
              placeholder="Describe the test in natural language...&#10;&#10;Example: Navigate to example.com, click the login button, enter email 'test@test.com' and verify the dashboard loads"
              style="margin-bottom: 0.75rem;"
            ></textarea>
            <input type="text" name="baseUrl" class="input" placeholder="Base URL (optional)" style="margin-bottom: 0.75rem;" />
            <button type="submit" class="btn btn-primary" style="width: 100%;">
              Generate & Run Test
            </button>
          </form>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">Test Result</span>
          </div>
          <div id="test-result">
            <div class="empty-state">
              <div class="empty-state-icon">⚡</div>
              <div class="empty-state-text">Describe a test to run</div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
});

// Performance Page
app.get('/perf', (c) => {
  return c.html(
    <Layout activePage="perf">
      <div class="header">
        <h1 class="header-title">Performance Analysis</h1>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Web Vitals Analysis</span>
          </div>
          <p style="color: var(--text-secondary); margin-bottom: 1rem; font-size: 0.9rem;">
            Analyze Core Web Vitals (LCP, FID, CLS, FCP, TTFB) on the current page.
          </p>
          <button class="btn btn-primary" hx-post="/api/perf/analyze" hx-target="#perf-result" hx-swap="innerHTML" style="width: 100%;">
            Run Analysis
          </button>
        </div>
        <div class="card">
          <div class="card-header">
            <span class="card-title">Results</span>
          </div>
          <div id="perf-result">
            <div class="empty-state">
              <div class="empty-state-icon">⚡</div>
              <div class="empty-state-text">Run analysis to see Web Vitals</div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
});

// Recording Page
app.get('/record', (c) => {
  return c.html(
    <Layout activePage="record">
      <div class="header">
        <h1 class="header-title">Test Recording</h1>
        <div class="header-actions" id="record-controls" hx-get="/api/record/status" hx-trigger="load" hx-swap="innerHTML">
        </div>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Recording Actions</span>
          </div>
          <div id="recording-actions" hx-get="/api/record/actions" hx-trigger="every 2s" hx-swap="innerHTML">
            <div class="empty-state">
              <div class="empty-state-text">Start recording to capture actions</div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <span class="card-title">Export Test</span>
          </div>
          <div id="export-result">
            <p style="color: var(--text-secondary); margin-bottom: 1rem; font-size: 0.9rem;">
              Stop recording to export as Playwright, Cypress, or Puppeteer code.
            </p>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button class="btn" hx-post="/api/record/export" hx-vals='{"format":"playwright"}' hx-target="#export-result" hx-swap="innerHTML">Playwright</button>
              <button class="btn" hx-post="/api/record/export" hx-vals='{"format":"cypress"}' hx-target="#export-result" hx-swap="innerHTML">Cypress</button>
              <button class="btn" hx-post="/api/record/export" hx-vals='{"format":"puppeteer"}' hx-target="#export-result" hx-swap="innerHTML">Puppeteer</button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
});

// Network Page
app.get('/network', (c) => {
  return c.html(
    <Layout activePage="network">
      <div class="header">
        <h1 class="header-title">Network Mocking</h1>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Add Mock</span>
          </div>
          <form hx-post="/api/network/mock" hx-target="#mock-result" hx-swap="innerHTML">
            <input type="text" name="url" class="input" placeholder="URL pattern (e.g. **/api/*)" style="margin-bottom: 0.75rem;" />
            <input type="number" name="status" class="input" placeholder="Status code (default: 200)" style="margin-bottom: 0.75rem;" />
            <textarea name="body" class="input textarea" placeholder='Response body (JSON or text)' style="margin-bottom: 0.75rem;"></textarea>
            <button type="submit" class="btn btn-primary" style="width: 100%;">Add Mock</button>
          </form>
        </div>
        <div class="card">
          <div class="card-header">
            <span class="card-title">Active Mocks</span>
            <button class="btn btn-sm" hx-post="/api/network/clear" hx-target="#mock-result" hx-swap="innerHTML">Clear All</button>
          </div>
          <div id="mock-result">
            <div class="empty-state">
              <div class="empty-state-text">No active mocks</div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
});

// Security Page
app.get('/security', (c) => {
  return c.html(
    <Layout activePage="security">
      <div class="header">
        <h1 class="header-title">Security Scan</h1>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <span class="card-title">OWASP Security Scan</span>
          </div>
          <p style="color: var(--text-secondary); margin-bottom: 1rem; font-size: 0.9rem;">
            Scan for security headers, cookies, XSS patterns, sensitive data exposure, and more.
          </p>
          <button class="btn btn-primary" hx-post="/api/security/scan" hx-target="#security-result" hx-swap="innerHTML" style="width: 100%;">
            Run Security Scan
          </button>
        </div>
        <div class="card">
          <div class="card-header">
            <span class="card-title">Results</span>
          </div>
          <div id="security-result">
            <div class="empty-state">
              <div class="empty-state-icon">🔒</div>
              <div class="empty-state-text">Run scan to check for vulnerabilities</div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
});

// Test Data Page
app.get('/data', (c) => {
  return c.html(
    <Layout activePage="data">
      <div class="header">
        <h1 class="header-title">Test Data Generator</h1>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Generate Data</span>
          </div>
          <form hx-post="/api/data/generate" hx-target="#data-result" hx-swap="innerHTML">
            <select name="type" class="input" style="margin-bottom: 0.75rem;">
              <option value="name">Name</option>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="address">Address</option>
              <option value="company">Company</option>
              <option value="uuid">UUID</option>
              <option value="creditCard">Credit Card</option>
              <option value="password">Password</option>
              <option value="url">URL</option>
              <option value="paragraph">Paragraph</option>
            </select>
            <input type="number" name="count" class="input" placeholder="Count (default: 5)" style="margin-bottom: 0.75rem;" />
            <button type="submit" class="btn btn-primary" style="width: 100%;">Generate</button>
          </form>
          <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border);">
            <div style="font-weight: 600; margin-bottom: 0.5rem;">Edge Cases</div>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button class="btn btn-sm" hx-post="/api/data/edge" hx-vals='{"type":"xss"}' hx-target="#data-result">XSS</button>
              <button class="btn btn-sm" hx-post="/api/data/edge" hx-vals='{"type":"sql_injection"}' hx-target="#data-result">SQL Inject</button>
              <button class="btn btn-sm" hx-post="/api/data/edge" hx-vals='{"type":"boundary"}' hx-target="#data-result">Boundary</button>
              <button class="btn btn-sm" hx-post="/api/data/edge" hx-vals='{"type":"unicode"}' hx-target="#data-result">Unicode</button>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <span class="card-title">Generated Data</span>
          </div>
          <div id="data-result">
            <div class="empty-state">
              <div class="empty-state-icon">⟳</div>
              <div class="empty-state-text">Generate test data</div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
});

// MCP Tools Page
app.get('/mcp', (c) => {
  const tools = [
    { name: 'browser_launch', desc: 'Start browser session', category: 'Browser' },
    { name: 'browser_navigate', desc: 'Go to URL', category: 'Browser' },
    { name: 'browser_screenshot', desc: 'Capture page', category: 'Browser' },
    { name: 'browser_click', desc: 'Click element', category: 'Browser' },
    { name: 'browser_type', desc: 'Type text', category: 'Browser' },
    { name: 'test_from_description', desc: 'NL to test steps', category: 'AI' },
    { name: 'accessibility_audit', desc: 'WCAG audit', category: 'Audit' },
    { name: 'security_scan', desc: 'OWASP scan', category: 'Audit' },
    { name: 'performance_analyze', desc: 'Web Vitals', category: 'Perf' },
    { name: 'test_record_start', desc: 'Start recording', category: 'Record' },
    { name: 'test_record_stop', desc: 'Stop recording', category: 'Record' },
    { name: 'test_export', desc: 'Export to code', category: 'Record' },
    { name: 'network_mock', desc: 'Mock requests', category: 'Network' },
    { name: 'data_generate', desc: 'Generate test data', category: 'Data' },
    { name: 'data_edge_cases', desc: 'Edge case values', category: 'Data' },
  ];

  return c.html(
    <Layout activePage="mcp">
      <div class="header">
        <h1 class="header-title">MCP Tools</h1>
        <span style="color: var(--text-muted);">{tools.length} tools available</span>
      </div>
      <div class="card">
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1rem;">
          {tools.map(tool => (
            <div style="padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-sm); border: 1px solid var(--border);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <span style="font-weight: 600; font-size: 0.9rem;">{tool.name}</span>
                <span style="font-size: 0.7rem; padding: 0.15rem 0.4rem; background: var(--accent-dim); border-radius: 4px;">{tool.category}</span>
              </div>
              <div style="color: var(--text-muted); font-size: 0.8rem;">{tool.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
});

// Accessibility Page
app.get('/a11y', (c) => {
  return c.html(
    <Layout activePage="a11y">
      <div class="header">
        <h1 class="header-title">Accessibility Audit</h1>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">Run Audit</span>
        </div>
        <form hx-post="/api/a11y/audit" hx-target="#a11y-result" hx-swap="innerHTML">
          <select name="level" class="input" style="margin-bottom: 0.75rem;">
            <option value="AA">WCAG 2.1 AA (Recommended)</option>
            <option value="A">WCAG 2.1 A</option>
            <option value="AAA">WCAG 2.1 AAA</option>
          </select>
          <button type="submit" class="btn btn-primary" style="width: 100%;">Run Audit</button>
        </form>
        <div id="a11y-result" style="margin-top: 1rem;"></div>
      </div>
    </Layout>
  );
});

// Golden Tests Page
app.get('/golden', (c) => {
  return c.html(
    <Layout activePage="golden">
      <div class="header">
        <h1 class="header-title">Golden Tests</h1>
        <span style="color: var(--text-muted);">AI Output Quality Validation</span>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Run Golden Tests</span>
        </div>
        <form hx-post="/api/golden/run" hx-target="#golden-result" hx-swap="innerHTML">
          <div style="margin-bottom: 0.75rem;">
            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Test Suite</label>
            <select name="suite" class="input">
              <option value="all">All Suites</option>
              <option value="nl-authoring">NL Authoring</option>
              <option value="ai-generation">AI Generation</option>
              <option value="rca">Root Cause Analysis</option>
              <option value="healing">Self-Healing</option>
              <option value="a11y">Accessibility</option>
            </select>
          </div>
          <div style="margin-bottom: 0.75rem;">
            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.9rem;">Pass Threshold</label>
            <input type="number" name="threshold" class="input" value="0.8" min="0" max="1" step="0.05" />
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%;">Run Tests</button>
        </form>
        <div id="golden-result" style="margin-top: 1rem;"></div>
      </div>

      <div class="card" style="margin-top: 1rem;">
        <div class="card-header">
          <span class="card-title">Test Cases</span>
          <button
            class="btn btn-outline btn-sm"
            hx-get="/api/golden/list"
            hx-target="#golden-cases"
            hx-swap="innerHTML"
          >Refresh</button>
        </div>
        <div id="golden-cases" hx-get="/api/golden/list" hx-trigger="load" hx-swap="innerHTML">
          <div style="color: var(--text-muted); text-align: center; padding: 2rem;">Loading test cases...</div>
        </div>
      </div>
    </Layout>
  );
});

// Hub Page - Test Orchestration
app.get('/hub', (c) => {
  return c.html(
    <Layout activePage="hub">
      <div class="header">
        <h1 class="header-title">Test Hub</h1>
        <span style="color: var(--text-muted);">Multi-Igor Test Orchestration</span>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Projects</span>
            <button
              class="btn btn-primary btn-sm"
              hx-get="/api/hub/projects/new"
              hx-target="#hub-modal"
              hx-swap="innerHTML"
            >+ New</button>
          </div>
          <div id="hub-projects" hx-get="/api/hub/projects" hx-trigger="load" hx-swap="innerHTML">
            <div style="color: var(--text-muted); text-align: center; padding: 2rem;">Loading projects...</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">Recent Runs</span>
          </div>
          <div id="hub-runs" hx-get="/api/hub/runs" hx-trigger="load" hx-swap="innerHTML">
            <div style="color: var(--text-muted); text-align: center; padding: 2rem;">Loading runs...</div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top: 1rem;">
        <div class="card-header">
          <span class="card-title">Targets</span>
          <button
            class="btn btn-outline btn-sm"
            hx-get="/api/hub/targets"
            hx-target="#hub-targets"
            hx-swap="innerHTML"
          >Refresh</button>
        </div>
        <div id="hub-targets" hx-get="/api/hub/targets" hx-trigger="load" hx-swap="innerHTML">
          <div style="color: var(--text-muted); text-align: center; padding: 2rem;">Loading targets...</div>
        </div>
      </div>

      <div id="hub-modal"></div>
    </Layout>
  );
});

// =============================================================================
// API Endpoints
// =============================================================================

// Stats API
app.get('/api/stats', async (c) => {
  try {
    const store = await getObservabilityStore();
    const stats = await store.getStats();

    const passed = stats.runsByStatus['passed'] || 0;
    const failed = stats.runsByStatus['failed'] || 0;
    const total = passed + failed;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 100;

    return c.html(
      <div>
        <div class="stat-card">
          <div class="stat-label">Total Runs</div>
          <div class="stat-value">{stats.totalRuns}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Pass Rate</div>
          <div class="stat-value" style={{color: passRate >= 90 ? 'var(--success)' : passRate >= 70 ? 'var(--warning)' : 'var(--error)'}}>{passRate}%</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Failed</div>
          <div class="stat-value" style={{color: failed > 0 ? 'var(--error)' : 'var(--text-primary)'}}>{failed}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Screenshots</div>
          <div class="stat-value">{stats.totalScreenshots}</div>
        </div>
      </div>
    );
  } catch {
    return c.html(
      <div>
        <div class="stat-card"><div class="stat-label">Total Runs</div><div class="stat-value">0</div></div>
        <div class="stat-card"><div class="stat-label">Pass Rate</div><div class="stat-value">--</div></div>
        <div class="stat-card"><div class="stat-label">Failed</div><div class="stat-value">0</div></div>
        <div class="stat-card"><div class="stat-label">Screenshots</div><div class="stat-value">0</div></div>
      </div>
    );
  }
});

// Runs List API
app.get('/api/runs', async (c) => {
  const limit = parseInt(c.req.query('limit') || '20');
  try {
    const store = await getObservabilityStore();
    const runs = await store.getRuns({ limit });

    if (runs.length === 0) {
      return c.html(<div class="empty-state"><div class="empty-state-text">No test runs recorded yet</div></div>);
    }

    return c.html(
      <div>
        {runs.map(run => (
          <a href={`/run/${run.runId}`} style="text-decoration: none; color: inherit;">
            <div class="run-item">
              <div class="run-item-info">
                <div class="run-item-name">{run.metadata?.suiteName || run.origin || 'Test Run'}</div>
                <div class="run-item-meta">{timeAgo(run.startedAt)} • {formatDuration(run.duration)}</div>
              </div>
              <div class={`badge badge-${run.status}`}>{run.status}</div>
            </div>
          </a>
        ))}
      </div>
    );
  } catch {
    return c.html(<div class="empty-state"><div class="empty-state-text">No test runs recorded yet</div></div>);
  }
});

// Run Detail API
app.get('/api/run/:id', async (c) => {
  const runId = c.req.param('id');
  try {
    const store = await getObservabilityStore();
    const run = await store.getRun(runId);

    if (!run) {
      return c.html(<div class="empty-state">Run not found</div>);
    }

    const logs = await store.getLogs(runId, { limit: 100 });
    const screenshots = await store.getScreenshots(runId);
    const network = await store.getNetworkRequests(runId, {});

    return c.html(
      <div>
        <div class="card" style="margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <h2 style="font-size: 1.25rem; margin-bottom: 0.5rem;">{run.metadata?.suiteName || run.origin || 'Test Run'}</h2>
              <div style="color: var(--text-muted); font-size: 0.85rem;">
                Started {timeAgo(run.startedAt)} • Duration: {formatDuration(run.duration)}
              </div>
            </div>
            <div class={`badge badge-${run.status}`} style="font-size: 0.8rem; padding: 0.4rem 0.8rem;">
              {run.status}
            </div>
          </div>
        </div>

        <div class="tabs">
          <div class="tab active" hx-get={`/api/run/${runId}/logs`} hx-target="#tab-content" hx-swap="innerHTML">
            Logs ({logs.length})
          </div>
          <div class="tab" hx-get={`/api/run/${runId}/screenshots`} hx-target="#tab-content" hx-swap="innerHTML">
            Screenshots ({screenshots.length})
          </div>
          <div class="tab" hx-get={`/api/run/${runId}/network`} hx-target="#tab-content" hx-swap="innerHTML">
            Network ({network.length})
          </div>
        </div>

        <div class="card">
          <div id="tab-content">
            {logs.length === 0 ? (
              <div class="empty-state">No logs recorded</div>
            ) : (
              <div class="log-container">
                {logs.map(log => (
                  <div class={`log-entry ${log.level || ''}`}>
                    <span class="log-time">{formatTime(log.timestamp)}</span>
                    <span class="log-type">{log.type}</span>
                    {log.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  } catch (e) {
    return c.html(<div class="empty-state">Error loading run details</div>);
  }
});

// Run Logs Tab
app.get('/api/run/:id/logs', async (c) => {
  const runId = c.req.param('id');
  try {
    const store = await getObservabilityStore();
    const logs = await store.getLogs(runId, { limit: 200 });

    if (logs.length === 0) {
      return c.html(<div class="empty-state">No logs recorded</div>);
    }

    return c.html(
      <div class="log-container">
        {logs.map(log => (
          <div class={`log-entry ${log.level || ''}`}>
            <span class="log-time">{formatTime(log.timestamp)}</span>
            <span class="log-type">{log.type}</span>
            {log.message}
          </div>
        ))}
      </div>
    );
  } catch {
    return c.html(<div class="empty-state">Error loading logs</div>);
  }
});

// Run Screenshots Tab
app.get('/api/run/:id/screenshots', async (c) => {
  const runId = c.req.param('id');
  try {
    const store = await getObservabilityStore();
    const screenshots = await store.getScreenshots(runId);

    if (screenshots.length === 0) {
      return c.html(<div class="empty-state">No screenshots captured</div>);
    }

    return c.html(
      <div class="screenshot-grid">
        {screenshots.map(ss => (
          <div class="screenshot-item">
            <img src={ss.url} alt={`Screenshot ${ss.id}`} loading="lazy" />
            <div class="screenshot-item-info">
              {formatTime(ss.timestamp)} • {ss.width}x{ss.height}
            </div>
          </div>
        ))}
      </div>
    );
  } catch {
    return c.html(<div class="empty-state">Error loading screenshots</div>);
  }
});

// Run Network Tab
app.get('/api/run/:id/network', async (c) => {
  const runId = c.req.param('id');
  try {
    const store = await getObservabilityStore();
    const network = await store.getNetworkRequests(runId, {});

    if (network.length === 0) {
      return c.html(<div class="empty-state">No network requests recorded</div>);
    }

    return c.html(
      <div>
        {network.map(req => (
          <div class="network-item">
            <span class="network-method">{req.method}</span>
            <span class="network-url" title={req.url}>{req.url}</span>
            <span class={`network-status ${(req.status || 0) < 400 ? 'ok' : 'error'}`}>
              {req.status || '-'}
            </span>
            <span class="network-duration">{formatDuration(req.duration)}</span>
          </div>
        ))}
      </div>
    );
  } catch {
    return c.html(<div class="empty-state">Error loading network data</div>);
  }
});

// Browser Launch API
app.post('/api/browser/launch', async (c) => {
  const result = await browserState.launch({ headless: false });
  if (result.success) {
    return c.html(
      <div class="log-entry info">Browser launched successfully (Run: {result.runId})</div>
    );
  }
  return c.html(
    <div class="log-entry error">Failed to launch: {result.message}</div>
  );
});

// Browser Navigate API
app.post('/api/browser/navigate', async (c) => {
  const body = await c.req.parseBody();
  const url = body.url as string;
  if (!url) {
    return c.html(<div class="log-entry error">URL is required</div>);
  }
  const result = await browserState.navigate(url);
  if (result.success) {
    return c.html(
      <div class="log-entry info">Navigated to {url} - {result.title}</div>
    );
  }
  return c.html(<div class="log-entry error">{result.message}</div>);
});

// Browser Click API
app.post('/api/browser/click', async (c) => {
  const body = await c.req.parseBody();
  const selector = body.selector as string;
  if (!selector) {
    return c.html(<div class="log-entry error">Selector is required</div>);
  }
  const result = await browserState.click(selector);
  if (result.success) {
    return c.html(<div class="log-entry info">{result.message}</div>);
  }
  return c.html(<div class="log-entry error">{result.message}</div>);
});

// Browser Type API
app.post('/api/browser/type', async (c) => {
  const body = await c.req.parseBody();
  const selector = body.selector as string;
  const text = body.text as string;
  if (!selector || !text) {
    return c.html(<div class="log-entry error">Selector and text are required</div>);
  }
  const result = await browserState.type(selector, text);
  if (result.success) {
    return c.html(<div class="log-entry info">{result.message}</div>);
  }
  return c.html(<div class="log-entry error">{result.message}</div>);
});

// Browser Close API
app.post('/api/browser/close', async (c) => {
  await browserState.close();
  return c.html(<div class="log-entry info">Browser closed</div>);
});

// Browser Screenshot API
app.get('/api/browser/screenshot', async (c) => {
  const info = await browserState.getInfo();
  if (!info.active) {
    return c.html(
      <div class="browser-placeholder">
        <div>
          <div style="margin-bottom: 0.5rem;">No active browser session</div>
          <div style="font-size: 0.8rem; opacity: 0.7;">Click "Launch Browser" to start</div>
        </div>
      </div>
    );
  }

  const result = await browserState.screenshot();
  if (result.success && result.data) {
    return c.html(
      <div style="text-align: center;">
        <img
          src={`data:image/png;base64,${result.data}`}
          alt="Browser screenshot"
          style="max-width: 100%; height: auto; border-radius: 4px;"
        />
        <div style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--text-muted);">
          {info.url || 'No URL'} - {info.title || 'Untitled'}
        </div>
      </div>
    );
  }

  return c.html(
    <div class="browser-placeholder">
      <div>Failed to capture screenshot</div>
    </div>
  );
});

// Test Run API
app.post('/api/test/run', async (c) => {
  const body = await c.req.parseBody();
  const description = body.description as string;
  const baseUrl = body.baseUrl as string | undefined;

  if (!description) {
    return c.html(
      <div class="empty-state" style="color: var(--error);">
        Please provide a test description
      </div>
    );
  }

  try {
    const test = await testFromDescription({ description, baseUrl });
    const mcpCalls = formatTestAsMCPCalls(test);

    return c.html(
      <div>
        <div style="margin-bottom: 1rem; display: flex; gap: 0.5rem; align-items: center;">
          <div class={`badge badge-${test.metadata.confidence > 0.7 ? 'passed' : 'running'}`}>
            Confidence: {(test.metadata.confidence * 100).toFixed(0)}%
          </div>
          <span style="color: var(--text-muted); font-size: 0.8rem;">
            {test.steps.length} steps, {test.assertions.length} assertions
          </span>
        </div>

        <div style="margin-bottom: 1rem; padding: 1rem; background: var(--bg-card); border-radius: var(--radius-sm);">
          <div style="font-weight: 600; margin-bottom: 0.75rem; color: var(--accent);">
            Generated Steps:
          </div>
          <div style="font-family: monospace; font-size: 0.8rem; line-height: 1.6;">
            {test.steps.map((step, i) => (
              <div style="margin-bottom: 0.5rem; padding-left: 1.5rem; position: relative;">
                <span style="position: absolute; left: 0; color: var(--text-muted);">{i + 1}.</span>
                <span style="color: var(--info);">{step.action}</span>
                {step.target && <span style="color: var(--text-secondary);"> → {step.target}</span>}
                {step.value && <span style="color: var(--success);"> "{step.value}"</span>}
              </div>
            ))}
          </div>
        </div>

        {test.assertions.length > 0 && (
          <div style="padding: 1rem; background: var(--bg-card); border-radius: var(--radius-sm);">
            <div style="font-weight: 600; margin-bottom: 0.75rem; color: var(--accent);">
              Assertions:
            </div>
            <div style="font-family: monospace; font-size: 0.8rem; line-height: 1.6;">
              {test.assertions.map(assertion => (
                <div style="margin-bottom: 0.5rem; color: var(--text-secondary);">
                  • {assertion.description}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style="margin-top: 1rem;">
          <button
            class="btn btn-primary"
            hx-post="/api/test/execute"
            hx-vals={JSON.stringify({ testData: JSON.stringify(test) })}
            hx-target="#test-result"
            hx-swap="innerHTML"
          >
            Execute Test
          </button>
        </div>
      </div>
    );
  } catch (error: any) {
    return c.html(
      <div class="empty-state" style="color: var(--error);">
        <div>Failed to generate test</div>
        <div style="font-size: 0.8rem; margin-top: 0.5rem;">{error.message}</div>
      </div>
    );
  }
});

// Test Execute API
app.post('/api/test/execute', async (c) => {
  const body = await c.req.parseBody();
  const testDataRaw = body.testData as string;

  if (!testDataRaw) {
    return c.html(
      <div class="empty-state" style="color: var(--error);">
        No test data provided
      </div>
    );
  }

  try {
    const test = JSON.parse(testDataRaw);
    const results: Array<{ step: string; success: boolean; message: string }> = [];

    // Ensure browser is launched
    const info = await browserState.getInfo();
    if (!info.active) {
      const launchResult = await browserState.launch({ headless: false });
      if (!launchResult.success) {
        return c.html(
          <div class="empty-state" style="color: var(--error);">
            Failed to launch browser: {launchResult.message}
          </div>
        );
      }
      results.push({ step: 'Launch browser', success: true, message: launchResult.message });
    }

    // Execute each step
    for (const step of test.steps) {
      let result: { success: boolean; message: string };

      switch (step.action) {
        case 'navigate':
          result = await browserState.navigate(step.target);
          break;
        case 'click':
          result = await browserState.click(step.target);
          break;
        case 'type':
          result = await browserState.type(step.target, step.value);
          break;
        default:
          result = { success: true, message: `Skipped: ${step.action}` };
      }

      results.push({
        step: step.description,
        success: result.success,
        message: result.message,
      });

      if (!result.success) {
        break; // Stop on first failure
      }
    }

    const passed = results.every(r => r.success);

    return c.html(
      <div>
        <div style="margin-bottom: 1rem;">
          <div class={`badge badge-${passed ? 'passed' : 'failed'}`} style="font-size: 0.9rem; padding: 0.5rem 1rem;">
            {passed ? 'PASSED' : 'FAILED'}
          </div>
        </div>
        <div style="background: var(--bg-card); border-radius: var(--radius-sm); overflow: hidden;">
          {results.map((result, i) => (
            <div style={`padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); display: flex; gap: 0.75rem; align-items: center;`}>
              <span style={`font-size: 1.2rem; ${result.success ? 'color: var(--success)' : 'color: var(--error)'}`}>
                {result.success ? '✓' : '✗'}
              </span>
              <div style="flex: 1;">
                <div style="font-size: 0.85rem;">{result.step}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">{result.message}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  } catch (error: any) {
    return c.html(
      <div class="empty-state" style="color: var(--error);">
        <div>Execution failed</div>
        <div style="font-size: 0.8rem; margin-top: 0.5rem;">{error.message}</div>
      </div>
    );
  }
});

// A11y Audit API
app.post('/api/a11y/audit', async (c) => {
  const body = await c.req.parseBody();
  const rulesRaw = body.rules as string;
  const rules: A11yRuleSet[] = rulesRaw ? rulesRaw.split(',') as A11yRuleSet[] : ['all'];

  const page = browserState.getPage();
  if (!page) {
    return c.html(
      <div class="empty-state" style="color: var(--warning);">
        <div class="empty-state-icon">!</div>
        <div class="empty-state-text">
          No active browser session. Launch browser and navigate to a page first.
        </div>
      </div>
    );
  }

  try {
    const result = await a11yCheckBasic({ page, rules });

    return c.html(
      <div>
        <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
          <div class={`badge badge-${result.passed ? 'passed' : 'failed'}`} style="font-size: 1rem; padding: 0.5rem 1rem;">
            Score: {result.score}/100
          </div>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            {result.summary.errors > 0 && (
              <span style="color: var(--error);">{result.summary.errors} errors</span>
            )}
            {result.summary.warnings > 0 && (
              <span style="color: var(--warning);">{result.summary.warnings} warnings</span>
            )}
            {result.summary.info > 0 && (
              <span style="color: var(--info);">{result.summary.info} info</span>
            )}
          </div>
        </div>

        {result.issues.length === 0 ? (
          <div class="empty-state" style="color: var(--success);">
            <div class="empty-state-icon">✓</div>
            <div class="empty-state-text">No accessibility issues found!</div>
          </div>
        ) : (
          <div style="background: var(--bg-card); border-radius: var(--radius-sm); overflow: hidden;">
            {result.issues.map((issue, i) => (
              <div style={`padding: 1rem; border-bottom: 1px solid var(--border);`}>
                <div style="display: flex; gap: 0.75rem; align-items: flex-start;">
                  <span style={`font-size: 1.1rem; ${issue.type === 'error' ? 'color: var(--error)' : issue.type === 'warning' ? 'color: var(--warning)' : 'color: var(--info)'}`}>
                    {issue.type === 'error' ? '✗' : issue.type === 'warning' ? '⚠' : 'ℹ'}
                  </span>
                  <div style="flex: 1;">
                    <div style="font-weight: 600; margin-bottom: 0.25rem;">
                      {issue.rule}
                      <span style={`margin-left: 0.5rem; font-size: 0.75rem; padding: 0.1rem 0.4rem; border-radius: 4px; background: ${issue.impact === 'critical' ? 'var(--error)' : issue.impact === 'serious' ? 'var(--warning)' : 'var(--bg-secondary)'}; color: ${issue.impact === 'critical' || issue.impact === 'serious' ? 'white' : 'var(--text-secondary)'};`}>
                        {issue.impact}
                      </span>
                    </div>
                    <div style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 0.5rem;">
                      {issue.description}
                    </div>
                    {issue.selector && (
                      <div style="font-family: monospace; font-size: 0.75rem; color: var(--text-muted); background: var(--bg-secondary); padding: 0.25rem 0.5rem; border-radius: 4px; display: inline-block;">
                        {issue.selector}
                      </div>
                    )}
                    {issue.suggestion && (
                      <div style="margin-top: 0.5rem; color: var(--accent); font-size: 0.8rem;">
                        💡 {issue.suggestion}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style="margin-top: 1rem; font-size: 0.8rem; color: var(--text-muted);">
          Checked rules: {result.checkedRules.join(', ')}
        </div>
      </div>
    );
  } catch (error: any) {
    return c.html(
      <div class="empty-state" style="color: var(--error);">
        <div>Audit failed</div>
        <div style="font-size: 0.8rem; margin-top: 0.5rem;">{error.message}</div>
      </div>
    );
  }
});

// =============================================================================
// Performance APIs
// =============================================================================

app.post('/api/perf/analyze', async (c) => {
  const page = browserState.getPage();
  if (!page) {
    return c.html(
      <div class="empty-state" style="color: var(--warning);">
        No active browser session. Launch browser first.
      </div>
    );
  }

  try {
    const result = await performanceAnalyze({ page });

    const gradeColors: Record<string, string> = {
      'A': 'var(--success)',
      'B': '#84cc16',
      'C': 'var(--warning)',
      'D': '#f97316',
      'F': 'var(--error)',
    };

    return c.html(
      <div>
        <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem; align-items: center;">
          <div style={`font-size: 2rem; font-weight: bold; color: ${gradeColors[result.grade]};`}>
            {result.grade}
          </div>
          <div>
            <div style="font-weight: 600;">Overall Score: {result.scores.overall}/100</div>
            <div style="color: var(--text-muted); font-size: 0.8rem;">{result.url}</div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 1.5rem;">
          <div style="padding: 0.75rem; background: var(--bg-secondary); border-radius: var(--radius-sm); text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-muted);">LCP</div>
            <div style="font-size: 1.1rem; font-weight: 600;">{result.metrics.lcp ? `${result.metrics.lcp}ms` : '-'}</div>
          </div>
          <div style="padding: 0.75rem; background: var(--bg-secondary); border-radius: var(--radius-sm); text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-muted);">FCP</div>
            <div style="font-size: 1.1rem; font-weight: 600;">{result.metrics.fcp ? `${result.metrics.fcp}ms` : '-'}</div>
          </div>
          <div style="padding: 0.75rem; background: var(--bg-secondary); border-radius: var(--radius-sm); text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-muted);">CLS</div>
            <div style="font-size: 1.1rem; font-weight: 600;">{result.metrics.cls?.toFixed(3) || '-'}</div>
          </div>
          <div style="padding: 0.75rem; background: var(--bg-secondary); border-radius: var(--radius-sm); text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-muted);">TTFB</div>
            <div style="font-size: 1.1rem; font-weight: 600;">{result.metrics.ttfb ? `${result.metrics.ttfb}ms` : '-'}</div>
          </div>
          <div style="padding: 0.75rem; background: var(--bg-secondary); border-radius: var(--radius-sm); text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-muted);">DOM Nodes</div>
            <div style="font-size: 1.1rem; font-weight: 600;">{result.metrics.domNodes}</div>
          </div>
          <div style="padding: 0.75rem; background: var(--bg-secondary); border-radius: var(--radius-sm); text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-muted);">Resources</div>
            <div style="font-size: 1.1rem; font-weight: 600;">{result.metrics.resourceCount}</div>
          </div>
        </div>

        {result.issues.length > 0 && (
          <div>
            <div style="font-weight: 600; margin-bottom: 0.5rem;">Issues</div>
            {result.issues.map(issue => (
              <div style="padding: 0.75rem; background: var(--bg-card); border-radius: var(--radius-sm); margin-bottom: 0.5rem; border-left: 3px solid ${issue.severity === 'critical' ? 'var(--error)' : issue.severity === 'warning' ? 'var(--warning)' : 'var(--info)'};">
                <div style="font-weight: 500;">{issue.metric}: {issue.value}</div>
                <div style="color: var(--text-muted); font-size: 0.8rem;">{issue.suggestion}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  } catch (error: any) {
    return c.html(<div class="empty-state" style="color: var(--error);">Analysis failed: {error.message}</div>);
  }
});

// =============================================================================
// Recording APIs
// =============================================================================

let currentRecording: Recording | null = null;

app.get('/api/record/status', async (c) => {
  const status = getRecordingStatus();

  if (status.isRecording) {
    return c.html(
      <button class="btn" style="background: var(--error);" hx-post="/api/record/stop" hx-target="#record-controls" hx-swap="innerHTML">
        ● Stop Recording
      </button>
    );
  }

  return c.html(
    <button class="btn btn-primary" hx-post="/api/record/start" hx-target="#record-controls" hx-swap="innerHTML">
      Start Recording
    </button>
  );
});

app.post('/api/record/start', async (c) => {
  const page = browserState.getPage();
  if (!page) {
    return c.html(
      <div>
        <span style="color: var(--error);">No browser session</span>
        <button class="btn btn-primary" style="margin-left: 1rem;" hx-post="/api/record/start" hx-target="#record-controls">
          Retry
        </button>
      </div>
    );
  }

  try {
    const result = await testRecordStart({ page, name: `Recording ${Date.now()}` });
    currentRecording = result.recording;

    return c.html(
      <button class="btn" style="background: var(--error);" hx-post="/api/record/stop" hx-target="#record-controls" hx-swap="innerHTML">
        ● Stop Recording
      </button>
    );
  } catch (error: any) {
    return c.html(<span style="color: var(--error);">Failed: {error.message}</span>);
  }
});

app.post('/api/record/stop', async (c) => {
  try {
    const result = testRecordStop();
    currentRecording = result.recording;

    return c.html(
      <div>
        <span style="color: var(--success);">Recorded {result.actionCount} actions</span>
        <button class="btn btn-primary" style="margin-left: 1rem;" hx-post="/api/record/start" hx-target="#record-controls">
          New Recording
        </button>
      </div>
    );
  } catch (error: any) {
    return c.html(<span style="color: var(--error);">Failed: {error.message}</span>);
  }
});

app.get('/api/record/actions', async (c) => {
  const status = getRecordingStatus();

  if (!status.isRecording && !currentRecording) {
    return c.html(
      <div class="empty-state">
        <div class="empty-state-text">Start recording to capture actions</div>
      </div>
    );
  }

  const recording = status.recording || currentRecording;
  if (!recording || recording.actions.length === 0) {
    return c.html(
      <div class="empty-state">
        <div class="empty-state-text">No actions recorded yet</div>
      </div>
    );
  }

  return c.html(
    <div class="log-container">
      {recording.actions.map((action, i) => (
        <div class="log-entry">
          <span class="log-time">{i + 1}</span>
          <span class="log-type">{action.type}</span>
          {action.selector && <span style="color: var(--info);">{action.selector}</span>}
          {action.value && <span style="color: var(--success);">"{action.value}"</span>}
          {action.url && <span style="color: var(--accent);">{action.url}</span>}
        </div>
      ))}
    </div>
  );
});

app.post('/api/record/export', async (c) => {
  const body = await c.req.parseBody();
  const format = (body.format as string) || 'playwright';

  if (!currentRecording) {
    return c.html(<div class="empty-state" style="color: var(--warning);">No recording to export</div>);
  }

  try {
    const result = testExport({
      recording: currentRecording,
      format: format as 'playwright' | 'cypress' | 'puppeteer' | 'mcp',
    });

    return c.html(
      <div>
        <div style="margin-bottom: 0.75rem; display: flex; justify-content: space-between; align-items: center;">
          <span class="badge badge-passed">{format}</span>
          <span style="color: var(--text-muted); font-size: 0.8rem;">{result.lineCount} lines</span>
        </div>
        <pre style="background: var(--bg-secondary); padding: 1rem; border-radius: var(--radius-sm); overflow-x: auto; font-size: 0.75rem; max-height: 300px;">{result.code}</pre>
      </div>
    );
  } catch (error: any) {
    return c.html(<div class="empty-state" style="color: var(--error);">Export failed: {error.message}</div>);
  }
});

// =============================================================================
// Network APIs
// =============================================================================

const activeMocks: Array<{ url: string; status: number; body: string }> = [];

app.post('/api/network/mock', async (c) => {
  const body = await c.req.parseBody();
  const url = body.url as string;
  const status = parseInt(body.status as string) || 200;
  const responseBody = body.body as string || '{}';

  if (!url) {
    return c.html(<div class="log-entry error">URL pattern is required</div>);
  }

  const page = browserState.getPage();
  if (!page) {
    return c.html(<div class="log-entry error">No browser session</div>);
  }

  try {
    await networkMock({
      page,
      url,
      response: {
        status,
        body: responseBody,
        contentType: 'application/json',
      },
    });

    activeMocks.push({ url, status, body: responseBody });

    return c.html(
      <div>
        <div class="log-entry info">Mock added: {url} → {status}</div>
        <div style="margin-top: 1rem;">
          {activeMocks.map((mock, i) => (
            <div style="padding: 0.5rem; background: var(--bg-secondary); border-radius: var(--radius-sm); margin-bottom: 0.5rem; font-size: 0.8rem;">
              <span style="color: var(--accent);">{mock.url}</span> → <span style="color: var(--success);">{mock.status}</span>
            </div>
          ))}
        </div>
      </div>
    );
  } catch (error: any) {
    return c.html(<div class="log-entry error">Failed: {error.message}</div>);
  }
});

app.post('/api/network/clear', async (c) => {
  const page = browserState.getPage();
  if (page) {
    await networkUnmock(page);
  }
  activeMocks.length = 0;

  return c.html(
    <div class="empty-state">
      <div class="empty-state-text">All mocks cleared</div>
    </div>
  );
});

// =============================================================================
// Security APIs
// =============================================================================

app.post('/api/security/scan', async (c) => {
  const page = browserState.getPage();
  if (!page) {
    return c.html(
      <div class="empty-state" style="color: var(--warning);">
        No active browser session. Launch browser first.
      </div>
    );
  }

  try {
    const result = await securityScan({ page });

    const severityColors: Record<string, string> = {
      critical: 'var(--error)',
      high: '#f97316',
      medium: 'var(--warning)',
      low: 'var(--info)',
      info: 'var(--text-muted)',
    };

    return c.html(
      <div>
        <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem; align-items: center;">
          <div class={`badge badge-${result.passed ? 'passed' : 'failed'}`} style="font-size: 1rem; padding: 0.5rem 1rem;">
            Score: {result.score}/100
          </div>
          <div style="display: flex; gap: 0.5rem;">
            {result.summary.critical > 0 && <span style="color: var(--error);">{result.summary.critical} critical</span>}
            {result.summary.high > 0 && <span style="color: #f97316;">{result.summary.high} high</span>}
            {result.summary.medium > 0 && <span style="color: var(--warning);">{result.summary.medium} medium</span>}
          </div>
        </div>

        {result.issues.length === 0 ? (
          <div class="empty-state" style="color: var(--success);">
            <div class="empty-state-icon">✓</div>
            <div class="empty-state-text">No security issues found!</div>
          </div>
        ) : (
          <div>
            {result.issues.map(issue => (
              <div style={`padding: 1rem; background: var(--bg-card); border-radius: var(--radius-sm); margin-bottom: 0.75rem; border-left: 3px solid ${severityColors[issue.severity]};`}>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                  <span style="font-weight: 600;">{issue.title}</span>
                  <span style={`font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 4px; background: ${severityColors[issue.severity]}; color: white;`}>
                    {issue.severity}
                  </span>
                </div>
                <div style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 0.5rem;">
                  {issue.description}
                </div>
                {issue.evidence && (
                  <div style="font-family: monospace; font-size: 0.75rem; color: var(--text-muted); background: var(--bg-secondary); padding: 0.25rem 0.5rem; border-radius: 4px; margin-bottom: 0.5rem;">
                    {issue.evidence}
                  </div>
                )}
                <div style="color: var(--accent); font-size: 0.8rem;">
                  Fix: {issue.remediation}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  } catch (error: any) {
    return c.html(<div class="empty-state" style="color: var(--error);">Scan failed: {error.message}</div>);
  }
});

// =============================================================================
// Data Generation APIs
// =============================================================================

app.post('/api/data/generate', async (c) => {
  const body = await c.req.parseBody();
  const type = (body.type as DataType) || 'name';
  const count = parseInt(body.count as string) || 5;

  try {
    const result = generateData({ type, count });

    return c.html(
      <div>
        <div style="margin-bottom: 0.75rem;">
          <span class="badge badge-passed">{type}</span>
          <span style="color: var(--text-muted); margin-left: 0.5rem; font-size: 0.8rem;">{result.values.length} generated</span>
        </div>
        <div style="background: var(--bg-secondary); border-radius: var(--radius-sm); overflow: hidden;">
          {result.values.map((value, i) => (
            <div style="padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); font-family: monospace; font-size: 0.85rem;">
              {value}
            </div>
          ))}
        </div>
      </div>
    );
  } catch (error: any) {
    return c.html(<div class="empty-state" style="color: var(--error);">Generation failed: {error.message}</div>);
  }
});

app.post('/api/data/edge', async (c) => {
  const body = await c.req.parseBody();
  const type = body.type as string || 'all';

  try {
    const result = generateEdgeCases({ category: type as any, limit: 10 });

    return c.html(
      <div>
        <div style="margin-bottom: 0.75rem;">
          <span class="badge badge-warning">{type}</span>
          <span style="color: var(--text-muted); margin-left: 0.5rem; font-size: 0.8rem;">{result.cases.length} edge cases</span>
        </div>
        <div style="background: var(--bg-secondary); border-radius: var(--radius-sm); overflow: hidden; max-height: 300px; overflow-y: auto;">
          {result.cases.map((edgeCase, i) => (
            <div style="padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border);">
              <div style="font-family: monospace; font-size: 0.8rem; word-break: break-all;">{edgeCase.value}</div>
              <div style="font-size: 0.7rem; color: var(--text-muted);">{edgeCase.description}</div>
            </div>
          ))}
        </div>
      </div>
    );
  } catch (error: any) {
    return c.html(<div class="empty-state" style="color: var(--error);">Generation failed: {error.message}</div>);
  }
});

// Golden Tests API - Run tests
app.post('/api/golden/run', async (c) => {
  const body = await c.req.parseBody();
  const suite = body.suite as string || 'all';
  const threshold = parseFloat(body.threshold as string) || 0.8;

  try {
    const options: RunOptions = {
      suite: suite as any,
      threshold,
      verbose: false,
    };

    const result = await runGoldenTests(options);
    const passRate = result.passed / result.total;
    const passColor = passRate >= 0.9 ? 'var(--success)' : passRate >= 0.7 ? 'var(--warning)' : 'var(--error)';

    return c.html(
      <div>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1rem;">
          <div style="background: var(--bg-secondary); padding: 1rem; border-radius: var(--radius-sm); text-align: center;">
            <div style="font-size: 2rem; font-weight: bold;">{result.total}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Total</div>
          </div>
          <div style="background: var(--bg-secondary); padding: 1rem; border-radius: var(--radius-sm); text-align: center;">
            <div style="font-size: 2rem; font-weight: bold; color: var(--success);">{result.passed}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Passed</div>
          </div>
          <div style="background: var(--bg-secondary); padding: 1rem; border-radius: var(--radius-sm); text-align: center;">
            <div style="font-size: 2rem; font-weight: bold; color: var(--error);">{result.failed}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Failed</div>
          </div>
          <div style="background: var(--bg-secondary); padding: 1rem; border-radius: var(--radius-sm); text-align: center;">
            <div style="font-size: 2rem; font-weight: bold; color: {passColor};">{(passRate * 100).toFixed(0)}%</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Pass Rate</div>
          </div>
        </div>

        <div style="background: var(--bg-secondary); border-radius: var(--radius-sm); overflow: hidden;">
          {result.results.map(test => (
            <div style="padding: 0.75rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 500;">{test.name}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">{test.suite}</div>
              </div>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="font-size: 0.8rem; color: var(--text-muted);">{(test.score * 100).toFixed(0)}%</span>
                <span class={`badge ${test.passed ? 'badge-success' : 'badge-danger'}`}>
                  {test.passed ? 'PASS' : 'FAIL'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  } catch (error: any) {
    return c.html(<div class="empty-state" style="color: var(--error);">Golden tests failed: {error.message}</div>);
  }
});

// Golden Tests API - List cases
app.get('/api/golden/list', async (c) => {
  try {
    const result = listGolden({});
    const { suites, cases } = result;

    // Build lookup of cases by suite
    const casesBySuite: Record<string, typeof cases> = {};
    for (const testCase of cases) {
      if (!casesBySuite[testCase.suite]) {
        casesBySuite[testCase.suite] = [];
      }
      casesBySuite[testCase.suite].push(testCase);
    }

    return c.html(
      <div>
        {suites.map(suite => {
          const suiteCases = casesBySuite[suite.id] || [];
          return (
            <div style="margin-bottom: 1rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <span style="font-weight: 600;">{suite.name}</span>
                <span class="badge">{suiteCases.length} cases</span>
              </div>
              <div style="background: var(--bg-secondary); border-radius: var(--radius-sm); overflow: hidden; max-height: 150px; overflow-y: auto;">
                {suiteCases.slice(0, 5).map(testCase => (
                  <div style="padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); font-size: 0.85rem;">
                    <div style="font-weight: 500;">{testCase.name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">
                      Match: {testCase.matchMode} | Threshold: {testCase.threshold}
                    </div>
                  </div>
                ))}
                {suiteCases.length > 5 && (
                  <div style="padding: 0.5rem; text-align: center; font-size: 0.8rem; color: var(--text-muted);">
                    +{suiteCases.length - 5} more cases
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {suites.length === 0 && (
          <div style="color: var(--text-muted); text-align: center; padding: 1rem;">No golden test cases found</div>
        )}
      </div>
    );
  } catch (error: any) {
    return c.html(<div class="empty-state" style="color: var(--error);">Failed to load cases: {error.message}</div>);
  }
});

// =============================================================================
// Glass API - War Room Live Data
// =============================================================================

// Helper to fetch tripartite health
async function fetchTripartiteStatus() {
  const [bridge, doctor, igor, frank] = await Promise.all([
    fetch('http://localhost:7000/health').then(r => r.json()).catch(() => null),
    fetch('http://localhost:7001/health').then(r => r.json()).catch(() => null),
    fetch('http://localhost:7002/health').then(r => r.json()).catch(() => null),
    fetch('http://localhost:7003/health').then(r => r.json()).catch(() => null),
  ]);
  return { bridge, doctor, igor, frank };
}

// Stack status - tripartite components
app.get('/api/glass/stack', async (c) => {
  const status = await fetchTripartiteStatus();

  const Component = ({ name, data, icon }: { name: string; data: any; icon: string }) => {
    const healthy = data?.status === 'healthy';
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 1rem',
        background: healthy ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
        border: `1px solid ${healthy ? 'var(--success)' : 'var(--error)'}`,
        borderRadius: '8px',
      }}>
        <span style={{ fontSize: '1.2rem' }}>{icon}</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{name}</div>
          <div style={{ fontSize: '0.7rem', color: healthy ? 'var(--success)' : 'var(--error)' }}>
            {healthy ? 'healthy' : 'offline'}
          </div>
        </div>
      </div>
    );
  };

  return c.html(
    <div style="display: flex; gap: 1rem; justify-content: center; align-items: center;">
      <Component name="Bridge" data={status.bridge} icon="🌉" />
      <span style="color: var(--text-muted);">→</span>
      <Component name="Doctor" data={status.doctor} icon="🩺" />
      <span style="color: var(--text-muted);">→</span>
      <Component name="Igor" data={status.igor} icon="🤖" />
      <span style="color: var(--text-muted);">→</span>
      <Component name="Frank" data={status.frank} icon="🔬" />
    </div>
  );
});

// Key metrics
app.get('/api/glass/metrics', async (c) => {
  const status = await fetchTripartiteStatus();
  const store = await getObservabilityStore();
  const swarmStats = await store.getSwarmStats();
  const testStats = await store.getStats();

  const activePlans = status.doctor?.activePlans || 0;
  const totalIgors = (status.doctor?.igors?.total || 0) + (status.igor?.spawnedIgors?.running || 0);
  const browserActive = status.frank?.browserActive || false;
  const activeBrowsers = status.frank?.resources?.activeBrowsers || 0;

  return c.html(
    <>
      <div class="stat-card">
        <div class="stat-label">Active Swarms</div>
        <div class="stat-value" style={{ color: swarmStats.running > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>
          {swarmStats.running}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Plans</div>
        <div class="stat-value" style={{ color: activePlans > 0 ? 'var(--info)' : 'var(--text-primary)' }}>
          {activePlans}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Igor Agents</div>
        <div class="stat-value" style={{ color: totalIgors > 0 ? 'var(--accent)' : 'var(--text-primary)' }}>
          {totalIgors}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Browsers</div>
        <div class="stat-value" style={{ color: browserActive ? 'var(--success)' : 'var(--text-muted)' }}>
          {activeBrowsers}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Runs</div>
        <div class="stat-value">{testStats.totalRuns}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Pass Rate</div>
        <div class="stat-value" style={{ color: (testStats.passRate || 0) >= 80 ? 'var(--success)' : (testStats.passRate || 0) >= 50 ? 'var(--warning)' : 'var(--error)' }}>
          {(testStats.passRate || 0).toFixed(0)}%
        </div>
      </div>
    </>
  );
});

// Swarm count badge
app.get('/api/glass/swarm-count', async (c) => {
  const store = await getObservabilityStore();
  const stats = await store.getSwarmStats();
  return c.html(<span>{stats.running} running / {stats.totalSwarms} total</span>);
});

// Active swarms list
app.get('/api/glass/swarms', async (c) => {
  const store = await getObservabilityStore();
  const swarms = await store.getSwarms({ limit: 10 });

  if (swarms.length === 0) {
    return c.html(<div style="padding: 1rem; text-align: center; color: var(--text-muted);">No swarms</div>);
  }

  return c.html(
    <div style="display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem;">
      {swarms.map(swarm => {
        const statusColor = swarm.status === 'completed' ? 'var(--success)' :
                          swarm.status === 'running' ? 'var(--warning)' :
                          swarm.status === 'failed' ? 'var(--error)' : 'var(--info)';
        const completedRoutes = swarm.routes.filter(r => r.status === 'completed').length;
        const totalRoutes = swarm.routes.length;

        return (
          <div style={{
            padding: '0.5rem',
            background: 'var(--bg-primary)',
            borderRadius: '6px',
            borderLeft: `3px solid ${statusColor}`,
          }}>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="font-size: 0.8rem; font-weight: 500;">{swarm.masterIntent.slice(0, 40)}...</div>
              <span class="badge" style={{ background: statusColor, fontSize: '0.65rem' }}>{swarm.status}</span>
            </div>
            <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.25rem;">
              Routes: {completedRoutes}/{totalRoutes} | {swarm.routes.filter(r => r.status === 'running').length} running
            </div>
          </div>
        );
      })}
    </div>
  );
});

// Browser status badge
app.get('/api/glass/browser-status', async (c) => {
  const status = await fetchTripartiteStatus();
  const active = status.frank?.browserActive;
  const count = status.frank?.resources?.activeBrowsers || 0;
  return c.html(
    <span style={{ background: active ? 'var(--success)' : 'var(--text-muted)', color: '#fff', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem' }}>
      {active ? `Active (${count})` : 'Inactive'}
    </span>
  );
});

// Browser preview
app.get('/api/glass/browser-preview', async (c) => {
  const status = await fetchTripartiteStatus();
  if (!status.frank?.browserActive) {
    return c.html(
      <div style="color: var(--text-muted); text-align: center;">
        <div style="font-size: 2rem; opacity: 0.3;">🖥️</div>
        <div style="font-size: 0.8rem;">No browser active</div>
      </div>
    );
  }

  // Try to get latest screenshot
  try {
    const info = await browserState.getInfo();
    return c.html(
      <div style="text-align: center; width: 100%;">
        <div style="font-size: 0.75rem; color: var(--success); margin-bottom: 0.5rem;">
          {info.url || 'Browser active'}
        </div>
        <img src="/api/browser/screenshot" style="max-width: 100%; max-height: 180px; border-radius: 4px;" />
      </div>
    );
  } catch {
    return c.html(
      <div style="color: var(--success); text-align: center;">
        <div style="font-size: 2rem;">🌐</div>
        <div style="font-size: 0.8rem;">Browser active</div>
      </div>
    );
  }
});

// Live feed
app.get('/api/glass/feed', async (c) => {
  const store = await getObservabilityStore();
  const runs = await store.getRuns({ limit: 5 });
  const swarms = await store.getSwarms({ limit: 3 });

  // Combine recent activity
  const activities: Array<{ time: Date; type: string; text: string; color: string }> = [];

  for (const run of runs) {
    activities.push({
      time: run.createdAt,
      type: 'run',
      text: `Test ${run.status}: ${run.name || run.id.slice(0, 8)}`,
      color: run.status === 'passed' ? 'var(--success)' : run.status === 'failed' ? 'var(--error)' : 'var(--info)',
    });
  }

  for (const swarm of swarms) {
    for (const route of swarm.routes) {
      if (route.progress.length > 0) {
        const latest = route.progress[route.progress.length - 1];
        activities.push({
          time: new Date(latest.timestamp),
          type: 'swarm',
          text: `${route.routeName}: ${latest.action}`,
          color: latest.status === 'completed' ? 'var(--success)' : latest.status === 'failed' ? 'var(--error)' : 'var(--info)',
        });
      }
    }
  }

  activities.sort((a, b) => b.time.getTime() - a.time.getTime());

  if (activities.length === 0) {
    return c.html(<div style="padding: 1rem; text-align: center; color: var(--text-muted);">No recent activity</div>);
  }

  return c.html(
    <div style="display: flex; flex-direction: column; gap: 0.25rem;">
      {activities.slice(0, 10).map(a => (
        <div style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderLeft: '2px solid', borderColor: a.color }}>
          <span style="color: var(--text-muted);">{formatTime(a.time)}</span>
          <span style="margin-left: 0.5rem;">{a.text}</span>
        </div>
      ))}
    </div>
  );
});

// Active plans
app.get('/api/glass/plans', async (c) => {
  const status = await fetchTripartiteStatus();
  const activePlans = status.doctor?.activePlans || 0;

  if (activePlans === 0) {
    return c.html(<div style="padding: 1rem; text-align: center; color: var(--text-muted);">No active plans</div>);
  }

  return c.html(
    <div style="padding: 0.5rem; text-align: center;">
      <div style="font-size: 2rem; font-weight: 700; color: var(--info);">{activePlans}</div>
      <div style="font-size: 0.8rem; color: var(--text-muted);">plans executing</div>
    </div>
  );
});

// Igor agents
app.get('/api/glass/igors', async (c) => {
  const status = await fetchTripartiteStatus();
  const mainIgor = status.igor;
  const doctorIgors = status.doctor?.igors;

  const igors = [];

  // Main Igor
  if (mainIgor) {
    igors.push({
      id: 'main',
      status: mainIgor.executionStatus || 'idle',
      tools: mainIgor.toolkit?.totalTools || 0,
    });
  }

  if (igors.length === 0) {
    return c.html(<div style="padding: 1rem; text-align: center; color: var(--text-muted);">No Igor agents</div>);
  }

  return c.html(
    <div style="display: flex; gap: 0.5rem; padding: 0.5rem; flex-wrap: wrap;">
      {igors.map(igor => {
        const statusColor = igor.status === 'executing' ? 'var(--warning)' :
                          igor.status === 'idle' ? 'var(--success)' : 'var(--text-muted)';
        return (
          <div style={{
            padding: '0.5rem 0.75rem',
            background: 'var(--bg-primary)',
            borderRadius: '6px',
            border: `1px solid ${statusColor}`,
          }}>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span>🤖</span>
              <div>
                <div style="font-size: 0.8rem; font-weight: 500;">Igor-{igor.id}</div>
                <div style={{ fontSize: '0.7rem', color: statusColor }}>{igor.status}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});

// =============================================================================
// Swarm API - Multi-Agent Orchestration
// =============================================================================

// Swarm stats (for htmx polling or JSON)
app.get('/api/swarm/stats', async (c) => {
  try {
    const store = await getObservabilityStore();
    const stats = await store.getSwarmStats();

    // Return JSON if not htmx request
    if (c.req.header('HX-Request') !== 'true') {
      return c.json(stats);
    }

    return c.html(
      <div>
        <div class="stat-card">
          <div class="stat-label">Total Swarms</div>
          <div class="stat-value">{stats.totalSwarms}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Running</div>
          <div class="stat-value" style={{ color: stats.running > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>{stats.running}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Completed</div>
          <div class="stat-value" style={{ color: 'var(--success)' }}>{stats.completed}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Routes</div>
          <div class="stat-value">{stats.totalRoutes}</div>
        </div>
      </div>
    );
  } catch {
    return c.html(
      <div>
        <div class="stat-card"><div class="stat-label">Total Swarms</div><div class="stat-value">0</div></div>
        <div class="stat-card"><div class="stat-label">Running</div><div class="stat-value">0</div></div>
        <div class="stat-card"><div class="stat-label">Completed</div><div class="stat-value">0</div></div>
        <div class="stat-card"><div class="stat-label">Total Routes</div><div class="stat-value">0</div></div>
      </div>
    );
  }
});

// List all swarms (htmx or JSON)
app.get('/api/swarms', async (c) => {
  try {
    const store = await getObservabilityStore();
    const swarms = await store.getSwarms({ limit: 50 });

    // Return JSON if Accept header requests it (for MCP)
    const accept = c.req.header('Accept') || '';
    if (accept.includes('application/json') || c.req.header('HX-Request') !== 'true') {
      return c.json(swarms);
    }

    if (swarms.length === 0) {
      return c.html(
        <div class="empty-state">
          <div class="empty-state-icon">🐝</div>
          <div class="empty-state-text">No swarms running</div>
          <div class="empty-state-sub">Use frank_swarm_execute to start a swarm</div>
        </div>
      );
    }

    return c.html(
      <div style="display: flex; flex-direction: column; gap: 1rem;">
        {swarms.map((swarm) => {
          const statusColor = swarm.status === 'completed' ? 'var(--success)' :
                             swarm.status === 'running' ? 'var(--warning)' :
                             swarm.status === 'failed' ? 'var(--error)' : 'var(--info)';
          const completedRoutes = swarm.routes.filter(r => r.status === 'completed').length;
          const failedRoutes = swarm.routes.filter(r => r.status === 'failed').length;
          const runningRoutes = swarm.routes.filter(r => r.status === 'running').length;

          return (
            <div style="background: var(--bg-card); border-radius: var(--radius); border: 1px solid var(--border); padding: 1rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                <div>
                  <div style="font-weight: 600; font-size: 1rem;">{swarm.masterIntent}</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">ID: {swarm.swarmId.slice(0, 12)}...</div>
                </div>
                <span class="badge" style={{ background: statusColor, color: '#fff' }}>{swarm.status}</span>
              </div>
              <div style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem;">
                <span style="font-size: 0.8rem; padding: 0.25rem 0.5rem; background: var(--bg-primary); border-radius: 4px;">
                  {swarm.routes.length} routes
                </span>
                {completedRoutes > 0 && (
                  <span style="font-size: 0.8rem; padding: 0.25rem 0.5rem; background: rgba(34,197,94,0.2); color: var(--success); border-radius: 4px;">
                    {completedRoutes} done
                  </span>
                )}
                {runningRoutes > 0 && (
                  <span style="font-size: 0.8rem; padding: 0.25rem 0.5rem; background: rgba(251,191,36,0.2); color: var(--warning); border-radius: 4px;">
                    {runningRoutes} running
                  </span>
                )}
                {failedRoutes > 0 && (
                  <span style="font-size: 0.8rem; padding: 0.25rem 0.5rem; background: rgba(239,68,68,0.2); color: var(--error); border-radius: 4px;">
                    {failedRoutes} failed
                  </span>
                )}
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.5rem;">
                {swarm.routes.map((route) => {
                  const rColor = route.status === 'completed' ? 'var(--success)' :
                                route.status === 'running' ? 'var(--warning)' :
                                route.status === 'failed' ? 'var(--error)' : 'var(--text-muted)';
                  return (
                    <div style={{ padding: '0.5rem', background: 'var(--bg-primary)', borderRadius: '6px', borderLeft: '3px solid', borderColor: rColor }}>
                      <div style="font-size: 0.85rem; font-weight: 500;">{route.routeName}</div>
                      <div style="font-size: 0.7rem; color: var(--text-muted);">
                        {route.toolBag.length} tools | {route.progress.length} actions
                      </div>
                      {route.progress.length > 0 && (
                        <div style={{ fontSize: '0.7rem', color: rColor, marginTop: '0.25rem' }}>
                          {route.progress[route.progress.length - 1].action}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  } catch (error: any) {
    return c.html(<div class="empty-state" style="color: var(--error);">Failed to load swarms: {error.message}</div>);
  }
});

// Get single swarm (JSON API)
app.get('/api/swarms/:id', async (c) => {
  const swarmId = c.req.param('id');
  try {
    const store = await getObservabilityStore();
    const swarm = await store.getSwarm(swarmId);
    if (!swarm) {
      return c.json({ error: 'Swarm not found' }, 404);
    }
    return c.json(swarm);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Create a new swarm (called by MCP)
app.post('/api/swarms', async (c) => {
  try {
    const data = await c.req.json();
    const store = await getObservabilityStore();

    const swarm = {
      swarmId: data.swarmId || `swarm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      masterIntent: data.masterIntent || data.intent || 'Unknown intent',
      status: 'running' as const,
      startedAt: new Date(),
      routes: (data.routes || []).map((r: any) => ({
        routeId: r.routeId || r.id,
        routeName: r.routeName || r.name,
        status: 'pending' as const,
        toolBag: r.toolBag?.map((t: any) => t.name || t) || [],
        progress: [],
      })),
      config: {
        maxIgors: data.config?.maxIgors || 4,
        toolBagSize: data.config?.toolBagSize || 15,
      },
    };

    await store.createSwarm(swarm);
    return c.json({ success: true, swarmId: swarm.swarmId, swarm });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Update route status (called by Igor agents)
app.patch('/api/swarms/:swarmId/routes/:routeId', async (c) => {
  const { swarmId, routeId } = c.req.param();
  try {
    const update = await c.req.json();
    const store = await getObservabilityStore();
    await store.updateRouteStatus(swarmId, routeId, update);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Add progress to route (called by Igor agents for live updates)
app.post('/api/swarms/:swarmId/routes/:routeId/progress', async (c) => {
  const { swarmId, routeId } = c.req.param();
  try {
    const progress = await c.req.json();
    const store = await getObservabilityStore();
    await store.addRouteProgress(swarmId, routeId, progress);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Update swarm status
app.patch('/api/swarms/:swarmId/status', async (c) => {
  const swarmId = c.req.param('swarmId');
  try {
    const { status } = await c.req.json();
    const store = await getObservabilityStore();
    await store.updateSwarmStatus(swarmId, status);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// Delete swarm
app.delete('/api/swarms/:swarmId', async (c) => {
  const swarmId = c.req.param('swarmId');
  try {
    const store = await getObservabilityStore();
    await store.deleteSwarm(swarmId);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// SSE Events - Real-time updates
app.get('/events', (c) => {
  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      data: `<span class="status-dot live"></span><span class="status-text">Connected</span>`,
      event: 'status-update',
    });

    const store = await getObservabilityStore();
    let lastEventCount = 0;
    let lastRunCount = 0;

    while (true) {
      await new Promise((r) => setTimeout(r, 2000));

      try {
        // Check for new runs
        const runs = await store.getRuns(5);
        if (runs.length !== lastRunCount) {
          lastRunCount = runs.length;
          const latestRun = runs[0];
          if (latestRun) {
            const statusClass = latestRun.status === 'passed' ? 'success' : latestRun.status === 'failed' ? 'error' : 'info';
            const time = new Date().toLocaleTimeString('en-US', { hour12: false });
            await stream.writeSSE({
              data: `<div class="log-entry ${statusClass}"><span class="log-time">${time}</span><span class="log-type">run</span>Test run ${latestRun.id.slice(0, 8)} - ${latestRun.status}</div>`,
              event: 'log-update',
            });
          }
        }

        // Check browser state
        const browserInfo = await browserState.getInfo();
        if (browserInfo.active) {
          await stream.writeSSE({
            data: `<span class="status-dot live"></span><span class="status-text">Browser Active: ${browserInfo.url || 'No URL'}</span>`,
            event: 'browser-status',
          });
        }

        // Get recent stats for stats update
        const stats = await store.getStats();
        await stream.writeSSE({
          data: JSON.stringify({
            totalRuns: stats.totalRuns,
            passRate: stats.passRate.toFixed(1),
            avgDuration: stats.avgDuration.toFixed(0),
          }),
          event: 'stats-update',
        });

      } catch {
        // Ignore errors, keep streaming
      }
    }
  });
});

// =============================================================================
// Hub API Endpoints (proxy to Hub service on port 7010)
// =============================================================================

const HUB_URL = process.env.HUB_URL || 'http://localhost:7010';

// Hub Projects
app.get('/api/hub/projects', async (c) => {
  try {
    const res = await fetch(`${HUB_URL}/projects`);
    const data = await res.json() as { projects: any[] };

    if (!data.projects?.length) {
      return c.html(
        <div style="color: var(--text-muted); text-align: center; padding: 1rem;">
          No projects yet. Click "+ New" to create one.
        </div>
      );
    }

    return c.html(
      <div class="list">
        {data.projects.map((p: any) => (
          <div class="list-item" style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-weight: 500;">{p.name}</div>
              <div style="font-size: 0.8rem; color: var(--text-muted);">{p.baseUrl}</div>
            </div>
            <div style="display: flex; gap: 0.5rem;">
              <button
                class="btn btn-outline btn-sm"
                hx-get={`/api/hub/projects/${p.id}/targets`}
                hx-target="#hub-targets"
                hx-swap="innerHTML"
              >Targets</button>
              <button
                class="btn btn-outline btn-sm"
                hx-get={`/api/hub/projects/${p.id}/stats`}
                hx-target="#hub-runs"
                hx-swap="innerHTML"
              >Stats</button>
            </div>
          </div>
        ))}
      </div>
    );
  } catch (error: any) {
    return c.html(
      <div class="badge badge-error">Hub offline: {error.message}</div>
    );
  }
});

app.get('/api/hub/projects/new', (c) => {
  return c.html(
    <div class="modal-overlay" onclick="this.remove()">
      <div class="modal" onclick="event.stopPropagation()">
        <div class="modal-header">
          <span class="modal-title">Create Project</span>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <form hx-post="/api/hub/projects" hx-target="#hub-projects" hx-swap="innerHTML" hx-on--after-request="this.closest('.modal-overlay').remove()">
          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem;">Project Name</label>
            <input type="text" name="name" class="input" placeholder="My App" required />
          </div>
          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem;">Base URL</label>
            <input type="text" name="baseUrl" class="input" placeholder="http://localhost:3000" required />
          </div>
          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem;">Description</label>
            <textarea name="description" class="input" rows="2" placeholder="Optional description"></textarea>
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%;">Create Project</button>
        </form>
      </div>
    </div>
  );
});

app.post('/api/hub/projects', async (c) => {
  try {
    const body = await c.req.parseBody();
    const res = await fetch(`${HUB_URL}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    // Refresh projects list
    const listRes = await fetch(`${HUB_URL}/projects`);
    const data = await listRes.json() as { projects: any[] };

    return c.html(
      <div class="list">
        {data.projects.map((p: any) => (
          <div class="list-item" style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-weight: 500;">{p.name}</div>
              <div style="font-size: 0.8rem; color: var(--text-muted);">{p.baseUrl}</div>
            </div>
            <button class="btn btn-outline btn-sm" hx-get={`/api/hub/projects/${p.id}/targets`} hx-target="#hub-targets">Targets</button>
          </div>
        ))}
      </div>
    );
  } catch (error: any) {
    return c.html(<div class="badge badge-error">Error: {error.message}</div>);
  }
});

app.get('/api/hub/projects/:id/stats', async (c) => {
  const id = c.req.param('id');
  try {
    const res = await fetch(`${HUB_URL}/projects/${id}/stats`);
    const data = await res.json() as { stats: any };
    const s = data.stats;

    return c.html(
      <div>
        <div class="stat-card">
          <div class="stat-label">Targets</div>
          <div class="stat-value">{s.enabledTargets}/{s.totalTargets}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Pass Rate</div>
          <div class="stat-value">{s.passRate.toFixed(0)}%</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Runs</div>
          <div class="stat-value">{s.totalRuns}</div>
        </div>
      </div>
    );
  } catch (error: any) {
    return c.html(<div class="badge badge-error">Error: {error.message}</div>);
  }
});

app.get('/api/hub/projects/:id/targets', async (c) => {
  const id = c.req.param('id');
  try {
    const res = await fetch(`${HUB_URL}/targets?projectId=${id}`);
    const data = await res.json() as { targets: any[] };

    if (!data.targets?.length) {
      return c.html(<div style="color: var(--text-muted); padding: 1rem;">No targets for this project.</div>);
    }

    return c.html(
      <div class="list">
        {data.targets.map((t: any) => (
          <div class="list-item">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 500;">{t.name}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">
                  {t.trigger.type} | {t.watchers.length} watcher(s) | {t.assertions.length} assertion(s)
                </div>
              </div>
              <div style="display: flex; gap: 0.5rem; align-items: center;">
                {t.lastRunStatus && (
                  <span class={`badge badge-${t.lastRunStatus === 'passed' ? 'success' : 'error'}`}>
                    {t.lastRunStatus}
                  </span>
                )}
                <button
                  class="btn btn-primary btn-sm"
                  hx-post={`/api/hub/execute/${t.id}`}
                  hx-target="#hub-runs"
                  hx-swap="innerHTML"
                >Run</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  } catch (error: any) {
    return c.html(<div class="badge badge-error">Error: {error.message}</div>);
  }
});

// Hub Targets
app.get('/api/hub/targets', async (c) => {
  try {
    const res = await fetch(`${HUB_URL}/targets`);
    const data = await res.json() as { targets: any[] };

    if (!data.targets?.length) {
      return c.html(<div style="color: var(--text-muted); text-align: center; padding: 1rem;">No targets yet.</div>);
    }

    return c.html(
      <div class="list">
        {data.targets.map((t: any) => (
          <div class="list-item">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 500;">{t.name}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">
                  {t.trigger.type} trigger | {t.watchers.length} watcher(s)
                </div>
              </div>
              <div style="display: flex; gap: 0.5rem; align-items: center;">
                <span class={`badge ${t.enabled ? 'badge-success' : 'badge-muted'}`}>
                  {t.enabled ? 'enabled' : 'disabled'}
                </span>
                <button class="btn btn-primary btn-sm" hx-post={`/api/hub/execute/${t.id}`} hx-target="#hub-runs">Run</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  } catch (error: any) {
    return c.html(<div class="badge badge-error">Hub offline: {error.message}</div>);
  }
});

// Hub Runs
app.get('/api/hub/runs', async (c) => {
  try {
    const res = await fetch(`${HUB_URL}/runs?limit=10`);
    const data = await res.json() as { runs: any[] };

    if (!data.runs?.length) {
      return c.html(<div style="color: var(--text-muted); text-align: center; padding: 1rem;">No runs yet.</div>);
    }

    return c.html(
      <div class="list">
        {data.runs.map((r: any) => (
          <div class="list-item">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span class={`badge badge-${r.status === 'passed' ? 'success' : r.status === 'failed' ? 'error' : 'info'}`}>
                  {r.status}
                </span>
                <span style="margin-left: 0.5rem; font-size: 0.8rem; color: var(--text-muted);">
                  {new Date(r.startedAt).toLocaleTimeString()}
                </span>
              </div>
              {r.durationMs && <span style="color: var(--text-muted);">{r.durationMs}ms</span>}
            </div>
          </div>
        ))}
      </div>
    );
  } catch (error: any) {
    return c.html(<div class="badge badge-error">Hub offline: {error.message}</div>);
  }
});

// Execute target
app.post('/api/hub/execute/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const res = await fetch(`${HUB_URL}/execute/${id}`, { method: 'POST' });
    const data = await res.json() as { runId: string; message: string };

    return c.html(
      <div>
        <div class="badge badge-success" style="margin-bottom: 1rem;">Execution started: {data.runId}</div>
        <div style="color: var(--text-muted);">{data.message}</div>
      </div>
    );
  } catch (error: any) {
    return c.html(<div class="badge badge-error">Error: {error.message}</div>);
  }
});

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// =============================================================================
// Server Start
// =============================================================================

const port = parseInt(process.env.PORT || '3333');
console.log(`\n  \x1b[35m\x1b[1mBarrHawk Dashboard\x1b[0m`);
console.log(`  \x1b[90m→\x1b[0m http://localhost:${port}\n`);

serve({ fetch: app.fetch, port });
