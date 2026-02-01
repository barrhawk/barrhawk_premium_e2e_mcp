#!/usr/bin/env bun
/**
 * BarrHawk Dashboard-Min v2
 * Lightweight visual war room for tripartite E2E testing.
 *
 * Features:
 * - Live browser view (screenshots from Frankenstein)
 * - Multi-agent grid (Igor swarm status)
 * - Plan flowchart (Doctor's current plan)
 * - Command input (submit intents directly)
 * - Real-time events from Bridge
 */

const PORT = parseInt(process.env.DASHBOARD_PORT || '3333');

const BRIDGE_URL = process.env.BRIDGE_URL || 'http://localhost:7000';
const BRIDGE_WS = process.env.BRIDGE_WS || 'ws://localhost:7000';
const DOCTOR_URL = process.env.DOCTOR_URL || 'http://localhost:7001';
const IGOR_URL = process.env.IGOR_URL || 'http://localhost:7002';
const FRANK_URL = process.env.FRANK_URL || 'http://localhost:7003';
const SCREENSHOTS_DIR = process.env.SCREENSHOTS_DIR || '/tmp/tripartite-screenshots';

// State
interface DashboardState {
  bridge: any;
  doctor: any;
  igor: any;
  frankenstein: any;
  doctorFrank: any;
  plans: any[];
  igors: any[];
  events: any[];
  reports: any[];
  toolbag: any;  // Igor's current tool bag
  stats: { total: number; passed: number; failed: number; successRate: string };
  lastScreenshot: string | null;
  lastUpdate: number;
}

const state: DashboardState = {
  bridge: null,
  doctor: null,
  igor: null,
  frankenstein: null,
  doctorFrank: null,
  plans: [],
  igors: [],
  events: [],
  reports: [],
  toolbag: null,
  stats: { total: 0, passed: 0, failed: 0, successRate: '-' },
  lastScreenshot: null,
  lastUpdate: 0,
};

const clients = new Set<any>();
let bridgeWs: WebSocket | null = null;

// Bridge WebSocket
function connectToBridge() {
  try {
    bridgeWs = new WebSocket(BRIDGE_WS);
    bridgeWs.onopen = () => {
      console.log('[Dashboard] Connected to Bridge');
      bridgeWs?.send(JSON.stringify({
        type: 'component.register',
        source: 'dashboard',
        payload: { name: 'dashboard-min', version: '2.0.0' }
      }));
    };
    bridgeWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        // Track events
        if (msg.type && !msg.type.includes('heartbeat')) {
          state.events.unshift({ time: Date.now(), ...msg });
          if (state.events.length > 50) state.events.pop();
          broadcast({ type: 'event', event: msg });
        }
        // Screenshot updates
        if (msg.type === 'browser.screenshot') {
          state.lastScreenshot = msg.payload?.path || null;
          broadcast({ type: 'screenshot', path: state.lastScreenshot });
        }
      } catch {}
    };
    bridgeWs.onclose = () => setTimeout(connectToBridge, 3000);
    bridgeWs.onerror = () => bridgeWs?.close();
  } catch {
    setTimeout(connectToBridge, 3000);
  }
}

// Fetch helpers
async function fetchJson(url: string): Promise<any> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

// Update state
async function updateState() {
  const [bridge, doctor, igor, frank, doctorFrank, plans, igors, reports, toolbag] = await Promise.all([
    fetchJson(`${BRIDGE_URL}/health`),
    fetchJson(`${DOCTOR_URL}/health`),
    fetchJson(`${IGOR_URL}/health`),
    fetchJson(`${FRANK_URL}/health`),
    fetchJson(`${DOCTOR_URL}/frank`),
    fetchJson(`${DOCTOR_URL}/plans`),
    fetchJson(`${DOCTOR_URL}/igors`),
    fetchJson(`${BRIDGE_URL}/reports`),
    fetchJson(`${IGOR_URL}/toolbag`),
  ]);

  state.bridge = bridge;
  state.doctor = doctor;
  state.igor = igor;
  state.frankenstein = frank;
  state.doctorFrank = doctorFrank;
  state.plans = Array.isArray(plans) ? plans : (plans?.plans || []);
  state.igors = igors?.instances || igors?.igors || [];
  state.toolbag = toolbag;

  const reportList = Array.isArray(reports) ? reports : (reports?.reports || []);
  state.reports = reportList;
  const total = reportList.length;
  const passed = reportList.filter((r: any) => r.success === true).length;
  const failed = reportList.filter((r: any) => r.success === false).length;
  const successRate = total > 0 ? ((passed / total) * 100).toFixed(0) + '%' : '-';
  state.stats = { total, passed, failed, successRate };

  state.lastUpdate = Date.now();

  broadcast({ type: 'state', data: state });
}

function broadcast(data: any) {
  const msg = JSON.stringify(data);
  for (const c of clients) { try { c.send(msg); } catch {} }
}

