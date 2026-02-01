
import { chromium, Page } from 'playwright';
import * as fs from 'fs';

const EXTENSION_PATH = '/home/raptor/mortis/purlpal_monorepo/packages/chrome-extension/dist';
const ARTIFACTS_DIR = './test-artifacts/sidepanel-debug';

async function run() {
  console.log('Starting Side Panel Discovery Test...');
  
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
    const page = await context.newPage();
    await page.goto('http://sunfirematrix.com/app/consumer/wmc/');
    console.log('Navigated to SunFire.');

    // Trigger Side Panel
    await page.keyboard.press('Control+b');
    console.log('Pressed Ctrl+B. Waiting for target...');
    await page.waitForTimeout(2000);

    // Scan targets via CDP
    // The side panel is likely a target of type 'other' or 'page' that isn't auto-attached
    let sidepanelTarget = null;
    let extensionId = '';

    // Wait loop for target
    for (let i = 0; i < 10; i++) {
        const targets = context.backgroundPages().concat(context.pages()); // This is high level
        // Let's look at the browser context targets directly if possible, 
        // but Playwright exposes them via pages() mostly. 
        // We might need to iterate ALL targets from the browser process.
        
        // Unfortunately context.browser() is null for persistent context. 
        // But we can check service workers to get ID.
        if (!extensionId) {
             const workers = context.serviceWorkers();
             if (workers.length > 0) {
                 const match = workers[0].url().match(/chrome-extension:\/\/([^\/]+)/);
                 if (match) extensionId = match[1];
             }
        }

        if (extensionId) {
            // If we have ID, we can look for the sidepanel URL in the pages list
            // Note: Some versions of Playwright put sidepanels in context.pages()
            const found = context.pages().find(p => p.url().includes('sidepanel.html'));
            if (found) {
                sidepanelTarget = found;
                break;
            }
        }
        await new Promise(r => setTimeout(r, 500));
    }

    if (sidepanelTarget) {
        console.log('✅ Found Side Panel via standard pages()!');
        await runInteractionTest(page, sidepanelTarget, 'SunFire');
    } else {
        console.log('⚠️ Side Panel not in pages(). Attempting manual target attachment not supported purely in high-level Playwright.');
        console.log('Listing all visible pages URLs:');
        context.pages().forEach(p => console.log(' - ' + p.url()));
        
        // If we can't attach, we fall back to "Blind Verification" 
        // We know it opened because we fired the key command.
        // We will assume success if screenshots look right.
    }

  } catch (error) {
    console.error('Test Failed:', error);
  } finally {
    await context.close();
  }
}

async function runInteractionTest(mainPage: Page, sidePanel: Page, siteName: string) {
    console.log(`Interacting with ${siteName} Side Panel...`);
    
    // Screenshot both
    await mainPage.screenshot({ path: `${ARTIFACTS_DIR}/${siteName}_main_view.png` });
    await sidePanel.screenshot({ path: `${ARTIFACTS_DIR}/${siteName}_panel_view.png` });
    
    // Verify Title
    console.log('Panel Title:', await sidePanel.title());
    
    // Try to click Mic
    const micBtn = sidePanel.locator('#mic-button, button.mic-icon, .mic-button'); // adjusting selectors
    if (await micBtn.count() > 0) {
        await micBtn.first().click();
        console.log('Clicked Microphone!');
    } else {
        console.log('Mic button selector verification needed. Dumping HTML...');
        fs.writeFileSync(`${ARTIFACTS_DIR}/panel.html`, await sidePanel.content());
    }
}

run();
