/**
 * BarrHawk E2E Event Emitter
 *
 * Wrapper for emitting events from MCP tool handlers.
 * Provides a simple API for the server.ts to emit events without
 * knowing about the transport layer.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  BarrHawkEvent,
  EventType,
  EventTypeMap,
  TypedEvent,
  EventSource,
  TestOrigin,
} from './types.js';
import { InMemoryEventTransport, type IEventTransport } from './transport.js';

// =============================================================================
// Event Emitter Interface
// =============================================================================

export interface IEventEmitter {
  /** Emit a typed event */
  emit<T extends EventType>(type: T, payload: EventTypeMap[T]): Promise<void>;

  /** Set the current test run context */
  setRunContext(context: RunContext): void;

  /** Clear the current run context */
  clearRunContext(): void;

  /** Get the current run ID */
  getCurrentRunId(): string | undefined;

  /** Set tenant context */
  setTenantContext(tenantId: string): void;

  /** Set event source */
  setSource(source: Partial<EventSource>): void;
}

export interface RunContext {
  runId: string;
  projectId?: string;
  suiteId?: string;
  testId?: string;
  stepIndex?: number;
}

// =============================================================================
// Event Emitter Implementation
// =============================================================================

export class BarrHawkEventEmitter implements IEventEmitter {
  private transport: IEventTransport;
  private tenantId: string = 'default';
  private source: EventSource;
  private runContext: RunContext | null = null;

  constructor(transport?: IEventTransport) {
    // Default to in-memory transport if none provided
    this.transport = transport ?? new InMemoryEventTransport();

    // Default source
    this.source = {
      type: 'mcp',
      origin: 'human_api',
    };
  }

  // ---------------------------------------------------------------------------
  // Context Management
  // ---------------------------------------------------------------------------

  setRunContext(context: RunContext): void {
    this.runContext = context;
  }

  clearRunContext(): void {
    this.runContext = null;
  }

  getCurrentRunId(): string | undefined {
    return this.runContext?.runId;
  }

  setTenantContext(tenantId: string): void {
    this.tenantId = tenantId;
  }

  setSource(source: Partial<EventSource>): void {
    this.source = { ...this.source, ...source };
  }

  // ---------------------------------------------------------------------------
  // Event Emission
  // ---------------------------------------------------------------------------

  async emit<T extends EventType>(type: T, payload: EventTypeMap[T]): Promise<void> {
    const event: TypedEvent<T> = {
      id: uuidv4(),
      type,
      timestamp: new Date(),
      version: '1.0',
      source: this.source,
      tenantId: this.tenantId,
      correlationId: this.runContext?.runId ?? 'no-run',
      payload,
      metadata: {
        runContext: this.runContext,
      },
    };

    await this.transport.publish(event);
  }

  // ---------------------------------------------------------------------------
  // Convenience Methods for Common Events
  // ---------------------------------------------------------------------------

  async emitTestRunStarted(
    runId: string,
    projectId: string,
    origin: TestOrigin,
    options?: {
      suiteId?: string;
      trigger?: string;
      expectedTests?: number;
      originConfidence?: number;
      originIndicators?: string[];
    }
  ): Promise<void> {
    this.setRunContext({ runId, projectId, suiteId: options?.suiteId });

    await this.emit('test.run.started', {
      runId,
      projectId,
      suiteId: options?.suiteId,
      trigger: options?.trigger ?? 'mcp',
      origin,
      originConfidence: options?.originConfidence ?? 1.0,
      originIndicators: options?.originIndicators ?? [],
      expectedTests: options?.expectedTests,
    });
  }

  async emitTestRunCompleted(
    status: 'passed' | 'failed' | 'cancelled',
    summary: {
      total: number;
      passed: number;
      failed: number;
      skipped: number;
      duration: number;
    }
  ): Promise<void> {
    if (!this.runContext) {
      console.warn('[EventEmitter] No run context set for test.run.completed');
      return;
    }

    await this.emit('test.run.completed', {
      runId: this.runContext.runId,
      status,
      summary,
    });

    this.clearRunContext();
  }

