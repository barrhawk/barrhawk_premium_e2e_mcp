#!/usr/bin/env bun
/**
 * BarrHawk Dashboard - Pure Bun SPA
 * Single Page App. Zero reloads. All resources for AI.
 */

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BarrHawk</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>tailwind.config={theme:{extend:{colors:{brand:{500:'#8b5cf6',600:'#7c3aed'}}}}}</script>
  <style>
    @keyframes pulse-dot{0%,100%{opacity:1}50%{opacity:.5}}.pulse-dot{animation:pulse-dot 2s infinite}
    @keyframes fade-in{from{opacity:0}to{opacity:1}}.fade-in{animation:fade-in .15s ease-out}
    @keyframes slide-up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}.slide-up{animation:slide-up .2s ease-out}
    .glass{background:rgba(255,255,255,.03);backdrop-filter:blur(12px)}
    .page{display:none}.page.active{display:block}
    ::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:#1a1a2e}::-webkit-scrollbar-thumb{background:#333;border-radius:3px}
  </style>
</head>
<body class="bg-[#0a0a12] text-gray-100 min-h-screen">
  <!-- Header - Always visible -->
  <header class="border-b border-white/10 glass sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center font-bold text-sm shadow-lg shadow-purple-500/20">BH</div>
        <span class="font-semibold text-lg">BarrHawk</span>
      </div>
      <nav class="flex items-center gap-1 bg-white/5 rounded-lg p-1" id="nav">
        <button onclick="navigate('dashboard')" data-page="dashboard" class="nav-btn px-4 py-1.5 rounded-md text-sm font-medium transition-all">Dashboard</button>
        <button onclick="navigate('supervisor')" data-page="supervisor" class="nav-btn px-4 py-1.5 rounded-md text-sm font-medium transition-all">Supervisor</button>
        <button onclick="navigate('observability')" data-page="observability" class="nav-btn px-4 py-1.5 rounded-md text-sm font-medium transition-all">Observability</button>
        <button onclick="navigate('settings')" data-page="settings" class="nav-btn px-4 py-1.5 rounded-md text-sm font-medium transition-all">Settings</button>
      </nav>
      <div class="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium" id="ws-badge">
        <div class="w-1.5 h-1.5 rounded-full pulse-dot" id="ws-dot"></div>
        <span id="ws-status">Connecting</span>
      </div>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-6 py-6">
    <!-- ==================== DASHBOARD PAGE ==================== -->
    <div id="page-dashboard" class="page">
      <div class="grid grid-cols-4 gap-4 mb-6">
        <div class="glass rounded-xl border border-white/10 p-4"><p class="text-xs text-gray-500 mb-1">TESTS TODAY</p><p class="text-2xl font-bold" id="d-tests">--</p></div>
        <div class="glass rounded-xl border border-white/10 p-4"><p class="text-xs text-gray-500 mb-1">PASS RATE</p><p class="text-2xl font-bold text-green-400" id="d-pass">--%</p></div>
        <div class="glass rounded-xl border border-white/10 p-4"><p class="text-xs text-gray-500 mb-1">FAILED</p><p class="text-2xl font-bold text-red-400" id="d-failed">--</p></div>
        <div class="glass rounded-xl border border-white/10 p-4"><p class="text-xs text-gray-500 mb-1">FLAKY</p><p class="text-2xl font-bold text-yellow-400" id="d-flaky">--</p></div>
      </div>

      <div class="grid grid-cols-3 gap-4 mb-6">
        <button class="glass rounded-xl border border-white/10 p-4 hover:border-violet-500/50 hover:bg-violet-500/5 transition-all text-left group">
          <div class="flex items-center gap-3 mb-2">
            <span class="text-xl">▶</span>
            <span class="font-medium">Run All Tests</span>
          </div>
          <p class="text-xs text-gray-500">Execute full test suite</p>
        </button>
        <button class="glass rounded-xl border border-white/10 p-4 hover:border-white/20 transition-all text-left">
          <div class="flex items-center gap-3 mb-2">
            <span class="text-xl">+</span>
            <span class="font-medium">New Test</span>
          </div>
          <p class="text-xs text-gray-500">Create test from URL</p>
        </button>
        <button class="glass rounded-xl border border-white/10 p-4 hover:border-white/20 transition-all text-left">
          <div class="flex items-center gap-3 mb-2">
            <span class="text-xl">⚙</span>
            <span class="font-medium">MCP Config</span>
          </div>
          <p class="text-xs text-gray-500">Server settings</p>
        </button>
      </div>

      <div class="glass rounded-xl border border-white/10 overflow-hidden">
        <div class="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <span class="font-medium">Recent Test Runs</span>
          <span class="text-xs text-gray-500">Live</span>
        </div>
        <div class="divide-y divide-white/5 max-h-80 overflow-y-auto" id="d-runs">
          <div class="px-4 py-8 text-center text-gray-500 text-sm">Loading...</div>
        </div>
      </div>
    </div>

    <!-- ==================== SUPERVISOR PAGE ==================== -->
    <div id="page-supervisor" class="page">
      <div class="flex items-center gap-2 mb-6">
        <span class="w-1 h-5 bg-gradient-to-b from-violet-500 to-purple-600 rounded-full"></span>
        <h2 class="font-semibold">Frankencode Three-Tier Architecture</h2>
      </div>

      <div class="grid grid-cols-3 gap-4 mb-6" id="s-servers">
        <!-- Doctor -->
        <div class="glass rounded-xl border border-white/10 overflow-hidden hover:border-violet-500/30 transition-all" id="s-doctor">
          <div class="p-5">
            <div class="flex items-start justify-between mb-4">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center text-lg">🩺</div>
                <div><h3 class="font-medium">Doctor</h3><p class="text-xs text-gray-500">Orchestrator • :3000</p></div>
              </div>
              <div class="flex items-center gap-1.5">
                <div class="w-1.5 h-1.5 rounded-full bg-gray-600" id="s-doctor-dot"></div>
                <span class="text-xs text-gray-400" id="s-doctor-status">--</span>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div class="bg-white/5 rounded-lg p-2"><p class="text-gray-500">Uptime</p><p class="font-medium" id="s-doctor-uptime">--</p></div>
              <div class="bg-white/5 rounded-lg p-2"><p class="text-gray-500">Tasks</p><p class="font-medium" id="s-doctor-tasks">--</p></div>
              <div class="bg-white/5 rounded-lg p-2"><p class="text-gray-500">Memory</p><p class="font-medium" id="s-doctor-mem">--</p></div>
              <div class="bg-white/5 rounded-lg p-2"><p class="text-gray-500">Load</p><p class="font-medium" id="s-doctor-load">--</p></div>
            </div>
          </div>
          <div class="border-t border-white/10 p-2 bg-white/5 flex gap-2">
            <button onclick="serverCmd('doctor','reload')" class="flex-1 py-1.5 bg-white/10 hover:bg-white/20 rounded text-xs transition-colors">↻ Reload</button>
            <button onclick="serverCmd('doctor','shutdown')" class="flex-1 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-xs transition-colors">Stop</button>
          </div>
        </div>

        <!-- Igor -->
        <div class="glass rounded-xl border border-white/10 overflow-hidden hover:border-green-500/30 transition-all" id="s-igor">
          <div class="p-5">
            <div class="flex items-start justify-between mb-4">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center text-lg">⚡</div>
                <div><h3 class="font-medium">Igor</h3><p class="text-xs text-gray-500">Performance • :3001</p></div>
              </div>
              <div class="flex items-center gap-1.5">
                <div class="w-1.5 h-1.5 rounded-full bg-gray-600" id="s-igor-dot"></div>
                <span class="text-xs text-gray-400" id="s-igor-status">--</span>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div class="bg-white/5 rounded-lg p-2"><p class="text-gray-500">Uptime</p><p class="font-medium" id="s-igor-uptime">--</p></div>
              <div class="bg-white/5 rounded-lg p-2"><p class="text-gray-500">Cache</p><p class="font-medium" id="s-igor-cache">--</p></div>
              <div class="bg-white/5 rounded-lg p-2"><p class="text-gray-500">Pool</p><p class="font-medium" id="s-igor-pool">--</p></div>
              <div class="bg-white/5 rounded-lg p-2"><p class="text-gray-500">Active</p><p class="font-medium" id="s-igor-active">--</p></div>
            </div>
          </div>
          <div class="border-t border-white/10 p-2 bg-white/5 flex gap-2">
            <button onclick="serverCmd('igor','reload')" class="flex-1 py-1.5 bg-white/10 hover:bg-white/20 rounded text-xs transition-colors">↻ Reload</button>
            <button onclick="serverCmd('igor','shutdown')" class="flex-1 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-xs transition-colors">Stop</button>
          </div>
        </div>

        <!-- Frankenstein -->
        <div class="glass rounded-xl border border-white/10 overflow-hidden hover:border-amber-500/30 transition-all" id="s-frank">
          <div class="p-5">
            <div class="flex items-start justify-between mb-4">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center text-lg">🧪</div>
                <div><h3 class="font-medium">Frankenstein</h3><p class="text-xs text-gray-500">Sandbox • :3100</p></div>
              </div>
              <div class="flex items-center gap-1.5">
                <div class="w-1.5 h-1.5 rounded-full bg-gray-600" id="s-frank-dot"></div>
                <span class="text-xs text-gray-400" id="s-frank-status">--</span>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div class="bg-white/5 rounded-lg p-2"><p class="text-gray-500">Uptime</p><p class="font-medium" id="s-frank-uptime">--</p></div>
              <div class="bg-white/5 rounded-lg p-2"><p class="text-gray-500">Tools</p><p class="font-medium" id="s-frank-tools">--</p></div>
              <div class="bg-white/5 rounded-lg p-2"><p class="text-gray-500">Hot Reload</p><p class="font-medium" id="s-frank-hot">--</p></div>
              <div class="bg-white/5 rounded-lg p-2"><p class="text-gray-500">Memory</p><p class="font-medium" id="s-frank-mem">--</p></div>
            </div>
          </div>
          <div class="border-t border-white/10 p-2 bg-white/5 flex gap-2">
            <button onclick="serverCmd('frankenstein','reload')" class="flex-1 py-1.5 bg-white/10 hover:bg-white/20 rounded text-xs transition-colors">↻ Reload</button>
            <button onclick="serverCmd('frankenstein','shutdown')" class="flex-1 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-xs transition-colors">Stop</button>
          </div>
        </div>
      </div>

      <!-- Architecture Diagram -->
      <div class="glass rounded-xl border border-white/10 p-5 mb-6">
        <p class="text-xs text-gray-500 mb-4">DATA FLOW</p>
        <div class="flex items-center justify-center gap-3 text-sm">
          <div class="px-4 py-2 rounded-lg bg-white/5 border border-white/10">AI Client</div>
          <span class="text-gray-600">→</span>
          <div class="px-4 py-2 rounded-lg bg-violet-500/20 border border-violet-500/30">Doctor</div>
          <span class="text-gray-600">→</span>
          <div class="px-4 py-2 rounded-lg bg-green-500/20 border border-green-500/30">Igor</div>
          <span class="text-gray-600">→</span>
          <div class="px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/30">Frankenstein</div>
        </div>
        <p class="text-center text-xs text-gray-500 mt-3">Fallback: Doctor → Igor → Frankenstein</p>
      </div>

      <!-- Live Logs -->
      <div class="glass rounded-xl border border-white/10 overflow-hidden">
        <div class="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <span class="font-medium text-sm">Live Activity</span>
          <button onclick="clearLogs()" class="text-xs text-gray-500 hover:text-white">Clear</button>
        </div>
        <div class="h-48 overflow-y-auto font-mono text-xs p-3 space-y-1" id="s-logs">
          <div class="text-gray-600">Waiting for events...</div>
        </div>
      </div>
    </div>

    <!-- ==================== OBSERVABILITY PAGE ==================== -->
    <div id="page-observability" class="page">
      <div class="grid grid-cols-6 gap-3 mb-6">
        <div class="glass rounded-lg border border-white/10 p-3"><p class="text-[10px] text-gray-500">TESTS</p><p class="text-xl font-bold" id="o-tests">--</p></div>
        <div class="glass rounded-lg border border-white/10 p-3"><p class="text-[10px] text-gray-500">PASS</p><p class="text-xl font-bold text-green-400" id="o-pass">--%</p></div>
        <div class="glass rounded-lg border border-white/10 p-3"><p class="text-[10px] text-gray-500">FAIL</p><p class="text-xl font-bold text-red-400" id="o-fail">--</p></div>
        <div class="glass rounded-lg border border-white/10 p-3"><p class="text-[10px] text-gray-500">FLAKY</p><p class="text-xl font-bold text-yellow-400" id="o-flaky">--</p></div>
        <div class="glass rounded-lg border border-white/10 p-3"><p class="text-[10px] text-gray-500">SCREENSHOTS</p><p class="text-xl font-bold text-purple-400" id="o-shots">--</p></div>
        <div class="glass rounded-lg border border-white/10 p-3"><p class="text-[10px] text-gray-500">REPLAYS</p><p class="text-xl font-bold text-cyan-400" id="o-replays">--</p></div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 mb-4 bg-white/5 rounded-lg p-1 w-fit">
        <button onclick="setObsTab('runs')" data-obs="runs" class="obs-tab px-3 py-1.5 rounded text-xs font-medium transition-all">Test Runs</button>
        <button onclick="setObsTab('flaky')" data-obs="flaky" class="obs-tab px-3 py-1.5 rounded text-xs font-medium transition-all">Flaky Tests</button>
        <button onclick="setObsTab('replays')" data-obs="replays" class="obs-tab px-3 py-1.5 rounded text-xs font-medium transition-all">Replays</button>
        <button onclick="setObsTab('network')" data-obs="network" class="obs-tab px-3 py-1.5 rounded text-xs font-medium transition-all">Network</button>
      </div>

      <div class="glass rounded-xl border border-white/10 overflow-hidden">
        <div id="obs-runs" class="obs-content">
          <div class="px-4 py-3 border-b border-white/10"><span class="font-medium text-sm">Recent Test Runs</span></div>
          <div class="divide-y divide-white/5 max-h-96 overflow-y-auto" id="o-runs-list">
            <div class="px-4 py-8 text-center text-gray-500 text-sm">Loading...</div>
          </div>
        </div>
        <div id="obs-flaky" class="obs-content hidden">
          <div class="px-4 py-3 border-b border-white/10"><span class="font-medium text-sm">Flaky Test Analysis</span></div>
          <div class="divide-y divide-white/5 max-h-96 overflow-y-auto" id="o-flaky-list">
            <div class="px-4 py-8 text-center text-gray-500 text-sm">No flaky tests detected</div>
          </div>
        </div>
        <div id="obs-replays" class="obs-content hidden">
          <div class="px-4 py-3 border-b border-white/10"><span class="font-medium text-sm">Session Replays</span></div>
          <div class="grid grid-cols-3 gap-4 p-4" id="o-replay-list">
            <div class="col-span-3 py-8 text-center text-gray-500 text-sm">No replays available</div>
          </div>
        </div>
        <div id="obs-network" class="obs-content hidden">
          <div class="px-4 py-3 border-b border-white/10"><span class="font-medium text-sm">Network Requests</span></div>
          <div class="divide-y divide-white/5 max-h-96 overflow-y-auto font-mono text-xs" id="o-network-list">
            <div class="px-4 py-8 text-center text-gray-500 text-sm">No network activity</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== SETTINGS PAGE ==================== -->
    <div id="page-settings" class="page">
      <div class="flex items-center gap-2 mb-6">
        <span class="w-1 h-5 bg-gradient-to-b from-violet-500 to-purple-600 rounded-full"></span>
        <h2 class="font-semibold">MCP Server Settings</h2>
      </div>

      <div class="grid grid-cols-2 gap-6">
        <div class="glass rounded-xl border border-white/10 p-5">
          <h3 class="font-medium mb-4">Server Configuration</h3>
          <div class="space-y-4">
            <div>
              <label class="block text-xs text-gray-500 mb-1">Doctor Port</label>
              <input type="number" value="3000" class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500">
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">Igor Port</label>
              <input type="number" value="3001" class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500">
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">Frankenstein Port</label>
              <input type="number" value="3100" class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500">
            </div>
          </div>
        </div>

        <div class="glass rounded-xl border border-white/10 p-5">
          <h3 class="font-medium mb-4">Performance</h3>
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <div><p class="text-sm">Igor Cache</p><p class="text-xs text-gray-500">LRU cache for tool results</p></div>
              <button class="w-12 h-6 rounded-full bg-green-500 relative"><div class="absolute right-1 top-1 w-4 h-4 rounded-full bg-white"></div></button>
            </div>
            <div class="flex items-center justify-between">
              <div><p class="text-sm">Hot Reload</p><p class="text-xs text-gray-500">Auto-reload tools on change</p></div>
              <button class="w-12 h-6 rounded-full bg-green-500 relative"><div class="absolute right-1 top-1 w-4 h-4 rounded-full bg-white"></div></button>
            </div>
            <div class="flex items-center justify-between">
              <div><p class="text-sm">Fallback Chain</p><p class="text-xs text-gray-500">Auto-failover between servers</p></div>
              <button class="w-12 h-6 rounded-full bg-green-500 relative"><div class="absolute right-1 top-1 w-4 h-4 rounded-full bg-white"></div></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>

