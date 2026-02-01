/**
 * Test Case 1: Sidebar Sync to Tab
 *
 * Verifies that the sidebar correctly displays data for the active tab.
 * This is the basic 1:1 mapping test.
 */

import {
  createHellContext,
  cleanupHellContext,
  getSidePanelPage,
  type HellFixtures
} from './fixtures';

async function test_sync_sidebar_to_tab() {
  console.log('='.repeat(60));
  console.log('TEST: sync_sidebar_to_tab');
  console.log('='.repeat(60));

  let fixtures: HellFixtures | null = null;

  try {
    // Setup
    console.log('[Test] Creating context with extension...');
    fixtures = await createHellContext();

    // Test 1: Focus Tab A, verify sidebar shows ALPHA
    console.log('[Test] Focusing Page A...');
    await fixtures.pageA.bringToFront();
    await new Promise(r => setTimeout(r, 1000)); // Wait for sync

    const sidePanel = await getSidePanelPage(fixtures);
    if (sidePanel) {
      const pageId = await sidePanel.$eval('#display-page-id', el => el.textContent).catch(() => null);
      console.log(`[Test] Sidebar shows Page ID: ${pageId}`);

      if (pageId === 'ALPHA') {
        console.log('[PASS] Sidebar correctly shows ALPHA for Tab A');
      } else {
        console.log(`[FAIL] Expected ALPHA, got ${pageId}`);
      }
    } else {
      console.log('[SKIP] Side panel not accessible - manual verification needed');
    }

    // Test 2: Focus Tab B, verify sidebar shows BETA
    console.log('[Test] Focusing Page B...');
    await fixtures.pageB.bringToFront();
    await new Promise(r => setTimeout(r, 1000));

    if (sidePanel) {
      const pageId = await sidePanel.$eval('#display-page-id', el => el.textContent).catch(() => null);
      console.log(`[Test] Sidebar shows Page ID: ${pageId}`);

      if (pageId === 'BETA') {
        console.log('[PASS] Sidebar correctly shows BETA for Tab B');
      } else {
        console.log(`[FAIL] Expected BETA, got ${pageId}`);
      }
    }

    // Test 3: Focus Tab C, verify sidebar shows GAMMA
    console.log('[Test] Focusing Page C...');
    await fixtures.pageC.bringToFront();
    await new Promise(r => setTimeout(r, 1000));

    if (sidePanel) {
      const pageId = await sidePanel.$eval('#display-page-id', el => el.textContent).catch(() => null);
      console.log(`[Test] Sidebar shows Page ID: ${pageId}`);

      if (pageId === 'GAMMA') {
        console.log('[PASS] Sidebar correctly shows GAMMA for Tab C');
      } else {
        console.log(`[FAIL] Expected GAMMA, got ${pageId}`);
      }
    }

    // Test 4: Return to Tab A, verify it still shows ALPHA
    console.log('[Test] Returning to Page A...');
    await fixtures.pageA.bringToFront();
    await new Promise(r => setTimeout(r, 1000));

    if (sidePanel) {
      const pageId = await sidePanel.$eval('#display-page-id', el => el.textContent).catch(() => null);
      console.log(`[Test] Sidebar shows Page ID: ${pageId}`);

      if (pageId === 'ALPHA') {
        console.log('[PASS] Sidebar correctly returns to ALPHA');
      } else {
        console.log(`[FAIL] Expected ALPHA on return, got ${pageId}`);
      }
    }

    console.log('[Test] sync_sidebar_to_tab complete');

  } catch (error) {
    console.error('[ERROR]', error);
  } finally {
    if (fixtures) {
      await cleanupHellContext(fixtures);
    }
  }
}

// Run if executed directly
test_sync_sidebar_to_tab().catch(console.error);

export { test_sync_sidebar_to_tab };
