/**
 * Hell Extension - Background Service Worker
 *
 * The bridge between content scripts, side panel, and tab events.
 * Deliberately includes race condition opportunities for testing.
 */

const API_BASE = 'http://localhost:6666';

// Track active tab data
let activeTabId = null;
let tabDataCache = new Map();
let pendingRequests = new Map(); // Track AbortControllers for pending requests

// Configurable chaos settings
const CHAOS_CONFIG = {
  networkDelayMs: 0,        // Artificial delay on data fetch (set via message)
  randomFailureRate: 0,     // 0-1, chance of random failure
  enableZombieMode: false,  // Don't clear state on tab close
  enableSlowUpdates: false  // Add 500ms delay before sending updates
};

// Open side panel on extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

// Track tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  console.log('[Hell BG] Tab activated:', activeInfo.tabId);
  activeTabId = activeInfo.tabId;

  // Get tab info
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    await notifyTabChange(tab);
  } catch (e) {
    console.error('[Hell BG] Failed to get tab:', e);
  }
});

// Track tab updates (URL changes, title changes)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId === activeTabId && (changeInfo.url || changeInfo.title)) {
    console.log('[Hell BG] Active tab updated:', changeInfo);
    await notifyTabChange(tab);
  }
});

// Track tab removal (for zombie state testing)
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  console.log('[Hell BG] Tab removed:', tabId);

  if (CHAOS_CONFIG.enableZombieMode) {
    // Deliberately DON'T clear the cache - zombie state!
    console.log('[Hell BG] ZOMBIE MODE: Not clearing cache for tab', tabId);
  } else {
    tabDataCache.delete(tabId);
  }

  // If active tab was closed, notify sidebar
  if (tabId === activeTabId) {
    activeTabId = null;
    broadcastToSidePanel({
      type: 'TAB_CLOSED',
      tabId: tabId,
      zombieMode: CHAOS_CONFIG.enableZombieMode
    });
  }
});

// Message handling from content scripts and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Hell BG] Message received:', message.type, message);

  switch (message.type) {
    case 'PAGE_DATA':
      handlePageData(message, sender);
      sendResponse({ success: true });
      break;

    case 'GET_ACTIVE_TAB_DATA':
      handleGetActiveTabData(sendResponse);
      return true; // Keep channel open for async response

    case 'SET_CHAOS_CONFIG':
      Object.assign(CHAOS_CONFIG, message.config);
      console.log('[Hell BG] Chaos config updated:', CHAOS_CONFIG);
      sendResponse({ success: true, config: CHAOS_CONFIG });
      break;

    case 'GET_CHAOS_CONFIG':
      sendResponse({ config: CHAOS_CONFIG });
      break;

    case 'STORE_TAB_NOTE':
      handleStoreTabNote(message, sendResponse);
      return true;

    case 'GET_TAB_NOTE':
      handleGetTabNote(message, sendResponse);
      return true;

    case 'API_FETCH_TAB_DATA':
      fetchTabDataFromAPI(message.tabId).then(data => {
        sendResponse({ success: true, data });
      }).catch(e => {
        sendResponse({ success: false, error: e.message });
      });
      return true;

    case 'API_LOG_ACTION':
      logActionToAPI(message.action).then(result => {
        sendResponse(result);
      });
      return true;

    case 'API_LIKE_PAGE':
      likePageViaAPI(message.pageId).then(result => {
        sendResponse(result);
      });
      return true;

    case 'API_GET_USER':
      getUserFromAPI().then(result => {
        sendResponse(result);
      });
      return true;

    case 'API_SET_CHAOS':
      setChaosViaAPI(message.config).then(result => {
        sendResponse(result);
      });
      return true;

    default:
      sendResponse({ error: 'Unknown message type' });
  }
});

async function notifyTabChange(tab) {
  const delay = CHAOS_CONFIG.enableSlowUpdates ? 500 : 0;

  if (delay > 0) {
    await new Promise(r => setTimeout(r, delay));
  }

  // Check if tab is still active after delay (race condition opportunity!)
  if (tab.id !== activeTabId) {
    console.log('[Hell BG] Tab changed during delay, aborting notification');
    return;
  }

  broadcastToSidePanel({
    type: 'TAB_CHANGED',
    tabId: tab.id,
    url: tab.url,
    title: tab.title,
    favIconUrl: tab.favIconUrl
  });
}

