
import { chromium, Page } from 'playwright';
import * as fs from 'fs';

const EXTENSION_PATH = '/home/raptor/mortis/purlpal_monorepo/packages/chrome-extension/dist';
const ARTIFACTS_DIR = './test-artifacts/sites-interactive';

async function run() {
  console.log('Starting Interactive Side Panel Test...');
  
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
    // Wait for extension
    await new Promise(r => setTimeout(r, 2000));

    // --- TEST: MEDICARE.GOV ---
    console.log('\n--- Testing Medicare.gov Interaction ---');
    
    const page = await context.newPage();
    await page.goto('https://www.medicare.gov/plan-compare/#/?year=2026&lang=en');
    console.log('Navigated to Medicare.gov');

    // Trigger Side Panel
    await page.keyboard.press('Control+b');
    console.log('Triggered Side Panel (Ctrl+B)');
    await page.waitForTimeout(3000); 

    // ROBUST SIDE PANEL DETECTION
    // We iterate through all pages again, but we can also try to wait for it.
    let sidePanel: Page | undefined;
    
    console.log('Searching for Side Panel...');
    for (let i = 0; i < 10; i++) {
        // Log all URLs for debugging
        const pages = context.pages();
        // console.log('Open pages:', pages.map(p => p.url()));
        
        sidePanel = pages.find(p => p.url().includes('sidepanel.html'));
        if (sidePanel) break;
        await new Promise(r => setTimeout(r, 1000));
    }

    if (!sidePanel) {
        throw new Error('Could not find Side Panel after waiting 10s');
    }

    console.log('✅ Side Panel Connected!');
    
    // INTERACT
    // 1. Check Title
    console.log('Side Panel Title:', await sidePanel.title());
    
    // 2. Click Microphone (Toggle)
    // Looking at the HTML/React code from before might help, but let's try generic selectors first
    // typically button with mic icon
    const micSelector = 'button.mic-button, button[aria-label="Toggle microphone"], button:has(svg)'; 
    
    // Take screenshot BEFORE interaction
    await sidePanel.screenshot({ path: `${ARTIFACTS_DIR}/before_click.png` });
    
    // Try to find the mic button
    // We might need to be more specific if there are many buttons
    // Let's dump the HTML if we fail
    try {
        const btn = sidePanel.locator(micSelector).first();
        if (await btn.isVisible()) {
            console.log('Found Microphone button, clicking...');
            await btn.click();
            console.log('Clicked Microphone!');
            await page.waitForTimeout(1000);
            await sidePanel.screenshot({ path: `${ARTIFACTS_DIR}/after_click.png` });
            console.log('Interaction successful!');
        } else {
            console.log('Microphone button not visible.');
            const html = await sidePanel.content();
            fs.writeFileSync(`${ARTIFACTS_DIR}/sidepanel_dump.html`, html);
            console.log('Dumped HTML to sidepanel_dump.html');
        }
    } catch (e) {
        console.log('Interaction error:', e);
    }

  } catch (error) {
    console.error('Test Failed:', error);
  } finally {
    await context.close();
  }
}

run();