<script>
// ========== STATE ==========
let ws, currentPage = 'dashboard', obsTab = 'runs';
const state = { health: {}, stats: {}, runs: [], flaky: [] };

// ========== NAVIGATION ==========
function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active', 'fade-in');
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('bg-white/10', b.dataset.page === page);
    b.classList.toggle('text-white', b.dataset.page === page);
    b.classList.toggle('text-gray-400', b.dataset.page !== page);
  });
  history.pushState(null, '', '#' + page);
}

function setObsTab(tab) {
  obsTab = tab;
  document.querySelectorAll('.obs-content').forEach(c => c.classList.add('hidden'));
  document.getElementById('obs-' + tab).classList.remove('hidden');
  document.querySelectorAll('.obs-tab').forEach(b => {
    b.classList.toggle('bg-white/10', b.dataset.obs === tab);
    b.classList.toggle('text-white', b.dataset.obs === tab);
    b.classList.toggle('text-gray-400', b.dataset.obs !== tab);
  });
}

// ========== WEBSOCKET ==========
function connect() {
  ws = new WebSocket('ws://' + location.host + '/ws');
  ws.onopen = () => {
    document.getElementById('ws-dot').className = 'w-1.5 h-1.5 rounded-full bg-green-500 pulse-dot';
    document.getElementById('ws-status').textContent = 'Live';
    document.getElementById('ws-badge').className = 'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-green-500/10 border border-green-500/20 text-green-400';
    addLog('info', 'Connected');
  };
  ws.onmessage = e => handleMsg(JSON.parse(e.data));
  ws.onclose = () => {
    document.getElementById('ws-dot').className = 'w-1.5 h-1.5 rounded-full bg-red-500';
    document.getElementById('ws-status').textContent = 'Offline';
    document.getElementById('ws-badge').className = 'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-red-500/10 border border-red-500/20 text-red-400';
    setTimeout(connect, 2000);
  };
}