// Get latest screenshot
async function getLatestScreenshot(): Promise<string | null> {
  try {
    const { readdir, stat } = await import('fs/promises');
    const files = await readdir(SCREENSHOTS_DIR);
    const pngs = files.filter(f => f.endsWith('.png'));
    if (pngs.length === 0) return null;

    let latest = { file: '', mtime: 0 };
    for (const f of pngs.slice(-10)) {
      const s = await stat(`${SCREENSHOTS_DIR}/${f}`);
      if (s.mtimeMs > latest.mtime) latest = { file: f, mtime: s.mtimeMs };
    }
    return latest.file ? `${SCREENSHOTS_DIR}/${latest.file}` : null;
  } catch { return null; }
}

// HTML
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BarrHawk War Room</title>
  <style>
    :root {
      --bg: #09090b;
      --card: #0f0f13;
      --card-elevated: #141419;
      --border: #1c1c26;
      --border-subtle: #16161e;
      --text: #e4e4e9;
      --text-secondary: #a0a0b0;
      --muted: #5a5a6e;
      --green: #22c55e;
      --green-dim: rgba(34,197,94,0.12);
      --red: #ef4444;
      --red-dim: rgba(239,68,68,0.12);
      --yellow: #eab308;
      --yellow-dim: rgba(234,179,8,0.12);
      --blue: #3b82f6;
      --blue-dim: rgba(59,130,246,0.12);
      --purple: #7c3aed;
      --purple-dim: rgba(124,58,237,0.12);
      --accent: #818cf8;
      --radius: 6px;
      --font-mono: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; font-size: 13px; line-height: 1.5; -webkit-font-smoothing: antialiased; }

    .layout { display: grid; grid-template-columns: 1fr 340px; grid-template-rows: auto 1fr auto; height: 100vh; }

    /* Header */
    .header { grid-column: 1/-1; border-bottom: 1px solid var(--border); padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; background: var(--card); }
    .logo { font-weight: 700; font-size: 15px; letter-spacing: -0.02em; color: var(--accent); display: flex; align-items: center; gap: 8px; }
    .logo-icon { width: 20px; height: 20px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 5px; display: flex; align-items: center; justify-content: center; font-size: 11px; }
    .status-row { display: flex; gap: 16px; }
    .status-dot { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-secondary); font-weight: 500; }
    .dot { width: 7px; height: 7px; border-radius: 50%; transition: all 0.3s; }
    .dot.on { background: var(--green); box-shadow: 0 0 8px rgba(34,197,94,0.5); }
    .dot.off { background: var(--muted); opacity: 0.5; }

    /* Toggle Switch */
    .toggle-wrapper { display: flex; align-items: center; gap: 8px; margin-left: 20px; }
    .toggle-label { font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
    .toggle { position: relative; width: 36px; height: 20px; background: var(--border); border-radius: 20px; cursor: pointer; transition: background 0.3s; }
    .toggle.active { background: var(--green); }
    .toggle-handle { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; background: #fff; border-radius: 50%; transition: transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1); }
    .toggle.active .toggle-handle { transform: translateX(16px); }
    
    /* Main panel */
    .main { display: flex; flex-direction: column; overflow: hidden; background: var(--bg); }
    .browser-panel { flex: 1; background: #000; position: relative; display: flex; align-items: center; justify-content: center; min-height: 0; }
    .browser-panel img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .browser-empty { color: var(--muted); text-align: center; }
    .browser-empty .empty-icon { font-size: 28px; opacity: 0.25; margin-bottom: 12px; }
    .browser-empty p { font-size: 12px; color: var(--muted); line-height: 1.6; }

    /* Agent bar */
    .agents-bar { display: flex; gap: 6px; padding: 10px 14px; background: var(--card); border-top: 1px solid var(--border); overflow-x: auto; align-items: center; }
    .agent { padding: 8px 14px; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); font-size: 11px; white-space: nowrap; min-width: 90px; transition: all 0.2s; }
    .agent.active { border-color: rgba(34,197,94,0.3); background: var(--green-dim); }
    .agent.busy { border-color: rgba(234,179,8,0.3); background: var(--yellow-dim); animation: pulse 2s ease-in-out infinite; }
    .agent.error { border-color: rgba(239,68,68,0.3); background: var(--red-dim); }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
    .agent-name { font-weight: 600; display: block; font-size: 11px; }
    .agent-status { color: var(--muted); font-size: 10px; margin-top: 1px; }
    .agent-task { color: var(--blue); font-size: 9px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; }
    .flow-arrow { color: var(--border); font-size: 14px; padding: 0 2px; font-family: var(--font-mono); }
    .flow-arrow.active { color: var(--yellow); animation: pulse 1s infinite; }

    /* Sidebar */
    .sidebar { border-left: 1px solid var(--border); display: flex; flex-direction: column; background: var(--card); overflow: hidden; }

    .section { padding: 14px 16px; border-bottom: 1px solid var(--border); }
    .section-header { font-size: 10px; color: var(--muted); margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; display: flex; align-items: center; justify-content: space-between; }
    .section-badge { font-size: 9px; background: var(--border); color: var(--text-secondary); padding: 1px 6px; border-radius: 10px; font-weight: 500; }

    /* Command */
    .command-input { display: flex; gap: 6px; }
    .command-input input { flex: 1; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 9px 12px; color: var(--text); font-size: 12px; transition: border-color 0.2s; }
    .command-input input::placeholder { color: var(--muted); }
    .command-input input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px rgba(129,140,248,0.15); }
    .command-input button { background: var(--accent); border: none; border-radius: var(--radius); padding: 9px 16px; color: #fff; font-size: 11px; font-weight: 600; cursor: pointer; transition: opacity 0.15s; letter-spacing: 0.02em; }
    .command-input button:hover { opacity: 0.85; }

    /* Plans */
    .plan-list { max-height: 160px; overflow-y: auto; }
    .plan-empty { color: var(--muted); font-size: 11px; padding: 4px 0; }
    .plan { background: var(--bg); border-radius: var(--radius); padding: 10px; margin-bottom: 6px; border-left: 3px solid var(--purple); }
    .plan-id { font-size: 10px; color: var(--muted); font-family: var(--font-mono); }
    .plan-intent { font-size: 12px; margin: 4px 0 6px; color: var(--text); line-height: 1.4; }
    .plan-steps { display: flex; gap: 4px; flex-wrap: wrap; }
    .step { font-size: 9px; padding: 2px 7px; border-radius: 3px; background: var(--border); color: var(--text-secondary); font-weight: 500; }
    .step.done { background: var(--green-dim); color: var(--green); }
    .step.active { background: var(--blue-dim); color: var(--blue); }
    .step.failed { background: var(--red-dim); color: var(--red); }

    /* Test Results */
    .results-list { max-height: 200px; overflow-y: auto; }
    .result { background: var(--bg); border-radius: var(--radius); padding: 10px 12px; margin-bottom: 6px; transition: background 0.15s; }
    .result:hover { background: var(--card-elevated); }
    .result.pass { border-left: 3px solid var(--green); }
    .result.fail { border-left: 3px solid var(--red); }
    .result-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .result-badge { font-size: 9px; font-weight: 700; padding: 2px 8px; border-radius: 3px; text-transform: uppercase; letter-spacing: 0.05em; font-family: var(--font-mono); }
    .result-badge.pass { background: var(--green-dim); color: var(--green); }
    .result-badge.fail { background: var(--red-dim); color: var(--red); }
    .result-time { font-size: 10px; color: var(--muted); font-family: var(--font-mono); }
    .result-intent { font-size: 11px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.4; }
    .result-meta { font-size: 10px; color: var(--muted); margin-top: 4px; display: flex; gap: 10px; align-items: center; }
    .result-meta span { display: flex; align-items: center; gap: 3px; }

    /* Frank Flow */
    .frank-section { padding: 14px 16px; border-bottom: 1px solid var(--border); }
    .frank-flow-bar { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
    .frank-flow-label { font-size: 12px; color: var(--muted); flex-shrink: 0; }
    .frank-flow-track { flex: 1; height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; }
    .frank-flow-fill { height: 100%; background: var(--accent); border-radius: 2px; transition: width 0.4s ease; }
    .frank-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .frank-stat { background: var(--bg); border-radius: var(--radius); padding: 8px 10px; }
    .frank-stat-label { font-size: 9px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 500; }
    .frank-stat-value { font-size: 16px; font-weight: 700; margin-top: 2px; font-family: var(--font-mono); }
    .frank-stat-value.red { color: var(--red); }
    .frank-stat-value.green { color: var(--green); }
    .frank-pending { margin-top: 8px; font-size: 10px; color: var(--muted); }

    /* Events */
    .events-box { flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
    .events-header { padding: 14px 16px 10px; }
    .events { flex: 1; overflow-y: auto; padding: 0 16px 16px; }
    .event { font-family: var(--font-mono); font-size: 10px; padding: 5px 0; border-bottom: 1px solid var(--border-subtle); display: flex; gap: 8px; align-items: baseline; }
    .event-time { color: var(--muted); flex-shrink: 0; font-size: 9px; }
    .event-type { flex-shrink: 0; min-width: 90px; font-weight: 600; font-size: 10px; }
    .event-type.completed,.event-type.created { color: var(--green); }
    .event-type.failed,.event-type.error { color: var(--red); }
    .event-type.started,.event-type.submit { color: var(--blue); }
    .event-data { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 9px; }

    /* Metrics Bar */
    .metrics-bar { grid-column: 1/-1; display: flex; background: var(--card); border-top: 1px solid var(--border); }
    .metric { flex: 1; padding: 12px 16px; text-align: center; position: relative; }
    .metric + .metric { border-left: 1px solid var(--border); }
    .metric-value { font-size: 20px; font-weight: 700; font-family: var(--font-mono); letter-spacing: -0.02em; }
    .metric-label { font-size: 9px; color: var(--muted); text-transform: uppercase; margin-top: 2px; letter-spacing: 0.06em; font-weight: 500; }
    .metric-value.green { color: var(--green); }
    .metric-value.red { color: var(--red); }
    .metric-value.yellow { color: var(--yellow); }
    .metric-value.neutral { color: var(--text-secondary); }

    /* Toolbag Section */
    .toolbag-section { padding: 14px 16px; border-bottom: 1px solid var(--border); }
    .toolbag-list { display: flex; flex-wrap: wrap; gap: 4px; max-height: 80px; overflow-y: auto; }
    .tool-chip { font-size: 9px; padding: 3px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 12px; color: var(--text-secondary); font-family: var(--font-mono); }
    .tool-chip.frank { border-color: rgba(124,58,237,0.3); color: var(--purple); }
    .toolbag-empty { color: var(--muted); font-size: 11px; }

    /* Autopsy Modal */
    .autopsy-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 1000; display: none; align-items: center; justify-content: center; }
    .autopsy-overlay.active { display: flex; }
    .autopsy-modal { background: var(--card); border: 1px solid var(--border); border-radius: 8px; width: 90%; max-width: 800px; max-height: 85vh; overflow: hidden; display: flex; flex-direction: column; }
    .autopsy-header { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
    .autopsy-title { font-size: 14px; font-weight: 600; }
    .autopsy-close { background: none; border: none; color: var(--muted); font-size: 20px; cursor: pointer; padding: 4px 8px; }
    .autopsy-close:hover { color: var(--text); }
    .autopsy-content { padding: 20px; overflow-y: auto; flex: 1; }
    .autopsy-section { margin-bottom: 20px; }
    .autopsy-section-title { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; font-weight: 600; }
    .autopsy-intent { font-size: 14px; color: var(--text); margin-bottom: 8px; line-height: 1.5; padding: 12px; background: var(--bg); border-radius: var(--radius); }
    .autopsy-meta { display: flex; gap: 16px; font-size: 11px; color: var(--text-secondary); margin-bottom: 16px; }
    .autopsy-steps { display: flex; flex-direction: column; gap: 8px; }
    .autopsy-step { background: var(--bg); border-radius: var(--radius); padding: 12px; border-left: 3px solid var(--border); }
    .autopsy-step.done { border-left-color: var(--green); }
    .autopsy-step.failed { border-left-color: var(--red); }
    .autopsy-step.pending { border-left-color: var(--muted); }
    .autopsy-step-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .autopsy-step-num { font-size: 10px; font-weight: 700; color: var(--muted); }
    .autopsy-step-action { font-size: 12px; font-weight: 600; font-family: var(--font-mono); }
    .autopsy-step-params { font-size: 11px; color: var(--text-secondary); font-family: var(--font-mono); word-break: break-all; margin-top: 4px; }
    .autopsy-step-result { font-size: 10px; margin-top: 6px; padding: 6px 8px; background: var(--card); border-radius: 3px; }
    .autopsy-step-result.success { color: var(--green); }
    .autopsy-step-result.error { color: var(--red); }
    .autopsy-errors { background: var(--red-dim); border: 1px solid rgba(239,68,68,0.2); border-radius: var(--radius); padding: 12px; }
    .autopsy-error { font-size: 11px; color: var(--red); font-family: var(--font-mono); margin-bottom: 6px; line-height: 1.4; }
    .autopsy-error:last-child { margin-bottom: 0; }
    .autopsy-toolbag { display: flex; flex-wrap: wrap; gap: 6px; }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--muted); }
  </style>
</head>
<body>
  <div class="layout">
    <header class="header">
      <div class="logo">
        <div class="logo-icon">B</div>
        BarrHawk War Room
      </div>
      <div class="status-row">
        <div class="toggle-wrapper" title="Token Nuke: Turn off to save context tokens (Hollow Shell mode)">
          <div class="toggle-label">Tools</div>
          <div class="toggle active" id="tools-toggle" onclick="toggleTools()">
            <div class="toggle-handle"></div>
          </div>
        </div>
        <div class="status-dot"><div class="dot" id="s-bridge"></div>Bridge</div>
        <div class="status-dot"><div class="dot" id="s-doctor"></div>Doctor</div>
        <div class="status-dot"><div class="dot" id="s-igor"></div>Igor</div>
        <div class="status-dot"><div class="dot" id="s-frank"></div>Frank</div>
      </div>
    </header>

    <div class="main">
      <div class="browser-panel" id="browser-panel">
        <div class="browser-empty" id="browser-empty">
          <div class="empty-icon">&#9635;</div>
          <p>No browser session active</p>
          <p>Submit a test intent to start</p>
        </div>
        <img id="browser-img" style="display:none" />
      </div>
      <div class="agents-bar" id="agents-bar">
        <div class="agent"><span class="agent-name">Igor</span><span class="agent-status">idle</span></div>
      </div>
    </div>

    <div class="sidebar">
      <div class="section">
        <div class="section-header">Command</div>
        <div class="command-input">
          <input type="text" id="cmd-input" placeholder="Test the login flow..." />
          <button onclick="submitIntent()">Run</button>
        </div>
      </div>

      <div class="section">
        <div class="section-header">Active Plans <span class="section-badge" id="plan-count">0</span></div>
        <div class="plan-list" id="plans"><div class="plan-empty">No active plans</div></div>
      </div>

      <div class="section">
        <div class="section-header">Test Results <span class="section-badge" id="result-count">0</span></div>
        <div class="results-list" id="results"><div class="plan-empty">No completed tests</div></div>
      </div>

      <div class="frank-section">
        <div class="section-header">Igor &rarr; Frank Pipeline</div>
        <div class="frank-flow-bar">
          <div class="frank-flow-label">Igor</div>
          <div class="frank-flow-track"><div class="frank-flow-fill" id="flow-progress" style="width:0%"></div></div>
          <div class="frank-flow-label">Frank</div>
        </div>
        <div class="frank-stats">
          <div class="frank-stat">
            <div class="frank-stat-label">Failures</div>
            <div class="frank-stat-value red" id="frank-patterns">0</div>
          </div>
          <div class="frank-stat">
            <div class="frank-stat-label">Tools Built</div>
            <div class="frank-stat-value green" id="frank-tools">0</div>
          </div>
        </div>
        <div class="frank-pending" id="pending-requests"></div>
        <span id="frank-threshold" style="display:none">2</span>
      </div>

      <div class="toolbag-section">
        <div class="section-header">Igor Tool Bag <span class="section-badge" id="toolbag-count">0</span></div>
        <div class="toolbag-list" id="toolbag"><span class="toolbag-empty">No tools loaded</span></div>
      </div>

      <div class="events-box">
        <div class="events-header">
          <div class="section-header" style="margin-bottom:0">Live Events</div>
        </div>
        <div class="events" id="events"></div>
      </div>
    </div>

    <div class="metrics-bar">
      <div class="metric"><div class="metric-value neutral" id="m-executed">0</div><div class="metric-label">Executed</div></div>
      <div class="metric"><div class="metric-value green" id="m-passed">0</div><div class="metric-label">Passed</div></div>
      <div class="metric"><div class="metric-value red" id="m-failed">0</div><div class="metric-label">Failed</div></div>
      <div class="metric"><div class="metric-value neutral" id="m-agents">1</div><div class="metric-label">Agents</div></div>
      <div class="metric"><div class="metric-value green" id="m-success">-</div><div class="metric-label">Success %</div></div>
    </div>
  </div>

  <!-- Autopsy Modal -->
  <div class="autopsy-overlay" id="autopsy-overlay" onclick="if(event.target===this)closeAutopsy()">
    <div class="autopsy-modal">
      <div class="autopsy-header">
        <span class="autopsy-title" id="autopsy-title">Plan Autopsy</span>
        <button class="autopsy-close" onclick="closeAutopsy()">&times;</button>
      </div>
      <div class="autopsy-content" id="autopsy-content">
        <!-- Filled by JS -->
      </div>
    </div>
  </div>

<script>
let ws;
const events = [];

function connect() {
  ws = new WebSocket('ws://'+location.host+'/ws');
  ws.onopen = () => console.log('Dashboard connected');
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'state') updateUI(msg.data);
    if (msg.type === 'event') addEvent(msg.event);
    if (msg.type === 'screenshot') loadScreenshot(msg.path);
  };
  ws.onclose = () => setTimeout(connect, 2000);
}

