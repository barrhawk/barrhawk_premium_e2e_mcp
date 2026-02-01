// URL Roaster - Sidebar Panel Logic v2.0
// With: themes, copy/share, favorites, history limit, export/import

const HISTORY_LIMIT = 50;
const STORAGE_VERSION = 2;

let currentUrl = '';
let currentRoast = '';
let roastHistory = [];
let favorites = [];
let settings = {
  theme: 'dark',
  useSystemTheme: false
};

// Roast templates based on URL patterns
const roasts = {
  google: [
    "Ah yes, feeding the all-seeing eye your search history. Bold move.",
    "Google: Because who needs privacy when you can have targeted ads?",
    "Let me guess, you're googling how to google things?"
  ],
  youtube: [
    "3 hours later you'll wonder where your life went. Enjoy!",
    "The algorithm knows you better than your therapist.",
    "Another rabbit hole? At least commit to the fall."
  ],
  github: [
    "Staring at other people's code won't fix yours.",
    "README.md: 'Installation: It's complicated'",
    "Star count: 3. Two are from your alt accounts."
  ],
  stackoverflow: [
    "Marked as duplicate. Your question has been closed.",
    "Copy-paste engineering at its finest.",
    "Did you even try reading the documentation? (Nobody does)"
  ],
  reddit: [
    "Time to argue with strangers about things that don't matter!",
    "Front page of the internet, back page of productivity.",
    "Your takes are mid and your karma means nothing."
  ],
  twitter: [
    "Ah, the hellsite. May your ratio be ever in your favor.",
    "280 characters of pure unfiltered bad takes.",
    "X marks the spot where your time goes to die."
  ],
  facebook: [
    "Checking on relatives you avoid at holidays?",
    "Boomer memes and MLM pitches await.",
    "Your aunt just poked you. Run."
  ],
  amazon: [
    "Your wallet is already crying.",
    "Add to cart, regret later. The cycle continues.",
    "Same day shipping for things you don't need."
  ],
  localhost: [
    "Ah, a developer. My condolences to your sleep schedule.",
    "localhost: Where bugs are born and dreams go to die.",
    "It works on my machine! (Narrator: It didn't)"
  ],
  linkedin: [
    "Excited to announce that I'm humblebragging!",
    "Thought leaders sharing thoughts they didn't lead.",
    "Congrats on the work anniversary literally nobody cares about!"
  ],
  default: [
    "Interesting URL choice. No judgment. (Okay, some judgment)",
    "I've seen better URLs on a 404 page.",
    "This URL walks into a bar. The bartender says 'we don't serve your type here'.",
    "Your browsing history called. It's disappointed.",
    "This is where you spend your time? Fascinating.",
    "The internet is vast and you chose... this?",
    "Your ISP is taking notes. Just saying."
  ]
};

// Get roast based on URL
function getRoast(url) {
  const urlLower = url.toLowerCase();
  for (const [pattern, roastList] of Object.entries(roasts)) {
    if (pattern !== 'default' && urlLower.includes(pattern)) {
      return roastList[Math.floor(Math.random() * roastList.length)];
    }
  }
  return roasts.default[Math.floor(Math.random() * roasts.default.length)];
}

// Update URL display
function updateUrlDisplay(url) {
  const urlEl = document.getElementById('current-url');
  currentUrl = url;
  urlEl.textContent = url || 'No URL detected';
  urlEl.title = url;
}

// ==================== THEME MANAGEMENT ====================

function applyTheme(theme) {
  if (theme === 'light') {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }
}

function detectSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function updateTheme() {
  const theme = settings.useSystemTheme ? detectSystemTheme() : settings.theme;
  applyTheme(theme);
}

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (settings.useSystemTheme) {
    updateTheme();
  }
});

// ==================== HISTORY MANAGEMENT ====================

