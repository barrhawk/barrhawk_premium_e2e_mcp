/**
 * Input Validation Module
 *
 * Defense against:
 * - Malicious URLs (javascript:, file:, internal IPs)
 * - Script injection via selectors
 * - Oversized payloads
 * - Invalid message structures
 */

// =============================================================================
// URL Validation
// =============================================================================

const BLOCKED_PROTOCOLS = ['javascript:', 'file:', 'data:', 'vbscript:'];
const INTERNAL_IP_PATTERNS = [
  /^https?:\/\/localhost/i,
  /^https?:\/\/127\./,
  /^https?:\/\/10\./,
  /^https?:\/\/172\.(1[6-9]|2[0-9]|3[01])\./,
  /^https?:\/\/192\.168\./,
  /^https?:\/\/0\./,
  /^https?:\/\/\[::1\]/,
  /^https?:\/\/\[fc/i,
  /^https?:\/\/\[fd/i,
];

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: string;
}

export function validateUrl(url: string, allowInternal = false): ValidationResult {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required and must be a string' };
  }

  const trimmed = url.trim();

  if (trimmed.length > 2048) {
    return { valid: false, error: 'URL exceeds maximum length (2048 characters)' };
  }

  const lower = trimmed.toLowerCase();

  // Block dangerous protocols
  for (const protocol of BLOCKED_PROTOCOLS) {
    if (lower.startsWith(protocol)) {
      return { valid: false, error: `Blocked protocol: ${protocol}` };
    }
  }

  // Require http:// or https://
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
    return { valid: false, error: 'URL must start with http:// or https://' };
  }

  // Block internal IPs unless explicitly allowed
  if (!allowInternal) {
    for (const pattern of INTERNAL_IP_PATTERNS) {
      if (pattern.test(trimmed)) {
        return { valid: false, error: 'Internal/private IP addresses are not allowed' };
      }
    }
  }

  // Try to parse as URL
  try {
    new URL(trimmed);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  return { valid: true, sanitized: trimmed };
}

// =============================================================================
// Selector Validation
// =============================================================================

const DANGEROUS_SELECTOR_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /on\w+\s*=/i,  // onclick=, onerror=, etc.
  /expression\s*\(/i,  // CSS expression()
  /url\s*\(\s*["']?javascript/i,
];

export function validateSelector(selector: string): ValidationResult {
  if (!selector || typeof selector !== 'string') {
    return { valid: false, error: 'Selector is required and must be a string' };
  }

  const trimmed = selector.trim();

  if (trimmed.length > 1024) {
    return { valid: false, error: 'Selector exceeds maximum length (1024 characters)' };
  }

  if (trimmed.length === 0) {
    return { valid: false, error: 'Selector cannot be empty' };
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_SELECTOR_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, error: 'Selector contains potentially dangerous content' };
    }
  }

  return { valid: true, sanitized: trimmed };
}

// =============================================================================
// Text Input Validation
// =============================================================================

export function validateText(text: string, maxLength = 10000): ValidationResult {
  if (text === undefined || text === null) {
    return { valid: false, error: 'Text is required' };
  }

  if (typeof text !== 'string') {
    return { valid: false, error: 'Text must be a string' };
  }

  if (text.length > maxLength) {
    return { valid: false, error: `Text exceeds maximum length (${maxLength} characters)` };
  }

  return { valid: true, sanitized: text };
}

// =============================================================================
// Intent Validation
// =============================================================================

const INTENT_MAX_LENGTH = 5000;

export function validateIntent(intent: string): ValidationResult {
  if (!intent || typeof intent !== 'string') {
    return { valid: false, error: 'Intent is required and must be a string' };
  }

  const trimmed = intent.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Intent cannot be empty' };
  }

  if (trimmed.length > INTENT_MAX_LENGTH) {
    return { valid: false, error: `Intent exceeds maximum length (${INTENT_MAX_LENGTH} characters)` };
  }

  return { valid: true, sanitized: trimmed };
}

// =============================================================================
// Message Validation
// =============================================================================

const MAX_MESSAGE_SIZE = 1024 * 1024; // 1MB
const MAX_PAYLOAD_SIZE = 512 * 1024;  // 512KB

export interface MessageValidation {
  valid: boolean;
  error?: string;
  size?: number;
}

export function validateMessageSize(message: string | object): MessageValidation {
  const str = typeof message === 'string' ? message : JSON.stringify(message);
  const size = Buffer.byteLength(str, 'utf8');

  if (size > MAX_MESSAGE_SIZE) {
    return {
      valid: false,
      error: `Message size (${size} bytes) exceeds maximum (${MAX_MESSAGE_SIZE} bytes)`,
      size
    };
  }

  return { valid: true, size };
}

