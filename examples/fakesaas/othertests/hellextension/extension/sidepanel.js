/**
 * Hell Extension - Side Panel Logic
 *
 * Manages state synchronization with the active tab.
 * Includes deliberate race condition opportunities for testing.
 */

// State
let currentTabId = null;
let currentTabData = null;
let pendingRequestId = 0;
let chaosConfig = {
  enableSlowUpdates: false,
  enableZombieMode: false,
  networkDelayMs: 0,
  randomFailureRate: 0
};

// DOM Elements
const contentEl = document.getElementById('content');
const statusBadge = document.getElementById('status-badge');
const tabNoteEl = document.getElementById('tab-note');
const logArea = document.getElementById('log-area');
const updateFlash = document.getElementById('update-flash');

// Chaos control buttons (local)
const btnSlow = document.getElementById('btn-slow');
const btnZombie = document.getElementById('btn-zombie');
const btnDelay = document.getElementById('btn-delay');
const btnFail = document.getElementById('btn-fail');

// API elements
const userNameEl = document.getElementById('user-name');
const userPlanEl = document.getElementById('user-plan');
const apiStatusEl = document.getElementById('api-status');
const likeCountEl = document.getElementById('like-count');
const btnLike = document.getElementById('btn-like');
const btnApiDelay = document.getElementById('btn-api-delay');
const btnApiFail = document.getElementById('btn-api-fail');
const serverChaosStatus = document.getElementById('server-chaos-status');

// Server chaos state
let serverChaos = { delayMs: 0, failRate: 0 };

// Initialize
async function init() {
  log('info', 'Initializing sidebar...');

  // Get current chaos config
  const response = await chrome.runtime.sendMessage({ type: 'GET_CHAOS_CONFIG' });
  if (response?.config) {
    chaosConfig = response.config;
    updateChaosButtons();
  }

  // Request initial data
  await fetchActiveTabData();

  // Fetch user info from API
  await fetchUserInfo();

  // Listen for messages from background
  chrome.runtime.onMessage.addListener(handleMessage);

  // Setup chaos button listeners
  setupChaosControls();

  // Setup API controls
  setupAPIControls();

  // Setup note persistence
  setupNotePersistence();

  log('info', 'Sidebar ready');
}

function handleMessage(message) {
  log('info', `Received: ${message.type}`);

  switch (message.type) {
    case 'TAB_CHANGED':
      handleTabChanged(message);
      break;

    case 'PAGE_DATA_UPDATED':
      handlePageDataUpdated(message);
      break;

    case 'TAB_CLOSED':
      handleTabClosed(message);
      break;
  }
}

async function handleTabChanged(message) {
  const { tabId, url, title } = message;

  // Save note for previous tab before switching
  if (currentTabId && currentTabId !== tabId) {
    await saveNoteForTab(currentTabId);
  }

  currentTabId = tabId;
  setStatus('loading', 'Syncing...');
  flashUpdate();

  log('info', `Tab changed to ${tabId}: ${title || url}`);

  // Load note for new tab
  await loadNoteForTab(tabId);

  // Fetch full page data
  await fetchActiveTabData();
}

async function handlePageDataUpdated(message) {
  const { tabId, data } = message;

  // CRITICAL: Check if this data is still relevant
  // This is where race conditions manifest!
  if (tabId !== currentTabId) {
    log('warn', `Stale data for tab ${tabId}, current is ${currentTabId} - IGNORED`);
    return;
  }

  currentTabData = data;
  renderTabData(data);
  setStatus('synced', 'Synced');
  flashUpdate();
}

function handleTabClosed(message) {
  if (message.zombieMode) {
    setStatus('zombie', 'Zombie');
    log('error', `Tab ${message.tabId} closed but ZOMBIE MODE - showing stale data!`);
  } else {
    currentTabId = null;
    currentTabData = null;
    renderEmptyState('Tab closed');
    setStatus('error', 'No Tab');
    log('info', `Tab ${message.tabId} closed, cleared state`);
  }
}

