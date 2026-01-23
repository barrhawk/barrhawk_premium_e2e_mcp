/**
 * Shared Types for Frankencode Three-Tier Architecture
 *
 * Doctor (Foolproof) → Igor (Performance) → Frankenstein (Adaptive)
 *
 * Philosophy:
 * - Doctor: Stable orchestrator, never fails, routes intelligently
 * - Igor: Performance-optimized execution, caches, pools
 * - Frankenstein: Adaptive sandbox, hot-reload, experimental
 *
 * Core Mission: Holistic AI testing - burn tokens for quality
 */

// ============================================
// Core Philosophy Types
// ============================================

export type ServerRole = 'doctor' | 'igor' | 'frankenstein';

export type ExecutionMode =
  | 'executor'      // BarrHawk drives browser (Claude CLI)
  | 'orchestrator'  // AI drives browser, BarrHawk validates (Gemini)
  | 'headless';     // CI/CD mode, no AI interaction

export type ClientType =
  | 'claude-cli'
  | 'cursor'
  | 'windsurf'
  | 'gemini-cli'
  | 'antigravity'
  | 'idx'
  | 'rest-api'
  | 'unknown';

// ============================================
// Task & Execution Types
// ============================================

export interface Task {
  id: string;
  type: 'tool_call' | 'validation' | 'screenshot' | 'assertion' | 'holistic';
  tool?: string;
  args?: Record<string, unknown>;
  priority: 'critical' | 'high' | 'normal' | 'low';
  timeout: number;
  retries: number;
  retriesLeft: number;
  createdAt: Date;
  source: ClientType;
  context?: ExecutionContext;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  executedBy: ServerRole;
  executionTime: number;
  fallbackUsed: boolean;
  fallbackChain?: ServerRole[];
  tokensBurned?: number;
  screenshot?: string;
}

export interface ExecutionContext {
  mode: ExecutionMode;
  client: ClientType;
  sessionId: string;
  runId: string;
  step: number;
  totalSteps?: number;
  lastScreenshot?: string;
  holisticMode: boolean;
}

// ============================================
// Server Health & Status
// ============================================

export interface ServerHealth {
  role: ServerRole;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'starting';
  uptime: number;
  load: number;
  tasksProcessed: number;
  tasksQueued: number;
  tasksFailed: number;
  lastError?: string;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
}

export interface DoctorHealth extends ServerHealth {
  role: 'doctor';
  igors: IgorInfo[];
  totalCapacity: number;
  activeConnections: number;
}

export interface IgorInfo {
  id: string;
  port: number;
  status: 'healthy' | 'degraded' | 'unhealthy';
  load: number;
  frankensteins: number;
}

export interface IgorHealth extends ServerHealth {
  role: 'igor';
  frankensteins: FrankensteinInfo[];
  poolSize: number;
  activeExecutions: number;
  cacheHitRate: number;
}

export interface FrankensteinInfo {
  id: string;
  status: 'idle' | 'busy' | 'crashed' | 'warming' | 'cooling';
  currentTask?: string;
  toolsLoaded: number;
  lastActivity: Date;
  uptime: number;
}

export interface FrankensteinHealth extends ServerHealth {
  role: 'frankenstein';
  toolsLoaded: string[];
  hotReloadEnabled: boolean;
  lastReload?: Date;
  sandboxed: boolean;
}

// ============================================
// Dynamic Tool Types
// ============================================

export interface DynamicTool {
  name: string;
  description: string;
  schema: ToolSchema;
  handler: (args: Record<string, unknown>, context?: ExecutionContext) => Promise<unknown>;
  permissions?: ToolPermission[];
  tier?: 'free' | 'premium' | 'enterprise';
  holisticVerify?: boolean;
}

export interface ToolSchema {
  type: 'object';
  description?: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

export interface SchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  items?: SchemaProperty;
  properties?: Record<string, SchemaProperty>;
}

export type ToolPermission = 'browser' | 'network' | 'filesystem' | 'ai' | 'system';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolSchema;
}

export interface ToolFile {
  name: string;
  path: string;
  loadedAt: Date;
  hash: string;
}

// ============================================
// IPC Messages
// ============================================

