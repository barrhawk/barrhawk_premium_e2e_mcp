/**
 * BarrHawk E2E Premium Features
 *
 * Advanced features for enterprise testing:
 * - Visual regression testing with screenshot diffing
 * - Flaky test detection and analysis
 * - Session replay with video and log sync
 * - Slack notifications for test results
 */

// Visual Diff
export {
  VisualDiffEngine,
  getVisualDiffEngine,
  compareScreenshot,
  type DiffResult,
  type VisualDiffConfig,
  type ComparisonReport,
} from './visual-diff.js';

// Flaky Test Detection
export {
  FlakyTestDetector,
  getFlakyDetector,
  type TestResult,
  type FlakyTestAnalysis,
  type FlakyReport,
  type FlakyDetectorConfig,
} from './flaky-detector.js';

// Session Replay
export {
  SessionRecorder,
  ReplayVideoGenerator,
  createReplaySession,
  generateReplayVideo,
  generateReplayPlayer,
  type ReplayFrame,
  type ReplaySession,
  type ReplayConfig,
  type ReplayVideoResult,
} from './session-replay.js';

// Slack Notifications
export {
  SlackNotifier,
  getSlackNotifier,
  sendSlackTestResult,
  type SlackConfig,
  type NotificationRule,
  type TestRunSummary,
  type SlackMessage,
} from './slack-notifications.js';
