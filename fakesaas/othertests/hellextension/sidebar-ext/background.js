// URL Roaster - Background Service Worker

// Enable side panel on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('[URL Roaster] Extension installed');

  // Set side panel behavior - open on action click
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(err => console.error('[URL Roaster] Failed to set panel behavior:', err));
});

// Handle action click (toolbar button or Ctrl+B)
chrome.action.onClicked.addListener(async (tab) => {
  console.log('[URL Roaster] Action clicked, opening side panel');

  try {
    // Open side panel for this tab
    await chrome.sidePanel.open({ tabId: tab.id });
    console.log('[URL Roaster] Side panel opened');
  } catch (err) {
    console.error('[URL Roaster] Failed to open side panel:', err);
  }
});

// Handle messages from content scripts or side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[URL Roaster] Message received:', message);

  if (message.type === 'GET_TAB_URL') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ url: tabs[0]?.url || '' });
    });
    return true; // async response
  }

  if (message.type === 'PING') {
    sendResponse({ status: 'alive', timestamp: Date.now() });
    return true;
  }
});

// Track side panel state for testing
let sidePanelOpen = false;

chrome.sidePanel.onStateChanged?.addListener?.((state) => {
  sidePanelOpen = state.open;
  console.log('[URL Roaster] Side panel state:', state);
});

// Log for debugging
console.log('[URL Roaster] Background service worker started');
