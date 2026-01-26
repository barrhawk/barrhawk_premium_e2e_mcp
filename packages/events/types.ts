/**
 * BarrHawk E2E Event System - Type Definitions
 *
 * Core event types for real-time observability, live view streaming,
 * and admin metrics collection.
 */

// =============================================================================
// Test Origin Classification
// =============================================================================

export type TestOrigin =
  | 'ai_agent'         // Claude Code, Cursor, AI IDEs
  | 'human_dashboard'  // Dashboard "Run" button
  | 'human_api'        // Direct API call
  | 'scheduled'        // Cron trigger
  | 'ci_cd'            // GitHub Actions, webhooks
  | 'webhook';         // External webhook trigger

export type TestRunStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'cancelled';

export type TestResultStatus =
  | 'passed'
  | 'failed'
  | 'skipped'
  | 'error';

export type ConsoleLevel =
  | 'log'
  | 'info'
  | 'warn'
  | 'error'
  | 'debug';

export type WorkerStatus =
  | 'healthy'
  | 'degraded'
  | 'down';

// =============================================================================
// Event Source - Where the event originated
// =============================================================================

export interface EventSource {
  /** Source type */
  type: 'mcp' | 'api' | 'scheduler' | 'webhook' | 'system';

  /** Test origin classification */
  origin: TestOrigin;

  /** API key or session ID */
  clientId?: string;

  /** Client application info */
  clientInfo?: {
    name: string;     // "claude-code", "dashboard", "github-actions"
    version: string;
  };

  /** IP address for audit */
  ipAddress?: string;

  /** User agent string */
  userAgent?: string;
}

// =============================================================================
// Base Event Interface
// =============================================================================

export interface BarrHawkEvent<T = unknown> {
  /** Unique event ID (UUID v7 for time-ordering) */
  id: string;

  /** Event type in dot-notation (e.g., 'test.run.started') */
  type: string;

  /** ISO timestamp */
  timestamp: Date;

  /** Schema version for backwards compatibility */
  version: string;

  /** Event source information */
  source: EventSource;

  /** Team ID for multi-tenant isolation */
  tenantId: string;

  /** Correlation ID (typically test run ID) for grouping related events */
  correlationId: string;

  /** Event-specific payload */
  payload: T;

  /** Flexible metadata */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Test Lifecycle Events
// =============================================================================

export interface TestRunStartedPayload {
  runId: string;
  projectId: string;
  suiteId?: string;
  trigger: string;
  origin: TestOrigin;
  originConfidence: number;
  originIndicators: string[];
  expectedTests?: number;
  workerId?: string;
  region?: string;
}

export interface TestRunCompletedPayload {
  runId: string;
  status: TestRunStatus;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;  // ms
  };
  artifacts?: string[];  // URLs to screenshots, videos, etc.
}

export interface TestStepStartedPayload {
  runId: string;
  testId: string;
  stepIndex: number;
  stepName: string;
  stepType: 'browser' | 'api' | 'assertion' | 'audio' | 'video' | 'mcp';
  tool?: string;  // MCP tool name
}

export interface TestStepCompletedPayload {
  runId: string;
  testId: string;
  stepIndex: number;
  status: TestResultStatus;
  duration: number;  // ms
  error?: string;
  errorStack?: string;
  artifacts?: string[];  // Screenshot URLs, etc.
}

// =============================================================================
// Browser Events
// =============================================================================

export interface BrowserLaunchedPayload {
  runId: string;
  headless: boolean;
  viewport: { width: number; height: number };
  extensionPath?: string;
}

export interface BrowserNavigatedPayload {
  runId: string;
  url: string;
  title?: string;
  loadTime?: number;  // ms
}

export interface BrowserClosedPayload {
  runId: string;
  totalNavigations: number;
  totalScreenshots: number;
  sessionDuration: number;  // ms
}

export interface ScreenshotCapturedPayload {
  runId: string;
  testId?: string;
  stepIndex?: number;
  screenshotId: string;
  url: string;            // Full-res S3/R2 URL
  thumbnailUrl?: string;  // Smaller version for live view
  width: number;
  height: number;
  type: 'viewport' | 'full_page' | 'element';
  sizeBytes: number;
}