function updateUI(s) {
  setDot('s-bridge', s.bridge?.status === 'healthy');
  setDot('s-doctor', s.doctor?.status === 'healthy');
  setDot('s-igor', s.igor?.status === 'healthy');
  setDot('s-frank', s.frankenstein?.status === 'healthy');

  const stats = s.stats || { total:0, passed:0, failed:0, successRate:'-' };
  setText('m-executed', stats.total);
  setText('m-passed', stats.passed);
  setText('m-failed', stats.failed);
  setText('m-agents', (s.igors?.length || 0) + 1);
  setText('m-success', stats.successRate);
  const pct = parseFloat(stats.successRate);
  document.getElementById('m-success').className = 'metric-value ' + (isNaN(pct) ? 'neutral' : pct >= 80 ? 'green' : pct < 50 ? 'red' : 'yellow');

  renderPlans(s.plans || []);
  renderReports(s.reports || []);
  renderAgents(s.igors || [], s.igor, s.doctor, s.frankenstein);
  updateFrankFlow(s.doctorFrank);
  renderToolbag(s.toolbag);

  if (s.frankenstein?.browserActive) fetchScreenshot();
}

function setText(id, v) { document.getElementById(id).textContent = v; }
function setDot(id, on) { document.getElementById(id).className = 'dot ' + (on ? 'on' : 'off'); }