  async emitStepStarted(
    stepIndex: number,
    stepName: string,
    stepType: 'browser' | 'api' | 'assertion' | 'audio' | 'video' | 'mcp',
    tool?: string
  ): Promise<void> {
    if (!this.runContext) return;

    this.runContext.stepIndex = stepIndex;

    await this.emit('test.step.started', {
      runId: this.runContext.runId,
      testId: this.runContext.testId ?? 'default',
      stepIndex,
      stepName,
      stepType,
      tool,
    });
  }

  async emitStepCompleted(
    status: 'passed' | 'failed' | 'skipped' | 'error',
    duration: number,
    options?: {
      error?: string;
      errorStack?: string;
      artifacts?: string[];
    }
  ): Promise<void> {
    if (!this.runContext) return;

    await this.emit('test.step.completed', {
      runId: this.runContext.runId,
      testId: this.runContext.testId ?? 'default',
      stepIndex: this.runContext.stepIndex ?? 0,
      status,
      duration,
      error: options?.error,
      errorStack: options?.errorStack,
      artifacts: options?.artifacts,
    });
  }

  async emitBrowserLaunched(
    headless: boolean,
    viewport: { width: number; height: number },
    extensionPath?: string
  ): Promise<void> {
    await this.emit('browser.launched', {
      runId: this.runContext?.runId ?? 'no-run',
      headless,
      viewport,
      extensionPath,
    });
  }

  async emitBrowserNavigated(
    url: string,
    title?: string,
    loadTime?: number
  ): Promise<void> {
    await this.emit('browser.navigated', {
      runId: this.runContext?.runId ?? 'no-run',
      url,
      title,
      loadTime,
    });
  }

  async emitScreenshotCaptured(
    screenshotId: string,
    url: string,
    width: number,
    height: number,
    type: 'viewport' | 'full_page' | 'element',
    sizeBytes: number,
    thumbnailUrl?: string
  ): Promise<void> {
    await this.emit('screenshot.captured', {
      runId: this.runContext?.runId ?? 'no-run',
      testId: this.runContext?.testId,
      stepIndex: this.runContext?.stepIndex,
      screenshotId,
      url,
      thumbnailUrl,
      width,
      height,
      type,
      sizeBytes,
    });
  }

  async emitConsoleCaptured(
    level: 'log' | 'info' | 'warn' | 'error' | 'debug',
    message: string,
    args?: unknown[],
    source?: { url: string; lineNumber: number; columnNumber: number }
  ): Promise<void> {
    await this.emit('console.captured', {
      runId: this.runContext?.runId ?? 'no-run',
      testId: this.runContext?.testId,
      level,
      message,
      args,
      source,
      browserTimestamp: Date.now(),
    });
  }

  async emitBrowserClick(
    success: boolean,
    options?: {
      selector?: string;
      text?: string;
      coordinates?: { x: number; y: number };
      elementInfo?: { tagName: string; id?: string; className?: string };
    }
  ): Promise<void> {
    await this.emit('browser.click', {
      runId: this.runContext?.runId ?? 'no-run',
      selector: options?.selector,
      text: options?.text,
      coordinates: options?.coordinates,
      success,
      elementInfo: options?.elementInfo,
    });
  }

  async emitBrowserType(
    success: boolean,
    selector: string,
    text: string,
    options?: {
      cleared?: boolean;
      pressedEnter?: boolean;
    }
  ): Promise<void> {
    await this.emit('browser.type', {
      runId: this.runContext?.runId ?? 'no-run',
      selector,
      textLength: text.length,  // Don't log actual text for security
      success,
      cleared: options?.cleared ?? true,
    });
  }

  async emitBrowserScroll(
    direction: string,
    amount: number,
    selector?: string
  ): Promise<void> {
    await this.emit('browser.scroll', {
      runId: this.runContext?.runId ?? 'no-run',
      direction,
      amount,
      selector,
    });
  }

  async emitApiRequestSent(
    requestId: string,
    method: string,
    url: string,
    sessionId?: string,
    headers?: Record<string, string>,
    bodySize?: number
  ): Promise<void> {
    await this.emit('api.request.sent', {
      runId: this.runContext?.runId ?? 'no-run',
      sessionId,
      requestId,
      method,
      url,
      headers,
      bodySize,
    });
  }

