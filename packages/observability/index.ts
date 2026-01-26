/**
 * BarrHawk E2E Observability Package
 *
 * Persistent storage and querying for test logs, screenshots, and network data.
 * Includes event integration and web viewer for full test observability.
 */

export {
  ObservabilityStore,
  getObservabilityStore,
  type TestRunRecord,
  type LogEntry,
  type ScreenshotRecord,
  type NetworkRecord,
  type RunSummary,
} from './store.js';

export {
  ObservabilityIntegration,
  createObservabilitySession,
  getObservabilityIntegration,
  shutdownObservability,
  type ObservabilityConfig,
  type ObservabilitySession,
} from './integration.js';
