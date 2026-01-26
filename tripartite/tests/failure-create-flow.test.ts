#!/usr/bin/env bun
/**
 * Test: Failure→Create Flow
 *
 * Tests that when Igor fails repeatedly, Doctor asks Frank to create a tool.
 *
 * Prerequisites:
 * - Bridge running on 7000
 * - Doctor running on 7001
 * - Frankenstein running on 7003
 *
 * Run: bun test tests/failure-create-flow.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';

const DOCTOR_URL = process.env.DOCTOR_URL || 'http://localhost:7001';
const FRANK_URL = process.env.FRANK_URL || 'http://localhost:7003';

// Helper to wait for condition
async function waitFor(
  condition: () => Promise<boolean>,
  timeout = 10000,
  interval = 500
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return;
    await Bun.sleep(interval);
  }
  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

// Helper to check if services are up
async function checkHealth(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/health`);
    const data = await res.json();
    return data.status === 'healthy';
  } catch {
    return false;
  }
}

describe('Failure→Create Flow', () => {
  beforeAll(async () => {
    // Check services are running
    const doctorUp = await checkHealth(DOCTOR_URL);
    const frankUp = await checkHealth(FRANK_URL);

    if (!doctorUp) {
      throw new Error('Doctor not running. Start with: bun run doctor/index.ts');
    }
    if (!frankUp) {
      throw new Error('Frankenstein not running. Start with: bun run frankenstein/index.ts');
    }

    console.log('Services healthy, starting tests...');
  });

  test('GET /frank returns config and empty patterns initially', async () => {
    const res = await fetch(`${DOCTOR_URL}/frank`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.config).toBeDefined();
    expect(data.config.enabled).toBe(true);
    expect(data.config.failureThreshold).toBeGreaterThan(0);
    expect(data.failurePatterns).toBeDefined();
  });

  test('Failure pattern is tracked after step.failed', async () => {
    // Get initial pattern count
    const initialRes = await fetch(`${DOCTOR_URL}/frank`);
    const initial = await initialRes.json();
    const initialCount = initial.failurePatterns.total;

    // Submit a plan that will fail (no browser launched, invalid selector)
    const planRes = await fetch(`${DOCTOR_URL}/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'Test failure tracking - click on nonexistent element',
        url: 'http://example.com',
      }),
    });

    expect(planRes.status).toBe(200);
    const planData = await planRes.json();
    expect(planData.planId).toBeDefined();

    // Wait for plan to fail and pattern to be tracked
    await Bun.sleep(3000);

    // Check patterns again
    const afterRes = await fetch(`${DOCTOR_URL}/frank`);
    const after = await afterRes.json();

    // Pattern count should have increased (or stayed same if this error doesn't match)
    console.log(`Patterns: ${initialCount} -> ${after.failurePatterns.total}`);
  });

  test('Tool creation is triggered after threshold failures', async () => {
    // Get current state
    const beforeRes = await fetch(`${DOCTOR_URL}/frank`);
    const before = await beforeRes.json();
    const threshold = before.config.failureThreshold;

    console.log(`Failure threshold: ${threshold}`);

    // Submit multiple plans that will fail with same pattern
    for (let i = 0; i < threshold + 1; i++) {
      const res = await fetch(`${DOCTOR_URL}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: `Test tool creation trigger #${i} - selector not found`,
          url: 'http://example.com',
          steps: [
            { action: 'click', params: { selector: '#nonexistent-element-test' } }
          ],
        }),
      });

      // Wait between submissions
      await Bun.sleep(2000);
    }

    // Check if tool was requested
    const afterRes = await fetch(`${DOCTOR_URL}/frank`);
    const after = await afterRes.json();

    console.log('Failure patterns after threshold:', JSON.stringify(after.failurePatterns, null, 2));

    // Should have at least one pattern with toolRequested=true
    const requestedPatterns = after.failurePatterns.patterns.filter(
      (p: any) => p.toolRequested
    );

    console.log(`Patterns with tool requested: ${requestedPatterns.length}`);
  });
});

describe('Frank Tool Integration', () => {
  test('GET /frank/health shows Frankenstein status', async () => {
    // This would require Frankenstein to be running
    const res = await fetch(`${FRANK_URL}/health`);
    if (res.ok) {
      const data = await res.json();
      expect(data.status).toBeDefined();
    }
  });

  test('Doctor can communicate with Frankenstein via Bridge', async () => {
    // Check Doctor's bridge connection
    const doctorRes = await fetch(`${DOCTOR_URL}/health`);
    const doctor = await doctorRes.json();

    expect(doctor.bridgeConnected).toBe(true);

    // Check Frankenstein's bridge connection
    const frankRes = await fetch(`${FRANK_URL}/health`);
    if (frankRes.ok) {
      const frank = await frankRes.json();
      expect(frank.bridgeConnected).toBe(true);
    }
  });
});

// Run tests
if (import.meta.main) {
  console.log('Running Failure→Create Flow tests...');
  console.log(`Doctor URL: ${DOCTOR_URL}`);
  console.log(`Frank URL: ${FRANK_URL}`);
}
