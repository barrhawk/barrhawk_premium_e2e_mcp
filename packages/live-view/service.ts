/**
 * BarrHawk E2E Live View Service
 *
 * Real-time test observation service that:
 * - Manages WebSocket connections for observers
 * - Subscribes to events from the event transport
 * - Broadcasts screenshots, console logs, and step progress
 * - Supports late-join replay for observers joining mid-test
 */

import type {
  BarrHawkEvent,
  EventType,
  TypedEvent,
  ConsoleCapturedPayload,
  ScreenshotCapturedPayload,
  TestStepStartedPayload,
  TestStepCompletedPayload,
  TestRunCompletedPayload,
  BrowserNavigatedPayload,
  IEventTransport,
} from '../events/index.js';

// =============================================================================
// Types
// =============================================================================

export interface LiveViewSession {
  sessionId: string;
  tenantId: string;
  runId: string;
  createdAt: Date;
  lastActivity: Date;
  observers: Set<LiveViewObserver>;

  state: LiveViewState;
}

export interface LiveViewState {
  lastScreenshot?: string;
  currentStep?: number;
  currentStepName?: string;
  currentUrl?: string;
  consoleBuffer: ConsoleCapturedPayload[];
  status: 'pending' | 'running' | 'passed' | 'failed' | 'cancelled';
  startTime: Date;
  stepCount: number;
}

export interface LiveViewObserver {
  id: string;
  send: (message: LiveViewMessage) => void;
  close: () => void;
}

export interface LiveViewMessage {
  type: 'init' | 'screenshot' | 'step' | 'console' | 'navigation' | 'completed' | 'error' | 'ping';
  data: unknown;
  timestamp: Date;
}

// =============================================================================
// Live View Service
// =============================================================================