async function fetchActiveTabData() {
  const requestId = ++pendingRequestId;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_ACTIVE_TAB_DATA'
    });

    // Check if a newer request was made while we were waiting
    if (requestId !== pendingRequestId) {
      log('warn', `Request ${requestId} superseded by ${pendingRequestId}`);
      return;
    }

    if (response?.data) {
      currentTabId = response.tabId;
      currentTabData = response.data;
      renderTabData(response.data);
      setStatus('synced', 'Synced');
    } else {
      renderEmptyState(response?.reason || 'No data');
      setStatus('loading', 'Waiting');
    }
  } catch (e) {
    log('error', `Fetch failed: ${e.message}`);
    setStatus('error', 'Error');
  }
}

function renderTabData(data) {
  if (!data) {
    renderEmptyState('No data');
    return;
  }

  const html = `
    <div class="card">
      <h2>🌐 Active Tab</h2>
      <div class="data-row">
        <span class="data-label">Tab ID</span>
        <span class="data-value highlight" id="display-tab-id">${data.tabId || 'Unknown'}</span>
      </div>
      <div class="data-row">
        <span class="data-label">Domain</span>
        <span class="data-value" id="display-domain">${extractDomain(data.url) || 'Unknown'}</span>
      </div>
      <div class="data-row">
        <span class="data-label">Title</span>
        <span class="data-value" id="display-title">${truncate(data.title, 40) || 'Untitled'}</span>
      </div>
      <div class="data-row">
        <span class="data-label">URL</span>
        <span class="data-value" id="display-url">${truncate(data.url, 50) || 'No URL'}</span>
      </div>
    </div>

    <div class="card">
      <h2>📦 Page Data</h2>
      <div class="data-row">
        <span class="data-label">Page ID</span>
        <span class="data-value highlight" id="display-page-id">${data.pageId || 'N/A'}</span>
      </div>
      <div class="data-row">
        <span class="data-label">Page Color</span>
        <span class="data-value" id="display-page-color" style="color: ${data.themeColor || '#fff'}">${data.themeColor || 'N/A'}</span>
      </div>
      <div class="data-row">
        <span class="data-label">Custom Data</span>
        <span class="data-value" id="display-custom-data">${data.customData || 'None'}</span>
      </div>
      <div class="data-row">
        <span class="data-label">Timestamp</span>
        <span class="data-value">${data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : 'N/A'}</span>
      </div>
    </div>
  `;

  contentEl.innerHTML = html;
}

function renderEmptyState(reason) {
  contentEl.innerHTML = `
    <div class="empty-state">
      <div class="icon">👻</div>
      <div>${reason || 'Waiting for tab data...'}</div>
    </div>
  `;
}

function setStatus(type, text) {
  statusBadge.className = `status-badge ${type}`;
  statusBadge.textContent = text;
}

function flashUpdate() {
  updateFlash.classList.add('active');
  setTimeout(() => updateFlash.classList.remove('active'), 300);
}

