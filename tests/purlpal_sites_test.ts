
import { chromium, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';

const EXTENSION_PATH = '/home/raptor/mortis/purlpal_monorepo/packages/chrome-extension/dist';
const ARTIFACTS_DIR = './test-artifacts/sites';

async function run() {
  console.log('Starting PURL Pal Sites Test (Simplified)...');
  
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }

  // Reuse profile
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
    // Wait briefly for extension to init
    await new Promise(r => setTimeout(r, 2000));

    // --- TEST 1: MEDICARE.GOV ---
    console.log('\n--- Testing Medicare.gov ---');
    let mediReport = '# Medicare.gov PURL Pal Test\n\n';
    
    const mediPage = await context.newPage();
    const mediUrl = 'https://www.medicare.gov/plan-compare/#/?year=2026&lang=en';
    await mediPage.goto(mediUrl);
    console.log('Navigated to Medicare.gov');
    mediReport += `- **URL**: ${mediUrl}\n- **Status**: Loaded successfully\n`;

    console.log('Triggering Side Panel (Ctrl+B)...');
    await mediPage.keyboard.press('Control+b');
    await mediPage.waitForTimeout(3000); 

    // Find Side Panel
    let sidePanel = context.pages().find(p => p.url().includes('sidepanel.html'));
    
    if (sidePanel) {
        console.log('Side Panel detected!');
        mediReport += `- **Side Panel**: ✅ Detected\n`;
        const title = await sidePanel.title();
        mediReport += `- **Panel Title**: "${title}"\n`;
        
        await sidePanel.screenshot({ path: `${ARTIFACTS_DIR}/medicare_sidepanel.png` });
        mediReport += `- **Screenshot**: Saved to 	este-artifacts/sites/medicare_sidepanel.png\n
`;
    } else {
        console.log('Side Panel NOT detected (checking strictly pages)');
        mediReport += `- **Side Panel**: ⚠️ Not found in context pages (Visual check required)\n`;
    }
    
    await mediPage.screenshot({ path: `${ARTIFACTS_DIR}/medicare_main.png` });
    fs.writeFileSync('mediresult.md', mediReport);
    console.log('Saved mediresult.md');
    
    // Don't close mediPage yet, keep it open while testing SunFire to mimic multi-tab usage? 
    // Or close it. Let's close it to keep clean.
    await mediPage.close();


    // --- TEST 2: SUNFIRE ---
    console.log('\n--- Testing SunFire ---');
    let sunReport = '# SunFire PURL Pal Test\n\n';
    
    const sunPage = await context.newPage();
    const sunUrl = 'http://sunfirematrix.com/app/consumer/wmc/';
    await sunPage.goto(sunUrl);
    console.log('Navigated to SunFire');
    sunReport += `- **URL**: ${sunUrl}\n- **Status**: Loaded successfully\n`;

    console.log('Triggering Side Panel...');
    await sunPage.keyboard.press('Control+b');
    await sunPage.waitForTimeout(3000);

    sidePanel = context.pages().find(p => p.url().includes('sidepanel.html'));

    if (sidePanel) {
        console.log('Side Panel detected!');
        sunReport += `- **Side Panel**: ✅ Detected\n`;
        await sidePanel.screenshot({ path: `${ARTIFACTS_DIR}/sunfire_sidepanel.png` });
        sunReport += `- **Screenshot**: Saved to 	este-artifacts/sites/sunfire_sidepanel.png\n`;
    } else {
        sunReport += `- **Side Panel**: ⚠️ Not found in context pages\n`;
    }
    
    await sunPage.screenshot({ path: `${ARTIFACTS_DIR}/sunfire_main.png` });
    fs.writeFileSync('sunresult.md', sunReport);
    console.log('Saved sunresult.md');

  } catch (error) {
    console.error('Test Failed:', error);
  } finally {
    await context.close();
  }
}

run();