function renderPlans(plans) {
  setText('plan-count', plans.length);
  const el = document.getElementById('plans');
  if (!plans.length) { el.innerHTML = '<div class="plan-empty">No active plans</div>'; return; }
  el.innerHTML = plans.slice(0, 5).map(p => {
    const stepIndicators = Array.from({length: p.totalSteps || 0}, (_,i) => {
      const status = i < p.currentStep ? 'done' : i === p.currentStep ? 'active' : 'pending';
      return '<span class="step ' + status + '">' + (i+1) + '</span>';
    }).join('');
    return '<div class="plan" style="cursor:pointer" onclick="openAutopsy(\\'' + (p.id || '') + '\\')">' +
      '<div class="plan-id">' + (p.id || '').substring(0,8) + ' &middot; ' + (p.status || 'unknown') + '</div>' +
      '<div class="plan-intent">' + esc(p.intent || 'Unknown intent') + '</div>' +
      '<div class="plan-steps">' + stepIndicators + '</div>' +
      (p.errors?.length ? '<div style="font-size:10px;color:var(--red);margin-top:6px">' + esc(p.errors[0]) + '</div>' : '') +
      '</div>';
  }).join('');
}

function renderReports(reports) {
  setText('result-count', reports.length);
  const el = document.getElementById('results');
  if (!reports.length) { el.innerHTML = '<div class="plan-empty">No completed tests</div>'; return; }
  const sorted = reports.slice().sort((a,b) => (b.completedAt || b.timestamp || 0) - (a.completedAt || a.timestamp || 0));
  el.innerHTML = sorted.slice(0, 15).map(r => {
    const ok = r.success === true;
    const cls = ok ? 'pass' : 'fail';
    const rawIntent = r.data?.intent || r.intent || r.planId || 'Unknown';
    const intent = rawIntent.length > 80 ? rawIntent.substring(0,77) + '...' : rawIntent;
    const steps = r.data?.steps || r.steps?.length || r.stepCount || 0;
    const time = r.completedAt || r.timestamp;
    const ts = time ? new Date(time).toLocaleTimeString() : '';
    const planId = r.planId || r.id || '';
    return '<div class="result ' + cls + '" style="cursor:pointer" onclick="openAutopsy(\\'' + planId + '\\')">' +
      '<div class="result-header">' +
      '<span class="result-badge ' + cls + '">' + (ok ? 'PASS' : 'FAIL') + '</span>' +
      '<span class="result-time">' + ts + '</span></div>' +
      '<div class="result-intent" title="' + esc(rawIntent) + '">' + esc(intent) + '</div>' +
      '<div class="result-meta"><span>' + steps + ' steps</span>' +
      (r.data?.errors?.length ? '<span style="color:var(--red)">' + r.data.errors.length + ' errors</span>' : '') +
      '</div></div>';
  }).join('');
}

