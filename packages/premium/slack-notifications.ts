/**
 * BarrHawk E2E Slack Notifications
 *
 * Send test results, alerts, and reports to Slack channels.
 * Supports smart notification rules to avoid spam.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// =============================================================================
// Types
// =============================================================================

export interface SlackConfig {
  /** Slack webhook URL */
  webhookUrl: string;
  /** Default channel (can be overridden per notification) */
  defaultChannel?: string;
  /** Bot username */
  username?: string;
  /** Bot icon emoji */
  iconEmoji?: string;
  /** Base URL for links to dashboard */
  dashboardBaseUrl?: string;
  /** Suppress duplicate notifications for this duration (ms) */
  dedupeWindow?: number;
  /** Data directory for tracking sent notifications */
  dataDir?: string;
}

export interface NotificationRule {
  /** When to trigger: 'failure', 'success', 'flaky', 'always' */
  trigger: 'failure' | 'success' | 'flaky' | 'always' | 'recovery';
  /** Only for specific test patterns (regex) */
  testPattern?: string;
  /** Only for specific origins */
  origins?: string[];
  /** Channel to send to (overrides default) */
  channel?: string;
  /** Mention users/groups */
  mentions?: string[];
  /** Include screenshot */
  includeScreenshot?: boolean;
  /** Include error details */
  includeError?: boolean;
  /** Suppress for flaky tests */
  suppressFlaky?: boolean;
}

export interface TestRunSummary {
  runId: string;
  projectId: string;
  status: 'passed' | 'failed' | 'cancelled';
  origin: string;
  duration: number;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  failedTests?: Array<{
    name: string;
    error?: string;
    screenshotUrl?: string;
  }>;
  dashboardUrl?: string;
}

export interface SlackMessage {
  channel?: string;
  username?: string;
  icon_emoji?: string;
  text?: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
}

export interface SlackBlock {
  type: 'section' | 'divider' | 'header' | 'context' | 'actions' | 'image';
  text?: { type: 'mrkdwn' | 'plain_text'; text: string };
  fields?: Array<{ type: 'mrkdwn' | 'plain_text'; text: string }>;
  accessory?: any;
  elements?: any[];
  image_url?: string;
  alt_text?: string;
}

export interface SlackAttachment {
  color?: string;
  title?: string;
  text?: string;
  fields?: Array<{ title: string; value: string; short?: boolean }>;
  footer?: string;
  ts?: number;
}

// =============================================================================
// Slack Notifier
// =============================================================================

export class SlackNotifier {
  private config: Required<SlackConfig>;
  private sentNotifications: Map<string, number> = new Map();
  private rules: NotificationRule[] = [];

  constructor(config: SlackConfig) {
    this.config = {
      defaultChannel: '#testing',
      username: 'BarrHawk',
      iconEmoji: ':hawk:',
      dashboardBaseUrl: 'https://barrhawk.io',
      dedupeWindow: 3600000, // 1 hour
      dataDir: './slack-data',
      ...config,
    };
  }

  async initialize(): Promise<void> {
    await mkdir(this.config.dataDir, { recursive: true });
    await this.loadSentNotifications();
  }

  private async loadSentNotifications(): Promise<void> {
    const filePath = path.join(this.config.dataDir, 'sent-notifications.json');
    if (existsSync(filePath)) {
      try {
        const data = await readFile(filePath, 'utf-8');
        const parsed = JSON.parse(data);
        this.sentNotifications = new Map(Object.entries(parsed));
      } catch {
        // Start fresh
      }
    }
  }

  private async saveSentNotifications(): Promise<void> {
    const filePath = path.join(this.config.dataDir, 'sent-notifications.json');
    const data = Object.fromEntries(this.sentNotifications);
    await writeFile(filePath, JSON.stringify(data, null, 2));
  }

  /**
   * Add notification rules
   */
  addRule(rule: NotificationRule): void {
    this.rules.push(rule);
  }

  /**
   * Clear all rules
   */
  clearRules(): void {
    this.rules = [];
  }

  /**
   * Check if notification should be suppressed (deduplication)
   */
  private shouldSuppress(key: string): boolean {
    const lastSent = this.sentNotifications.get(key);
    if (!lastSent) return false;
    return Date.now() - lastSent < this.config.dedupeWindow;
  }

