
import { chromium, Page } from 'playwright';
import * as fs from 'fs';

const EXTENSION_PATH = '/home/raptor/mortis/purlpal_monorepo/packages/chrome-extension/dist';
const ARTIFACTS_DIR = './test-artifacts/signup-journey';

// Helper to execute a tool on the page as if the AI sent it
async function executeTool(page: Page, toolName: string, args: any) {
  console.log(`🤖 AI AGENT: Executing ${toolName}`, args);
  try {
      return await page.evaluate(async ({ tool, args }) => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage({
            type: 'EXECUTE_TOOL',
            tool: tool,
            args: args
          }, (response) => {
            resolve(response);
          });
        });
      }, { tool: toolName, args });
  } catch (e) {
      console.log(`   ⚠️ Tool execution failed: ${e}`);
      return { success: false, error: e };
  }
}

async function run() {
  console.log('🚀 Starting PURL Pal Agentic Signup Journey (Resilient Mode)...');
  
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }

  const context = await chromium.launchPersistentContext('/tmp/chrome-profile-journey', {
    headless: false,
    slowMo: 500,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ]
  });

  try {
    const page = await context.newPage();
    
    // --- STEP 1: LANDING ---
    console.log('\n📍 STEP 1: Navigation');
    try {
        await page.goto('https://www.medicare.gov/plan-compare/#/?year=2026&lang=en', { timeout: 45000, waitUntil: 'domcontentloaded' });
        // Optional: Wait for specific element to ensure app loaded
        await page.waitForSelector('input[name="zipcode"]', { timeout: 10000 }).catch(() => console.log('   Note: Zip input not immediately found via selector wait'));
    } catch (e) {
        console.log(`   Note: Navigation timeout/issue: ${e}`);
    }
    await page.waitForTimeout(2000); // Settling time
    await page.screenshot({ path: `${ARTIFACTS_DIR}/01_landing.png` });

    // --- STEP 2: ZIP CODE ---
    console.log('\n📍 STEP 2: Enter Zip Code (90210)');
    const zipResult = await executeTool(page, 'medicare_zip', { zipCode: '90210' });
    console.log('   Result:', JSON.stringify(zipResult));
    
    await page.waitForTimeout(5000); // Allow react transition
    await page.screenshot({ path: `${ARTIFACTS_DIR}/02_after_zip.png` });

    // --- STEP 3: PLAN TYPE ---
    console.log('\n📍 STEP 3: Select Plan Type (Medicare Advantage)');
    const typeResult = await executeTool(page, 'medicare_plan_type', { planType: 'advantage' });
    console.log('   Result:', JSON.stringify(typeResult));
    
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${ARTIFACTS_DIR}/03_after_type.png` });

    // --- STEP 4: EXTRA HELP ---
    console.log('\n📍 STEP 4: Extra Help (None)');
    const helpResult = await executeTool(page, 'medicare_extra_help', { helpType: 'none' });
    console.log('   Result:', JSON.stringify(helpResult));

    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${ARTIFACTS_DIR}/04_after_help.png` });

    // --- STEP 5: DRUG COVERAGE ---
    console.log('\n📍 STEP 5: Handling "Add Drugs" Question');
    // Try to find the "No" radio button for drugs using generic selectors if we are on that page
    try {
        // Wait briefly to see if we are on the drug page
        const drugText = await page.getByText('Do you want to see your drug costs?').isVisible().catch(() => false);
        if (drugText) {
             console.log('   Drug page detected. Selecting "No"...');
             // Try clicking the label for "No"
             await page.click('label:has-text("No")').catch(() => console.log('   Could not click "No" label'));
             
             // Then click continue tool
             await executeTool(page, 'click_continue', {});
        } else {
             console.log('   Drug page NOT detected (might have skipped or different flow).');
        }
    } catch (e) {
        console.log('   ⚠️ Error handling drug step:', e);
    }
    
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${ARTIFACTS_DIR}/05_results_landing.png` });

    // --- STEP 6: SORT RESULTS ---
    console.log('\n📍 STEP 6: Sort by Lowest Premium');
    // Verify we are on results page
    const isResults = await page.url().includes('plan-results');
    if (isResults) {
        const sortResult = await executeTool(page, 'medicare_sort', { sortBy: 'Lowest monthly premium' });
        console.log('   Result:', JSON.stringify(sortResult));
        await page.waitForTimeout(3000);
        await page.screenshot({ path: `${ARTIFACTS_DIR}/06_sorted.png` });
    } else {
        console.log('   ⚠️ Not on results page, skipping sort.');
    }

    // --- STEP 7: HIGHLIGHT PLAN ---
    console.log('\n📍 STEP 7: Highlight Top Plan');
    if (isResults) {
        const highlightResult = await executeTool(page, 'medicare_highlight_plan', { planIdentifier: '1' });
        console.log('   Result:', JSON.stringify(highlightResult));
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `${ARTIFACTS_DIR}/07_highlighted.png` });
    }

    // --- STEP 8: EXTRACT PAGE INFO ---
    console.log('\n📍 STEP 8: Analyze Page Results');
    const infoResult = await executeTool(page, 'extract_page_info', {});
    console.log('   Summary:', infoResult.summary || 'No summary');
    fs.writeFileSync(`${ARTIFACTS_DIR}/final_page_info.json`, JSON.stringify(infoResult, null, 2));

    console.log('\n✅ Signup Journey Complete!');

  } catch (error) {
    console.error('❌ Journey Failed:', error);
    if (context.pages().length > 0) {
        await context.pages()[0].screenshot({ path: `${ARTIFACTS_DIR}/failure.png` });
    }
  } finally {
    await context.close();
  }
}

run();