function addToHistory(url, roast) {
  const entry = {
    id: Date.now(),
    url,
    roast,
    timestamp: new Date().toISOString(),
    favorite: false
  };

  roastHistory.unshift(entry);

  // Enforce limit - remove oldest non-favorite items first
  while (roastHistory.length > HISTORY_LIMIT) {
    const nonFavIndex = roastHistory.findIndex((item, idx) => !item.favorite && idx > 0);
    if (nonFavIndex !== -1) {
      roastHistory.splice(nonFavIndex, 1);
    } else {
      roastHistory.pop();
    }
  }

  saveData();
  renderHistory();
}

function clearHistory() {
  if (confirm('Clear all roast history? Favorites will also be removed.')) {
    roastHistory = [];
    favorites = [];
    saveData();
    renderHistory();
    showToast('History cleared');
  }
}

function toggleFavorite(id) {
  const item = roastHistory.find(h => h.id === id);
  if (item) {
    item.favorite = !item.favorite;
    if (item.favorite) {
      favorites.push(id);
    } else {
      favorites = favorites.filter(f => f !== id);
    }
    saveData();
    renderHistory();
  }
}

function renderHistory() {
  const section = document.getElementById('history-section');
  const list = document.getElementById('history-list');
  const countEl = document.getElementById('history-count');

  countEl.textContent = roastHistory.length;

  if (roastHistory.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  list.innerHTML = roastHistory.slice(0, 10).map(item => `
    <div class="history-item" data-id="${item.id}">
      <div class="history-url">${escapeHtml(item.url)}</div>
      <div class="history-roast">${escapeHtml(item.roast)}</div>
      <div class="timestamp">
        ${new Date(item.timestamp).toLocaleTimeString()}
        ${item.favorite ? '⭐' : ''}
      </div>
    </div>
  `).join('');
}

// ==================== COPY / SHARE / FAVORITE ====================

async function copyRoast() {
  if (!currentRoast) return;

  try {
    await navigator.clipboard.writeText(currentRoast);
    showToast('Copied to clipboard!');
  } catch (e) {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = currentRoast;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('Copied!');
  }
}

async function shareRoast() {
  if (!currentRoast) return;

  const shareData = {
    title: 'URL Roaster',
    text: `${currentRoast}\n\n— Roasted by URL Roaster 🔥`,
    url: currentUrl
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch (e) {
      if (e.name !== 'AbortError') {
        copyRoast(); // Fallback to copy
      }
    }
  } else {
    copyRoast(); // Fallback to copy
  }
}

function favoriteCurrentRoast() {
  const btn = document.getElementById('favorite-btn');
  if (roastHistory.length > 0) {
    const latest = roastHistory[0];
    toggleFavorite(latest.id);
    btn.classList.toggle('active', latest.favorite);
    showToast(latest.favorite ? 'Saved to favorites!' : 'Removed from favorites');
  }
}

// ==================== EXPORT / IMPORT / RESET ====================

function exportData() {
  const data = {
    version: STORAGE_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    roastHistory,
    favorites
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `url-roaster-backup-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Data exported!');
}

function importData() {
  document.getElementById('import-file').click();
}

async function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.version || !data.settings) {
      throw new Error('Invalid backup file');
    }

    settings = { ...settings, ...data.settings };
    roastHistory = data.roastHistory || [];
    favorites = data.favorites || [];

    await saveData();
    updateTheme();
    renderHistory();
    updateSettingsUI();

    showToast('Data imported successfully!');
  } catch (e) {
    showToast('Import failed: ' + e.message);
  }

  event.target.value = '';
}

function resetToDefaults() {
  if (confirm('Reset all settings and clear history? This cannot be undone.')) {
    settings = { theme: 'dark', useSystemTheme: false };
    roastHistory = [];
    favorites = [];
    saveData();
    updateTheme();
    renderHistory();
    updateSettingsUI();
    showToast('Reset to defaults');
  }
}

// ==================== STORAGE ====================

async function saveData() {
  await chrome.storage.local.set({
    version: STORAGE_VERSION,
    settings,
    roastHistory,
    favorites
  });
}

async function loadData() {
  const stored = await chrome.storage.local.get(['version', 'settings', 'roastHistory', 'favorites']);

  // Migration from v1
  if (!stored.version && stored.roastHistory) {
    roastHistory = stored.roastHistory.map((item, idx) => ({
      id: Date.now() - idx,
      url: item.url,
      roast: item.roast,
      timestamp: item.timestamp,
      favorite: false
    }));
  } else {
    roastHistory = stored.roastHistory || [];
  }

  settings = stored.settings || { theme: 'dark', useSystemTheme: false };
  favorites = stored.favorites || [];
}

// ==================== UI HELPERS ====================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 60px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.8);
    color: white;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 12px;
    z-index: 1000;
    animation: fadeInOut 2s ease;
  `;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeInOut {
      0% { opacity: 0; transform: translateX(-50%) translateY(10px); }
      15% { opacity: 1; transform: translateX(-50%) translateY(0); }
      85% { opacity: 1; transform: translateX(-50%) translateY(0); }
      100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 2000);
}

function updateSettingsUI() {
  document.getElementById('theme-toggle').checked = settings.theme === 'light';
  document.getElementById('system-theme-toggle').checked = settings.useSystemTheme;
}

// ==================== ROAST ====================

async function performRoast() {
  const btn = document.getElementById('roast-btn');
  const resultEl = document.getElementById('result-text');
  const actionRow = document.getElementById('action-row');

  if (!currentUrl) {
    resultEl.textContent = 'No URL to roast!';
    resultEl.className = 'result-text error';
    return;
  }

  btn.disabled = true;
  btn.textContent = '🔥 Roasting...';
  resultEl.textContent = 'Generating spicy take...';
  resultEl.className = 'result-text loading';
  actionRow.style.display = 'none';

  await new Promise(r => setTimeout(r, 800 + Math.random() * 700));

  const roast = getRoast(currentUrl);
  currentRoast = roast;

  resultEl.textContent = roast;
  resultEl.className = 'result-text';
  btn.disabled = false;
  btn.textContent = '🎤 Roast This URL';
  actionRow.style.display = 'flex';

  // Reset favorite button state
  document.getElementById('favorite-btn').classList.remove('active');

  addToHistory(currentUrl, roast);

  window.dispatchEvent(new CustomEvent('roast-complete', {
    detail: { url: currentUrl, roast }
  }));
}

// ==================== INIT ====================

async function getCurrentTabUrl() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.url || '';
  } catch (e) {
    console.error('Failed to get tab URL:', e);
    return '';
  }
}