function renderToolbag(toolbag) {
  const count = toolbag?.count || toolbag?.toolBag?.length || 0;
  setText('toolbag-count', count);
  const el = document.getElementById('toolbag');
  if (!count) { el.innerHTML = '<span class="toolbag-empty">No tools loaded</span>'; return; }
  const tools = toolbag.toolBag || [];
  el.innerHTML = tools.map(t => {
    const isFrank = t.name?.startsWith('frank_');
    return '<span class="tool-chip' + (isFrank ? ' frank' : '') + '" title="' + esc(t.description || '') + '">' + esc(t.name) + '</span>';
  }).join('');
}

async function openAutopsy(planId) {
  if (!planId) return;
  document.getElementById('autopsy-title').textContent = 'Loading...';
  document.getElementById('autopsy-content').innerHTML = '<div style="color:var(--muted);text-align:center;padding:40px">Loading plan details...</div>';
  document.getElementById('autopsy-overlay').classList.add('active');

  try {
    const res = await fetch('/api/plan/' + planId);
    const plan = await res.json();
    if (plan.error) throw new Error(plan.error);
    renderAutopsyContent(plan);
  } catch (err) {
    document.getElementById('autopsy-title').textContent = 'Error';
    document.getElementById('autopsy-content').innerHTML = '<div style="color:var(--red);text-align:center;padding:40px">Failed to load plan: ' + esc(err.message) + '</div>';
  }
}