  private markSent(key: string): void {
    this.sentNotifications.set(key, Date.now());
    // Clean old entries
    const cutoff = Date.now() - this.config.dedupeWindow * 2;
    for (const [k, v] of this.sentNotifications) {
      if (v < cutoff) this.sentNotifications.delete(k);
    }
    this.saveSentNotifications().catch(() => {});
  }

  /**
   * Send a raw Slack message
   */
  async sendMessage(message: SlackMessage): Promise<boolean> {
    const payload = {
      channel: message.channel || this.config.defaultChannel,
      username: message.username || this.config.username,
      icon_emoji: message.icon_emoji || this.config.iconEmoji,
      ...message,
    };

    try {
      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      return response.ok;
    } catch (error) {
      console.error('[Slack] Failed to send message:', error);
      return false;
    }
  }

  /**
   * Send test run summary notification
   */
  async notifyTestRun(summary: TestRunSummary, options: { force?: boolean } = {}): Promise<boolean> {
    // Check rules
    const applicableRules = this.rules.filter(rule => {
      if (rule.trigger === 'failure' && summary.status !== 'failed') return false;
      if (rule.trigger === 'success' && summary.status !== 'passed') return false;
      if (rule.origins && !rule.origins.includes(summary.origin)) return false;
      return true;
    });

    if (applicableRules.length === 0 && !options.force) {
      // No matching rules, use default behavior
      if (summary.status === 'passed') return false; // Don't notify on success by default
    }

    // Check deduplication
    const dedupeKey = `run:${summary.projectId}:${summary.status}`;
    if (!options.force && this.shouldSuppress(dedupeKey)) {
      return false;
    }

    // Build message
    const statusEmoji = summary.status === 'passed' ? ':white_check_mark:' :
                        summary.status === 'failed' ? ':x:' : ':warning:';
    const statusColor = summary.status === 'passed' ? '#22c55e' :
                        summary.status === 'failed' ? '#ef4444' : '#eab308';

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${statusEmoji} Test Run ${summary.status.toUpperCase()}`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Project:*\n${summary.projectId}` },
          { type: 'mrkdwn', text: `*Origin:*\n${summary.origin}` },
          { type: 'mrkdwn', text: `*Duration:*\n${this.formatDuration(summary.duration)}` },
          { type: 'mrkdwn', text: `*Results:*\n:white_check_mark: ${summary.passed} | :x: ${summary.failed} | :fast_forward: ${summary.skipped}` },
        ],
      },
    ];

    // Add failed tests section if any
    if (summary.failedTests && summary.failedTests.length > 0) {
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Failed Tests:*\n' + summary.failedTests.slice(0, 5).map(t =>
            `• \`${t.name}\`${t.error ? `\n   _${t.error.substring(0, 100)}_` : ''}`
          ).join('\n'),
        },
      });
    }

    // Add link to dashboard
    if (summary.dashboardUrl || this.config.dashboardBaseUrl) {
      const url = summary.dashboardUrl || `${this.config.dashboardBaseUrl}/runs/${summary.runId}`;
      blocks.push({
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: 'View Details' },
          url,
        }],
      });
    }

    // Determine channel from rules
    const channel = applicableRules.find(r => r.channel)?.channel || this.config.defaultChannel;

    // Add mentions
    const mentions = applicableRules.flatMap(r => r.mentions || []);
    let text = '';
    if (mentions.length > 0) {
      text = mentions.map(m => m.startsWith('@') ? `<${m}>` : `<@${m}>`).join(' ') + ' ';
    }

    const success = await this.sendMessage({
      channel,
      text: text || `Test run ${summary.status}`,
      blocks,
    });

    if (success) {
      this.markSent(dedupeKey);
    }

    return success;
  }

  /**
   * Send flaky test alert
   */
  async notifyFlakyTest(
    testName: string,
    flakinessScore: number,
    recentResults: Array<{ status: 'passed' | 'failed' }>,
    recommendation: string
  ): Promise<boolean> {
    const dedupeKey = `flaky:${testName}`;
    if (this.shouldSuppress(dedupeKey)) {
      return false;
    }

    const resultsBar = recentResults.slice(-10).map(r =>
      r.status === 'passed' ? ':large_green_circle:' : ':red_circle:'
    ).join('');

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: ':warning: Flaky Test Detected' },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Test:* \`${testName}\`\n*Flakiness Score:* ${(flakinessScore * 100).toFixed(1)}%\n*Recent Results:* ${resultsBar}`,
        },
      },
      {
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: `Recommendation: *${recommendation}*`,
        }],
      },
    ];

    const success = await this.sendMessage({
      text: `Flaky test detected: ${testName}`,
      blocks,
    });

    if (success) {
      this.markSent(dedupeKey);
    }

    return success;
  }

  /**
   * Send visual regression alert
   */
  async notifyVisualRegression(
    screenshotName: string,
    diffPercentage: number,
    baselineUrl?: string,
    actualUrl?: string,
    diffUrl?: string
  ): Promise<boolean> {
    const dedupeKey = `visual:${screenshotName}`;
    if (this.shouldSuppress(dedupeKey)) {
      return false;
    }

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: ':eyes: Visual Regression Detected' },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Screenshot:* \`${screenshotName}\`\n*Difference:* ${diffPercentage.toFixed(2)}%`,
        },
      },
    ];

    if (diffUrl) {
      blocks.push({
        type: 'image',
        image_url: diffUrl,
        alt_text: 'Visual diff',
      });
    }

    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve Change' },
          style: 'primary',
          action_id: 'approve_visual',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Comparison' },
          action_id: 'view_comparison',
        },
      ],
    });

    const success = await this.sendMessage({
      text: `Visual regression: ${screenshotName}`,
      blocks,
    });

    if (success) {
      this.markSent(dedupeKey);
    }

    return success;
  }

  /**
   * Send daily summary
   */
  async notifyDailySummary(
    date: Date,
    stats: {
      totalRuns: number;
      passed: number;
      failed: number;
      flakyTests: number;
      topFailures: Array<{ name: string; count: number }>;
    }
  ): Promise<boolean> {
    const dateStr = date.toISOString().split('T')[0];
    const passRate = stats.totalRuns > 0 ? (stats.passed / stats.totalRuns * 100).toFixed(1) : '0';

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `:bar_chart: Daily Test Summary - ${dateStr}` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Total Runs:*\n${stats.totalRuns}` },
          { type: 'mrkdwn', text: `*Pass Rate:*\n${passRate}%` },
          { type: 'mrkdwn', text: `*Passed:*\n:white_check_mark: ${stats.passed}` },
          { type: 'mrkdwn', text: `*Failed:*\n:x: ${stats.failed}` },
        ],
      },
    ];

    if (stats.flakyTests > 0) {
      blocks.push({
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: `:warning: ${stats.flakyTests} flaky tests detected`,
        }],
      });
    }

    if (stats.topFailures.length > 0) {
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Top Failing Tests:*\n' + stats.topFailures.slice(0, 5).map(t =>
            `• \`${t.name}\` (${t.count} failures)`
          ).join('\n'),
        },
      });
    }

    return this.sendMessage({
      text: `Daily summary for ${dateStr}`,
      blocks,
    });
  }

  /**
   * Send custom alert
   */
  async notifyCustom(
    title: string,
    message: string,
    options: {
      emoji?: string;
      color?: string;
      channel?: string;
      mentions?: string[];
    } = {}
  ): Promise<boolean> {
    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${options.emoji || ':bell:'} ${title}` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: message },
      },
    ];

    let text = '';
    if (options.mentions && options.mentions.length > 0) {
      text = options.mentions.map(m => m.startsWith('@') ? `<${m}>` : `<@${m}>`).join(' ') + ' ';
    }

    return this.sendMessage({
      channel: options.channel,
      text: text || title,
      blocks,
    });
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

let defaultNotifier: SlackNotifier | null = null;

export async function getSlackNotifier(config?: SlackConfig): Promise<SlackNotifier | null> {
  if (!config?.webhookUrl && !process.env.SLACK_WEBHOOK_URL) {
    return null;
  }

  if (!defaultNotifier) {
    defaultNotifier = new SlackNotifier({
      webhookUrl: config?.webhookUrl || process.env.SLACK_WEBHOOK_URL!,
      ...config,
    });
    await defaultNotifier.initialize();
  }

  return defaultNotifier;
}

export async function sendSlackTestResult(
  summary: TestRunSummary,
  webhookUrl?: string
): Promise<boolean> {
  const notifier = await getSlackNotifier({ webhookUrl: webhookUrl || process.env.SLACK_WEBHOOK_URL! });
  if (!notifier) {
    console.warn('[Slack] No webhook URL configured');
    return false;
  }
  return notifier.notifyTestRun(summary, { force: true });
}
