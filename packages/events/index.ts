/**
 * BarrHawk E2E Event System
 *
 * Real-time event system for test observability, live view streaming,
 * and admin metrics collection.
 *
 * @packageDocumentation
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // Core types
  TestOrigin,
  TestRunStatus,
  TestResultStatus,
  ConsoleLevel,
  WorkerStatus,

  // Event structure
  EventSource,
  BarrHawkEvent,
  EventType,
  EventTypeMap,
  TypedEvent,
  EventHandler,
  EventSubscription,
  EventFilter,

  // Payloads - Test lifecycle
  TestRunStartedPayload,
  TestRunCompletedPayload,
  TestStepStartedPayload,
  TestStepCompletedPayload,

  // Payloads - Browser
  BrowserLaunchedPayload,
  BrowserNavigatedPayload,
  BrowserClosedPayload,
  ScreenshotCapturedPayload,
  ConsoleCapturedPayload,
  BrowserClickPayload,
  BrowserTypePayload,
  BrowserScrollPayload,

  // Payloads - API
  ApiRequestSentPayload,
  ApiResponseReceivedPayload,
  ApiAssertionPayload,

  // Payloads - MCP
  McpInstanceStartedPayload,
  McpInstanceStoppedPayload,
  McpToolInvokedPayload,

  // Payloads - System
  WorkerHealthPayload,
  UsageRecordedPayload,
  QuotaExceededPayload,
  AlertFiredPayload,

  // Configuration
  RedisConfig,
  EventTransportConfig,

  // Live view
  LiveViewSession,
  LiveViewMessage,
} from './types.js';

// =============================================================================
// Transport
// =============================================================================

export {
  type IEventTransport,
  RedisEventTransport,
  InMemoryEventTransport,
  createEventTransport,
} from './transport.js';

// =============================================================================
// Emitter
// =============================================================================

export {
  type IEventEmitter,
  type RunContext,
  type OriginDetectionContext,
  BarrHawkEventEmitter,
  getEventEmitter,
  resetEventEmitter,
  detectTestOrigin,
} from './emitter.js';

// =============================================================================
// Persistence
// =============================================================================

export {
  type IEventPersistence,
  type QueryOptions,
  type EventRecord,
  type RetentionPolicy,
  type EventAggregation,
  type UsageAggregation,
  PERSISTABLE_EVENTS,
  shouldPersist,
  toEventRecord,
  fromEventRecord,
  PrismaEventPersistence,
  DEFAULT_RETENTION_POLICY,
  getRetentionDays,
  aggregateEvents,
} from './persistence.js';

// =============================================================================
// Convenience Re-exports
// =============================================================================

export { v4 as generateEventId } from 'uuid';
