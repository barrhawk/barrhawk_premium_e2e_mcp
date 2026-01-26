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
  const [bridge, doctor, igor, frank, doctorFrank, plans, igors] = await Promise.all([
    fetchJson(`${BRIDGE_URL}/health`),
    fetchJson(`${DOCTOR_URL}/health`),
    fetchJson(`${IGOR_URL}/health`),
    fetchJson(`${FRANK_URL}/health`),
    fetchJson(`${DOCTOR_URL}/frank`),
    fetchJson(`${DOCTOR_URL}/plans`),
    fetchJson(`${DOCTOR_URL}/igors`),
  ]);

  state.bridge = bridge;
  state.doctor = doctor;
  state.igor = igor;
  state.frankenstein = frank;
  state.doctorFrank = doctorFrank;
  state.plans = plans?.plans || [];
  state.igors = igors?.igors || [];
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
    :root { --bg:#0a0a0f; --card:#111118; --border:#1e1e2a; --text:#e0e0e8; --muted:#555; --green:#10b981; --red:#ef4444; --yellow:#f59e0b; --blue:#3b82f6; --purple:#8b5cf6; }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:system-ui,sans-serif; background:var(--bg); color:var(--text); min-height:100vh; font-size:13px; }

    .layout { display:grid; grid-template-columns:1fr 320px; grid-template-rows:auto 1fr auto; height:100vh; }

    .header { grid-column:1/-1; border-bottom:1px solid var(--border); padding:8px 16px; display:flex; justify-content:space-between; align-items:center; background:#08080c; }
    .logo { font-weight:700; font-size:14px; background:linear-gradient(135deg,#6366f1,#8b5cf6); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
    .status-row { display:flex; gap:12px; }
    .status-dot { display:flex; align-items:center; gap:4px; font-size:11px; }
    .dot { width:6px; height:6px; border-radius:50%; }
    .dot.on { background:var(--green); box-shadow:0 0 6px var(--green); }
    .dot.off { background:var(--red); }

    .main { display:flex; flex-direction:column; overflow:hidden; }

    .browser-panel { flex:1; background:#000; position:relative; display:flex; align-items:center; justify-content:center; min-height:0; }
    .browser-panel img { max-width:100%; max-height:100%; object-fit:contain; }
    .browser-empty { color:var(--muted); text-align:center; }
    .browser-empty p { margin-top:8px; font-size:11px; }

    .agents-bar { display:flex; gap:8px; padding:8px 12px; background:var(--card); border-top:1px solid var(--border); overflow-x:auto; align-items:center; }
    .agent { padding:8px 12px; background:var(--bg); border:1px solid var(--border); border-radius:8px; font-size:11px; white-space:nowrap; min-width:100px; }
    .agent.active { border-color:var(--green); background:rgba(16,185,129,0.1); }
    .agent.busy { border-color:var(--yellow); background:rgba(245,158,11,0.1); animation: pulse 1.5s infinite; }
    .agent.error { border-color:var(--red); background:rgba(239,68,68,0.1); }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.7; } }
    .agent-name { font-weight:600; display:block; }
    .agent-status { color:var(--muted); font-size:10px; }
    .agent-task { color:var(--blue); font-size:9px; margin-top:2px; overflow:hidden; text-overflow:ellipsis; }
    .flow-arrow { color:var(--muted); font-size:16px; padding:0 4px; }
    .flow-arrow.active { color:var(--yellow); animation: pulse 1s infinite; }

    .sidebar { border-left:1px solid var(--border); display:flex; flex-direction:column; background:var(--card); }

    .command-box { padding:12px; border-bottom:1px solid var(--border); }
    .command-box h3 { font-size:11px; color:var(--muted); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.05em; }
    .command-input { display:flex; gap:6px; }
    .command-input input { flex:1; background:var(--bg); border:1px solid var(--border); border-radius:4px; padding:8px 10px; color:var(--text); font-size:12px; }
    .command-input input:focus { outline:none; border-color:var(--purple); }
    .command-input button { background:var(--purple); border:none; border-radius:4px; padding:8px 12px; color:#fff; font-size:11px; font-weight:600; cursor:pointer; }
    .command-input button:hover { opacity:0.9; }
    .command-hint { font-size:10px; color:var(--muted); margin-top:6px; }

    .plan-box { padding:12px; border-bottom:1px solid var(--border); flex:0 0 auto; max-height:200px; overflow-y:auto; }
    .plan-box h3 { font-size:11px; color:var(--muted); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.05em; }
    .plan-empty { color:var(--muted); font-size:11px; }
    .plan { background:var(--bg); border-radius:6px; padding:8px; margin-bottom:6px; border-left:3px solid var(--purple); }
    .plan-id { font-size:10px; color:var(--muted); }
    .plan-intent { font-size:12px; margin:4px 0; }
    .plan-steps { display:flex; gap:4px; flex-wrap:wrap; margin-top:6px; }
    .step { font-size:10px; padding:2px 6px; border-radius:3px; background:var(--border); }
    .step.done { background:rgba(16,185,129,0.2); color:var(--green); }
    .step.active { background:rgba(59,130,246,0.2); color:var(--blue); }
    .step.failed { background:rgba(239,68,68,0.2); color:var(--red); }

    .events-box { flex:1; display:flex; flex-direction:column; min-height:0; }
    .events-box h3 { font-size:11px; color:var(--muted); padding:12px 12px 8px; text-transform:uppercase; letter-spacing:0.05em; }
    .events { flex:1; overflow-y:auto; padding:0 12px 12px; }
    .event { font-family:'SF Mono',Monaco,monospace; font-size:10px; padding:4px 0; border-bottom:1px solid var(--border); display:flex; gap:8px; }
    .event-time { color:var(--muted); flex-shrink:0; }
    .event-type { flex-shrink:0; min-width:100px; }
    .event-type.completed,.event-type.created { color:var(--green); }
    .event-type.failed,.event-type.error { color:var(--red); }
    .event-type.started,.event-type.submit { color:var(--blue); }
    .event-data { color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

    .metrics-bar { grid-column:1/-1; display:flex; gap:1px; background:var(--border); border-top:1px solid var(--border); }
    .metric { flex:1; padding:8px 12px; background:var(--card); text-align:center; }
    .metric-value { font-size:16px; font-weight:700; }
    .metric-label { font-size:9px; color:var(--muted); text-transform:uppercase; margin-top:2px; }
    .metric-value.green { color:var(--green); }
    .metric-value.red { color:var(--red); }
    .metric-value.yellow { color:var(--yellow); }
  </style>
</head>
<body>
  <div class="layout">
    <header class="header">
      <div class="logo">BarrHawk War Room</div>
      <div class="status-row">
        <div class="status-dot"><div class="dot" id="s-bridge"></div>Bridge</div>
        <div class="status-dot"><div class="dot" id="s-doctor"></div>Doctor</div>
        <div class="status-dot"><div class="dot" id="s-igor"></div>Igor</div>
        <div class="status-dot"><div class="dot" id="s-frank"></div>Frank</div>
      </div>
    </header>

    <div class="main">
      <div class="browser-panel" id="browser-panel">
        <div class="browser-empty" id="browser-empty">
          <div style="font-size:32px;opacity:0.3">🖥️</div>
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
      <div class="command-box">
        <h3>Command</h3>
        <div class="command-input">
          <input type="text" id="cmd-input" placeholder="Test the login flow..." />
          <button onclick="submitIntent()">Run</button>
        </div>
        <div class="command-hint">Enter a test intent in natural language</div>
      </div>

      <div class="plan-box">
        <h3>Active Plans</h3>
        <div id="plans"><div class="plan-empty">No active plans</div></div>
      </div>

      <div class="plan-box" id="frank-box" style="border-left:3px solid var(--purple);">
        <h3>🧪 Igor → Frank Flow</h3>
        <div id="frank-flow">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
            <div style="font-size:20px;">🤖</div>
            <div style="flex:1;height:2px;background:var(--border);position:relative;">
              <div id="flow-progress" style="height:2px;background:var(--purple);width:0%;transition:width 0.3s;"></div>
            </div>
            <div style="font-size:20px;">🔬</div>
          </div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:6px;">
            Igor fails <span id="frank-threshold">2</span>x → Frank creates tool
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px;">
            <div>
              <div style="color:var(--muted);font-size:9px;">Failure Patterns</div>
              <div id="frank-patterns" style="font-weight:600;color:var(--red);">0</div>
            </div>
            <div>
              <div style="color:var(--muted);font-size:9px;">Tools Created</div>
              <div id="frank-tools" style="font-weight:600;color:var(--green);">0</div>
            </div>
          </div>
          <div id="pending-requests" style="margin-top:8px;font-size:10px;"></div>
        </div>
      </div>

      <div class="events-box">
        <h3>Live Events</h3>
        <div class="events" id="events"></div>
      </div>
    </div>

    <div class="metrics-bar">
      <div class="metric"><div class="metric-value" id="m-plans">0</div><div class="metric-label">Plans</div></div>
      <div class="metric"><div class="metric-value" id="m-agents">1</div><div class="metric-label">Agents</div></div>
      <div class="metric"><div class="metric-value green" id="m-tools">0</div><div class="metric-label">Tools Created</div></div>
      <div class="metric"><div class="metric-value" id="m-patterns">0</div><div class="metric-label">Patterns</div></div>
      <div class="metric"><div class="metric-value green" id="m-success">-</div><div class="metric-label">Success Rate</div></div>
    </div>
  </div>

<script>
let ws, screenshotInterval;
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
  // Component status dots
  setDot('s-bridge', s.bridge?.status === 'healthy');
  setDot('s-doctor', s.doctor?.status === 'healthy');
  setDot('s-igor', s.igor?.status === 'healthy');
  setDot('s-frank', s.frankenstein?.status === 'healthy');

  // Metrics
  document.getElementById('m-plans').textContent = s.plans?.length || 0;
  document.getElementById('m-agents').textContent = (s.igors?.length || 0) + 1;
  document.getElementById('m-tools').textContent = s.doctorFrank?.metrics?.toolsCreatedTotal || 0;
  document.getElementById('m-patterns').textContent = s.doctorFrank?.failurePatterns?.total || 0;
  const rate = s.doctor?.experience?.successRate || '-';
  document.getElementById('m-success').textContent = rate;
  document.getElementById('m-success').className = 'metric-value ' + (rate.includes('100') ? 'green' : parseFloat(rate) < 50 ? 'red' : 'yellow');

  // Plans
  renderPlans(s.plans || []);

  // Agents flow: Doctor → Igor(s) → Frank
  renderAgents(s.igors || [], s.igor, s.doctor, s.frankenstein);

  // Frank flow visualization
  updateFrankFlow(s.doctorFrank);

  // Browser
  if (s.frankenstein?.browserActive) {
    fetchScreenshot();
  }
}

function setDot(id, on) {
  document.getElementById(id).className = 'dot ' + (on ? 'on' : 'off');
}

function renderPlans(plans) {
  const el = document.getElementById('plans');
  if (!plans.length) {
    el.innerHTML = '<div class="plan-empty">No active plans</div>';
    return;
  }
  el.innerHTML = plans.slice(0, 3).map(p =>
    '<div class="plan">' +
    '<div class="plan-id">' + (p.id || '').substring(0,8) + '</div>' +
    '<div class="plan-intent">' + esc(p.intent || 'Unknown intent') + '</div>' +
    '<div class="plan-steps">' + (p.steps || []).map((st,i) =>
      '<span class="step ' + (st.status || '') + '">' + (i+1) + '. ' + esc(st.action || '') + '</span>'
    ).join('') + '</div></div>'
  ).join('');
}

function renderAgents(igors, mainIgor, doctor, frank) {
  const el = document.getElementById('agents-bar');

  // Doctor box
  let html = '<div class="agent active" style="border-color:var(--purple);">' +
    '<span class="agent-name">🩺 Doctor</span>' +
    '<span class="agent-status">Plans: ' + (doctor?.activePlans || 0) + '</span></div>';

  html += '<span class="flow-arrow">→</span>';

  // Main Igor
  const mainStatus = mainIgor?.executionStatus || 'idle';
  html += '<div class="agent ' + (mainStatus === 'executing' ? 'busy' : 'active') + '">' +
    '<span class="agent-name">🤖 Igor</span>' +
    '<span class="agent-status">' + mainStatus + '</span></div>';

  // Spawned Igors
  if (igors && igors.length > 0) {
    igors.forEach((ig, i) => {
      const st = ig.status || 'idle';
      html += '<div class="agent ' + (st === 'executing' ? 'busy' : st === 'error' ? 'error' : 'active') + '">' +
        '<span class="agent-name">🤖 Igor-' + (i+1) + '</span>' +
        '<span class="agent-status">' + st + '</span>' +
        (ig.currentTask ? '<div class="agent-task">' + esc(ig.currentTask).substring(0,20) + '</div>' : '') +
        '</div>';
    });
  }

  html += '<span class="flow-arrow" id="igor-frank-arrow">→</span>';

  // Frankenstein
  const frankActive = frank?.browserActive;
  html += '<div class="agent ' + (frankActive ? 'busy' : 'active') + '" style="border-color:var(--purple);">' +
    '<span class="agent-name">🔬 Frank</span>' +
    '<span class="agent-status">' + (frank?.dynamicTools?.total || 0) + ' tools</span></div>';

  el.innerHTML = html;
}

function updateFrankFlow(doctorFrank) {
  if (!doctorFrank) return;

  const threshold = doctorFrank.config?.failureThreshold || 2;
  const patterns = doctorFrank.failurePatterns?.total || 0;
  const pending = doctorFrank.pendingRequests?.total || 0;
  const tools = doctorFrank.metrics?.toolsCreatedTotal || 0;

  document.getElementById('frank-threshold').textContent = threshold;
  document.getElementById('frank-patterns').textContent = patterns;
  document.getElementById('frank-tools').textContent = tools;

  // Progress bar based on pending requests
  const progress = pending > 0 ? 100 : (patterns > 0 ? 50 : 0);
  document.getElementById('flow-progress').style.width = progress + '%';

  // Arrow animation when creating
  const arrow = document.getElementById('igor-frank-arrow');
  if (arrow) arrow.className = 'flow-arrow' + (pending > 0 ? ' active' : '');

  // Pending requests list
  const reqEl = document.getElementById('pending-requests');
  if (pending > 0 && doctorFrank.pendingRequests?.requests) {
    reqEl.innerHTML = '<div style="color:var(--yellow);">⏳ Creating tools...</div>' +
      doctorFrank.pendingRequests.requests.slice(0,2).map(r =>
        '<div style="color:var(--muted);">• ' + esc(r.pattern || 'unknown') + '</div>'
      ).join('');
  } else if (tools > 0) {
    reqEl.innerHTML = '<div style="color:var(--green);">✓ Tools ready</div>';
  } else {
    reqEl.innerHTML = '<div style="color:var(--muted);">No tool creation in progress</div>';
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
    return '<div class="event">' +
      '<span class="event-time">' + new Date(e.time || Date.now()).toLocaleTimeString() + '</span>' +
      '<span class="event-type ' + cls + '">' + t + '</span>' +
      '<span class="event-data">' + esc(JSON.stringify(e.payload || {}).substring(0,50)) + '</span></div>';
  }).join('');
}

async function submitIntent() {
  const input = document.getElementById('cmd-input');
  const intent = input.value.trim();
  if (!intent) return;

  input.value = '';
  addEvent({ type: 'intent.submitted', time: Date.now(), payload: { intent } });

  try {
    const res = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent, url: 'https://example.com' })
    });
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

function loadScreenshot(path) {
  if (path) fetchScreenshot();
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

// Enter key to submit
document.getElementById('cmd-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitIntent();
});

// Start
connect();
// Poll screenshots every 2s when browser active
setInterval(() => {
  if (document.getElementById('browser-img').style.display !== 'none') {
    fetchScreenshot();
  }
}, 2000);
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

    // API: State
    if (url.pathname === '/api/state') {
      return Response.json(state);
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
