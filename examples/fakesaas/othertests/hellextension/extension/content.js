/**
 * Hell Extension - Content Script
 *
 * Runs in the context of web pages.
 * Extracts page data and sends it to the background service worker.
 */

(function() {
  'use strict';

  // Avoid re-injection
  if (window.__hellExtensionInjected) {
    return;
  }
  window.__hellExtensionInjected = true;

  console.log('[Hell Content] Content script loaded on:', window.location.href);

  // Extract page data
  function getPageData() {
    // Look for special data attributes on test pages
    const pageIdEl = document.querySelector('[data-hell-page-id]');
    const pageColorEl = document.querySelector('[data-hell-theme-color]');
    const customDataEl = document.querySelector('[data-hell-custom-data]');

    // Get theme color from meta tag
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');

    return {
      url: window.location.href,
      title: document.title,
      pageId: pageIdEl?.getAttribute('data-hell-page-id') || null,
      themeColor: pageColorEl?.getAttribute('data-hell-theme-color') ||
                  themeColorMeta?.getAttribute('content') || null,
      customData: customDataEl?.getAttribute('data-hell-custom-data') || null,
      documentReady: document.readyState,
      elementCount: document.querySelectorAll('*').length,
      hasHellMarkers: !!(pageIdEl || pageColorEl || customDataEl)
    };
  }

  // Send page data to background
  function sendPageData() {
    const data = getPageData();

    console.log('[Hell Content] Sending page data:', data);

    chrome.runtime.sendMessage({
      type: 'PAGE_DATA',
      data: data
    }).catch(e => {
      console.log('[Hell Content] Failed to send data:', e.message);
    });
  }

  // Initial send after page is ready
  if (document.readyState === 'complete') {
    sendPageData();
  } else {
    window.addEventListener('load', sendPageData);
  }

  // Watch for dynamic changes (SPA navigation)
  let lastUrl = window.location.href;
  let lastTitle = document.title;

  const observer = new MutationObserver(() => {
    const currentUrl = window.location.href;
    const currentTitle = document.title;

    if (currentUrl !== lastUrl || currentTitle !== lastTitle) {
      console.log('[Hell Content] Detected navigation/title change');
      lastUrl = currentUrl;
      lastTitle = currentTitle;
      sendPageData();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // Listen for visibility changes (tab focus)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      console.log('[Hell Content] Tab became visible, refreshing data');
      sendPageData();
    }
  });

  // Expose a global for test pages to trigger manual updates
  window.__hellExtensionUpdate = sendPageData;

  console.log('[Hell Content] Content script initialized');
})();
