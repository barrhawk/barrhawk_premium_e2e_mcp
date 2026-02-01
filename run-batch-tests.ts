import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { getObservabilityStore } from './packages/observability/index.js';
import { getFlakyDetector } from './packages/premium/flaky-detector.js';
import { createReplaySession, generateReplayPlayer } from './packages/premium/session-replay.js';
import { getVisualDiffEngine } from './packages/premium/visual-diff.ts';
import path from 'path';

/**
 * Dual Simulation Runner
 * 
 * Runs tests against FakeSaaS (Modern) and PurlPal (Legacy)
 * to generate observability data.
 */

async function runSimulation() {
    console.log('🚀 Starting Dual Simulation Run...');
    
    // Correctly await the store instance
    const obs = await getObservabilityStore();
    
    const flaky = await getFlakyDetector();
    const visual = await getVisualDiffEngine();
    
    const browser = await chromium.launch({ headless: true });
    
    // --- Test 1: FakeSaaS (The Standard) ---
    await runSuite(browser, flaky, 'FakeSaaS', 'http://127.0.0.1:4000', [
        { name: 'Login Flow', path: '/login', action: async (page: Page) => {
            await page.fill('#email', 'demo@example.com');
            await page.fill('#password', 'demo123');
            await page.click('#login-btn');
            await page.waitForURL('**/dashboard');
        }},
        { name: 'Stats Refresh', path: '/dashboard', action: async (page: Page) => {
            await page.click('#refresh-btn');
            await page.waitForSelector('.toast.show');
        }}
    ]);

    // --- Test 2: PurlPal (The Flaky Legacy) ---
    // Running 5 times to trigger flakiness
    for (let i = 0; i < 5; i++) {
        await runSuite(browser, flaky, `PurlPal-Run-${i}`, 'http://127.0.0.1:4001', [
            { name: 'PurlPal Login', path: '/login', action: async (page: Page) => {
                await page.fill('input[name="username"]', 'knit_queen');
                await page.fill('input[name="password"]', 'anything');
                await page.click('#submit_btn_final_v2_real');
                await page.waitForURL('http://127.0.0.1:4001/');
            }},
            { name: 'Upvote Pattern', path: '/', action: async (page: Page) => {
                const initialVotes = await page.innerText('.vote-count');
                await page.click('.btn-vote.up');
                // Intentional flakiness check: if it reverts, the test might "fail" or show drift
                await page.waitForTimeout(1500); 
            }}
        ]);
    }

    await browser.close();
    
    // Force save flaky history
    console.log('💾 Saving flaky test history...');
    await (flaky as any).saveHistory();
    
    console.log('✅ Simulation Complete. Observability data generated.');
}

async function runSuite(browser: Browser, flaky: any, projectName: string, baseUrl: string, tests: any[]) {
    const obs = await getObservabilityStore();
    
    for (const test of tests) {
        const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
        console.log(`[${projectName}] Running: ${test.name} (${runId})`);
        
        const recorder = await createReplaySession(runId);
        
        // Use correct API: createRun
        await obs.createRun({
            runId,
            projectId: projectName,
            tenantId: 'default',
            origin: 'ai_agent',
            status: 'running',
            startedAt: new Date()
        });
        
        const context = await browser.newContext();
        const page = await context.newPage();
        
        // Setup observability hooks with correct API: addLog, addNetworkRequest
        page.on('console', msg => obs.addLog({
            id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            runId,
            timestamp: new Date(),
            type: 'console',
            level: msg.type() as any,
            message: msg.text()
        }));
        
        page.on('request', req => obs.addNetworkRequest({
            id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            runId,
            timestamp: new Date(),
            method: req.method(),
            url: req.url()
        }));
        
        // page.on('response', ...) would require updating the request, omitted for brevity

        const startTime = Date.now();
        try {
            await page.goto(baseUrl + test.path);
            
            // Interaction
            await test.action(page);
            
            // Visual Check
            const screenshotPath = path.join(process.cwd(), 'visual-actual', `${test.name.replace(/ /g, '_')}.png`);
            await page.screenshot({ path: screenshotPath });
            
            // Add to replay
            await recorder.addFrame(screenshotPath, [], [], { activeStep: test.name });
            
            // Use correct API: updateRun
            await obs.updateRun(runId, {
                status: 'passed',
                completedAt: new Date(),
                duration: Date.now() - startTime,
                summary: { total: 1, passed: 1, failed: 0, skipped: 0 }
            });

            // Record for Flaky Detector
            await flaky.recordResult({
                testId: test.name.replace(/ /g, '_').toLowerCase(),
                testName: test.name,
                runId,
                timestamp: new Date(),
                status: 'passed',
                duration: Date.now() - startTime
            });
        } catch (e) {
            console.error(`Test Failed: ${test.name}`, e);
            await obs.updateRun(runId, {
                status: 'failed',
                completedAt: new Date(),
                duration: Date.now() - startTime,
                summary: { total: 1, passed: 0, failed: 1, skipped: 0 }
            });

            // Record failure for Flaky Detector
            await flaky.recordResult({
                testId: test.name.replace(/ /g, '_').toLowerCase(),
                testName: test.name,
                runId,
                timestamp: new Date(),
                status: 'failed',
                duration: Date.now() - startTime,
                error: String(e)
            });
        } finally {
            await recorder.saveSession();
            await generateReplayPlayer(runId);
            await context.close();
        }
    }
}

runSimulation().catch(console.error);