function handleMsg(msg) {
  if (msg.type === 'health') updateHealth(msg.data);
  if (msg.type === 'stats') updateStats(msg.data);
  if (msg.type === 'runs') updateRuns(msg.data);
  if (msg.type === 'log') addLog(msg.level, msg.message);
}

// ========== UPDATES ==========
function updateHealth(h) {
  state.health = h;
  ['doctor', 'igor', 'frankenstein'].forEach(s => {
    const d = h[s], prefix = 's-' + (s === 'frankenstein' ? 'frank' : s);
    if (d) {
      const color = d.status === 'healthy' ? 'green' : d.status === 'degraded' ? 'yellow' : 'red';
      document.getElementById(prefix + '-dot').className = 'w-1.5 h-1.5 rounded-full bg-' + color + '-500';
      document.getElementById(prefix + '-status').textContent = d.status;
      document.getElementById(prefix + '-status').className = 'text-xs text-' + color + '-400';
      document.getElementById(prefix + '-uptime').textContent = fmtTime(d.uptime);
      if (s === 'doctor') {
        document.getElementById('s-doctor-tasks').textContent = d.tasksProcessed || 0;
        document.getElementById('s-doctor-mem').textContent = fmtBytes(d.memory?.used);
        document.getElementById('s-doctor-load').textContent = ((d.load || 0) * 100).toFixed(0) + '%';
      }
      if (s === 'igor') {
        document.getElementById('s-igor-cache').textContent = ((d.cacheHitRate || 0) * 100).toFixed(0) + '%';
        document.getElementById('s-igor-pool').textContent = d.poolSize || 0;
        document.getElementById('s-igor-active').textContent = d.activeExecutions || 0;
      }
      if (s === 'frankenstein') {
        document.getElementById('s-frank-tools').textContent = d.toolsLoaded?.length || 0;
        document.getElementById('s-frank-hot').textContent = d.hotReloadEnabled ? 'ON' : 'OFF';
        document.getElementById('s-frank-mem').textContent = fmtBytes(d.memory?.used);
      }
    } else {
      document.getElementById(prefix + '-dot').className = 'w-1.5 h-1.5 rounded-full bg-gray-600';
      document.getElementById(prefix + '-status').textContent = 'offline';
      document.getElementById(prefix + '-status').className = 'text-xs text-gray-400';
    }
  });
}

