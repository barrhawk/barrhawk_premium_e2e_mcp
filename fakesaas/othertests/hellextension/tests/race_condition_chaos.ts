/**
 * Test Case 2: Race Condition Chaos
 *
 * Attempts to break the sidebar by inducing race conditions:
 * - Rapid tab switching
 * - Network delays
 * - Concurrent updates
 *
 * The sidebar should always show the CORRECT current tab, never stale data.
 */

import {
  createHellContext,
  cleanupHellContext,
  getSidePanelPage,
  rapidTabSwitch,
  type HellFixtures
} from './fixtures';

async function test_race_condition_chaos() {
  console.log('='.repeat(60));
  console.log('TEST: race_condition_chaos');
  console.log('='.repeat(60));

  let fixtures: HellFixtures | null = null;

  try {
    console.log('[Test] Creating context with extension...');
    fixtures = await createHellContext();

    const sidePanel = await getSidePanelPage(fixtures);

    // Test 1: Rapid tab switching (10 switches, 100ms apart)
    console.log('[Test] Starting rapid tab switch test...');
    console.log('[Test] Switching A -> B -> C -> A -> B -> C -> A -> B -> C -> A');

    const startPage = fixtures.pageA;
    const expectedFinal = 'ALPHA'; // We end on pageA

    await rapidTabSwitch(fixtures, 10, 100);

    // Final state should be Tab A (index 10 % 3 = 1, but let's end on A)
    await fixtures.pageA.bringToFront();
    await new Promise(r => setTimeout(r, 500));

    if (sidePanel) {
      const pageId = await sidePanel.$eval('#display-page-id', el => el.textContent).catch(() => null);
      console.log(`[Test] After rapid switch, sidebar shows: ${pageId}`);

      if (pageId === 'ALPHA') {
        console.log('[PASS] Sidebar correctly shows final tab after rapid switching');
      } else {
        console.log(`[FAIL] Expected ALPHA, got ${pageId} - RACE CONDITION DETECTED`);
      }
    } else {
      console.log('[SKIP] Side panel not accessible');
    }

    // Test 2: Enable network delay and switch tabs
    console.log('[Test] Enabling network delay chaos...');

    // Click the delay button in sidebar to enable 2s delay
    if (sidePanel) {
      await sidePanel.click('#btn-delay').catch(() => {});
      console.log('[Test] Network delay enabled (2000ms)');
    }

    // Now switch tabs rapidly - the slow responses from old tabs should be ignored
    console.log('[Test] Switching with network delay active...');

    await fixtures.pageB.bringToFront();
    await new Promise(r => setTimeout(r, 100)); // Don't wait for delay to complete

    await fixtures.pageC.bringToFront();
    await new Promise(r => setTimeout(r, 100));

    await fixtures.pageA.bringToFront();
    await new Promise(r => setTimeout(r, 3000)); // Wait for all delayed responses

    if (sidePanel) {
      const pageId = await sidePanel.$eval('#display-page-id', el => el.textContent).catch(() => null);
      console.log(`[Test] After delayed responses, sidebar shows: ${pageId}`);

      if (pageId === 'ALPHA') {
        console.log('[PASS] Stale delayed responses were correctly ignored');
      } else {
        console.log(`[FAIL] Expected ALPHA, got ${pageId} - STALE DATA DISPLAYED`);
      }

      // Disable delay
      await sidePanel.click('#btn-delay').catch(() => {});
    }

    // Test 3: Trigger slow load on Page B, then immediately switch away
    console.log('[Test] Testing slow load race condition...');

    await fixtures.pageB.bringToFront();
    await new Promise(r => setTimeout(r, 500));

    // Click "Simulate 3s Load" button
    await fixtures.pageB.click('button:has-text("Simulate 3s Load")');
    console.log('[Test] Triggered 3s slow load on Page B');

    // Immediately switch to Page A
    await new Promise(r => setTimeout(r, 100));
    await fixtures.pageA.bringToFront();
    console.log('[Test] Switched to Page A during slow load');

    // Wait for slow load to complete
    await new Promise(r => setTimeout(r, 3500));

    if (sidePanel) {
      const pageId = await sidePanel.$eval('#display-page-id', el => el.textContent).catch(() => null);
      console.log(`[Test] After slow load completed on B, sidebar shows: ${pageId}`);

      if (pageId === 'ALPHA') {
        console.log('[PASS] Slow load from Page B did not overwrite Page A state');
      } else {
        console.log(`[FAIL] Expected ALPHA, got ${pageId} - SLOW LOAD CAUSED STATE LEAK`);
      }
    }

    // Test 4: Ultra-rapid switching (stress test)
    console.log('[Test] Ultra-rapid switching (50 iterations, 50ms apart)...');

    await rapidTabSwitch(fixtures, 50, 50);

    // End on a known tab
    await fixtures.pageC.bringToFront();
    await new Promise(r => setTimeout(r, 1000));

    if (sidePanel) {
      const pageId = await sidePanel.$eval('#display-page-id', el => el.textContent).catch(() => null);
      console.log(`[Test] After 50 rapid switches, sidebar shows: ${pageId}`);

      if (pageId === 'GAMMA') {
        console.log('[PASS] Survived ultra-rapid switching');
      } else {
        console.log(`[FAIL] Expected GAMMA, got ${pageId}`);
      }
    }

    console.log('[Test] race_condition_chaos complete');

  } catch (error) {
    console.error('[ERROR]', error);
  } finally {
    if (fixtures) {
      await cleanupHellContext(fixtures);
    }
  }
}

test_race_condition_chaos().catch(console.error);

export { test_race_condition_chaos };