  async emitApiResponseReceived(
    requestId: string,
    status: number,
    statusText: string,
    duration: number,
    bodySize: number,
    sessionId?: string,
    headers?: Record<string, string>
  ): Promise<void> {
    await this.emit('api.response.received', {
      runId: this.runContext?.runId ?? 'no-run',
      sessionId,
      requestId,
      status,
      statusText,
      duration,
      bodySize,
      headers,
    });
  }

  async emitUsageRecorded(
    teamId: string,
    usageType: 'test_run' | 'screenshot' | 'api_call' | 'ai_analysis' | 'storage_bytes',
    count: number,
    origin: TestOrigin,
    unitCost?: number
  ): Promise<void> {
    await this.emit('billing.usage.recorded', {
      teamId,
      usageType,
      count,
      origin,
      unitCost,
    });
  }
}

// =============================================================================
// Global Emitter Instance
// =============================================================================

let globalEmitter: BarrHawkEventEmitter | null = null;

/**
 * Get or create the global event emitter instance.
 * Call with transport to initialize, or without to get existing instance.
 */
export function getEventEmitter(transport?: IEventTransport): BarrHawkEventEmitter {
  if (!globalEmitter) {
    globalEmitter = new BarrHawkEventEmitter(transport);
  }
  return globalEmitter;
}

/**
 * Reset the global emitter (for testing).
 */
export function resetEventEmitter(): void {
  globalEmitter = null;
}

// =============================================================================
// Origin Detection Helper
// =============================================================================

export interface OriginDetectionContext {
  headers?: Record<string, string>;
  clientInfo?: { name: string; version: string };
  apiKeyPurpose?: string;
  trigger?: string;
  sourceType?: string;
}

/**
 * Detect the test origin from request context.
 */
export function detectTestOrigin(context: OriginDetectionContext): {
  origin: TestOrigin;
  confidence: number;
  indicators: string[];
} {
  const indicators: string[] = [];
  let origin: TestOrigin = 'human_api';
  let confidence = 0.5;

  // 1. Check explicit header (most reliable)
  const declaredOrigin = context.headers?.['x-barrhawk-origin'];
  if (declaredOrigin && isValidOrigin(declaredOrigin)) {
    indicators.push(`declared_origin:${declaredOrigin}`);
    origin = declaredOrigin as TestOrigin;
    confidence = 0.95;
    return { origin, confidence, indicators };
  }

  // 2. Check client info from MCP handshake
  if (context.clientInfo) {
    const name = context.clientInfo.name.toLowerCase();

    if (name.includes('claude') || name.includes('anthropic')) {
      indicators.push('client_name:claude');
      origin = 'ai_agent';
      confidence = 0.95;
    } else if (name.includes('cursor')) {
      indicators.push('client_name:cursor');
      origin = 'ai_agent';
      confidence = 0.9;
    } else if (name.includes('copilot') || name.includes('github')) {
      indicators.push('client_name:copilot');
      origin = 'ai_agent';
      confidence = 0.85;
    } else if (name.includes('windsurf') || name.includes('codeium')) {
      indicators.push('client_name:windsurf');
      origin = 'ai_agent';
      confidence = 0.85;
    }
  }

  // 3. Check API key metadata
  if (context.apiKeyPurpose === 'ai_agent') {
    indicators.push('api_key_purpose:ai');
    origin = 'ai_agent';
    confidence = Math.max(confidence, 0.8);
  }

  // 4. Check request trigger
  if (context.trigger === 'scheduled' || context.trigger === 'cron') {
    origin = 'scheduled';
    confidence = 1.0;
    indicators.push('trigger:scheduled');
  } else if (context.trigger === 'webhook') {
    origin = 'webhook';
    confidence = 0.9;
    indicators.push('trigger:webhook');
  } else if (context.trigger === 'ci' || context.trigger === 'github_actions') {
    origin = 'ci_cd';
    confidence = 0.95;
    indicators.push(`trigger:${context.trigger}`);
  }

  // 5. Check source type
  if (context.sourceType === 'dashboard') {
    origin = 'human_dashboard';
    confidence = 0.95;
    indicators.push('source:dashboard');
  }

  return { origin, confidence, indicators };
}

function isValidOrigin(value: string): boolean {
  const validOrigins: TestOrigin[] = [
    'ai_agent',
    'human_dashboard',
    'human_api',
    'scheduled',
    'ci_cd',
    'webhook',
  ];
  return validOrigins.includes(value as TestOrigin);
}