function closeAutopsy() {
  document.getElementById('autopsy-overlay').classList.remove('active');
}

function renderAutopsyContent(plan) {
  document.getElementById('autopsy-title').textContent = 'Plan Autopsy: ' + (plan.id || '').substring(0,8);
  const statusColor = plan.status === 'completed' ? 'var(--green)' : plan.status === 'failed' ? 'var(--red)' : 'var(--yellow)';

  let html = '<div class="autopsy-section">' +
    '<div class="autopsy-section-title">Intent</div>' +
    '<div class="autopsy-intent">' + esc(plan.intent || 'Unknown') + '</div>' +
    '<div class="autopsy-meta">' +
    '<span>Status: <strong style="color:' + statusColor + '">' + (plan.status || 'unknown').toUpperCase() + '</strong></span>' +
    '<span>Steps: ' + (plan.currentStep || 0) + '/' + (plan.totalSteps || 0) + '</span>' +
    '<span>ID: ' + (plan.id || 'unknown') + '</span>' +
    '</div></div>';

  // Steps
  if (plan.steps?.length) {
    html += '<div class="autopsy-section"><div class="autopsy-section-title">Steps</div><div class="autopsy-steps">';
    plan.steps.forEach((step, i) => {
      const stepStatus = i < plan.currentStep ? 'done' : i === plan.currentStep && plan.status === 'failed' ? 'failed' : i === plan.currentStep ? 'active' : 'pending';
      const result = plan.results?.[i];
      html += '<div class="autopsy-step ' + stepStatus + '">' +
        '<div class="autopsy-step-header">' +
        '<span class="autopsy-step-num">STEP ' + (i+1) + '</span>' +
        '<span class="autopsy-step-action">' + esc(step.action || 'unknown') + '</span>' +
        '</div>' +
        '<div class="autopsy-step-params">' + esc(JSON.stringify(step.params || {}, null, 0)) + '</div>';
      if (result !== undefined) {
        const isSuccess = result?.success !== false;
        html += '<div class="autopsy-step-result ' + (isSuccess ? 'success' : 'error') + '">' +
          (isSuccess ? 'OK' : 'FAILED') + ': ' + esc(JSON.stringify(result, null, 0).substring(0,200)) + '</div>';
      }
      html += '</div>';
    });
    html += '</div></div>';
  }

  // Errors
  if (plan.errors?.length) {
    html += '<div class="autopsy-section"><div class="autopsy-section-title">Errors</div>' +
      '<div class="autopsy-errors">' +
      plan.errors.map(e => '<div class="autopsy-error">' + esc(e) + '</div>').join('') +
      '</div></div>';
  }

  document.getElementById('autopsy-content').innerHTML = html;
}