export class LiveViewService {
  private sessions: Map<string, LiveViewSession> = new Map();
  private transport: IEventTransport;
  private consoleBufferSize: number;
  private sessionTimeoutMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    transport: IEventTransport,
    options: {
      consoleBufferSize?: number;
      sessionTimeoutMs?: number;
    } = {}
  ) {
    this.transport = transport;
    this.consoleBufferSize = options.consoleBufferSize ?? 100;
    this.sessionTimeoutMs = options.sessionTimeoutMs ?? 300000; // 5 min
  }

  /**
   * Start the service and begin listening for events.
   */
  start(): void {
    // Subscribe to all events
    this.transport.subscribe('events:*:*', (event) => {
      this.handleEvent(event as TypedEvent<EventType>);
    });

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleSessions();
    }, 60000); // Every minute

    console.log('[LiveView] Service started');
  }

  /**
   * Stop the service.
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Close all observers
    for (const session of this.sessions.values()) {
      for (const observer of session.observers) {
        observer.close();
      }
    }

    this.sessions.clear();
    console.log('[LiveView] Service stopped');
  }

  /**
   * Start or get a live view session for a test run.
   */
  getOrCreateSession(runId: string, tenantId: string): LiveViewSession {
    const sessionId = `live:${runId}`;

    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        tenantId,
        runId,
        createdAt: new Date(),
        lastActivity: new Date(),
        observers: new Set(),
        state: {
          consoleBuffer: [],
          status: 'running',
          startTime: new Date(),
          stepCount: 0,
        },
      };
      this.sessions.set(sessionId, session);
      console.log(`[LiveView] Created session: ${sessionId}`);
    }

    return session;
  }

  /**
   * Add an observer to a session.
   */
  addObserver(runId: string, tenantId: string, observer: LiveViewObserver): void {
    const session = this.getOrCreateSession(runId, tenantId);
    session.observers.add(observer);
    session.lastActivity = new Date();

    // Send current state to new observer
    observer.send({
      type: 'init',
      data: {
        runId: session.runId,
        lastScreenshot: session.state.lastScreenshot,
        currentStep: session.state.currentStep,
        currentStepName: session.state.currentStepName,
        currentUrl: session.state.currentUrl,
        consoleBuffer: session.state.consoleBuffer,
        status: session.state.status,
        stepCount: session.state.stepCount,
      },
      timestamp: new Date(),
    });

    console.log(`[LiveView] Observer added to ${session.sessionId}. Total: ${session.observers.size}`);
  }

  /**
   * Remove an observer from a session.
   */
  removeObserver(runId: string, observer: LiveViewObserver): void {
    const sessionId = `live:${runId}`;
    const session = this.sessions.get(sessionId);

    if (session) {
      session.observers.delete(observer);
      console.log(`[LiveView] Observer removed from ${sessionId}. Remaining: ${session.observers.size}`);

      // Don't immediately delete session - keep for a grace period
      if (session.observers.size === 0) {
        setTimeout(() => {
          const current = this.sessions.get(sessionId);
          if (current && current.observers.size === 0) {
            this.sessions.delete(sessionId);
            console.log(`[LiveView] Session cleaned up: ${sessionId}`);
          }
        }, 30000); // 30 second grace period
      }
    }
  }

  /**
   * Get session info.
   */
  getSession(runId: string): LiveViewSession | undefined {
    return this.sessions.get(`live:${runId}`);
  }

  /**
   * Get all active sessions.
   */
  getActiveSessions(): LiveViewSession[] {
    return Array.from(this.sessions.values());
  }

  // ---------------------------------------------------------------------------
  // Event Handling
  // ---------------------------------------------------------------------------

  private handleEvent(event: TypedEvent<EventType>): void {
    const session = this.sessions.get(`live:${event.correlationId}`);
    if (!session) return;

    session.lastActivity = new Date();

    switch (event.type) {
      case 'screenshot.captured':
        this.handleScreenshot(session, event.payload as ScreenshotCapturedPayload);
        break;

      case 'console.captured':
        this.handleConsole(session, event.payload as ConsoleCapturedPayload);
        break;

      case 'test.step.started':
        this.handleStepStarted(session, event.payload as TestStepStartedPayload);
        break;

      case 'test.step.completed':
        this.handleStepCompleted(session, event.payload as TestStepCompletedPayload);
        break;

      case 'browser.navigated':
        this.handleNavigation(session, event.payload as BrowserNavigatedPayload);
        break;

      case 'test.run.completed':
        this.handleRunCompleted(session, event.payload as TestRunCompletedPayload);
        break;
    }
  }

  private handleScreenshot(session: LiveViewSession, payload: ScreenshotCapturedPayload): void {
    session.state.lastScreenshot = payload.thumbnailUrl || payload.url;

    this.broadcast(session, {
      type: 'screenshot',
      data: {
        screenshotId: payload.screenshotId,
        url: payload.url,
        thumbnailUrl: payload.thumbnailUrl,
        width: payload.width,
        height: payload.height,
        type: payload.type,
      },
      timestamp: new Date(),
    });
  }

  private handleConsole(session: LiveViewSession, payload: ConsoleCapturedPayload): void {
    // Add to buffer
    session.state.consoleBuffer.push(payload);
    if (session.state.consoleBuffer.length > this.consoleBufferSize) {
      session.state.consoleBuffer.shift();
    }

    this.broadcast(session, {
      type: 'console',
      data: {
        level: payload.level,
        message: payload.message,
        timestamp: payload.browserTimestamp,
        source: payload.source,
      },
      timestamp: new Date(),
    });
  }

  private handleStepStarted(session: LiveViewSession, payload: TestStepStartedPayload): void {
    session.state.currentStep = payload.stepIndex;
    session.state.currentStepName = payload.stepName;
    session.state.stepCount++;

    this.broadcast(session, {
      type: 'step',
      data: {
        stepIndex: payload.stepIndex,
        stepName: payload.stepName,
        stepType: payload.stepType,
        status: 'running',
      },
      timestamp: new Date(),
    });
  }

  private handleStepCompleted(session: LiveViewSession, payload: TestStepCompletedPayload): void {
    this.broadcast(session, {
      type: 'step',
      data: {
        stepIndex: payload.stepIndex,
        status: payload.status,
        duration: payload.duration,
        error: payload.error,
      },
      timestamp: new Date(),
    });
  }

  private handleNavigation(session: LiveViewSession, payload: BrowserNavigatedPayload): void {
    session.state.currentUrl = payload.url;

    this.broadcast(session, {
      type: 'navigation',
      data: {
        url: payload.url,
        title: payload.title,
        loadTime: payload.loadTime,
      },
      timestamp: new Date(),
    });
  }

  private handleRunCompleted(session: LiveViewSession, payload: TestRunCompletedPayload): void {
    session.state.status = payload.status as LiveViewState['status'];

    this.broadcast(session, {
      type: 'completed',
      data: {
        status: payload.status,
        summary: payload.summary,
      },
      timestamp: new Date(),
    });
  }

  // ---------------------------------------------------------------------------
  // Broadcasting
  // ---------------------------------------------------------------------------

  private broadcast(session: LiveViewSession, message: LiveViewMessage): void {
    for (const observer of session.observers) {
      try {
        observer.send(message);
      } catch (err) {
        console.error(`[LiveView] Failed to send to observer: ${err}`);
        session.observers.delete(observer);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  private cleanupStaleSessions(): void {
    const now = Date.now();
    const stale: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      const age = now - session.lastActivity.getTime();

      // Remove if no observers and session is stale
      if (session.observers.size === 0 && age > this.sessionTimeoutMs) {
        stale.push(sessionId);
      }

      // Also remove completed sessions after a while
      if (
        ['passed', 'failed', 'cancelled'].includes(session.state.status) &&
        age > this.sessionTimeoutMs
      ) {
        stale.push(sessionId);
      }
    }

    for (const sessionId of stale) {
      this.sessions.delete(sessionId);
      console.log(`[LiveView] Cleaned up stale session: ${sessionId}`);
    }
  }
}
