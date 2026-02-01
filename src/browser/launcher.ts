/**
 * Browser Manager - Handles Playwright browser lifecycle and Squad Mode (Multi-Context)
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { Config } from '../config.js';
import { randomUUID } from 'crypto';

export interface IgorSession {
  id: string;
  context: BrowserContext;
  page: Page;
  consoleMessages: Array<{ type: string; text: string; timestamp: number }>;
  createdAt: number;
  metadata: {
    title?: string;
    url?: string;
    status: 'active' | 'idle' | 'busy';
  };
}

export class BrowserManager {
  private browser: Browser | null = null;
  private sessions: Map<string, IgorSession> = new Map();
  private activeSessionId: string | null = null;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Initialize the browser engine (Chromium)
   */
  async initBrowser(options: { headless?: boolean } = {}): Promise<void> {
    if (this.browser) return;

    const headless = options.headless ?? this.config.browser.headless;
    try {
      this.browser = await chromium.launch({
        headless,
      });
    } catch (error) {
      throw new Error(`Failed to launch browser engine: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Launch a new worker (Igor) context
   */
  async launchWorker(options: { url?: string; id?: string; headless?: boolean } = {}): Promise<{ success: boolean; message: string; id: string }> {
    try {
      if (!this.browser) {
        await this.initBrowser({ headless: options.headless });
      }

      const id = options.id || `igor-${randomUUID().substring(0, 8)}`;
      
      if (this.sessions.has(id)) {
        return {
          success: false,
          message: `Worker with ID ${id} already exists`,
          id,
        };
      }

      const context = await this.browser!.newContext({
        viewport: this.config.browser.viewport,
        userAgent: this.config.browser.userAgent,
      });

      const page = await context.newPage();
      const session: IgorSession = {
        id,
        context,
        page,
        consoleMessages: [],
        createdAt: Date.now(),
        metadata: {
          status: 'idle',
          url: 'about:blank',
        },
      };

      // Attach listeners
      this.attachListeners(session);

      // Navigate if URL provided
      if (options.url) {
        session.metadata.status = 'busy';
        await page.goto(options.url, {
          waitUntil: 'domcontentloaded',
          timeout: this.config.timeout,
        });
        session.metadata.url = page.url();
        session.metadata.title = await page.title();
        session.metadata.status = 'idle';
      }

      this.sessions.set(id, session);
      
      // If this is the first session, make it active
      if (!this.activeSessionId) {
        this.activeSessionId = id;
      }

      return {
        success: true,
        message: `Worker ${id} launched.${options.url ? ` Navigated to ${options.url}` : ''}`,
        id,
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to launch worker: ${message}`,
        id: '',
      };
    }
  }

  /**
   * Legacy launch support: Starts browser + 1 default worker
   */
  async launch(options: { headless?: boolean; url?: string } = {}): Promise<{ success: boolean; message: string }> {
    // For legacy launch, we respect the restart semantics if browser exists
    if (this.browser) {
      await this.closeAll();
    }

    const result = await this.launchWorker({ 
      url: options.url, 
      id: 'igor-1', 
      headless: options.headless 
    });
    
    return {
      success: result.success,
      message: result.message,
    };
  }

  /**
   * Switch active focus to a specific worker
   */
  switchWorker(id: string): { success: boolean; message: string } {
    if (!this.sessions.has(id)) {
      return { success: false, message: `Worker ${id} not found` };
    }
    this.activeSessionId = id;
    return { success: true, message: `Switched focus to ${id}` };
  }

  /**
   * List all active workers
   */
  listWorkers(): Array<IgorSession['metadata'] & { id: string; active: boolean }> {
    return Array.from(this.sessions.values()).map(s => ({
      id: s.id,
      ...s.metadata,
      active: s.id === this.activeSessionId,
    }));
  }

  private attachListeners(session: IgorSession) {
    session.page.on('console', (msg) => {
      session.consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: Date.now(),
      });
      if (session.consoleMessages.length > 100) session.consoleMessages.shift();
    });

    session.page.on('pageerror', (err) => {
      session.consoleMessages.push({
        type: 'error',
        text: err.message,
        timestamp: Date.now(),
      });
    });
    
    // Update metadata on navigation
    session.page.on('framenavigated', async (frame) => {
      if (frame === session.page.mainFrame()) {
        session.metadata.url = frame.url();
        try {
          session.metadata.title = await session.page.title();
        } catch (e) { /* ignore */ }
      }
    });
  }

  /**
   * Get the current page (of the active session), throwing if not available
   */
  getPage(): Page {
    if (!this.activeSessionId || !this.sessions.has(this.activeSessionId)) {
      throw new Error('No active worker session. Call browser_launch or worker_launch first.');
    }
    return this.sessions.get(this.activeSessionId)!.page;
  }
  
  /**
   * Get specific session or active session
   */
  getSession(id?: string): IgorSession {
    const targetId = id || this.activeSessionId;
    if (!targetId || !this.sessions.has(targetId)) {
      throw new Error(`Worker session ${targetId || 'active'} not found.`);
    }
    return this.sessions.get(targetId)!;
  }

  /**
   * Check if browser is launched
   */
  isLaunched(): boolean {
    return this.browser !== null && this.sessions.size > 0;
  }

  /**
   * Get console messages for active session
   */
  getConsoleMessages(): Array<{ type: string; text: string; timestamp: number }> {
    if (!this.activeSessionId) return [];
    return [...(this.sessions.get(this.activeSessionId)?.consoleMessages || [])];
  }

  /**
   * Clear console messages for active session
   */
  clearConsoleMessages(): void {
    if (this.activeSessionId && this.sessions.has(this.activeSessionId)) {
      this.sessions.get(this.activeSessionId)!.consoleMessages = [];
    }
  }

  /**
   * Close all browser resources
   */
  async closeAll(): Promise<{ success: boolean; message: string }> {
    try {
      const promises = Array.from(this.sessions.values()).map(s => s.context.close().catch(() => {}));
      await Promise.all(promises);
      this.sessions.clear();
      this.activeSessionId = null;

      if (this.browser) {
        await this.browser.close().catch(() => {});
        this.browser = null;
      }

      return {
        success: true,
        message: 'Browser and all workers closed.',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Error closing browser: ${message}`,
      };
    }
  }

  /**
   * Get default timeout from config
   */
  getTimeout(): number {
    return this.config.timeout;
  }

  /**
   * Get self-healing config
   */
  getSelfHealingConfig(): Config['selfHealing'] {
    return this.config.selfHealing;
  }
}