function updateStats(s) {
  state.stats = s;
  document.getElementById('d-tests').textContent = s.testsToday || 0;
  document.getElementById('d-pass').textContent = (s.passRate || 0).toFixed(1) + '%';
  document.getElementById('d-failed').textContent = s.failedTests || 0;
  document.getElementById('d-flaky').textContent = s.flakyTests || 0;
  document.getElementById('o-tests').textContent = s.testsToday || 0;
  document.getElementById('o-pass').textContent = (s.passRate || 0).toFixed(1) + '%';
  document.getElementById('o-fail').textContent = s.failedTests || 0;
  document.getElementById('o-flaky').textContent = s.flakyTests || 0;
  document.getElementById('o-shots').textContent = s.totalScreenshots || 0;
  document.getElementById('o-replays').textContent = s.totalReplays || 0;
}

function updateRuns(runs) {
  state.runs = runs;
  const html = runs.slice(0, 20).map(r =>
    '<div class="px-4 py-3 hover:bg-white/5 flex items-center justify-between slide-up">' +
    '<div class="flex items-center gap-3">' +
    '<span class="px-2 py-0.5 rounded text-xs font-medium ' + (r.status === 'passed' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400') + '">' + r.status + '</span>' +
    '<span class="text-sm">' + r.name + '</span></div>' +
    '<div class="flex items-center gap-4 text-xs text-gray-500">' +
    '<span>' + r.steps + ' steps</span>' +
    '<span>' + fmtDur(r.duration) + '</span>' +
    '<span>' + fmtAgo(r.startedAt) + '</span></div></div>'
  ).join('');
  document.getElementById('d-runs').innerHTML = html || '<div class="px-4 py-8 text-center text-gray-500 text-sm">No test runs yet</div>';
  document.getElementById('o-runs-list').innerHTML = html || '<div class="px-4 py-8 text-center text-gray-500 text-sm">No test runs yet</div>';
}

// ========== LOGS ==========
function addLog(level, msg) {
  const el = document.getElementById('s-logs');
  if (el.children[0]?.textContent.includes('Waiting')) el.innerHTML = '';
  const colors = { info: 'text-blue-400', warn: 'text-yellow-400', error: 'text-red-400', success: 'text-green-400' };
  el.innerHTML += '<div class="slide-up"><span class="text-gray-600">' + new Date().toLocaleTimeString() + '</span> <span class="' + (colors[level] || 'text-gray-400') + '">[' + level.toUpperCase() + ']</span> ' + msg + '</div>';
  el.scrollTop = el.scrollHeight;
  while (el.children.length > 50) el.removeChild(el.firstChild);
}

function clearLogs() { document.getElementById('s-logs').innerHTML = '<div class="text-gray-600">Cleared</div>'; }

// ========== ACTIONS ==========
function serverCmd(server, cmd) {
  const ports = { doctor: 3000, igor: 3001, frankenstein: 3100 };
  fetch('http://localhost:' + ports[server] + '/' + cmd, { method: 'POST' })
    .then(() => addLog('success', server + ' ' + cmd))
    .catch(() => addLog('error', 'Failed: ' + server + ' ' + cmd));
}

// ========== UTILS ==========
function fmtTime(ms) { const s = Math.floor(ms/1000), m = Math.floor(s/60), h = Math.floor(m/60); return h > 0 ? h+'h '+m%60+'m' : m > 0 ? m+'m '+s%60+'s' : s+'s'; }
function fmtBytes(b) { return b < 1024 ? b+' B' : b < 1048576 ? (b/1024).toFixed(1)+' KB' : (b/1048576).toFixed(1)+' MB'; }
function fmtDur(ms) { return ms < 1000 ? ms+'ms' : (ms/1000).toFixed(1)+'s'; }
function fmtAgo(iso) { const d = Date.now() - new Date(iso).getTime(); return d < 60000 ? 'now' : d < 3600000 ? Math.floor(d/60000)+'m' : d < 86400000 ? Math.floor(d/3600000)+'h' : Math.floor(d/86400000)+'d'; }

// ========== INIT ==========
navigate(location.hash.slice(1) || 'dashboard');
setObsTab('runs');
connect();
window.onpopstate = () => navigate(location.hash.slice(1) || 'dashboard');
</script>
</body>
</html>`;

// ========== SERVER ==========
const clients = new Set<any>();
const PORTS = { doctor: 3000, igor: 3001, frankenstein: 3100 };

async function fetchHealth() {
  const health: Record<string, any> = {};
  for (const [name, port] of Object.entries(PORTS)) {
    try {
      const r = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(1500) });
      health[name] = r.ok ? await r.json() : null;
    } catch { health[name] = null; }
  }
  return health;
}

async function fetchStats() {
  try {
    const r = await fetch('http://localhost:3030/api/observability', { signal: AbortSignal.timeout(2000) });
    return r.ok ? (await r.json()).stats : null;
  } catch { return null; }
}

async function fetchRuns() {
  try {
    const r = await fetch('http://localhost:3030/api/observability', { signal: AbortSignal.timeout(2000) });
    return r.ok ? (await r.json()).testRuns : [];
  } catch { return []; }
}

function broadcast(data: any) {
  const msg = JSON.stringify(data);
  for (const c of clients) c.send(msg);
}

async function loop() {
  while (true) {
    const [health, stats, runs] = await Promise.all([fetchHealth(), fetchStats(), fetchRuns()]);
    broadcast({ type: 'health', data: health });
    if (stats) broadcast({ type: 'stats', data: stats });
    if (runs.length) broadcast({ type: 'runs', data: runs });
    await Bun.sleep(2000);
  }
}

Bun.serve({
  port: 3031,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === '/ws' && server.upgrade(req)) return;
    if (url.pathname === '/' || url.pathname.startsWith('/dashboard') || url.pathname.startsWith('/supervisor') || url.pathname.startsWith('/observability') || url.pathname.startsWith('/settings')) {
      return new Response(HTML, { headers: { 'Content-Type': 'text/html' } });
    }
    return new Response('Not found', { status: 404 });
  },
  websocket: {
    open(ws) { clients.add(ws); ws.send(JSON.stringify({ type: 'log', level: 'info', message: 'Dashboard connected' })); },
    close(ws) { clients.delete(ws); },
    message() {},
  },
});

console.log(`
╔══════════════════════════════════════════════════════╗
║         BarrHawk Dashboard SPA - Pure Bun            ║
║                                                      ║
║   🌐 http://localhost:3031                           ║
║                                                      ║
║   Pages: Dashboard | Supervisor | Observability      ║
║   Zero reloads. Instant navigation.                  ║
╚══════════════════════════════════════════════════════╝
`);

loop();