function renderAgents(igors, mainIgor, doctor, frank) {
  const el = document.getElementById('agents-bar');
  let html = '<div class="agent active" style="border-color:rgba(124,58,237,0.3);background:var(--purple-dim);">' +
    '<span class="agent-name">Doctor</span>' +
    '<span class="agent-status">Plans: ' + (doctor?.activePlans || 0) + '</span></div>';
  html += '<span class="flow-arrow">&rarr;</span>';
  const mainStatus = mainIgor?.executionStatus || 'idle';
  html += '<div class="agent ' + (mainStatus === 'executing' ? 'busy' : 'active') + '">' +
    '<span class="agent-name">Igor</span>' +
    '<span class="agent-status">' + mainStatus + '</span></div>';
  if (igors && igors.length > 0) {
    igors.forEach((ig, i) => {
      const st = ig.status || 'idle';
      html += '<div class="agent ' + (st === 'executing' ? 'busy' : st === 'error' ? 'error' : 'active') + '">' +
        '<span class="agent-name">Igor-' + (i+1) + '</span>' +
        '<span class="agent-status">' + st + '</span>' +
        (ig.currentTask ? '<div class="agent-task">' + esc(ig.currentTask).substring(0,25) + '</div>' : '') + '</div>';
    });
  }
  html += '<span class="flow-arrow" id="igor-frank-arrow">&rarr;</span>';
  const frankActive = frank?.browserActive;
  html += '<div class="agent ' + (frankActive ? 'busy' : 'active') + '" style="border-color:rgba(124,58,237,0.3);background:var(--purple-dim);">' +
    '<span class="agent-name">Frank</span>' +
    '<span class="agent-status">' + (frank?.dynamicTools?.total || 0) + ' tools</span></div>';
  el.innerHTML = html;
}

function updateFrankFlow(doctorFrank) {
  if (!doctorFrank) return;
  const patterns = doctorFrank.failurePatterns?.total || 0;
  const pending = doctorFrank.pendingRequests?.total || 0;
  const tools = doctorFrank.metrics?.toolsCreatedTotal || 0;
  setText('frank-patterns', patterns);
  setText('frank-tools', tools);
  const progress = pending > 0 ? 100 : (patterns > 0 ? 50 : 0);
  document.getElementById('flow-progress').style.width = progress + '%';
  const arrow = document.getElementById('igor-frank-arrow');
  if (arrow) arrow.className = 'flow-arrow' + (pending > 0 ? ' active' : '');
  const reqEl = document.getElementById('pending-requests');
  if (pending > 0 && doctorFrank.pendingRequests?.requests) {
    reqEl.innerHTML = '<span style="color:var(--yellow)">Creating tools...</span>';
  } else if (tools > 0) {
    reqEl.innerHTML = '<span style="color:var(--green)">Tools ready</span>';
  } else {
    reqEl.innerHTML = '';
  }
}

function addEvent(ev) {
  events.unshift(ev);
  if (events.length > 30) events.pop();
  const el = document.getElementById('events');
  el.innerHTML = events.map(e => {
    const t = e.type || '';
    const cls = t.includes('completed') || t.includes('created') ? 'completed' :
                t.includes('failed') || t.includes('error') ? 'failed' :
                t.includes('started') || t.includes('submit') ? 'started' : '';
    return '<div class="event"><span class="event-time">' + new Date(e.time || Date.now()).toLocaleTimeString() + '</span>' +
      '<span class="event-type ' + cls + '">' + t + '</span>' +
      '<span class="event-data">' + esc(JSON.stringify(e.payload || {}).substring(0,60)) + '</span></div>';
  }).join('');
}

