
import { chromium, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';

const EXTENSION_PATH = '/home/raptor/mortis/purlpal_monorepo/packages/chrome-extension/dist';
const ARTIFACTS_DIR = './test-artifacts/integration';

async function run() {
  console.log('Starting Full Integration Test (Sidepanel-as-Tab)...');
  
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }

  const context = await chromium.launchPersistentContext('/tmp/chrome-profile-onboarding', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ]
  });

  try {
    // 1. Get Extension ID
    let extensionId = '';
    console.log('Finding extension ID...');
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

    if (!extensionId) throw new Error('Could not find extension ID');
    console.log(`Extension ID: ${extensionId}`);

    // 2. Open Sunfire in Tab 1
    const sunfirePage = await context.newPage();
    await sunfirePage.goto('http://sunfirematrix.com/app/consumer/wmc/');
    console.log('Sunfire loaded in Tab 1');

    // 3. Open Sidepanel as a Tab in Tab 2
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    console.log('Sidepanel loaded as Tab 2');
    await sidepanelPage.waitForTimeout(2000);
    await sidepanelPage.screenshot({ path: `${ARTIFACTS_DIR}/sidepanel_initial.png` });

    // 4. Verify Sidepanel Content
    const content = await sidepanelPage.content();
    if (content.includes('PURL Pal') || content.includes('Assistant')) {
        console.log('✅ Sidepanel UI confirmed.');
    }

    // 5. Test "Fill ZIP" via UI (if button exists) or via message
    // Since we are in an extension page (sidepanel.html), we HAVE access to chrome.runtime
    console.log('Triggering fill_zip_code tool from Sidepanel Tab...');
    const result = await sidepanelPage.evaluate(async () => {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                type: 'EXECUTE_TOOL',
                tool: 'fill_zip_code',
                args: { zipCode: '90210' }
            }, (response) => {
                resolve(response);
            });
        });
    });

    console.log('Tool Result:', JSON.stringify(result, null, 2));

    // 6. Verify result on Sunfire Page
    await sunfirePage.bringToFront();
    await sunfirePage.waitForTimeout(1000);
    await sunfirePage.screenshot({ path: `${ARTIFACTS_DIR}/sunfire_verified.png` });
    
    // Check if zip value is actually there
    const zipValue = await sunfirePage.$eval('input#zip', (el: any) => el.value).catch(() => 'NOT FOUND');
    console.log(`Verified ZIP value in Sunfire: ${zipValue}`);

    if (zipValue === '90210') {
        console.log('🚀 SUCCESS: Holistic Integration Verified!');
    } else {
        console.log('⚠️ ZIP value mismatch or field not found.');
    }

  } catch (error) {
    console.error('Test Failed:', error);
  } finally {
    await context.close();
  }
}

run();
