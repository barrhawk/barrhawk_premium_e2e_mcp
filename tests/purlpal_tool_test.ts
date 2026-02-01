
import { chromium, Page } from 'playwright';
import * as fs from 'fs';

const EXTENSION_PATH = '/home/raptor/mortis/purlpal_monorepo/packages/chrome-extension/dist';
const ARTIFACTS_DIR = './test-artifacts/tool-verification';

async function run() {
  console.log('Starting Extension Tool Verification Test...');
  
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
    const page = await context.newPage();
    const targetUrl = 'http://sunfirematrix.com/app/consumer/wmc/';
    await page.goto(targetUrl);
    console.log(`Navigated to ${targetUrl}`);

    // Wait for content script to load
    await page.waitForTimeout(3000);

    // 1. TEST: extract_page_info
    console.log('Testing tool: extract_page_info...');
    const pageInfo = await page.evaluate(async () => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'EXECUTE_TOOL',
          tool: 'extract_page_info',
          args: {}
        }, (response) => {
          resolve(response);
        });
      });
    });

    console.log('Page Info Result:', JSON.stringify(pageInfo, null, 2));
    fs.writeFileSync(`${ARTIFACTS_DIR}/extract_page_info.json`, JSON.stringify(pageInfo, null, 2));

    // 2. TEST: fill_zip_code
    console.log('Testing tool: fill_zip_code...');
    const zipCode = '90210';
    const fillResult = await page.evaluate(async (zip) => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'EXECUTE_TOOL',
          tool: 'fill_zip_code',
          args: { zipCode: zip }
        }, (response) => {
          resolve(response);
        });
      });
    }, zipCode);

    console.log('Fill ZIP Result:', JSON.stringify(fillResult, null, 2));
    fs.writeFileSync(`${ARTIFACTS_DIR}/fill_zip_code.json`, JSON.stringify(fillResult, null, 2));

    // Take screenshot to visually verify ZIP code is in the field
    await page.screenshot({ path: `${ARTIFACTS_DIR}/sunfire_zip_filled.png` });
    console.log('Screenshot saved: sunfire_zip_filled.png');

    // 3. TEST: click_continue (but don't actually navigate away too fast)
    // We'll just verify it finds the button
    console.log('Testing tool: click_continue...');
    const clickResult = await page.evaluate(async () => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'EXECUTE_TOOL',
          tool: 'click_continue',
          args: { buttonText: 'Find plans' }
        }, (response) => {
          resolve(response);
        });
      });
    });
    console.log('Click Continue Result:', JSON.stringify(clickResult, null, 2));

    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${ARTIFACTS_DIR}/sunfire_after_click.png` });

    console.log('Tool Verification Complete!');

  } catch (error) {
    console.error('Test Failed:', error);
  } finally {
    await context.close();
  }
}

run();
