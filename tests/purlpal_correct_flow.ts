
import { chromium, Page } from 'playwright';
import * as fs from 'fs';

const EXTENSION_PATH = '/home/raptor/mortis/purlpal_monorepo/packages/chrome-extension/dist';
const ARTIFACTS_DIR = './test-artifacts/correct-flow';

async function run() {
  console.log('Starting Correct Flow Test...');
  
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }

  const context = await chromium.launchPersistentContext('/tmp/chrome-profile-correct', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream'
    ],
    permissions: ['microphone', 'camera']
  });

  try {
    // 1. Handle Auto-Open Onboarding
    console.log('Waiting for auto-opened onboarding page...');
    let onboardingPage: Page | undefined;
    
    // Give it a moment to spawn
    await new Promise(r => setTimeout(r, 2000));
    
    const pages = context.pages();
    onboardingPage = pages.find(p => p.url().includes('onboarding.html'));

    if (onboardingPage) {
        console.log('Found Onboarding page. Closing it to free context...');
        await onboardingPage.close();
        console.log('Onboarding page closed.');
    } else {
        console.log('Onboarding page not found (maybe profile persisted). Continuing...');
    }

    // 2. Open SunFire in a clean tab
    const page = await context.newPage();
    await page.goto('http://sunfirematrix.com/app/consumer/wmc/');
    console.log('Navigated to SunFire.');
    
    // Ensure it's focused
    await page.bringToFront();
    
    // 3. Trigger Side Panel
    console.log('Triggering Side Panel (Ctrl+B) on SunFire...');
    await page.keyboard.press('Control+b');
    await page.waitForTimeout(3000); // Wait for animation/load

    // 4. Verification
    // Since we can't easily "get" the sidepanel handle in Playwright, 
    // we verify by checking if the viewport of the main page reacted 
    // OR by checking visual screenshot.
    
    await page.screenshot({ path: `${ARTIFACTS_DIR}/sunfire_with_panel.png` });
    console.log('Screenshot captured. Check if side panel is visible.');
    
    // 5. Check Service Worker Logs (if possible) to confirm 'Side panel opened'
    // This is hard to do programmatically without attaching to SW target, 
    // but the screenshot is the best user-proxy proof.

  } catch (error) {
    console.error('Test Failed:', error);
  } finally {
    await context.close();
  }
}

run();