export type MessageType =
  | 'task'
  | 'result'
  | 'health_check'
  | 'health_report'
  | 'register'
  | 'deregister'
  | 'reload'
  | 'shutdown'
  | 'fallback'
  | 'screenshot'
  | 'verify'
  | 'tools_list'
  | 'tools_update';

export interface IPCMessage {
  id: string;
  type: MessageType;
  from: ServerRole;
  to: ServerRole;
  timestamp: Date;
  payload: unknown;
}

export interface TaskMessage extends IPCMessage {
  type: 'task';
  payload: Task;
}

export interface ResultMessage extends IPCMessage {
  type: 'result';
  payload: TaskResult;
}

export interface FallbackMessage extends IPCMessage {
  type: 'fallback';
  payload: {
    task: Task;
    reason: string;
    attemptedBy: ServerRole;
    nextInChain: ServerRole;
  };
}

export interface HealthCheckMessage extends IPCMessage {
  type: 'health_check';
  payload: { requestId: string };
}

export interface HealthReportMessage extends IPCMessage {
  type: 'health_report';
  payload: ServerHealth;
}

// ============================================
// Holistic Testing Types (AI-Native)
// ============================================

export interface HolisticCheck {
  id: string;
  type: 'visual' | 'interaction' | 'responsiveness' | 'accessibility' | 'performance' | 'stress';
  description: string;
  screenshot: string;
  aiPrompt: string;
  expectedOutcome: string;
  actualOutcome?: string;
  passed?: boolean;
  confidence?: number;
  tokensUsed?: number;
}

export interface VisualVerification {
  taskId: string;
  screenshot: string;
  prompt: string;
  response?: string;
  confidence?: number;
  passed?: boolean;
  tokensUsed?: number;
  issues?: string[];
}

export interface InteractionTest {
  action: string;
  target: string;
  holdDuration?: number;
  clickCount?: number;
  verifyWith: 'screenshot' | 'ai' | 'both';
  beforeScreenshot?: string;
  afterScreenshot?: string;
  aiVerification?: VisualVerification;
}

export interface ResponsivenessCheck {
  url: string;
  viewports: ViewportConfig[];
  screenshots: Record<string, string>;
  issues: ResponsivenessIssue[];
  passed: boolean;
}

export interface ViewportConfig {
  width: number;
  height: number;
  name: string;
  deviceScaleFactor?: number;
}

export interface ResponsivenessIssue {
  viewport: string;
  description: string;
  severity: 'critical' | 'major' | 'minor';
  screenshot?: string;
}

export interface StressTest {
  action: string;
  target: string;
  type: 'long-press' | 'rapid-click' | 'drag-shake' | 'scroll-spam';
  duration?: number;
  count?: number;
  result: 'passed' | 'failed' | 'degraded';
  observations: string[];
}

// ============================================
// Configuration
// ============================================

export interface FrankencodeConfig {
  mode: ExecutionMode | 'auto';

  doctor: {
    port: number;
    host: string;
    maxRetries: number;
    healthCheckInterval: number;
    taskTimeout: number;
  };

  igor: {
    port: number;
    host: string;
    poolSize: number;
    maxConcurrent: number;
    performanceMode: boolean;
    cacheEnabled: boolean;
    cacheTTL: number;
  };

  frankenstein: {
    basePort: number;
    host: string;
    hotReload: boolean;
    sandboxed: boolean;
    containerized: boolean;
    toolsDir: string;
    maxMemory: number;
    maxCPU: number;
  };

  fallback: {
    enabled: boolean;
    chain: ServerRole[];
    retryDelay: number;
    maxRetries: number;
  };

  holistic: {
    enabled: boolean;
    screenshotOnEveryStep: boolean;
    aiVerification: boolean;
    burnTokensForQuality: boolean;
    responsiveChecks: boolean;
    stressTests: boolean;
    defaultViewports: ViewportConfig[];
  };

  security: {
    blockedPatterns: string[];
    maxExecutionTime: number;
    allowedPermissions: ToolPermission[];
  };
}