async function handlePageData(message, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  // Simulate network delay if configured
  if (CHAOS_CONFIG.networkDelayMs > 0) {
    console.log(`[Hell BG] Simulating ${CHAOS_CONFIG.networkDelayMs}ms network delay`);
    await new Promise(r => setTimeout(r, CHAOS_CONFIG.networkDelayMs));
  }

  // Simulate random failures
  if (Math.random() < CHAOS_CONFIG.randomFailureRate) {
    console.log('[Hell BG] Simulated random failure!');
    return;
  }

  // Store data in cache
  tabDataCache.set(tabId, {
    ...message.data,
    tabId: tabId,
    timestamp: Date.now()
  });

  // Only send to sidebar if this is still the active tab
  // This is THE critical race condition point!
  if (tabId === activeTabId) {
    broadcastToSidePanel({
      type: 'PAGE_DATA_UPDATED',
      tabId: tabId,
      data: tabDataCache.get(tabId)
    });
  } else {
    console.log('[Hell BG] Data arrived for inactive tab, not sending to sidebar');
  }
}

async function handleGetActiveTabData(sendResponse) {
  if (!activeTabId) {
    sendResponse({ data: null, reason: 'no_active_tab' });
    return;
  }

  // Simulate delay
  if (CHAOS_CONFIG.networkDelayMs > 0) {
    await new Promise(r => setTimeout(r, CHAOS_CONFIG.networkDelayMs));
  }

  const data = tabDataCache.get(activeTabId);
  sendResponse({
    data: data || null,
    tabId: activeTabId,
    cacheSize: tabDataCache.size
  });
}

async function handleStoreTabNote(message, sendResponse) {
  // Save to both local storage AND API
  const key = `note_tab_${message.tabId}`;
  await chrome.storage.local.set({ [key]: message.note });

  // Also save to API
  try {
    await fetch(`${API_BASE}/api/notes/${message.tabId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: message.note })
    });
    console.log(`[Hell BG] Stored note for tab ${message.tabId} (local + API)`);
  } catch (e) {
    console.log(`[Hell BG] API save failed, local only:`, e.message);
  }

  sendResponse({ success: true });
}

async function handleGetTabNote(message, sendResponse) {
  // Try API first, fall back to local
  try {
    const response = await fetch(`${API_BASE}/api/notes/${message.tabId}`);
    const data = await response.json();
    if (data.success && data.data.note) {
      sendResponse({ note: data.data.note, source: 'api' });
      return;
    }
  } catch (e) {
    console.log(`[Hell BG] API fetch failed, using local:`, e.message);
  }

  const key = `note_tab_${message.tabId}`;
  const result = await chrome.storage.local.get(key);
  sendResponse({ note: result[key] || null, source: 'local' });
}

// ============ API INTEGRATION ============

async function fetchTabDataFromAPI(tabId) {
  // Cancel any pending request for this tab
  if (pendingRequests.has(tabId)) {
    pendingRequests.get(tabId).abort();
  }

  const controller = new AbortController();
  pendingRequests.set(tabId, controller);

  try {
    const response = await fetch(`${API_BASE}/api/tab-data/${tabId}`, {
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const result = await response.json();
    pendingRequests.delete(tabId);

    return result.data;
  } catch (e) {
    pendingRequests.delete(tabId);
    if (e.name === 'AbortError') {
      console.log(`[Hell BG] Request for tab ${tabId} was aborted`);
      return null;
    }
    throw e;
  }
}

async function logActionToAPI(action) {
  try {
    const response = await fetch(`${API_BASE}/api/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action)
    });
    return await response.json();
  } catch (e) {
    console.log(`[Hell BG] Failed to log action:`, e.message);
    return null;
  }
}

async function likePageViaAPI(pageId) {
  try {
    const response = await fetch(`${API_BASE}/api/likes/${pageId}`, {
      method: 'POST'
    });
    return await response.json();
  } catch (e) {
    console.log(`[Hell BG] Failed to like page:`, e.message);
    return null;
  }
}

async function getUserFromAPI() {
  try {
    const response = await fetch(`${API_BASE}/api/user`);
    return await response.json();
  } catch (e) {
    console.log(`[Hell BG] Failed to get user:`, e.message);
    return null;
  }
}

async function setChaosViaAPI(config) {
  try {
    const response = await fetch(`${API_BASE}/api/chaos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    return await response.json();
  } catch (e) {
    console.log(`[Hell BG] Failed to set chaos:`, e.message);
    return null;
  }
}

function broadcastToSidePanel(message) {
  // Send to all extension pages (side panel will receive this)
  chrome.runtime.sendMessage(message).catch(e => {
    // Side panel might not be open, that's OK
    console.log('[Hell BG] Could not send to side panel (probably closed)');
  });
}

console.log('[Hell BG] Background service worker initialized');