async function init() {
  // Load data
  await loadData();
  renderHistory();
  updateTheme();
  updateSettingsUI();

  // Get current URL
  const url = await getCurrentTabUrl();
  updateUrlDisplay(url);

  // Setup event listeners
  document.getElementById('roast-btn').addEventListener('click', performRoast);
  document.getElementById('copy-btn').addEventListener('click', copyRoast);
  document.getElementById('share-btn').addEventListener('click', shareRoast);
  document.getElementById('favorite-btn').addEventListener('click', favoriteCurrentRoast);
  document.getElementById('clear-history-btn').addEventListener('click', clearHistory);
  document.getElementById('export-btn').addEventListener('click', exportData);
  document.getElementById('import-btn').addEventListener('click', importData);
  document.getElementById('import-file').addEventListener('change', handleImport);
  document.getElementById('reset-btn').addEventListener('click', resetToDefaults);

  // Theme toggles
  document.getElementById('theme-toggle').addEventListener('change', (e) => {
    settings.theme = e.target.checked ? 'light' : 'dark';
    settings.useSystemTheme = false;
    document.getElementById('system-theme-toggle').checked = false;
    updateTheme();
    saveData();
  });

  document.getElementById('system-theme-toggle').addEventListener('change', (e) => {
    settings.useSystemTheme = e.target.checked;
    updateTheme();
    saveData();
  });

  // Tab listeners
  chrome.tabs.onActivated.addListener(async () => {
    const url = await getCurrentTabUrl();
    updateUrlDisplay(url);
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.url) {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id === tabId) {
        updateUrlDisplay(changeInfo.url);
      }
    }
  });

  // Mark ready
  document.body.setAttribute('data-ready', 'true');
  console.log('[URL Roaster] Sidebar v2.0 initialized');
}

init();
