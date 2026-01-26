/**
 * Structured Error Types
 *
 * Categorized errors with codes for:
 * - Programmatic handling (retry decisions, alerting)
 * - Clear error messages for debugging
 * - Error context preservation
 */

// =============================================================================
// Error Categories
// =============================================================================

export type ErrorCategory =
  | 'VALIDATION'      // Input validation failures
  | 'CONNECTION'      // Network/WebSocket issues
  | 'TIMEOUT'         // Operation timeouts
  | 'BROWSER'         // Browser/Playwright errors
  | 'EXECUTION'       // Plan execution failures
  | 'RESOURCE'        // Resource limits exceeded
  | 'INTERNAL';       // Unexpected internal errors

// =============================================================================
// Error Codes
// =============================================================================

export const ErrorCodes = {
  // Validation errors (1xxx)
  VALIDATION_URL_INVALID: 'E1001',
  VALIDATION_URL_BLOCKED_PROTOCOL: 'E1002',
  VALIDATION_URL_INTERNAL_IP: 'E1003',
  VALIDATION_SELECTOR_INVALID: 'E1004',
  VALIDATION_SELECTOR_DANGEROUS: 'E1005',
  VALIDATION_TEXT_INVALID: 'E1006',
  VALIDATION_INTENT_INVALID: 'E1007',
  VALIDATION_PLAN_INVALID: 'E1008',
  VALIDATION_MESSAGE_TOO_LARGE: 'E1009',
  VALIDATION_COMPONENT_ID_INVALID: 'E1010',

  // Connection errors (2xxx)
  CONNECTION_BRIDGE_FAILED: 'E2001',
  CONNECTION_BRIDGE_LOST: 'E2002',
  CONNECTION_COMPONENT_UNAVAILABLE: 'E2003',
  CONNECTION_MESSAGE_DROPPED: 'E2004',

  // Timeout errors (3xxx)
  TIMEOUT_BRIDGE_RESPONSE: 'E3001',
  TIMEOUT_BROWSER_OPERATION: 'E3002',
  TIMEOUT_PLAN_EXECUTION: 'E3003',
  TIMEOUT_STEP_EXECUTION: 'E3004',

  // Browser errors (4xxx)
  BROWSER_NOT_LAUNCHED: 'E4001',
  BROWSER_LAUNCH_FAILED: 'E4002',
  BROWSER_NAVIGATION_FAILED: 'E4003',
  BROWSER_ELEMENT_NOT_FOUND: 'E4004',
  BROWSER_CLICK_FAILED: 'E4005',
  BROWSER_TYPE_FAILED: 'E4006',
  BROWSER_SCREENSHOT_FAILED: 'E4007',
  BROWSER_CRASHED: 'E4008',

  // Execution errors (5xxx)
  EXECUTION_PLAN_REJECTED: 'E5001',
  EXECUTION_STEP_FAILED: 'E5002',
  EXECUTION_ABORTED: 'E5003',
  EXECUTION_UNKNOWN_ACTION: 'E5004',

  // Resource errors (6xxx)
  RESOURCE_BROWSER_LIMIT: 'E6001',
  RESOURCE_MEMORY_LIMIT: 'E6002',
  RESOURCE_QUEUE_FULL: 'E6003',
  RESOURCE_RATE_LIMITED: 'E6004',

  // Internal errors (9xxx)
  INTERNAL_UNEXPECTED: 'E9001',
  INTERNAL_STATE_CORRUPT: 'E9002',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

// =============================================================================
// Retryability
// =============================================================================

const RETRYABLE_CODES = new Set<ErrorCode>([
  ErrorCodes.CONNECTION_BRIDGE_LOST,
  ErrorCodes.CONNECTION_COMPONENT_UNAVAILABLE,
  ErrorCodes.TIMEOUT_BRIDGE_RESPONSE,
  ErrorCodes.TIMEOUT_BROWSER_OPERATION,
  ErrorCodes.BROWSER_ELEMENT_NOT_FOUND,  // Might appear after page loads
  ErrorCodes.RESOURCE_RATE_LIMITED,
]);

// =============================================================================
// Structured Error Class
// =============================================================================

export interface ErrorContext {
  component?: string;
  action?: string;
  planId?: string;
  stepIndex?: number;
  input?: unknown;
  timestamp?: Date;
  [key: string]: unknown;
}

export class TripartiteError extends Error {
  readonly code: ErrorCode;
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  readonly context: ErrorContext;
  readonly cause?: Error;

  constructor(
    code: ErrorCode,
    message: string,
    context: ErrorContext = {},
    cause?: Error
  ) {
    super(message);
    this.name = 'TripartiteError';
    this.code = code;
    this.category = this.getCategory(code);
    this.retryable = RETRYABLE_CODES.has(code);
    this.context = {
      ...context,
      timestamp: new Date(),
    };
    this.cause = cause;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TripartiteError);
    }
  }

  private getCategory(code: ErrorCode): ErrorCategory {
    const prefix = code.charAt(1);
    switch (prefix) {
      case '1': return 'VALIDATION';
      case '2': return 'CONNECTION';
      case '3': return 'TIMEOUT';
      case '4': return 'BROWSER';
      case '5': return 'EXECUTION';
      case '6': return 'RESOURCE';
      default: return 'INTERNAL';
    }
  }

  toJSON(): object {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      message: this.message,
      retryable: this.retryable,
      context: this.context,
      cause: this.cause ? {
        name: this.cause.name,
        message: this.cause.message,
      } : undefined,
    };
  }

  toString(): string {
    return `[${this.code}] ${this.message}`;
  }
}

