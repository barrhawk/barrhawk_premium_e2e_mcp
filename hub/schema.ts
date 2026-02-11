/**
 * Hub Schema - Project & Target Definitions
 *
 * The Hub manages projects, targets, watchers, and test runs.
 */

// =============================================================================
// Project
// =============================================================================

export interface Project {
  id: string;
  name: string;
  baseUrl: string;
  description?: string;

  // Connection configs for different watchers
  connections: {
    db?: DatabaseConnection;
    api?: ApiConnection;
    logs?: LogsConnection;
  };

  createdAt: Date;
  updatedAt: Date;
}

export interface DatabaseConnection {
  type: 'postgres' | 'mysql' | 'sqlite';
  connectionString: string;
}

export interface ApiConnection {
  baseUrl: string;
  headers?: Record<string, string>;
  authToken?: string;
}

export interface LogsConnection {
  type: 'file' | 'docker' | 'journald';
  path?: string;
  containerId?: string;
  unit?: string;
}

// =============================================================================
// Target - What to test
// =============================================================================

export interface Target {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  source: 'auto' | 'user';
  enabled: boolean;

  // What triggers this test
  trigger: TriggerDef;

  // What to watch during the test
  watchers: WatcherDef[];

  // What to verify after trigger
  assertions: AssertionDef[];

  // Timing
  settleTimeMs: number;  // Wait after trigger before asserting
  timeoutMs: number;     // Max time for entire test

  // Metadata
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  lastRunAt?: Date;
  lastRunStatus?: 'passed' | 'failed' | 'error';
}

// =============================================================================
// Trigger - What action starts the test
// =============================================================================

export type TriggerDef =
  | ClickTrigger
  | NavigateTrigger
  | ApiTrigger
  | CronTrigger
  | EventTrigger;

export interface ClickTrigger {
  type: 'click';
  selector: string;
  text?: string;  // Alternative: click by text
  waitForNavigation?: boolean;
}

export interface NavigateTrigger {
  type: 'navigate';
  url: string;
  waitFor?: string;  // Selector to wait for
}

export interface ApiTrigger {
  type: 'api';
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  endpoint: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface CronTrigger {
  type: 'cron';
  schedule: string;  // Cron expression
}

export interface EventTrigger {
  type: 'event';
  source: 'webhook' | 'pubsub' | 'manual';
  filter?: Record<string, unknown>;
}

// =============================================================================
// Watcher - What to observe during test
// =============================================================================

export type WatcherDef =
  | UiWatcher
  | DbWatcher
  | ApiWatcher
  | LogsWatcher;

export interface UiWatcher {
  id: string;
  type: 'ui';
  name: string;

  // What to capture
  capture: {
    screenshot?: boolean;
    selectors?: string[];  // Capture innerText/value of these
    url?: boolean;
    title?: boolean;
    console?: boolean;
  };
}

export interface DbWatcher {
  id: string;
  type: 'db';
  name: string;

  // Query to run before and after trigger
  query: string;
  params?: Record<string, unknown>;

  // For real-time watching
  subscribe?: {
    table: string;
    operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  };
}

export interface ApiWatcher {
  id: string;
  type: 'api';
  name: string;

  // Endpoint to poll or watch
  endpoint: string;
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;

  // Capture specific fields from response
  captureFields?: string[];  // JSONPath expressions
}

export interface LogsWatcher {
  id: string;
  type: 'logs';
  name: string;

  // Pattern to watch for
  pattern: string;  // Regex
  source?: string;  // File path, container, etc.
}

// =============================================================================
// Assertion - What to verify
// =============================================================================

export interface AssertionDef {
  id: string;
  name: string;

  // Left side: what to check
  left: ValueRef;

  // Operator
  op: 'eq' | 'neq' | 'contains' | 'not_contains' | 'matches' | 'gt' | 'lt' | 'gte' | 'lte' | 'exists' | 'not_exists' | 'changed' | 'unchanged';

  // Right side: expected value (or another reference)
  right: ValueRef | LiteralValue;

  // Severity
  severity: 'critical' | 'warning' | 'info';
}

export type ValueRef = {
  type: 'ref';
  watcher: string;      // Watcher ID
  path: string;         // JSONPath or property path
  timing: 'before' | 'after' | 'diff';
};

export type LiteralValue = {
  type: 'literal';
  value: string | number | boolean | null | RegExp;
};

// =============================================================================
// Test Run - Execution record
// =============================================================================

export interface TestRun {
  id: string;
  targetId: string;
  projectId: string;

  status: 'pending' | 'running' | 'passed' | 'failed' | 'error' | 'timeout';

  // Timing
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;

  // Trigger info
  triggeredBy: 'manual' | 'cron' | 'webhook' | 'ci';
  triggerContext?: Record<string, unknown>;

  // Watcher states
  watcherStates: {
    [watcherId: string]: {
      before: unknown;
      after: unknown;
      events?: unknown[];  // For real-time watchers
    };
  };

  // Assertion results
  assertionResults: {
    assertionId: string;
    passed: boolean;
    leftValue: unknown;
    rightValue: unknown;
    message?: string;
  }[];

  // Artifacts
  artifacts: {
    type: 'screenshot' | 'video' | 'log' | 'har';
    path: string;
    watcherId?: string;
  }[];

  // Error info if failed
  error?: {
    message: string;
    stack?: string;
    watcherId?: string;
    phase: 'setup' | 'trigger' | 'capture' | 'assertion';
  };
}

// =============================================================================
// Dashboard Config
// =============================================================================

export interface DashboardConfig {
  projectId: string;

  // Layout
  layout: {
    columns: number;
    widgets: WidgetConfig[];
  };

  // Refresh
  autoRefresh: boolean;
  refreshIntervalMs: number;
}

export interface WidgetConfig {
  id: string;
  type: 'target-status' | 'recent-runs' | 'pass-rate' | 'watcher-live' | 'custom';
  title: string;
  targetIds?: string[];  // Filter to specific targets
  watcherId?: string;    // For live watcher view
  size: { w: number; h: number };
  position: { x: number; y: number };
}

// =============================================================================
// Helpers
// =============================================================================

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createProject(name: string, baseUrl: string): Project {
  const now = new Date();
  return {
    id: generateId(),
    name,
    baseUrl,
    connections: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function createTarget(projectId: string, name: string, trigger: TriggerDef): Target {
  const now = new Date();
  return {
    id: generateId(),
    projectId,
    name,
    source: 'user',
    enabled: true,
    trigger,
    watchers: [],
    assertions: [],
    settleTimeMs: 1000,
    timeoutMs: 30000,
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}
