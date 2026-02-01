/**
 * Test Case 3: Storage Leak Detection
 *
 * Verifies that tab-specific data doesn't leak between tabs via:
 * - chrome.storage.local
 * - Sidebar state
 * - Note persistence
 *
 * Each tab should have isolated state.
 */

import {
  createHellContext,
  cleanupHellContext,
  getSidePanelPage,
  type HellFixtures
} from './fixtures';

async function test_storage_leak() {
  console.log('='.repeat(60));
  console.log('TEST: storage_leak');
  console.log('='.repeat(60));

  let fixtures: HellFixtures | null = null;

  try {
    console.log('[Test] Creating context with extension...');
    fixtures = await createHellContext();

    const sidePanel = await getSidePanelPage(fixtures);

    // Test 1: Note isolation between tabs
    console.log('[Test] Testing note isolation...');

    // Write note on Tab A
    await fixtures.pageA.bringToFront();
    await new Promise(r => setTimeout(r, 500));

    if (sidePanel) {
      await sidePanel.fill('#tab-note', 'This is a secret note for Tab A only!');
      console.log('[Test] Wrote note on Tab A');

      await new Promise(r => setTimeout(r, 600)); // Wait for debounced save
    }

    // Switch to Tab B
    await fixtures.pageB.bringToFront();
    await new Promise(r => setTimeout(r, 500));

    if (sidePanel) {
      const noteOnB = await sidePanel.$eval('#tab-note', (el: HTMLTextAreaElement) => el.value).catch(() => '');
      console.log(`[Test] Note value on Tab B: "${noteOnB}"`);

      if (noteOnB === '') {
        console.log('[PASS] Tab B does not see Tab A\'s note');
      } else if (noteOnB.includes('Tab A')) {
        console.log('[FAIL] Tab A\'s note leaked to Tab B - STORAGE LEAK DETECTED');
      } else {
        console.log(`[INFO] Tab B has its own note: "${noteOnB}"`);
      }

      // Write different note on Tab B
      await sidePanel.fill('#tab-note', 'Tab B has its own private note');
      console.log('[Test] Wrote note on Tab B');

      await new Promise(r => setTimeout(r, 600));
    }

    // Switch to Tab C
    await fixtures.pageC.bringToFront();
    await new Promise(r => setTimeout(r, 500));

    if (sidePanel) {
      const noteOnC = await sidePanel.$eval('#tab-note', (el: HTMLTextAreaElement) => el.value).catch(() => '');
      console.log(`[Test] Note value on Tab C: "${noteOnC}"`);

      if (noteOnC === '') {
        console.log('[PASS] Tab C does not see Tab A or B\'s notes');
      } else {
        console.log(`[FAIL] Note leaked to Tab C: "${noteOnC}"`);
      }
    }

    // Test 2: Return to Tab A, verify note persisted
    console.log('[Test] Returning to Tab A to verify persistence...');

    await fixtures.pageA.bringToFront();
    await new Promise(r => setTimeout(r, 500));

    if (sidePanel) {
      const noteOnA = await sidePanel.$eval('#tab-note', (el: HTMLTextAreaElement) => el.value).catch(() => '');
      console.log(`[Test] Note value on Tab A after return: "${noteOnA}"`);

      if (noteOnA.includes('Tab A')) {
        console.log('[PASS] Tab A\'s note persisted across tab switches');
      } else {
        console.log(`[FAIL] Tab A\'s note was lost: "${noteOnA}"`);
      }
    }

    // Test 3: Close Tab B and check for zombie state
    console.log('[Test] Closing Tab B to test zombie state handling...');

    await fixtures.pageB.close();
    console.log('[Test] Tab B closed');

    await new Promise(r => setTimeout(r, 500));

    // We should now be on Tab A or Tab C
    if (sidePanel) {
      const statusBadge = await sidePanel.$eval('#status-badge', el => el.textContent).catch(() => '');
      console.log(`[Test] Status after Tab B close: ${statusBadge}`);

      if (statusBadge === 'Zombie') {
        console.log('[WARN] Zombie mode detected - sidebar showing stale Tab B data');
      } else {
        console.log('[INFO] Status appears normal after tab close');
      }

      // Check what page ID is shown
      const pageId = await sidePanel.$eval('#display-page-id', el => el.textContent).catch(() => null);
      console.log(`[Test] Displayed Page ID after Tab B close: ${pageId}`);

      if (pageId === 'BETA') {
        console.log('[FAIL] ZOMBIE STATE - Still showing BETA after Tab B was closed!');
      } else if (pageId === 'ALPHA' || pageId === 'GAMMA') {
        console.log('[PASS] Correctly showing active tab after Tab B close');
      }
    }

    // Test 4: Enable zombie mode and test
    console.log('[Test] Testing deliberate zombie mode...');

    if (sidePanel) {
      // Enable zombie mode
      await sidePanel.click('#btn-zombie').catch(() => {});
      console.log('[Test] Zombie mode enabled');
    }

    // Open a new tab, navigate, then close it
    const tempPage = await fixtures.context.newPage();
    await tempPage.goto('http://localhost:6662/page-c.html');
    await new Promise(r => setTimeout(r, 500));

    await tempPage.bringToFront();
    await new Promise(r => setTimeout(r, 500));

    // Now close it with zombie mode on
    await tempPage.close();
    console.log('[Test] Closed temp tab with zombie mode enabled');

    await new Promise(r => setTimeout(r, 500));

    if (sidePanel) {
      const statusBadge = await sidePanel.$eval('#status-badge', el => el.textContent).catch(() => '');
      console.log(`[Test] Status with zombie mode: ${statusBadge}`);

      if (statusBadge === 'Zombie') {
        console.log('[EXPECTED] Zombie mode correctly shows zombie state');
      }

      // Disable zombie mode
      await sidePanel.click('#btn-zombie').catch(() => {});
    }

    console.log('[Test] storage_leak complete');

  } catch (error) {
    console.error('[ERROR]', error);
  } finally {
    if (fixtures) {
      await cleanupHellContext(fixtures);
    }
  }
}

test_storage_leak().catch(console.error);

export { test_storage_leak };