async function submitIntent() {
  const input = document.getElementById('cmd-input');
  const intent = input.value.trim();
  if (!intent) return;
  input.value = '';
  addEvent({ type: 'intent.submitted', time: Date.now(), payload: { intent } });
  try {
    const res = await fetch('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ intent, url: 'https://example.com' }) });
    const data = await res.json();
    addEvent({ type: 'plan.created', time: Date.now(), payload: data });
  } catch (err) {
    addEvent({ type: 'error', time: Date.now(), payload: { error: err.message } });
  }
}

async function fetchScreenshot() {
  try {
    const res = await fetch('/api/screenshot');
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 0) {
        const url = URL.createObjectURL(blob);
        document.getElementById('browser-img').src = url;
        document.getElementById('browser-img').style.display = 'block';
        document.getElementById('browser-empty').style.display = 'none';
      }
    }
  } catch {}
}

function loadScreenshot(path) { if (path) fetchScreenshot(); }

function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

let toolsEnabled = true;
async function toggleTools() {
  toolsEnabled = !toolsEnabled;
  const el = document.getElementById('tools-toggle');
  el.className = 'toggle ' + (toolsEnabled ? 'active' : '');
  
  try {
    await fetch('/api/toggle-tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: toolsEnabled })
    });
    // Add local event for immediate feedback
    addEvent({ type: 'tools.toggled', time: Date.now(), payload: { enabled: toolsEnabled } });
  } catch (err) {
    console.error('Failed to toggle tools', err);
    // Revert UI on error
    toolsEnabled = !toolsEnabled;
    el.className = 'toggle ' + (toolsEnabled ? 'active' : '');
  }
}

document.getElementById('cmd-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitIntent(); });

connect();
setInterval(() => { if (document.getElementById('browser-img').style.display !== 'none') fetchScreenshot(); }, 2000);
</script>
</body>
</html>`;

// Server
Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket
    if (url.pathname === '/ws') {
      if (server.upgrade(req)) return;
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    // API: Submit plan to Doctor
    if (url.pathname === '/api/plan' && req.method === 'POST') {
      try {
        const body = await req.json();
        const res = await fetch(`${DOCTOR_URL}/plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        return Response.json(data);
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    // API: Toggle Tools (Token Nuke)
    if (url.pathname === '/api/toggle-tools' && req.method === 'POST') {
      try {
        const body = await req.json();
        const enabled = !!body.enabled;
        
        if (bridgeWs && bridgeWs.readyState === WebSocket.OPEN) {
          bridgeWs.send(JSON.stringify({
            type: 'mcp.toggle_tools',
            source: 'dashboard',
            payload: { enabled }
          }));
          return Response.json({ success: true, enabled });
        } else {
          return Response.json({ error: 'Bridge not connected' }, { status: 503 });
        }
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }

    // API: Get latest screenshot
    if (url.pathname === '/api/screenshot') {
      const path = await getLatestScreenshot();
      if (path) {
        try {
          const file = Bun.file(path);
          return new Response(file, { headers: { 'Content-Type': 'image/png' } });
        } catch {}
      }
      return new Response('', { status: 204 });
    }

    // API: Reports
    if (url.pathname === '/api/reports') {
      return Response.json({ reports: state.reports, stats: state.stats });
    }

    // API: State
    if (url.pathname === '/api/state') {
      return Response.json(state);
    }

    // API: Toolbag (Igor's current tools)
    if (url.pathname === '/api/toolbag') {
      return Response.json(state.toolbag || { toolBag: [], count: 0 });
    }

    // API: Full plan details (autopsy)
    if (url.pathname.startsWith('/api/plan/')) {
      const planId = url.pathname.replace('/api/plan/', '');
      try {
        const planDetails = await fetchJson(`${DOCTOR_URL}/plan/${planId}`);
        if (planDetails) {
          return Response.json(planDetails);
        }
        return Response.json({ error: 'Plan not found' }, { status: 404 });
      } catch {
        return Response.json({ error: 'Failed to fetch plan' }, { status: 500 });
      }
    }

    // API: Plans list with full details
    if (url.pathname === '/api/plans') {
      return Response.json({ plans: state.plans });
    }

    // Health
    if (url.pathname === '/health') {
      return Response.json({
        status: 'healthy',
        bridgeConnected: bridgeWs?.readyState === WebSocket.OPEN,
        components: {
          bridge: state.bridge?.status || 'offline',
          doctor: state.doctor?.status || 'offline',
          igor: state.igor?.status || 'offline',
          frankenstein: state.frankenstein?.status || 'offline',
        }
      });
    }

    // Dashboard
    return new Response(HTML, { headers: { 'Content-Type': 'text/html' } });
  },
  websocket: {
    open(ws) {
      clients.add(ws);
      ws.send(JSON.stringify({ type: 'state', data: state }));
    },
    close(ws) { clients.delete(ws); },
    message() {},
  },
});

// Start
async function start() {
  console.log(`
╔════════════════════════════════════════════════════╗
║         BarrHawk War Room v2                       ║
╠════════════════════════════════════════════════════╣
║  Dashboard:  http://localhost:${PORT}                  ║
║                                                    ║
║  Features:                                         ║
║  • Live browser view                               ║
║  • Multi-agent grid                                ║
║  • Plan visualization                              ║
║  • Command input                                   ║
║  • Real-time events                                ║
╚════════════════════════════════════════════════════╝
`);

  connectToBridge();

  while (true) {
    await updateState();
    await Bun.sleep(2000);
  }
}

start();