function log(level, message) {
  const entry = document.createElement('div');
  entry.className = `log-entry ${level}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logArea.appendChild(entry);
  logArea.scrollTop = logArea.scrollHeight;

  // Keep only last 50 entries
  while (logArea.children.length > 50) {
    logArea.removeChild(logArea.firstChild);
  }
}

// Chaos Controls
function setupChaosControls() {
  btnSlow.addEventListener('click', () => toggleChaos('enableSlowUpdates'));
  btnZombie.addEventListener('click', () => toggleChaos('enableZombieMode'));
  btnDelay.addEventListener('click', () => toggleChaos('networkDelayMs', 0, 2000));
  btnFail.addEventListener('click', () => toggleChaos('randomFailureRate', 0, 0.3));
}

async function toggleChaos(key, offValue = false, onValue = true) {
  const currentValue = chaosConfig[key];
  const newValue = currentValue === offValue ? onValue : offValue;

  chaosConfig[key] = newValue;

  await chrome.runtime.sendMessage({
    type: 'SET_CHAOS_CONFIG',
    config: { [key]: newValue }
  });

  updateChaosButtons();
  log('warn', `Chaos: ${key} = ${newValue}`);
}

function updateChaosButtons() {
  btnSlow.classList.toggle('active', chaosConfig.enableSlowUpdates);
  btnZombie.classList.toggle('active', chaosConfig.enableZombieMode);
  btnDelay.classList.toggle('active', chaosConfig.networkDelayMs > 0);
  btnFail.classList.toggle('active', chaosConfig.randomFailureRate > 0);
}

// Note Persistence (for state conflict testing)
function setupNotePersistence() {
  let saveTimeout;

  tabNoteEl.addEventListener('input', () => {
    // Debounced save
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      if (currentTabId) {
        saveNoteForTab(currentTabId);
      }
    }, 500);
  });
}

async function saveNoteForTab(tabId) {
  const note = tabNoteEl.value;
  await chrome.runtime.sendMessage({
    type: 'STORE_TAB_NOTE',
    tabId: tabId,
    note: note
  });
  log('info', `Saved note for tab ${tabId}`);
}

async function loadNoteForTab(tabId) {
  const response = await chrome.runtime.sendMessage({
    type: 'GET_TAB_NOTE',
    tabId: tabId
  });
  tabNoteEl.value = response?.note || '';
  log('info', `Loaded note for tab ${tabId}: "${response?.note || '(empty)'}"`);
}

// ============ API FUNCTIONS ============

async function fetchUserInfo() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'API_GET_USER' });
    if (response?.success && response.data) {
      userNameEl.textContent = response.data.name;
      userPlanEl.textContent = response.data.plan;
      apiStatusEl.textContent = 'Connected';
      apiStatusEl.style.color = '#00d26a';
      log('info', `API connected: ${response.data.name}`);
    } else {
      throw new Error('No data');
    }
  } catch (e) {
    userNameEl.textContent = 'Offline';
    userPlanEl.textContent = '-';
    apiStatusEl.textContent = 'Disconnected';
    apiStatusEl.style.color = '#e94560';
    log('error', `API connection failed: ${e.message}`);
  }
}

async function fetchLikeCount(pageId) {
  if (!pageId) return;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'API_FETCH_TAB_DATA',
      tabId: currentTabId
    });

    if (response?.success && response.data) {
      likeCountEl.textContent = response.data.likes || 0;
    }
  } catch (e) {
    log('error', `Failed to fetch likes: ${e.message}`);
  }
}

async function likeCurrentPage() {
  if (!currentTabData?.pageId) {
    log('warn', 'No page ID to like');
    return;
  }

  btnLike.disabled = true;
  btnLike.textContent = 'Liking...';

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'API_LIKE_PAGE',
      pageId: currentTabData.pageId
    });

    if (response?.success) {
      likeCountEl.textContent = response.data.count;
      log('info', `Liked ${currentTabData.pageId}: ${response.data.count} total`);

      // Also log the action
      await chrome.runtime.sendMessage({
        type: 'API_LOG_ACTION',
        action: {
          type: 'like',
          pageId: currentTabData.pageId,
          tabId: currentTabId
        }
      });
    }
  } catch (e) {
    log('error', `Like failed: ${e.message}`);
  }

  btnLike.disabled = false;
  btnLike.textContent = '❤️ Like This Page';
}

function setupAPIControls() {
  // Like button
  btnLike.addEventListener('click', likeCurrentPage);

  // Server chaos controls
  btnApiDelay.addEventListener('click', async () => {
    serverChaos.delayMs = serverChaos.delayMs > 0 ? 0 : 2000;
    await updateServerChaos();
  });

  btnApiFail.addEventListener('click', async () => {
    serverChaos.failRate = serverChaos.failRate > 0 ? 0 : 0.3;
    await updateServerChaos();
  });
}

async function updateServerChaos() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'API_SET_CHAOS',
      config: serverChaos
    });

    if (response?.success) {
      updateServerChaosUI();
      log('warn', `Server chaos: delay=${serverChaos.delayMs}ms, fail=${serverChaos.failRate * 100}%`);
    }
  } catch (e) {
    log('error', `Failed to set server chaos: ${e.message}`);
  }
}

function updateServerChaosUI() {
  btnApiDelay.classList.toggle('active', serverChaos.delayMs > 0);
  btnApiFail.classList.toggle('active', serverChaos.failRate > 0);

  if (serverChaos.delayMs > 0 || serverChaos.failRate > 0) {
    serverChaosStatus.textContent = 'ACTIVE';
    serverChaosStatus.style.color = '#e94560';
  } else {
    serverChaosStatus.textContent = 'Inactive';
    serverChaosStatus.style.color = '#888';
  }
}

// Utilities
function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len) + '...' : str;
}

// Start
init();
