/**
 * BarrHawk Dashboard Client
 *
 * Connects to Bridge WebSocket for live updates
 * Manages state and renders UI
 */

// ============================================
// State
// ============================================
const state = {
  connected: false,
  paused: false,
  bridge: {
    status: 'unknown',
    uptime: 0,
    doctorStatus: 'unknown',
    doctorRestarts: 0,
    messagesIn: 0,
    messagesOut: 0,
    bytesIn: 0,
    bytesOut: 0,
  },
  doctor: {
    status: 'unknown',
    uptime: 0,
    activeTasks: 0,
    queuedTasks: 0,
    igorCount: 0,
    maxIgors: 8,
    swarms: [],
    squads: [],
  },
  igors: new Map(),
  stream: [],
  streamFilter: {
    source: 'all',
    search: '',
  },
  autoScroll: true,
};

// Config
let config = {
  bridgeWsUrl: 'ws://localhost:3334',
};

// WebSocket
let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 2000;

// ============================================
// WebSocket Connection
// ============================================
async function connect() {
  // Fetch config first
  try {
    const res = await fetch('/api/config');
    config = await res.json();
  } catch (e) {
    console.warn('Failed to fetch config, using defaults');
  }

  connectWebSocket();
}

function connectWebSocket() {
  updateConnectionStatus('connecting');

  try {
    ws = new WebSocket(config.bridgeWsUrl);

    ws.onopen = () => {
      console.log('Connected to Bridge');
      state.connected = true;
      reconnectAttempts = 0;
      updateConnectionStatus('connected');

      // Subscribe to all events
      ws.send(JSON.stringify({ type: 'subscribe', channels: ['all'] }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleEvent(data);
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    ws.onclose = () => {
      console.log('Disconnected from Bridge');
      state.connected = false;
      updateConnectionStatus('disconnected');
      scheduleReconnect();
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  } catch (e) {
    console.error('Failed to connect:', e);
    updateConnectionStatus('disconnected');
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    showToast('Connection failed after multiple attempts', 'error');
    return;
  }

  reconnectAttempts++;
  setTimeout(connectWebSocket, RECONNECT_DELAY);
}

function sendCommand(action, params = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showToast('Not connected to Bridge', 'error');
    return;
  }

  ws.send(JSON.stringify({ action, ...params }));
}

// ============================================
// Event Handling
// ============================================
function handleEvent(event) {
  const { type, data } = event;

  switch (type) {
    // Bridge events
    case 'bridge:stats':
      Object.assign(state.bridge, data);
      renderBridge();
      break;

    case 'bridge:doctor_status':
      state.bridge.doctorStatus = data.status;
      renderBridge();
      break;

    // Doctor events
    case 'doctor:state':
      Object.assign(state.doctor, data);
      renderDoctor();
      updateIgorCount();
      break;

    case 'doctor:swarm_progress':
      const swarm = state.doctor.swarms.find(s => s.id === data.swarmId);
      if (swarm) {
        swarm.progress = data.progress;
        renderDoctor();
      }
      break;

    // Igor events
    case 'igor:spawned':
      state.igors.set(data.id, {
        id: data.id,
        status: 'idle',
        domain: data.domain || 'general',
        memoryMB: 0,
        currentTask: null,
        ...data,
      });
      renderIgors();
      updateIgorCount();
      addStreamEntry('doctor', 'igor:spawned', `${data.id} spawned`);
      break;

    case 'igor:state':
      state.igors.set(data.id, { ...state.igors.get(data.id), ...data });
      renderIgors();
      break;

    case 'igor:task_start':
      const igorStart = state.igors.get(data.igorId);
      if (igorStart) {
        igorStart.status = 'busy';
        igorStart.currentTask = { tool: data.tool, startedAt: Date.now() };
        renderIgors();
      }
      addStreamEntry('igor', 'task:start', `${data.igorId} → ${data.tool}`, data.igorId);
      break;

    case 'igor:task_end':
      const igorEnd = state.igors.get(data.igorId);
      if (igorEnd) {
        igorEnd.status = 'idle';
        igorEnd.currentTask = null;
        renderIgors();
      }
      const statusIcon = data.status === 'success' ? '✓' : '✗';
      addStreamEntry('igor', 'task:complete', `${data.igorId} ${statusIcon} ${data.duration}ms`, data.igorId);
      break;

    case 'igor:terminated':
      state.igors.delete(data.id);
      renderIgors();
      updateIgorCount();
      addStreamEntry('doctor', 'igor:terminated', `${data.id} - ${data.reason}`);
      break;

    // Stream events
    case 'stream':
      addStreamEntry(data.source, data.type, data.summary, data.sourceId, data.level);
      break;

    // MCP events (for stream)
    case 'mcp:request':
      addStreamEntry('bridge', 'mcp:request', data.tool || data.method);
      break;

    case 'mcp:response':
      addStreamEntry('bridge', 'mcp:response', `→ Claude`);
      break;

    default:
      console.log('Unknown event:', type, data);
  }
}

// ============================================
// Stream
// ============================================
function addStreamEntry(source, type, summary, sourceId = null, level = 'info') {
  const entry = {
    timestamp: Date.now(),
    source,
    sourceId,
    type,
    summary,
    level,
  };

  state.stream.unshift(entry);

  // Keep max 1000 entries
  if (state.stream.length > 1000) {
    state.stream.pop();
  }

  renderStream();
}

// ============================================
// Rendering
// ============================================
function updateConnectionStatus(status) {
  const el = document.getElementById('connection-status');
  const text = el.querySelector('.status-text');

  el.classList.remove('connected', 'disconnected');

  switch (status) {
    case 'connected':
      el.classList.add('connected');
      text.textContent = 'Connected';
      break;
    case 'disconnected':
      el.classList.add('disconnected');
      text.textContent = 'Disconnected';
      break;
    case 'connecting':
      el.classList.add('disconnected');
      text.textContent = 'Connecting...';
      break;
  }
}

function updateIgorCount() {
  const el = document.getElementById('igor-count');
  const count = state.igors.size;
  el.textContent = `${count} Igor${count !== 1 ? 's' : ''}`;
}

function formatUptime(seconds) {
  if (!seconds || seconds < 0) return '--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatTime(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-US', { hour12: false }) + '.' +
    String(d.getMilliseconds()).padStart(3, '0');
}

function renderBridge() {
  const b = state.bridge;

  document.getElementById('bridge-state').textContent = b.status;
  document.getElementById('bridge-uptime').textContent = formatUptime(b.uptime);
  document.getElementById('bridge-doctor').textContent = b.doctorStatus;
  document.getElementById('bridge-restarts').textContent = b.doctorRestarts;
  document.getElementById('bridge-msg-in').textContent = b.messagesIn.toLocaleString();
  document.getElementById('bridge-msg-out').textContent = b.messagesOut.toLocaleString();

  // Status badge
  const badge = document.getElementById('bridge-status');
  badge.textContent = b.status;
  badge.className = 'status-badge ' + b.status;
}

function renderDoctor() {
  const d = state.doctor;

  document.getElementById('doctor-active').textContent = d.activeTasks;
  document.getElementById('doctor-queued').textContent = d.queuedTasks;
  document.getElementById('doctor-igors').textContent = `${d.igorCount}/${d.maxIgors}`;
  document.getElementById('doctor-uptime').textContent = formatUptime(d.uptime);

  // Status badge
  const badge = document.getElementById('doctor-status');
  badge.textContent = d.status;
  badge.className = 'status-badge ' + d.status;

  // Swarms
  const swarmsEl = document.getElementById('swarms-list');
  if (d.swarms.length === 0) {
    swarmsEl.innerHTML = '<div class="empty-state">No active swarms</div>';
  } else {
    swarmsEl.innerHTML = d.swarms.map(s => `
      <div class="swarm-item">
        <span class="swarm-name">${s.name}</span>
        <div class="swarm-progress">
          <div class="swarm-progress-bar" style="width: ${s.progress}%"></div>
        </div>
        <span class="swarm-percent">${s.progress}%</span>
      </div>
    `).join('');
  }

  // Squads
  const squadsEl = document.getElementById('squads-list');
  if (d.squads.length === 0) {
    squadsEl.innerHTML = '<div class="empty-state">No squads</div>';
  } else {
    squadsEl.innerHTML = d.squads.map(s => `
      <div class="squad-item">
        <span class="squad-name">${s.name}</span>
        <span class="squad-igors">${s.igorIds.length} igors</span>
      </div>
    `).join('');
  }
}

function renderIgors() {
  const container = document.getElementById('igors-container');

  if (state.igors.size === 0) {
    container.innerHTML = '<div class="empty-state">No Igors running</div>';
    return;
  }

  const domainIcons = {
    browser: '🌐',
    database: '🗄️',
    github: '🐙',
    docker: '🐳',
    filesystem: '📁',
    general: '⚡',
  };

  container.innerHTML = Array.from(state.igors.values()).map(igor => {
    const elapsed = igor.currentTask
      ? ((Date.now() - igor.currentTask.startedAt) / 1000).toFixed(1)
      : null;

    return `
      <div class="igor-card" data-id="${igor.id}">
        <div class="igor-header">
          <span class="igor-id">${igor.id}</span>
          <span class="igor-status ${igor.status}"></span>
        </div>
        <div class="igor-domain">
          <span class="igor-domain-icon">${domainIcons[igor.domain] || '⚡'}</span>
          <span>${igor.domain}</span>
        </div>
        <div class="igor-resources">
          <span>${igor.memoryMB || 0}MB</span>
          ${igor.browserPages ? `<span>${igor.browserPages} pages</span>` : ''}
          ${igor.dbConnections ? `<span>${igor.dbConnections} conns</span>` : ''}
        </div>
        ${igor.currentTask ? `
          <div class="igor-task">
            <div class="igor-task-name">${igor.currentTask.tool}</div>
            <div class="igor-task-time">${elapsed}s</div>
          </div>
        ` : ''}
        <div class="igor-actions">
          <button class="btn btn-danger btn-sm" data-action="igor:kill" data-id="${igor.id}">Kill</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderStream() {
  const container = document.getElementById('stream-container');
  const { source, search } = state.streamFilter;

  let filtered = state.stream;

  // Filter by source
  if (source !== 'all') {
    filtered = filtered.filter(e => e.source === source);
  }

  // Filter by search
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(e =>
      e.summary.toLowerCase().includes(q) ||
      e.type.toLowerCase().includes(q)
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div class="stream-empty">No events match filter</div>';
    return;
  }

  // Only render visible entries for performance
  const visible = filtered.slice(0, 200);

  container.innerHTML = visible.map(entry => {
    const sourceLabel = entry.sourceId || entry.source.toUpperCase();
    return `
      <div class="stream-entry ${entry.level}">
        <span class="stream-time">${formatTime(entry.timestamp)}</span>
        <span class="stream-source ${entry.source}">${sourceLabel}</span>
        <span class="stream-type">${entry.type}</span>
        <span class="stream-summary">${escapeHtml(entry.summary)}</span>
      </div>
    `;
  }).join('');

  // Auto-scroll
  if (state.autoScroll) {
    container.scrollTop = 0;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================
// Command Palette
// ============================================
const commandPalette = {
  visible: false,
  selected: 0,
  filtered: [],

  commands: [
    { id: 'restart-doctor', title: 'Restart Doctor', icon: '🔄', hotkey: '⌘⇧R', category: 'bridge',
      handler: () => confirmAction('Restart Doctor?', 'This will restart the Doctor process.', () => sendCommand('doctor:restart')) },
    { id: 'pause', title: 'Pause Traffic', icon: '⏸', hotkey: 'P', category: 'bridge',
      handler: () => { state.paused = true; sendCommand('bridge:pause'); } },
    { id: 'resume', title: 'Resume Traffic', icon: '▶', category: 'bridge',
      handler: () => { state.paused = false; sendCommand('bridge:resume'); } },
    { id: 'spawn-igor', title: 'Spawn New Igor', icon: '➕', hotkey: '⌘N', category: 'igor',
      handler: () => sendCommand('igor:spawn') },
    { id: 'clear-stream', title: 'Clear Stream', icon: '🗑', hotkey: '⌘L', category: 'stream',
      handler: () => { state.stream = []; renderStream(); } },
    { id: 'toggle-autoscroll', title: 'Toggle Auto-scroll', icon: '⏬', category: 'stream',
      handler: () => toggleAutoScroll() },
    { id: 'shutdown', title: 'Shutdown Bridge', icon: '⏹', hotkey: '⌘⇧Q', category: 'bridge',
      handler: () => confirmAction('Shutdown Bridge?', 'This will stop all BarrHawk processes.', () => sendCommand('bridge:shutdown')) },
  ],

  getDynamicCommands() {
    const cmds = [...this.commands];

    // Add kill commands for each Igor
    state.igors.forEach((igor, id) => {
      cmds.push({
        id: `kill-${id}`,
        title: `Kill ${id}`,
        icon: '💀',
        category: 'igor',
        handler: () => confirmAction(`Kill ${id}?`, 'This will terminate the Igor worker.', () => sendCommand('igor:kill', { id })),
      });
    });

    // Add cancel commands for each swarm
    state.doctor.swarms.forEach(swarm => {
      cmds.push({
        id: `cancel-swarm-${swarm.id}`,
        title: `Cancel Swarm: ${swarm.name}`,
        icon: '⏹',
        category: 'swarm',
        handler: () => confirmAction(`Cancel ${swarm.name}?`, 'This will abort the swarm operation.', () => sendCommand('swarm:cancel', { id: swarm.id })),
      });
    });

    return cmds;
  },

  show() {
    this.visible = true;
    this.selected = 0;
    this.filtered = this.getDynamicCommands();
    this.render();

    const el = document.getElementById('command-palette');
    el.classList.remove('hidden');

    const input = document.getElementById('cmd-input');
    input.value = '';
    input.focus();
  },

  hide() {
    this.visible = false;
    document.getElementById('command-palette').classList.add('hidden');
  },

  toggle() {
    this.visible ? this.hide() : this.show();
  },

  filter(query) {
    const q = query.toLowerCase();
    this.filtered = this.getDynamicCommands().filter(cmd =>
      cmd.title.toLowerCase().includes(q)
    );
    this.selected = 0;
    this.render();
  },

  moveSelection(delta) {
    this.selected = Math.max(0, Math.min(this.filtered.length - 1, this.selected + delta));
    this.render();
  },

  execute() {
    const cmd = this.filtered[this.selected];
    if (cmd?.handler) {
      cmd.handler();
    }
    this.hide();
  },

  render() {
    const list = document.getElementById('cmd-list');
    let lastCategory = null;

    list.innerHTML = this.filtered.map((cmd, i) => {
      let separator = '';
      if (cmd.category !== lastCategory && lastCategory !== null) {
        separator = '<div class="cmd-separator"></div>';
      }
      lastCategory = cmd.category;

      return `
        ${separator}
        <div class="cmd-item ${i === this.selected ? 'selected' : ''}" data-index="${i}">
          <span class="cmd-item-icon">${cmd.icon || '▶'}</span>
          <span class="cmd-item-title">${cmd.title}</span>
          ${cmd.hotkey ? `<span class="cmd-item-hotkey">${cmd.hotkey}</span>` : ''}
        </div>
      `;
    }).join('');
  },
};

// ============================================
// Confirmation Modal
// ============================================
let confirmCallback = null;

function confirmAction(title, message, callback) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  document.getElementById('confirm-modal').classList.remove('hidden');
  confirmCallback = callback;
}

function closeConfirm() {
  document.getElementById('confirm-modal').classList.add('hidden');
  confirmCallback = null;
}

// ============================================
// Toast
// ============================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = { success: '✓', error: '✗', warn: '⚠', info: 'ℹ' };
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ'}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

// ============================================
// UI Helpers
// ============================================
function toggleAutoScroll() {
  state.autoScroll = !state.autoScroll;
  const btn = document.getElementById('btn-autoscroll');
  btn.classList.toggle('active', state.autoScroll);
}

// ============================================
// Event Listeners
// ============================================
function setupEventListeners() {
  // Command palette
  document.addEventListener('keydown', (e) => {
    // Cmd/Ctrl + K
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      commandPalette.toggle();
      return;
    }

    if (commandPalette.visible) {
      if (e.key === 'Escape') {
        commandPalette.hide();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        commandPalette.moveSelection(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        commandPalette.moveSelection(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        commandPalette.execute();
      }
      return;
    }

    // Global shortcuts (when palette not open)
    if (e.key === 'p' && !e.metaKey && !e.ctrlKey) {
      state.paused = !state.paused;
      sendCommand(state.paused ? 'bridge:pause' : 'bridge:resume');
    }

    // Number keys for panel focus
    if (['1', '2', '3', '4'].includes(e.key) && !e.metaKey && !e.ctrlKey) {
      const panels = ['bridge-panel', 'doctor-panel', 'igors-panel', 'stream-panel'];
      document.getElementById(panels[parseInt(e.key) - 1])?.scrollIntoView({ behavior: 'smooth' });
    }

    // Escape to close modals
    if (e.key === 'Escape') {
      closeConfirm();
    }
  });

  // Command palette input
  document.getElementById('cmd-input').addEventListener('input', (e) => {
    commandPalette.filter(e.target.value);
  });

  // Command palette click
  document.getElementById('cmd-list').addEventListener('click', (e) => {
    const item = e.target.closest('.cmd-item');
    if (item) {
      commandPalette.selected = parseInt(item.dataset.index);
      commandPalette.execute();
    }
  });

  // Command palette backdrop
  document.querySelector('.cmd-backdrop')?.addEventListener('click', () => {
    commandPalette.hide();
  });

  // Command button in header
  document.getElementById('btn-command').addEventListener('click', () => {
    commandPalette.toggle();
  });

  // Pause button
  document.getElementById('btn-pause').addEventListener('click', () => {
    state.paused = !state.paused;
    sendCommand(state.paused ? 'bridge:pause' : 'bridge:resume');
    document.getElementById('btn-pause').innerHTML = state.paused
      ? '<span class="btn-icon">▶</span> Resume'
      : '<span class="btn-icon">⏸</span> Pause';
  });

  // Auto-scroll button
  document.getElementById('btn-autoscroll').addEventListener('click', toggleAutoScroll);

  // Clear stream button
  document.getElementById('btn-clear-stream').addEventListener('click', () => {
    state.stream = [];
    renderStream();
  });

  // Stream filters
  document.getElementById('stream-filter-source').addEventListener('change', (e) => {
    state.streamFilter.source = e.target.value;
    renderStream();
  });

  document.getElementById('stream-search').addEventListener('input', (e) => {
    state.streamFilter.search = e.target.value;
    renderStream();
  });

  // Confirm modal
  document.getElementById('confirm-cancel').addEventListener('click', closeConfirm);
  document.getElementById('confirm-ok').addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    closeConfirm();
  });
  document.querySelector('.modal-backdrop')?.addEventListener('click', closeConfirm);

  // Delegated button actions
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;

    switch (action) {
      case 'doctor:restart':
        confirmAction('Restart Doctor?', 'This will restart the Doctor process.', () => sendCommand('doctor:restart'));
        break;
      case 'bridge:pause':
        sendCommand('bridge:pause');
        break;
      case 'igor:spawn':
        sendCommand('igor:spawn');
        break;
      case 'igor:kill':
        confirmAction(`Kill ${id}?`, 'This will terminate the Igor worker.', () => sendCommand('igor:kill', { id }));
        break;
      case 'squad:create':
        // TODO: Open squad creation modal
        showToast('Squad creation coming soon', 'info');
        break;
    }
  });
}

// ============================================
// Demo Data (for testing without Bridge)
// ============================================
function loadDemoData() {
  // Simulate some state for UI testing
  state.bridge = {
    status: 'running',
    uptime: 9420,
    doctorStatus: 'ready',
    doctorRestarts: 0,
    messagesIn: 847,
    messagesOut: 845,
    bytesIn: 2300000,
    bytesOut: 14100000,
  };

  state.doctor = {
    status: 'ready',
    uptime: 9420,
    activeTasks: 3,
    queuedTasks: 12,
    igorCount: 4,
    maxIgors: 8,
    swarms: [
      { id: 'swarm-1', name: 'a11y-audit', progress: 67, igorCount: 3 },
    ],
    squads: [
      { name: 'browser-team', igorIds: ['igor-001', 'igor-003'] },
    ],
  };

  state.igors.set('igor-001', {
    id: 'igor-001',
    status: 'busy',
    domain: 'browser',
    memoryMB: 127,
    browserPages: 2,
    currentTask: { tool: 'browser_screenshot', startedAt: Date.now() - 2300 },
  });

  state.igors.set('igor-002', {
    id: 'igor-002',
    status: 'idle',
    domain: 'database',
    memoryMB: 45,
    dbConnections: 3,
    currentTask: null,
  });

  state.igors.set('igor-003', {
    id: 'igor-003',
    status: 'busy',
    domain: 'github',
    memoryMB: 52,
    currentTask: { tool: 'gh_pr_create', startedAt: Date.now() - 800 },
  });

  // Demo stream
  const demoEvents = [
    { source: 'bridge', type: 'mcp:request', summary: 'browser_screenshot' },
    { source: 'doctor', type: 'task:dispatch', summary: '→ igor-001' },
    { source: 'igor', type: 'task:start', summary: 'igor-001 → browser_screenshot', sourceId: 'IGOR-001' },
    { source: 'igor', type: 'task:complete', summary: 'igor-001 ✓ 765ms', sourceId: 'IGOR-001' },
    { source: 'bridge', type: 'mcp:response', summary: '→ Claude' },
    { source: 'doctor', type: 'swarm:progress', summary: 'a11y-audit 67%' },
  ];

  demoEvents.forEach((e, i) => {
    state.stream.push({
      timestamp: Date.now() - (demoEvents.length - i) * 1000,
      ...e,
      level: 'info',
    });
  });

  renderBridge();
  renderDoctor();
  renderIgors();
  renderStream();
  updateIgorCount();
}

// ============================================
// Initialize
// ============================================
function init() {
  setupEventListeners();
  connect();

  // Load demo data after a short delay if not connected
  setTimeout(() => {
    if (!state.connected) {
      console.log('Loading demo data (Bridge not connected)');
      loadDemoData();
    }
  }, 2000);

  // Update elapsed times periodically
  setInterval(() => {
    if (state.igors.size > 0) {
      renderIgors();
    }
  }, 1000);
}

// Start
init();