export function validatePayloadSize(payload: unknown): MessageValidation {
  const str = JSON.stringify(payload);
  const size = Buffer.byteLength(str, 'utf8');

  if (size > MAX_PAYLOAD_SIZE) {
    return {
      valid: false,
      error: `Payload size (${size} bytes) exceeds maximum (${MAX_PAYLOAD_SIZE} bytes)`,
      size
    };
  }

  return { valid: true, size };
}

// =============================================================================
// Plan Validation
// =============================================================================

const ALLOWED_ACTIONS = [
  'launch', 'navigate', 'click', 'type', 'screenshot',
  'close', 'wait', 'scroll', 'select', 'hover',
  'verify', 'execute_intent'
];

const MAX_STEPS = 100;
const MAX_TIMEOUT = 300000; // 5 minutes
const MAX_RETRIES = 5;

export interface PlanStep {
  action: string;
  params: Record<string, unknown>;
  timeout?: number;
  retries?: number;
}

export interface PlanValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validatePlan(steps: PlanStep[]): PlanValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(steps)) {
    return { valid: false, errors: ['Steps must be an array'], warnings: [] };
  }

  if (steps.length === 0) {
    return { valid: false, errors: ['Plan must have at least one step'], warnings: [] };
  }

  if (steps.length > MAX_STEPS) {
    errors.push(`Plan has ${steps.length} steps, maximum is ${MAX_STEPS}`);
  }

  steps.forEach((step, index) => {
    const prefix = `Step ${index + 1}`;

    // Validate action
    if (!step.action || typeof step.action !== 'string') {
      errors.push(`${prefix}: action is required and must be a string`);
    } else if (!ALLOWED_ACTIONS.includes(step.action)) {
      errors.push(`${prefix}: unknown action '${step.action}'`);
    }

    // Validate params
    if (step.params && typeof step.params !== 'object') {
      errors.push(`${prefix}: params must be an object`);
    }

    // Validate timeout
    if (step.timeout !== undefined) {
      if (typeof step.timeout !== 'number' || step.timeout < 0) {
        errors.push(`${prefix}: timeout must be a positive number`);
      } else if (step.timeout > MAX_TIMEOUT) {
        warnings.push(`${prefix}: timeout ${step.timeout}ms exceeds recommended maximum ${MAX_TIMEOUT}ms`);
      }
    }

    // Validate retries
    if (step.retries !== undefined) {
      if (typeof step.retries !== 'number' || step.retries < 0) {
        errors.push(`${prefix}: retries must be a positive number`);
      } else if (step.retries > MAX_RETRIES) {
        warnings.push(`${prefix}: ${step.retries} retries exceeds recommended maximum ${MAX_RETRIES}`);
      }
    }

    // Action-specific validation
    if (step.action === 'navigate' && step.params) {
      // Allow localhost for local development/testing
      const allowInternal = process.env.ALLOW_LOCALHOST !== 'false';
      const urlResult = validateUrl(step.params.url as string, allowInternal);
      if (!urlResult.valid) {
        errors.push(`${prefix}: ${urlResult.error}`);
      }
    }

    if ((step.action === 'click' || step.action === 'type') && step.params?.selector) {
      const selectorResult = validateSelector(step.params.selector as string);
      if (!selectorResult.valid) {
        errors.push(`${prefix}: ${selectorResult.error}`);
      }
    }

    if (step.action === 'type' && step.params?.text) {
      const textResult = validateText(step.params.text as string);
      if (!textResult.valid) {
        errors.push(`${prefix}: ${textResult.error}`);
      }
    }
  });

  return { valid: errors.length === 0, errors, warnings };
}

// =============================================================================
// Component ID Validation
// =============================================================================

const VALID_COMPONENT_IDS = ['bridge', 'doctor', 'igor', 'frankenstein', 'meta', 'mcp-frank'];

// Patterns for dynamic component IDs (spawned instances)
const DYNAMIC_COMPONENT_PATTERNS = [
  /^igor-[a-z0-9_-]+$/i,    // igor-user, igor-admin, igor-route-123, etc.
  /^frank-[a-z0-9_-]+$/i,   // frank-001, frank-browser-1, etc.
  /^doctor-[a-z0-9_-]+$/i,  // doctor-backup, doctor-2, etc.
  /^mcp-[a-z0-9_-]+$/i,     // mcp-frank, mcp-test, etc.
];

export function validateComponentId(id: string): ValidationResult {
  if (!id || typeof id !== 'string') {
    return { valid: false, error: 'Component ID is required and must be a string' };
  }

  // Check static IDs first
  if (VALID_COMPONENT_IDS.includes(id)) {
    return { valid: true, sanitized: id };
  }

  // Check dynamic patterns for spawned instances
  for (const pattern of DYNAMIC_COMPONENT_PATTERNS) {
    if (pattern.test(id)) {
      return { valid: true, sanitized: id };
    }
  }

  return { valid: false, error: `Invalid component ID: ${id}` };
}