// =============================================================================
// Error Factories
// =============================================================================

export const Errors = {
  // Validation
  invalidUrl: (url: string, reason: string) =>
    new TripartiteError(ErrorCodes.VALIDATION_URL_INVALID, `Invalid URL: ${reason}`, { input: url }),

  blockedProtocol: (url: string, protocol: string) =>
    new TripartiteError(ErrorCodes.VALIDATION_URL_BLOCKED_PROTOCOL, `Blocked protocol: ${protocol}`, { input: url }),

  internalIp: (url: string) =>
    new TripartiteError(ErrorCodes.VALIDATION_URL_INTERNAL_IP, 'Internal/private IP addresses are not allowed', { input: url }),

  invalidSelector: (selector: string, reason: string) =>
    new TripartiteError(ErrorCodes.VALIDATION_SELECTOR_INVALID, `Invalid selector: ${reason}`, { input: selector }),

  dangerousSelector: (selector: string) =>
    new TripartiteError(ErrorCodes.VALIDATION_SELECTOR_DANGEROUS, 'Selector contains potentially dangerous content', { input: selector }),

  invalidIntent: (reason: string) =>
    new TripartiteError(ErrorCodes.VALIDATION_INTENT_INVALID, `Invalid intent: ${reason}`),

  invalidPlan: (errors: string[]) =>
    new TripartiteError(ErrorCodes.VALIDATION_PLAN_INVALID, `Plan validation failed: ${errors.join(', ')}`, { validationErrors: errors }),

  messageTooLarge: (size: number, max: number) =>
    new TripartiteError(ErrorCodes.VALIDATION_MESSAGE_TOO_LARGE, `Message size ${size} exceeds maximum ${max}`, { size, max }),

  // Connection
  bridgeConnectionFailed: (url: string, cause?: Error) =>
    new TripartiteError(ErrorCodes.CONNECTION_BRIDGE_FAILED, `Failed to connect to Bridge at ${url}`, { url }, cause),

  bridgeConnectionLost: () =>
    new TripartiteError(ErrorCodes.CONNECTION_BRIDGE_LOST, 'Lost connection to Bridge'),

  componentUnavailable: (componentId: string) =>
    new TripartiteError(ErrorCodes.CONNECTION_COMPONENT_UNAVAILABLE, `Component ${componentId} is not available`, { componentId }),

  // Timeout
  bridgeTimeout: (operation: string, timeoutMs: number) =>
    new TripartiteError(ErrorCodes.TIMEOUT_BRIDGE_RESPONSE, `Timeout waiting for Bridge response: ${operation}`, { operation, timeoutMs }),

  browserTimeout: (operation: string, timeoutMs: number) =>
    new TripartiteError(ErrorCodes.TIMEOUT_BROWSER_OPERATION, `Browser operation timed out: ${operation}`, { operation, timeoutMs }),

  stepTimeout: (planId: string, stepIndex: number, action: string, timeoutMs: number) =>
    new TripartiteError(ErrorCodes.TIMEOUT_STEP_EXECUTION, `Step ${stepIndex + 1} (${action}) timed out after ${timeoutMs}ms`, { planId, stepIndex, action, timeoutMs }),

  // Browser
  browserNotLaunched: () =>
    new TripartiteError(ErrorCodes.BROWSER_NOT_LAUNCHED, 'No browser has been launched'),

  browserLaunchFailed: (cause?: Error) =>
    new TripartiteError(ErrorCodes.BROWSER_LAUNCH_FAILED, 'Failed to launch browser', {}, cause),

  navigationFailed: (url: string, cause?: Error) =>
    new TripartiteError(ErrorCodes.BROWSER_NAVIGATION_FAILED, `Navigation to ${url} failed`, { url }, cause),

  elementNotFound: (selector: string) =>
    new TripartiteError(ErrorCodes.BROWSER_ELEMENT_NOT_FOUND, `Element not found: ${selector}`, { selector }),

  clickFailed: (selector: string, cause?: Error) =>
    new TripartiteError(ErrorCodes.BROWSER_CLICK_FAILED, `Click failed on ${selector}`, { selector }, cause),

  typeFailed: (selector: string, cause?: Error) =>
    new TripartiteError(ErrorCodes.BROWSER_TYPE_FAILED, `Type failed on ${selector}`, { selector }, cause),

  // Execution
  planRejected: (planId: string, reason: string) =>
    new TripartiteError(ErrorCodes.EXECUTION_PLAN_REJECTED, `Plan ${planId} rejected: ${reason}`, { planId }),

  stepFailed: (planId: string, stepIndex: number, action: string, cause?: Error) =>
    new TripartiteError(ErrorCodes.EXECUTION_STEP_FAILED, `Step ${stepIndex + 1} (${action}) failed`, { planId, stepIndex, action }, cause),

  unknownAction: (action: string) =>
    new TripartiteError(ErrorCodes.EXECUTION_UNKNOWN_ACTION, `Unknown action: ${action}`, { action }),

  // Resource
  browserLimitReached: (current: number, max: number) =>
    new TripartiteError(ErrorCodes.RESOURCE_BROWSER_LIMIT, `Browser limit reached: ${current}/${max}`, { current, max }),

  rateLimited: (resource: string) =>
    new TripartiteError(ErrorCodes.RESOURCE_RATE_LIMITED, `Rate limited: ${resource}`, { resource }),

  // Internal
  unexpected: (message: string, cause?: Error) =>
    new TripartiteError(ErrorCodes.INTERNAL_UNEXPECTED, `Unexpected error: ${message}`, {}, cause),
};

// =============================================================================
// Error Serialization for Messages
// =============================================================================

export interface SerializedError {
  code: ErrorCode;
  message: string;
  category: ErrorCategory;
  retryable: boolean;
  context?: ErrorContext;
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof TripartiteError) {
    return {
      code: error.code,
      message: error.message,
      category: error.category,
      retryable: error.retryable,
      context: error.context,
    };
  }

  if (error instanceof Error) {
    return {
      code: ErrorCodes.INTERNAL_UNEXPECTED,
      message: error.message,
      category: 'INTERNAL',
      retryable: false,
      context: { originalError: error.name },
    };
  }

  return {
    code: ErrorCodes.INTERNAL_UNEXPECTED,
    message: String(error),
    category: 'INTERNAL',
    retryable: false,
  };
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof TripartiteError) {
    return error.retryable;
  }
  return false;
}
