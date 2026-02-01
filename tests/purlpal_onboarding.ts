
import { chromium, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

const EXTENSION_PATH = '/home/raptor/mortis/purlpal_monorepo/packages/chrome-extension/dist';
const ARTIFACTS_DIR = './test-artifacts/onboarding';

async function run() {
  console.log('Starting PURL Pal Onboarding Test...');
  
  // Ensure artifacts dir exists
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }

  const context = await chromium.launchPersistentContext('/tmp/chrome-profile-onboarding', {
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
    let onboardingPage: Page | null = null;
    
    // 1. Wait for onboarding page
    console.log('Waiting for onboarding page...');
    for (let i = 0; i < 10; i++) {
      const pages = context.pages();
      onboardingPage = pages.find(p => p.url().includes('onboarding.html')) || null;
      if (onboardingPage) break;
      await new Promise(r => setTimeout(r, 1000));
    }

    // 2. If not found, find ID and navigate
    if (!onboardingPage) {
      console.log('Finding extension ID...');
      let extensionId = '';
      for (let i = 0; i < 10; i++) {
        const workers = context.serviceWorkers();
        if (workers.length > 0) {
           const url = workers[0].url();
           const match = url.match(/chrome-extension:\/\/([^\/]+)/);
           if (match) {
             extensionId = match[1];
             break;
           }
        }
        await new Promise(r => setTimeout(r, 500));
      }
      
      if (!extensionId) {
          const pages = context.pages();
          for (const p of pages) {
             const match = p.url().match(/chrome-extension:\/\/([^\/]+)/);
             if (match) {
               extensionId = match[1];
               break;
             }
          }
      }

      if (!extensionId) throw new Error('Could not determine extension ID');

      console.log(`Extension ID: ${extensionId}`);
      onboardingPage = await context.newPage();
      await onboardingPage.goto(`chrome-extension://${extensionId}/onboarding.html`);
    }

    if (!onboardingPage) throw new Error('Failed to access onboarding page');

    console.log('Onboarding page loaded.');
    await onboardingPage.bringToFront();
    await onboardingPage.screenshot({ path: `${ARTIFACTS_DIR}/step1_start.png` });

    // --- STEP 1: Permissions ---
    console.log('Executing Step 1: Permissions...');
    
    const micBtn = onboardingPage.locator('#enableMicBtn');
    if (await micBtn.isDisabled()) {
        console.log('Mic button already disabled');
    } else {
        await micBtn.click();
        console.log('Clicked Enable Mic');
        await onboardingPage.waitForTimeout(500); 
    }
    
    const camBtn = onboardingPage.locator('#enableCameraBtn');
    if (await camBtn.isDisabled()) {
         console.log('Camera button already disabled');
    } else {
        await camBtn.click();
        console.log('Clicked Enable Camera');
        await onboardingPage.waitForTimeout(500);
    }

    await onboardingPage.screenshot({ path: `${ARTIFACTS_DIR}/step1_done.png` });

    // Next
    await onboardingPage.click('#nextBtn');
    console.log('Clicked Next');
    await onboardingPage.waitForTimeout(1000);

    // --- STEP 2: Terms ---
    console.log('Executing Step 2: Terms...');
    await onboardingPage.screenshot({ path: `${ARTIFACTS_DIR}/step2_start.png` });

    // SCROLL TERMS
    console.log('Scrolling terms...');
    await onboardingPage.evaluate(() => {
        const terms = document.querySelector('#termsScroll');
        if (terms) terms.scrollTop = terms.scrollHeight;
    });
    await onboardingPage.waitForTimeout(500);

    // Check checkboxes
    await onboardingPage.check('#readTermsCheckbox');
    await onboardingPage.check('#agreeTermsCheckbox');
    console.log('Accepted Terms');
    
    await onboardingPage.screenshot({ path: `${ARTIFACTS_DIR}/step2_done.png` });

    // Check Button State
    const nextBtnStep2 = onboardingPage.locator('#nextBtn');
    const isDisabled = await nextBtnStep2.isDisabled();
    console.log(`Step 2 Next Button Disabled: ${isDisabled}`);
    
    if (isDisabled) {
        // Maybe try clicking checkboxes again or triggering change?
        console.log('Retrying checkboxes...');
        await onboardingPage.uncheck('#readTermsCheckbox');
        await onboardingPage.uncheck('#agreeTermsCheckbox');
        await onboardingPage.waitForTimeout(200);
        await onboardingPage.check('#readTermsCheckbox');
        await onboardingPage.check('#agreeTermsCheckbox');
    }

    // Next
    await onboardingPage.click('#nextBtn');
    console.log('Clicked Next');
    await onboardingPage.waitForTimeout(1000);

    // --- STEP 3: Finish ---
    console.log('Executing Step 3: Finish...');
    await onboardingPage.screenshot({ path: `${ARTIFACTS_DIR}/step3_start.png` });

    const finishVisible = await onboardingPage.isVisible('#finishBtn');
    console.log(`Finish button visible: ${finishVisible}`);
    
    if (finishVisible) {
        await onboardingPage.click('#finishBtn');
    } else {
        // Some flows might use nextBtn text change
        await onboardingPage.click('#nextBtn');
    }
    console.log('Clicked Finish/Next');
    
    await onboardingPage.waitForTimeout(2000);
    await onboardingPage.screenshot({ path: `${ARTIFACTS_DIR}/final_state.png` });
    
    console.log('Test Complete!');

  } catch (error) {
    console.error('Test Failed:', error);
    if (context.pages().length > 0) {
        await context.pages()[0].screenshot({ path: `${ARTIFACTS_DIR}/error_state.png` });
    }
  } finally {
    await context.close();
  }
}

run();
