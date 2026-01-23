/**
 * @barrhawk/supervisor
 *
 * Self-healing dynamic tool system with hot-reload capability.
 *
 * Architecture:
 * - Primary (Immortal): Supervises secondary, handles recovery, can't modify itself
 * - Secondary (Mutable): Runs with `bun --hot`, hosts dynamic tools
 *
 * Usage:
 *   # Start both servers (primary manages secondary lifecycle)
 *   bun run start
 *
 *   # Or start individually for development
 *   bun run start:primary
 *   bun --hot secondary/index.ts
 */

// Re-export types
export type {
  DynamicTool,
  ToolSchema,
  ToolPermission,
  ToolDefinition,
  ToolFile,
  SecurityScanResult,
  HealthStatus,
  WorkerState,
  SnapshotMeta,
  IPCMessage,
  IPCRequest,
  IPCResponse,
} from './shared/types.js';

// Re-export IPC utilities
export { IPCClient, EventEmitter } from './shared/ipc.js';

// Re-export managers (for programmatic use)
export { SnapshotManager } from './primary/snapshot-manager.js';
export { HealthMonitor } from './primary/health-monitor.js';
export { ToolLoader } from './secondary/tool-loader.js';