export const DEFAULT_CONFIG: FrankencodeConfig = {
  mode: 'auto',

  doctor: {
    port: 3000,
    host: 'localhost',
    maxRetries: 3,
    healthCheckInterval: 5000,
    taskTimeout: 60000,
  },

  igor: {
    port: 3001,
    host: 'localhost',
    poolSize: 3,
    maxConcurrent: 10,
    performanceMode: true,
    cacheEnabled: true,
    cacheTTL: 300000,
  },

  frankenstein: {
    basePort: 3100,
    host: 'localhost',
    hotReload: true,
    sandboxed: true,
    containerized: false,
    toolsDir: './tools',
    maxMemory: 512,
    maxCPU: 50,
  },

  fallback: {
    enabled: true,
    chain: ['doctor', 'igor', 'frankenstein'],
    retryDelay: 1000,
    maxRetries: 3,
  },

  holistic: {
    enabled: true,
    screenshotOnEveryStep: true,
    aiVerification: true,
    burnTokensForQuality: true,
    responsiveChecks: true,
    stressTests: false,
    defaultViewports: [
      { width: 1920, height: 1080, name: 'desktop' },
      { width: 1024, height: 768, name: 'tablet-landscape' },
      { width: 768, height: 1024, name: 'tablet-portrait' },
      { width: 375, height: 812, name: 'mobile' },
    ],
  },

  security: {
    blockedPatterns: [
      'process.exit',
      'require(',
      'eval(',
      'new Function(',
      '__proto__',
      'child_process',
    ],
    maxExecutionTime: 60000,
    allowedPermissions: ['browser', 'network', 'ai'],
  },
};

// ============================================
// Snapshot & Recovery
// ============================================

export interface Snapshot {
  id: string;
  createdAt: Date;
  createdBy: ServerRole;
  reason: string;
  tools: string[];
  configHash: string;
  path: string;
  size: number;
}

export interface RecoveryAction {
  type: 'restart' | 'rollback' | 'escalate' | 'ignore' | 'replace';
  target: ServerRole;
  snapshot?: string;
  reason: string;
  automatic: boolean;
}

// ============================================
// Events
// ============================================

export type EventType =
  | 'task:received'
  | 'task:started'
  | 'task:completed'
  | 'task:failed'
  | 'task:fallback'
  | 'server:started'
  | 'server:stopped'
  | 'server:crashed'
  | 'server:recovered'
  | 'tool:loaded'
  | 'tool:created'
  | 'tool:deleted'
  | 'screenshot:taken'
  | 'verification:started'
  | 'verification:completed'
  | 'holistic:check'
  | 'holistic:passed'
  | 'holistic:failed';

export interface ServerEvent {
  type: EventType;
  timestamp: Date;
  source: ServerRole;
  taskId?: string;
  data: unknown;
}

// ============================================
// Primary/Secondary (Beta Architecture)
// ============================================

export interface PrimaryConfig {
  secondaryPath: string;
  snapshotDir: string;
  healthInterval: number;
  maxRestarts: number;
  restartDelay: number;
  snapshotRetention: number;
}

export interface WorkerState {
  pid: number | null;
  status: 'starting' | 'running' | 'stopped' | 'crashed';
  startedAt: Date | null;
  restartCount: number;
  lastHealthCheck: Date | null;
  healthy: boolean;
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  uptime: number;
  toolCount: number;
  lastError?: string;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
  };
}

export interface SnapshotMeta {
  id: string;
  name: string;
  createdAt: Date;
  size: number;
  toolCount: number;
  trigger: 'manual' | 'auto' | 'pre-rollback';
}

export interface SupervisorEvent {
  type: string;
  pid?: number;
  error?: string;
  attempt?: number;
  snapshot?: string;
  id?: string;
}

export interface IPCRequest {
  method: string;
  path: string;
  body?: unknown;
}

export interface IPCResponse {
  ok: boolean;
  status: number;
  data?: unknown;
  error?: string;
}

// ============================================
// Security Scan
// ============================================

export interface SecurityScanResult {
  safe: boolean;
  issues: SecurityIssue[];
}

export interface SecurityIssue {
  severity: 'error' | 'warning';
  message: string;
  pattern: string;
  line?: number;
}
