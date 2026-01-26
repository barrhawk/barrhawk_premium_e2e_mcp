/**
 * Unit Tests for Validation Module
 *
 * Run with: bun test tripartite/shared/validation.test.ts
 */

import { describe, test, expect } from 'bun:test';
import {
  validateUrl,
  validateSelector,
  validateText,
  validateIntent,
  validatePlan,
  validateMessageSize,
  validateComponentId,
} from './validation.js';

// =============================================================================
// URL Validation Tests
// =============================================================================

describe('validateUrl', () => {
  test('accepts valid HTTPS URLs', () => {
    const result = validateUrl('https://example.com');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('https://example.com');
  });

  test('accepts valid HTTP URLs', () => {
    const result = validateUrl('http://example.com/path?query=1');
    expect(result.valid).toBe(true);
  });

  test('rejects javascript: protocol', () => {
    const result = validateUrl('javascript:alert(1)');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Blocked protocol');
  });

  test('rejects file: protocol', () => {
    const result = validateUrl('file:///etc/passwd');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Blocked protocol');
  });

  test('rejects data: protocol', () => {
    const result = validateUrl('data:text/html,<script>alert(1)</script>');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Blocked protocol');
  });

  test('rejects internal IP 192.168.x.x', () => {
    const result = validateUrl('http://192.168.1.1/admin');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Internal/private IP');
  });

  test('rejects internal IP 10.x.x.x', () => {
    const result = validateUrl('http://10.0.0.1/admin');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Internal/private IP');
  });

  test('rejects localhost', () => {
    const result = validateUrl('http://localhost:3000');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Internal/private IP');
  });

  test('rejects 127.0.0.1', () => {
    const result = validateUrl('http://127.0.0.1:8080');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Internal/private IP');
  });

  test('allows internal IPs when allowInternal=true', () => {
    const result = validateUrl('http://192.168.1.1/admin', true);
    expect(result.valid).toBe(true);
  });

  test('rejects URLs without protocol', () => {
    const result = validateUrl('example.com');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('must start with http');
  });

  test('rejects empty URL', () => {
    const result = validateUrl('');
    expect(result.valid).toBe(false);
  });

  test('rejects overly long URLs', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(3000);
    const result = validateUrl(longUrl);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds maximum length');
  });

  test('trims whitespace', () => {
    const result = validateUrl('  https://example.com  ');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('https://example.com');
  });
});

// =============================================================================
// Selector Validation Tests
// =============================================================================

describe('validateSelector', () => {
  test('accepts valid CSS selectors', () => {
    expect(validateSelector('#login-button').valid).toBe(true);
    expect(validateSelector('.btn-primary').valid).toBe(true);
    expect(validateSelector('[data-testid="submit"]').valid).toBe(true);
    expect(validateSelector('button.submit').valid).toBe(true);
  });

  test('rejects selectors with script tags', () => {
    const result = validateSelector('<script>alert(1)</script>');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('dangerous');
  });

  test('rejects selectors with javascript:', () => {
    const result = validateSelector('a[href="javascript:alert(1)"]');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('dangerous');
  });

  test('rejects selectors with onclick=', () => {
    const result = validateSelector('[onclick=alert(1)]');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('dangerous');
  });

  test('rejects empty selectors', () => {
    const result = validateSelector('');
    expect(result.valid).toBe(false);
  });

  test('rejects overly long selectors', () => {
    const longSelector = '#' + 'a'.repeat(2000);
    const result = validateSelector(longSelector);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds maximum length');
  });
});

// =============================================================================
// Text Validation Tests
// =============================================================================

describe('validateText', () => {
  test('accepts normal text', () => {
    const result = validateText('Hello, world!');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('Hello, world!');
  });

  test('accepts empty string', () => {
    const result = validateText('');
    expect(result.valid).toBe(true);
  });

  test('rejects null', () => {
    const result = validateText(null as any);
    expect(result.valid).toBe(false);
  });

  test('rejects undefined', () => {
    const result = validateText(undefined as any);
    expect(result.valid).toBe(false);
  });

  test('rejects overly long text', () => {
    const longText = 'a'.repeat(15000);
    const result = validateText(longText, 10000);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds maximum length');
  });

  test('accepts text at max length', () => {
    const text = 'a'.repeat(100);
    const result = validateText(text, 100);
    expect(result.valid).toBe(true);
  });
});

// =============================================================================
// Intent Validation Tests
// =============================================================================

describe('validateIntent', () => {
  test('accepts valid intents', () => {
    const result = validateIntent('navigate to https://example.com');
    expect(result.valid).toBe(true);
  });

  test('rejects empty intents', () => {
    const result = validateIntent('');
    expect(result.valid).toBe(false);
  });

  test('rejects whitespace-only intents', () => {
    const result = validateIntent('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('cannot be empty');
  });

  test('trims whitespace', () => {
    const result = validateIntent('  click the button  ');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('click the button');
  });

  test('rejects overly long intents', () => {
    const longIntent = 'a'.repeat(6000);
    const result = validateIntent(longIntent);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds maximum length');
  });
});

// =============================================================================
// Plan Validation Tests
// =============================================================================

describe('validatePlan', () => {
  test('accepts valid plans', () => {
    const steps = [
      { action: 'launch', params: { headless: true } },
      { action: 'navigate', params: { url: 'https://example.com' } },
      { action: 'screenshot', params: {} },
      { action: 'close', params: {} },
    ];
    const result = validatePlan(steps);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('rejects empty plans', () => {
    const result = validatePlan([]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('at least one step');
  });

  test('rejects unknown actions', () => {
    const steps = [{ action: 'fly', params: {} }];
    const result = validatePlan(steps);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("unknown action 'fly'");
  });

  test('rejects invalid URLs in navigate steps', () => {
    const steps = [
      { action: 'launch', params: {} },
      { action: 'navigate', params: { url: 'javascript:alert(1)' } },
    ];
    const result = validatePlan(steps);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('Blocked protocol'));
  });

  test('warns about excessive timeouts', () => {
    const steps = [
      { action: 'launch', params: {}, timeout: 600000 },
    ];
    const result = validatePlan(steps);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('timeout');
  });

  test('warns about excessive retries', () => {
    const steps = [
      { action: 'launch', params: {}, retries: 10 },
    ];
    const result = validatePlan(steps);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('retries');
  });

  test('rejects plans with too many steps', () => {
    const steps = Array(150).fill({ action: 'wait', params: { ms: 100 } });
    const result = validatePlan(steps);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('maximum is 100');
  });
});

// =============================================================================
// Message Size Validation Tests
// =============================================================================

describe('validateMessageSize', () => {
  test('accepts small messages', () => {
    const result = validateMessageSize({ foo: 'bar' });
    expect(result.valid).toBe(true);
    expect(result.size).toBeGreaterThan(0);
  });

  test('rejects overly large messages', () => {
    const largePayload = { data: 'x'.repeat(2 * 1024 * 1024) }; // 2MB
    const result = validateMessageSize(largePayload);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds maximum');
  });
});

// =============================================================================
// Component ID Validation Tests
// =============================================================================

describe('validateComponentId', () => {
  test('accepts valid component IDs', () => {
    expect(validateComponentId('bridge').valid).toBe(true);
    expect(validateComponentId('doctor').valid).toBe(true);
    expect(validateComponentId('igor').valid).toBe(true);
    expect(validateComponentId('frankenstein').valid).toBe(true);
  });

  test('rejects invalid component IDs', () => {
    const result = validateComponentId('hacker');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid component ID');
  });

  test('rejects empty component IDs', () => {
    const result = validateComponentId('');
    expect(result.valid).toBe(false);
  });
});