export interface ConsoleCapturedPayload {
  runId: string;
  testId?: string;
  level: ConsoleLevel;
  message: string;
  args?: unknown[];
  source?: {
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
  browserTimestamp: number;
}

export interface BrowserClickPayload {
  runId: string;
  selector?: string;
  text?: string;
  coordinates?: { x: number; y: number };
  success: boolean;
  elementInfo?: {
    tagName: string;
    id?: string;
    className?: string;
  };
}

export interface BrowserTypePayload {
  runId: string;
  selector: string;
  textLength: number;  // Don't log actual text for security
  cleared: boolean;
  success: boolean;
}

export interface BrowserScrollPayload {
  runId: string;
  direction: string;
  amount: number;
  selector?: string;
}

// =============================================================================
// API Testing Events
// =============================================================================

export interface ApiRequestSentPayload {
  runId: string;
  sessionId?: string;
  requestId: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  bodySize?: number;
}

export interface ApiResponseReceivedPayload {
  runId: string;
  sessionId?: string;
  requestId: string;
  status: number;
  statusText: string;
  duration: number;  // ms
  bodySize: number;
  headers?: Record<string, string>;
}

export interface ApiAssertionPayload {
  runId: string;
  requestId: string;
  assertionType: 'status' | 'header' | 'body' | 'jsonPath' | 'duration' | 'schema';
  expected: unknown;
  actual: unknown;
  passed: boolean;
  message?: string;
}

// =============================================================================
// MCP Testing Events
// =============================================================================

export interface McpInstanceStartedPayload {
  runId: string;
  instanceId: string;
  command: string;
  args: string[];
  cwd?: string;
}

export interface McpInstanceStoppedPayload {
  runId: string;
  instanceId: string;
  exitCode?: number;
  uptime: number;  // ms
}

export interface McpToolInvokedPayload {
  runId: string;
  instanceId: string;
  tool: string;
  args: Record<string, unknown>;
  success: boolean;
  duration: number;  // ms
  error?: string;
}

// =============================================================================
// System / Admin Events
// =============================================================================

export interface WorkerHealthPayload {
  workerId: string;
  region: string;
  status: WorkerStatus;
  activeTests: number;
  maxCapacity: number;
  cpuUsage: number;      // 0-100
  memoryUsage: number;   // 0-100
  queueDepth: number;
  uptime: number;        // ms
}

export interface UsageRecordedPayload {
  teamId: string;
  usageType: 'test_run' | 'screenshot' | 'api_call' | 'ai_analysis' | 'storage_bytes';
  count: number;
  origin: TestOrigin;
  unitCost?: number;
}

export interface QuotaExceededPayload {
  teamId: string;
  usageType: string;
  current: number;
  quota: number;
  overage: number;
  estimatedCost: number;
}

export interface AlertFiredPayload {
  alertId: string;
  alertName: string;
  severity: 'info' | 'warning' | 'critical';
  condition: string;
  value: number;
  threshold: number;
  channels: string[];
}

// =============================================================================
// Event Type Mapping
// =============================================================================

export interface EventTypeMap {
  // Test Lifecycle
  'test.run.started': TestRunStartedPayload;
  'test.run.completed': TestRunCompletedPayload;
  'test.step.started': TestStepStartedPayload;
  'test.step.completed': TestStepCompletedPayload;

  // Browser
  'browser.launched': BrowserLaunchedPayload;
  'browser.navigated': BrowserNavigatedPayload;
  'browser.closed': BrowserClosedPayload;
  'browser.click': BrowserClickPayload;
  'browser.type': BrowserTypePayload;
  'browser.scroll': BrowserScrollPayload;
  'screenshot.captured': ScreenshotCapturedPayload;
  'console.captured': ConsoleCapturedPayload;

  // API Testing
  'api.request.sent': ApiRequestSentPayload;
  'api.response.received': ApiResponseReceivedPayload;
  'api.assertion': ApiAssertionPayload;

  // MCP Testing
  'mcp.instance.started': McpInstanceStartedPayload;
  'mcp.instance.stopped': McpInstanceStoppedPayload;
  'mcp.tool.invoked': McpToolInvokedPayload;

  // System
  'system.worker.health': WorkerHealthPayload;
  'billing.usage.recorded': UsageRecordedPayload;
  'billing.quota.exceeded': QuotaExceededPayload;
  'system.alert.fired': AlertFiredPayload;
}

export type EventType = keyof EventTypeMap;

// =============================================================================
// Typed Event Helper
// =============================================================================

export type TypedEvent<T extends EventType> = BarrHawkEvent<EventTypeMap[T]> & {
  type: T;
};

// =============================================================================
// Subscription & Handler Types
// =============================================================================

export type EventHandler<T extends EventType = EventType> = (
  event: TypedEvent<T>
) => void | Promise<void>;

export interface EventSubscription {
  id: string;
  pattern: string;
  handler: EventHandler;
  unsubscribe: () => void;
}

export interface EventFilter {
  types?: EventType[];
  tenantId?: string;
  correlationId?: string;
  origin?: TestOrigin[];
  since?: Date;
  until?: Date;
}

// =============================================================================
// Transport Configuration
// =============================================================================

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  tls?: boolean;
}

export interface EventTransportConfig {
  redis: RedisConfig;

  /** Max events to keep per tenant stream */
  maxStreamLength?: number;

  /** Enable event persistence to database */
  persistEvents?: boolean;

  /** Event types to persist (default: critical events only) */
  persistableTypes?: EventType[];
}

// =============================================================================
// Live View Types
// =============================================================================

export interface LiveViewSession {
  sessionId: string;
  tenantId: string;
  runId: string;
  createdAt: Date;
  lastActivity: Date;
  observerCount: number;

  /** Current state for late-joining observers */
  state: {
    lastScreenshot?: string;
    currentStep?: number;
    currentStepName?: string;
    consoleBuffer: ConsoleCapturedPayload[];
    status: TestRunStatus;
  };
}

export interface LiveViewMessage {
  type: 'init' | 'screenshot' | 'step' | 'console' | 'navigation' | 'completed' | 'error';
  data: unknown;
  timestamp: Date;
}
