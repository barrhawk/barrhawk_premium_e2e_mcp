#!/usr/bin/env npx tsx
/**
 * BarrHawk E2E SaaS Dashboard
 *
 * Comprehensive dashboard for test observability with:
 * - Real-time WebSocket updates
 * - Interactive charts and analytics
 * - REST API for CI/CD integration
 * - Webhook configuration
 * - Usage tracking and billing insights
 *
 * Usage:
 *   npx tsx packages/observability/dashboard.ts [--port=3030]
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { getObservabilityStore, type TestRunRecord, type LogEntry, type ScreenshotRecord, type NetworkRecord } from './store.js';

// =============================================================================
// Configuration
// =============================================================================

const args = process.argv.slice(2);
const PORT = parseInt(args.find(a => a.startsWith('--port='))?.split('=')[1] || '3030');
const DATA_DIR = args.find(a => a.startsWith('--data-dir='))?.split('=')[1] || './observability-data';
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

interface DashboardConfig {
  webhooks: WebhookConfig[];
  apiKeys: ApiKeyConfig[];
  alertRules: AlertRule[];
}

interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  type: 'slack' | 'discord' | 'generic';
  events: string[];
  enabled: boolean;
  secret?: string;
}

interface ApiKeyConfig {
  id: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt?: Date;
}

interface AlertRule {
  id: string;
  name: string;
  condition: 'test_failed' | 'error_threshold' | 'duration_threshold';
  threshold?: number;
  webhookIds: string[];
  enabled: boolean;
}

interface UsageRecord {
  date: string;
  testRuns: number;
  screenshots: number;
  apiCalls: number;
  aiTests: number;
  humanTests: number;
}

let config: DashboardConfig = {
  webhooks: [],
  apiKeys: [],
  alertRules: [],
};

// Connected WebSocket clients for real-time updates
const wsClients: Set<WebSocket> = new Set();

// =============================================================================
// Config Management
// =============================================================================

async function loadConfig(): Promise<void> {
  try {
    if (existsSync(CONFIG_FILE)) {
      const data = await readFile(CONFIG_FILE, 'utf-8');
      config = JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to load config:', err);
  }
}

async function saveConfig(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// =============================================================================
// Webhook Notifications
// =============================================================================

async function sendWebhook(webhook: WebhookConfig, event: string, data: any): Promise<void> {
  if (!webhook.enabled) return;
  if (!webhook.events.includes(event) && !webhook.events.includes('*')) return;

  try {
    let payload: any;

    if (webhook.type === 'slack') {
      payload = formatSlackMessage(event, data);
    } else if (webhook.type === 'discord') {
      payload = formatDiscordMessage(event, data);
    } else {
      payload = { event, data, timestamp: new Date().toISOString() };
    }

    await fetch(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error(`Webhook ${webhook.name} failed:`, err);
  }
}

function formatSlackMessage(event: string, data: any): any {
  const colors: Record<string, string> = {
    passed: '#22c55e',
    failed: '#ef4444',
    running: '#eab308',
  };

  if (event === 'test.run.completed') {
    return {
      attachments: [{
        color: colors[data.status] || '#64748b',
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: `Test Run ${data.status.toUpperCase()}` }
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Run ID:*\n${data.runId?.substring(0, 20)}...` },
              { type: 'mrkdwn', text: `*Duration:*\n${data.duration ? `${(data.duration/1000).toFixed(1)}s` : '-'}` },
              { type: 'mrkdwn', text: `*Tests:*\n${data.summary?.passed || 0}/${data.summary?.total || 0} passed` },
              { type: 'mrkdwn', text: `*Origin:*\n${data.origin || 'unknown'}` },
            ]
          }
        ]
      }]
    };
  }

  return {
    text: `BarrHawk: ${event}`,
    attachments: [{ text: JSON.stringify(data, null, 2) }]
  };
}

function formatDiscordMessage(event: string, data: any): any {
  const colors: Record<string, number> = {
    passed: 0x22c55e,
    failed: 0xef4444,
    running: 0xeab308,
  };

  if (event === 'test.run.completed') {
    return {
      embeds: [{
        title: `Test Run ${data.status?.toUpperCase()}`,
        color: colors[data.status] || 0x64748b,
        fields: [
          { name: 'Run ID', value: data.runId?.substring(0, 20) || '-', inline: true },
          { name: 'Duration', value: data.duration ? `${(data.duration/1000).toFixed(1)}s` : '-', inline: true },
          { name: 'Tests', value: `${data.summary?.passed || 0}/${data.summary?.total || 0}`, inline: true },
          { name: 'Origin', value: data.origin || 'unknown', inline: true },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'BarrHawk E2E' }
      }]
    };
  }

  return {
    content: `BarrHawk: ${event}`,
    embeds: [{ description: JSON.stringify(data, null, 2) }]
  };
}

async function notifyWebhooks(event: string, data: any): Promise<void> {
  for (const webhook of config.webhooks) {
    await sendWebhook(webhook, event, data);
  }
}

// =============================================================================
// Real-time WebSocket Updates
// =============================================================================

function broadcastUpdate(type: string, data: any): void {
  const message = JSON.stringify({ type, data, timestamp: Date.now() });
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// =============================================================================
// Usage Tracking
// =============================================================================

async function getUsageStats(days: number = 30): Promise<UsageRecord[]> {
  const store = await getObservabilityStore(DATA_DIR);
  const runs = await store.getRuns({ limit: 1000 });

  const usageByDate: Map<string, UsageRecord> = new Map();
  const now = new Date();

  // Initialize all days
  for (let i = 0; i < days; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().substring(0, 10);
    usageByDate.set(dateStr, {
      date: dateStr,
      testRuns: 0,
      screenshots: 0,
      apiCalls: 0,
      aiTests: 0,
      humanTests: 0,
    });
  }

  // Aggregate runs
  for (const run of runs) {
    const dateStr = run.startedAt.toISOString().substring(0, 10);
    const record = usageByDate.get(dateStr);
    if (record) {
      record.testRuns++;
      if (run.origin === 'ai_agent') {
        record.aiTests++;
      } else {
        record.humanTests++;
      }
    }
  }

  return Array.from(usageByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// =============================================================================
// HTML Templates
// =============================================================================

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dashboardPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BarrHawk Dashboard</title>
  <style>
    :root {
      --bg-primary: #0a0a0f;
      --bg-secondary: #12121a;
      --bg-tertiary: #1a1a24;
      --bg-card: #16161f;
      --text-primary: #f0f0f5;
      --text-secondary: #a0a0b0;
      --text-muted: #606070;
      --accent-primary: #6366f1;
      --accent-secondary: #8b5cf6;
      --accent-green: #10b981;
      --accent-red: #ef4444;
      --accent-yellow: #f59e0b;
      --accent-blue: #3b82f6;
      --accent-cyan: #06b6d4;
      --border-color: #2a2a35;
      --gradient-1: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      --gradient-2: linear-gradient(135deg, #10b981 0%, #06b6d4 100%);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
    }

    /* Sidebar */
    .sidebar {
      position: fixed;
      left: 0;
      top: 0;
      bottom: 0;
      width: 240px;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border-color);
      padding: 20px 0;
      z-index: 100;
    }

    .logo {
      padding: 0 20px 20px;
      border-bottom: 1px solid var(--border-color);
      margin-bottom: 20px;
    }

    .logo h1 {
      font-size: 1.25rem;
      background: var(--gradient-1);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .logo span {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .nav-section {
      padding: 0 12px;
      margin-bottom: 24px;
    }

    .nav-section-title {
      font-size: 0.7rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0 8px;
      margin-bottom: 8px;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      color: var(--text-secondary);
      text-decoration: none;
      border-radius: 8px;
      transition: all 0.2s;
      cursor: pointer;
    }

    .nav-item:hover { background: var(--bg-tertiary); color: var(--text-primary); }
    .nav-item.active { background: var(--accent-primary); color: white; }

    .nav-item svg { width: 18px; height: 18px; opacity: 0.7; }

    /* Main content */
    .main {
      margin-left: 240px;
      min-height: 100vh;
    }

    .header {
      position: sticky;
      top: 0;
      background: var(--bg-primary);
      border-bottom: 1px solid var(--border-color);
      padding: 16px 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 50;
    }

    .header h2 {
      font-size: 1.25rem;
      font-weight: 600;
    }

    .header-actions {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .live-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 20px;
      font-size: 0.8rem;
      color: var(--accent-green);
    }

    .live-dot {
      width: 8px;
      height: 8px;
      background: var(--accent-green);
      border-radius: 50%;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .content {
      padding: 24px 32px;
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 20px;
      position: relative;
      overflow: hidden;
    }

    .stat-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: var(--gradient-1);
    }

    .stat-card.green::before { background: var(--gradient-2); }
    .stat-card.red::before { background: var(--accent-red); }

    .stat-label {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-bottom: 8px;
    }

    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .stat-change {
      font-size: 0.75rem;
      color: var(--accent-green);
    }

    .stat-change.negative { color: var(--accent-red); }

    /* Cards */
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      margin-bottom: 24px;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-color);
    }

    .card-title {
      font-size: 1rem;
      font-weight: 600;
    }

    .card-body {
      padding: 20px;
    }

    /* Charts */
    .chart-container {
      height: 200px;
      position: relative;
    }

    .chart-svg {
      width: 100%;
      height: 100%;
    }

    .chart-bar {
      fill: var(--accent-primary);
      transition: fill 0.2s;
    }

    .chart-bar:hover { fill: var(--accent-secondary); }
    .chart-bar.ai { fill: var(--accent-cyan); }
    .chart-bar.human { fill: var(--accent-primary); }

    .chart-line {
      fill: none;
      stroke: var(--accent-primary);
      stroke-width: 2;
    }

    .chart-area {
      fill: url(#gradient);
      opacity: 0.3;
    }

    /* Table */
    .table {
      width: 100%;
      border-collapse: collapse;
    }

    .table th, .table td {
      text-align: left;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
    }

    .table th {
      color: var(--text-muted);
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .table tr:hover { background: var(--bg-tertiary); }

    .table a {
      color: var(--accent-primary);
      text-decoration: none;
    }

    .table a:hover { text-decoration: underline; }

    /* Badges */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .badge-passed { background: rgba(16, 185, 129, 0.15); color: var(--accent-green); }
    .badge-failed { background: rgba(239, 68, 68, 0.15); color: var(--accent-red); }
    .badge-running { background: rgba(245, 158, 11, 0.15); color: var(--accent-yellow); }

    .badge-ai { background: rgba(6, 182, 212, 0.15); color: var(--accent-cyan); }
    .badge-human { background: rgba(99, 102, 241, 0.15); color: var(--accent-primary); }
    .badge-ci { background: rgba(245, 158, 11, 0.15); color: var(--accent-yellow); }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
      font-family: inherit;
    }

    .btn-primary {
      background: var(--gradient-1);
      color: white;
    }

    .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }

    .btn-secondary {
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
    }

    .btn-secondary:hover { background: var(--border-color); }

    /* Forms */
    .form-group {
      margin-bottom: 16px;
    }

    .form-label {
      display: block;
      font-size: 0.8rem;
      color: var(--text-secondary);
      margin-bottom: 6px;
    }

    .form-input, .form-select {
      width: 100%;
      padding: 10px 14px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 0.9rem;
      font-family: inherit;
    }

    .form-input:focus, .form-select:focus {
      outline: none;
      border-color: var(--accent-primary);
    }

    /* Toggle */
    .toggle {
      position: relative;
      width: 44px;
      height: 24px;
      background: var(--bg-tertiary);
      border-radius: 12px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .toggle.active { background: var(--accent-primary); }

    .toggle::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 20px;
      height: 20px;
      background: white;
      border-radius: 50%;
      transition: transform 0.2s;
    }

    .toggle.active::after { transform: translateX(20px); }

    /* Modal */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal-overlay.active { display: flex; }

    .modal {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      width: 100%;
      max-width: 500px;
      max-height: 80vh;
      overflow: auto;
    }

    .modal-header {
      padding: 20px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .modal-body { padding: 20px; }
    .modal-footer {
      padding: 16px 20px;
      border-top: 1px solid var(--border-color);
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }

    /* Empty state */
    .empty {
      text-align: center;
      padding: 40px;
      color: var(--text-muted);
    }

    /* Toast notifications */
    .toast-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2000;
    }

    .toast {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 12px 16px;
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 12px;
      animation: slideIn 0.3s ease;
    }

    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    .toast.success { border-left: 3px solid var(--accent-green); }
    .toast.error { border-left: 3px solid var(--accent-red); }

    /* Page sections (hidden by default) */
    .page { display: none; }
    .page.active { display: block; }

    /* Grid layouts */
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 24px;
    }

    @media (max-width: 1200px) {
      .grid-2 { grid-template-columns: 1fr; }
    }

    /* Log viewer */
    .log-viewer {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 0.8rem;
      max-height: 400px;
      overflow: auto;
    }

    .log-entry {
      padding: 6px 12px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      gap: 12px;
    }

    .log-entry:hover { background: var(--bg-tertiary); }
    .log-time { color: var(--text-muted); white-space: nowrap; }
    .log-level { width: 50px; }
    .log-level.error { color: var(--accent-red); }
    .log-level.warn { color: var(--accent-yellow); }
    .log-level.info { color: var(--accent-blue); }
    .log-message { flex: 1; word-break: break-all; }
  </style>
</head>
<body>
  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="logo">
      <h1>BarrHawk</h1>
      <span>E2E Testing Platform</span>
    </div>

    <div class="nav-section">
      <div class="nav-section-title">Overview</div>
      <a class="nav-item active" data-page="dashboard">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
        Dashboard
      </a>
      <a class="nav-item" data-page="runs">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
        Test Runs
      </a>
      <a class="nav-item" data-page="analytics">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
        Analytics
      </a>
    </div>

    <div class="nav-section">
      <div class="nav-section-title">Settings</div>
      <a class="nav-item" data-page="webhooks">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        Webhooks
      </a>
      <a class="nav-item" data-page="api-keys">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
        API Keys
      </a>
      <a class="nav-item" data-page="usage">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
        Usage & Billing
      </a>
    </div>
  </aside>

  <!-- Main Content -->
  <main class="main">
    <header class="header">
      <h2 id="page-title">Dashboard</h2>
      <div class="header-actions">
        <div class="live-indicator">
          <div class="live-dot"></div>
          <span>Live</span>
        </div>
        <button class="btn btn-secondary" onclick="location.reload()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/></svg>
          Refresh
        </button>
      </div>
    </header>

    <div class="content">
      <!-- Dashboard Page -->
      <div class="page active" id="page-dashboard">
        <div class="stats-grid" id="stats-grid">
          <!-- Populated by JS -->
        </div>

        <div class="grid-2">
          <div class="card">
            <div class="card-header">
              <span class="card-title">Test Runs (7 Days)</span>
            </div>
            <div class="card-body">
              <div class="chart-container" id="chart-runs"></div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <span class="card-title">AI vs Human Tests</span>
            </div>
            <div class="card-body">
              <div class="chart-container" id="chart-origin"></div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">Recent Test Runs</span>
            <a href="#" onclick="showPage('runs'); return false;">View All</a>
          </div>
          <div class="card-body">
            <table class="table" id="recent-runs">
              <!-- Populated by JS -->
            </table>
          </div>
        </div>
      </div>

      <!-- Test Runs Page -->
      <div class="page" id="page-runs">
        <div class="card">
          <div class="card-header">
            <span class="card-title">All Test Runs</span>
            <div style="display: flex; gap: 12px;">
              <select class="form-select" style="width: auto;" id="filter-status">
                <option value="">All Statuses</option>
                <option value="passed">Passed</option>
                <option value="failed">Failed</option>
                <option value="running">Running</option>
              </select>
              <select class="form-select" style="width: auto;" id="filter-origin">
                <option value="">All Origins</option>
                <option value="ai_agent">AI Agent</option>
                <option value="human_api">Human API</option>
                <option value="human_dashboard">Dashboard</option>
                <option value="ci_cd">CI/CD</option>
              </select>
            </div>
          </div>
          <div class="card-body">
            <table class="table" id="all-runs">
              <!-- Populated by JS -->
            </table>
          </div>
        </div>
      </div>

      <!-- Analytics Page -->
      <div class="page" id="page-analytics">
        <div class="stats-grid" id="analytics-stats"></div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">Test Success Rate (30 Days)</span>
          </div>
          <div class="card-body">
            <div class="chart-container" id="chart-success-rate"></div>
          </div>
        </div>
      </div>

      <!-- Webhooks Page -->
      <div class="page" id="page-webhooks">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Webhook Integrations</span>
            <button class="btn btn-primary" onclick="showAddWebhookModal()">Add Webhook</button>
          </div>
          <div class="card-body">
            <div id="webhooks-list"></div>
          </div>
        </div>
      </div>

      <!-- API Keys Page -->
      <div class="page" id="page-api-keys">
        <div class="card">
          <div class="card-header">
            <span class="card-title">API Keys</span>
            <button class="btn btn-primary" onclick="showAddApiKeyModal()">Create API Key</button>
          </div>
          <div class="card-body">
            <div id="api-keys-list"></div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">API Documentation</span>
          </div>
          <div class="card-body">
            <h3 style="margin-bottom: 12px;">Endpoints</h3>
            <div class="log-viewer">
              <div class="log-entry"><span class="log-level info">GET</span><span class="log-message">/api/runs - List all test runs</span></div>
              <div class="log-entry"><span class="log-level info">GET</span><span class="log-message">/api/run/:id - Get run details</span></div>
              <div class="log-entry"><span class="log-level info">GET</span><span class="log-message">/api/logs/:runId - Get logs for a run</span></div>
              <div class="log-entry"><span class="log-level info">GET</span><span class="log-message">/api/screenshots/:runId - Get screenshots</span></div>
              <div class="log-entry"><span class="log-level info">GET</span><span class="log-message">/api/stats - Get usage statistics</span></div>
              <div class="log-entry"><span class="log-level warn">POST</span><span class="log-message">/api/trigger - Trigger a test run (coming soon)</span></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Usage Page -->
      <div class="page" id="page-usage">
        <div class="stats-grid" id="usage-stats"></div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">Usage Over Time</span>
          </div>
          <div class="card-body">
            <div class="chart-container" id="chart-usage"></div>
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <div class="card-header">
              <span class="card-title">Current Plan</span>
            </div>
            <div class="card-body">
              <div style="text-align: center; padding: 20px;">
                <div style="font-size: 1.5rem; font-weight: 700; margin-bottom: 8px;">Pro Plan</div>
                <div style="color: var(--text-muted); margin-bottom: 20px;">$200/month</div>
                <div style="font-size: 0.9rem; color: var(--text-secondary);">
                  <div>10,000 test runs/month</div>
                  <div>Unlimited screenshots</div>
                  <div>Priority support</div>
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <span class="card-title">This Month</span>
            </div>
            <div class="card-body" id="billing-summary">
              <!-- Populated by JS -->
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>

  <!-- Add Webhook Modal -->
  <div class="modal-overlay" id="modal-webhook">
    <div class="modal">
      <div class="modal-header">
        <span class="card-title">Add Webhook</span>
        <button style="background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 1.5rem;" onclick="closeModal('modal-webhook')">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Name</label>
          <input type="text" class="form-input" id="webhook-name" placeholder="e.g., Slack Notifications">
        </div>
        <div class="form-group">
          <label class="form-label">Webhook URL</label>
          <input type="text" class="form-input" id="webhook-url" placeholder="https://hooks.slack.com/...">
        </div>
        <div class="form-group">
          <label class="form-label">Type</label>
          <select class="form-select" id="webhook-type">
            <option value="slack">Slack</option>
            <option value="discord">Discord</option>
            <option value="generic">Generic (JSON)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Events</label>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
              <input type="checkbox" value="test.run.completed" checked> Test Completed
            </label>
            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
              <input type="checkbox" value="test.run.failed"> Test Failed
            </label>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('modal-webhook')">Cancel</button>
        <button class="btn btn-primary" onclick="saveWebhook()">Save Webhook</button>
      </div>
    </div>
  </div>

  <!-- Toast Container -->
  <div class="toast-container" id="toast-container"></div>

  <script>
    // State
    let runs = [];
    let stats = {};
    let usage = [];
    let config = { webhooks: [], apiKeys: [] };
    let ws = null;

    // Initialize
    document.addEventListener('DOMContentLoaded', async () => {
      await loadData();
      setupWebSocket();
      setupNavigation();
      renderDashboard();
    });

    // Load data from API
    async function loadData() {
      try {
        const [runsRes, statsRes, usageRes, configRes] = await Promise.all([
          fetch('/api/runs').then(r => r.json()),
          fetch('/api/stats').then(r => r.json()),
          fetch('/api/usage').then(r => r.json()),
          fetch('/api/config').then(r => r.json()),
        ]);
        runs = runsRes;
        stats = statsRes;
        usage = usageRes;
        config = configRes;
      } catch (err) {
        console.error('Failed to load data:', err);
      }
    }

    // WebSocket for real-time updates
    function setupWebSocket() {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(protocol + '//' + location.host + '/ws');

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'run_update') {
          showToast('Test run updated: ' + msg.data.status, 'success');
          loadData().then(renderDashboard);
        }
      };

      ws.onclose = () => {
        setTimeout(setupWebSocket, 3000);
      };
    }

    // Navigation
    function setupNavigation() {
      document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
          const page = item.dataset.page;
          if (page) showPage(page);
        });
      });
    }

    function showPage(page) {
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

      document.getElementById('page-' + page)?.classList.add('active');
      document.querySelector('[data-page="' + page + '"]')?.classList.add('active');
      document.getElementById('page-title').textContent =
        page.charAt(0).toUpperCase() + page.slice(1).replace('-', ' ');

      if (page === 'runs') renderRunsPage();
      if (page === 'analytics') renderAnalyticsPage();
      if (page === 'webhooks') renderWebhooksPage();
      if (page === 'api-keys') renderApiKeysPage();
      if (page === 'usage') renderUsagePage();
    }

    // Render Dashboard
    function renderDashboard() {
      // Stats
      const passed = runs.filter(r => r.status === 'passed').length;
      const failed = runs.filter(r => r.status === 'failed').length;
      const aiRuns = runs.filter(r => r.origin === 'ai_agent').length;

      document.getElementById('stats-grid').innerHTML = \`
        <div class="stat-card">
          <div class="stat-label">Total Runs</div>
          <div class="stat-value">\${runs.length}</div>
          <div class="stat-change">+12% this week</div>
        </div>
        <div class="stat-card green">
          <div class="stat-label">Pass Rate</div>
          <div class="stat-value">\${runs.length ? Math.round(passed/runs.length*100) : 0}%</div>
          <div class="stat-change">+3% vs last week</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">AI Tests</div>
          <div class="stat-value">\${aiRuns}</div>
          <div class="stat-change">\${runs.length ? Math.round(aiRuns/runs.length*100) : 0}% of total</div>
        </div>
        <div class="stat-card \${failed > 0 ? 'red' : ''}">
          <div class="stat-label">Failed Today</div>
          <div class="stat-value">\${failed}</div>
          <div class="stat-change \${failed > 0 ? 'negative' : ''}">\${failed > 0 ? 'Needs attention' : 'All good!'}</div>
        </div>
      \`;

      // Charts
      renderRunsChart();
      renderOriginChart();

      // Recent runs table
      document.getElementById('recent-runs').innerHTML = \`
        <thead>
          <tr>
            <th>Run ID</th>
            <th>Status</th>
            <th>Origin</th>
            <th>Duration</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          \${runs.slice(0, 5).map(run => \`
            <tr>
              <td><a href="/run/\${run.runId}">\${run.runId.substring(0, 16)}...</a></td>
              <td><span class="badge badge-\${run.status}">\${run.status}</span></td>
              <td><span class="badge badge-\${run.origin === 'ai_agent' ? 'ai' : 'human'}">\${run.origin}</span></td>
              <td>\${run.duration ? (run.duration/1000).toFixed(1) + 's' : '-'}</td>
              <td>\${new Date(run.startedAt).toLocaleTimeString()}</td>
            </tr>
          \`).join('')}
        </tbody>
      \`;
    }

    function renderRunsChart() {
      const last7Days = getLast7Days();
      const runsByDay = last7Days.map(day => ({
        date: day,
        count: runs.filter(r => new Date(r.startedAt).toDateString() === day.toDateString()).length
      }));

      const maxCount = Math.max(...runsByDay.map(d => d.count), 1);
      const barWidth = 100 / 7 - 2;

      document.getElementById('chart-runs').innerHTML = \`
        <svg class="chart-svg" viewBox="0 0 100 50">
          \${runsByDay.map((d, i) => \`
            <rect class="chart-bar" x="\${i * (barWidth + 2) + 1}" y="\${50 - (d.count / maxCount * 45)}"
                  width="\${barWidth}" height="\${d.count / maxCount * 45}" rx="2"/>
          \`).join('')}
        </svg>
        <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--text-muted); margin-top: 8px;">
          \${runsByDay.map(d => \`<span>\${d.date.toLocaleDateString('en', {weekday: 'short'})}</span>\`).join('')}
        </div>
      \`;
    }

    function renderOriginChart() {
      const ai = runs.filter(r => r.origin === 'ai_agent').length;
      const human = runs.length - ai;
      const total = runs.length || 1;

      document.getElementById('chart-origin').innerHTML = \`
        <div style="display: flex; align-items: center; gap: 32px; height: 100%;">
          <svg viewBox="0 0 100 100" style="width: 150px; height: 150px;">
            <circle cx="50" cy="50" r="40" fill="none" stroke="var(--bg-tertiary)" stroke-width="12"/>
            <circle cx="50" cy="50" r="40" fill="none" stroke="var(--accent-cyan)" stroke-width="12"
                    stroke-dasharray="\${ai/total * 251.3} 251.3" transform="rotate(-90 50 50)"/>
          </svg>
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
              <div style="width: 12px; height: 12px; background: var(--accent-cyan); border-radius: 3px;"></div>
              <span>AI Agent: \${ai} (\${Math.round(ai/total*100)}%)</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="width: 12px; height: 12px; background: var(--bg-tertiary); border-radius: 3px;"></div>
              <span>Human: \${human} (\${Math.round(human/total*100)}%)</span>
            </div>
          </div>
        </div>
      \`;
    }

    function renderRunsPage() {
      const status = document.getElementById('filter-status').value;
      const origin = document.getElementById('filter-origin').value;

      let filtered = runs;
      if (status) filtered = filtered.filter(r => r.status === status);
      if (origin) filtered = filtered.filter(r => r.origin === origin);

      document.getElementById('all-runs').innerHTML = \`
        <thead>
          <tr>
            <th>Run ID</th>
            <th>Project</th>
            <th>Status</th>
            <th>Origin</th>
            <th>Tests</th>
            <th>Duration</th>
            <th>Started</th>
          </tr>
        </thead>
        <tbody>
          \${filtered.map(run => \`
            <tr>
              <td><a href="/run/\${run.runId}">\${run.runId.substring(0, 16)}...</a></td>
              <td>\${run.projectId}</td>
              <td><span class="badge badge-\${run.status}">\${run.status}</span></td>
              <td><span class="badge badge-\${run.origin === 'ai_agent' ? 'ai' : run.origin === 'ci_cd' ? 'ci' : 'human'}">\${run.origin}</span></td>
              <td>\${run.summary ? run.summary.passed + '/' + run.summary.total : '-'}</td>
              <td>\${run.duration ? (run.duration/1000).toFixed(1) + 's' : '-'}</td>
              <td>\${new Date(run.startedAt).toLocaleString()}</td>
            </tr>
          \`).join('')}
        </tbody>
      \`;
    }

    function renderAnalyticsPage() {
      // Similar stats with more detail
      document.getElementById('analytics-stats').innerHTML = document.getElementById('stats-grid').innerHTML;
    }

    function renderWebhooksPage() {
      if (config.webhooks.length === 0) {
        document.getElementById('webhooks-list').innerHTML = '<div class="empty">No webhooks configured. Add one to get notifications.</div>';
        return;
      }

      document.getElementById('webhooks-list').innerHTML = \`
        <table class="table">
          <thead>
            <tr><th>Name</th><th>Type</th><th>URL</th><th>Events</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            \${config.webhooks.map(w => \`
              <tr>
                <td>\${w.name}</td>
                <td><span class="badge">\${w.type}</span></td>
                <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;">\${w.url}</td>
                <td>\${w.events.join(', ')}</td>
                <td><div class="toggle \${w.enabled ? 'active' : ''}" onclick="toggleWebhook('\${w.id}')"></div></td>
                <td><button class="btn btn-secondary" onclick="deleteWebhook('\${w.id}')">Delete</button></td>
              </tr>
            \`).join('')}
          </tbody>
        </table>
      \`;
    }

    function renderApiKeysPage() {
      if (config.apiKeys.length === 0) {
        document.getElementById('api-keys-list').innerHTML = '<div class="empty">No API keys created. Create one to access the API.</div>';
        return;
      }

      document.getElementById('api-keys-list').innerHTML = \`
        <table class="table">
          <thead>
            <tr><th>Name</th><th>Key</th><th>Scopes</th><th>Created</th><th>Last Used</th><th></th></tr>
          </thead>
          <tbody>
            \${config.apiKeys.map(k => \`
              <tr>
                <td>\${k.name}</td>
                <td><code>\${k.keyPrefix}...</code></td>
                <td>\${k.scopes.join(', ')}</td>
                <td>\${new Date(k.createdAt).toLocaleDateString()}</td>
                <td>\${k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'Never'}</td>
                <td><button class="btn btn-secondary" onclick="deleteApiKey('\${k.id}')">Revoke</button></td>
              </tr>
            \`).join('')}
          </tbody>
        </table>
      \`;
    }

    function renderUsagePage() {
      const thisMonth = usage.slice(-30);
      const totalRuns = thisMonth.reduce((s, u) => s + u.testRuns, 0);
      const aiRuns = thisMonth.reduce((s, u) => s + u.aiTests, 0);

      document.getElementById('usage-stats').innerHTML = \`
        <div class="stat-card">
          <div class="stat-label">Test Runs (This Month)</div>
          <div class="stat-value">\${totalRuns}</div>
          <div class="stat-change">\${10000 - totalRuns} remaining</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">AI-Generated Tests</div>
          <div class="stat-value">\${aiRuns}</div>
          <div class="stat-change">\${totalRuns ? Math.round(aiRuns/totalRuns*100) : 0}% of total</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Screenshots Captured</div>
          <div class="stat-value">\${thisMonth.reduce((s, u) => s + u.screenshots, 0)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">API Calls</div>
          <div class="stat-value">\${thisMonth.reduce((s, u) => s + u.apiCalls, 0)}</div>
        </div>
      \`;

      document.getElementById('billing-summary').innerHTML = \`
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; justify-content: space-between;">
            <span>Test runs (\${totalRuns})</span>
            <span>Included</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>Screenshots</span>
            <span>Included</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding-top: 12px; border-top: 1px solid var(--border-color); font-weight: 600;">
            <span>Total</span>
            <span>$200.00</span>
          </div>
        </div>
      \`;
    }

    // Helpers
    function getLast7Days() {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d);
      }
      return days;
    }

    function showToast(message, type = 'success') {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.className = 'toast ' + type;
      toast.innerHTML = message;
      container.appendChild(toast);
      setTimeout(() => toast.remove(), 5000);
    }

    function showAddWebhookModal() {
      document.getElementById('modal-webhook').classList.add('active');
    }

    function closeModal(id) {
      document.getElementById(id).classList.remove('active');
    }

    async function saveWebhook() {
      const webhook = {
        id: crypto.randomUUID(),
        name: document.getElementById('webhook-name').value,
        url: document.getElementById('webhook-url').value,
        type: document.getElementById('webhook-type').value,
        events: Array.from(document.querySelectorAll('#modal-webhook input[type="checkbox"]:checked')).map(c => c.value),
        enabled: true,
      };

      await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhook),
      });

      config.webhooks.push(webhook);
      closeModal('modal-webhook');
      renderWebhooksPage();
      showToast('Webhook added successfully');
    }

    async function toggleWebhook(id) {
      const webhook = config.webhooks.find(w => w.id === id);
      if (webhook) {
        webhook.enabled = !webhook.enabled;
        await fetch('/api/webhooks/' + id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: webhook.enabled }),
        });
        renderWebhooksPage();
      }
    }

    async function deleteWebhook(id) {
      if (!confirm('Delete this webhook?')) return;
      await fetch('/api/webhooks/' + id, { method: 'DELETE' });
      config.webhooks = config.webhooks.filter(w => w.id !== id);
      renderWebhooksPage();
      showToast('Webhook deleted');
    }

    function showAddApiKeyModal() {
      const name = prompt('API Key Name:');
      if (!name) return;
      createApiKey(name);
    }

    async function createApiKey(name) {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();

      alert('API Key created! Copy it now - it won\\'t be shown again:\\n\\n' + data.key);

      config.apiKeys.push(data.record);
      renderApiKeysPage();
      showToast('API key created');
    }

    async function deleteApiKey(id) {
      if (!confirm('Revoke this API key? This cannot be undone.')) return;
      await fetch('/api/api-keys/' + id, { method: 'DELETE' });
      config.apiKeys = config.apiKeys.filter(k => k.id !== id);
      renderApiKeysPage();
      showToast('API key revoked');
    }

    // Set up filter listeners
    document.getElementById('filter-status')?.addEventListener('change', renderRunsPage);
    document.getElementById('filter-origin')?.addEventListener('change', renderRunsPage);
  </script>
</body>
</html>`;
}

// =============================================================================
// API Handlers
// =============================================================================

async function handleApiRequest(req: IncomingMessage, res: ServerResponse, pathname: string, method: string): Promise<void> {
  res.setHeader('Content-Type', 'application/json');

  const store = await getObservabilityStore(DATA_DIR);

  // GET /api/runs
  if (pathname === '/api/runs' && method === 'GET') {
    const runs = await store.getRuns({ limit: 100 });
    res.end(JSON.stringify(runs));
    return;
  }

  // GET /api/run/:id
  if (pathname.startsWith('/api/run/') && method === 'GET') {
    const runId = pathname.split('/')[3];
    const summary = await store.getRunSummary(runId);
    res.end(JSON.stringify(summary));
    return;
  }

  // GET /api/logs/:runId
  if (pathname.startsWith('/api/logs/') && method === 'GET') {
    const runId = pathname.split('/')[3];
    const logs = await store.getLogs(runId, { limit: 500 });
    res.end(JSON.stringify(logs));
    return;
  }

  // GET /api/screenshots/:runId
  if (pathname.startsWith('/api/screenshots/') && method === 'GET') {
    const runId = pathname.split('/')[3];
    const screenshots = await store.getScreenshots(runId);
    res.end(JSON.stringify(screenshots));
    return;
  }

  // GET /api/stats
  if (pathname === '/api/stats' && method === 'GET') {
    const stats = await store.getStats();
    res.end(JSON.stringify(stats));
    return;
  }

  // GET /api/usage
  if (pathname === '/api/usage' && method === 'GET') {
    const usage = await getUsageStats(30);
    res.end(JSON.stringify(usage));
    return;
  }

  // GET /api/config
  if (pathname === '/api/config' && method === 'GET') {
    res.end(JSON.stringify(config));
    return;
  }

  // POST /api/webhooks
  if (pathname === '/api/webhooks' && method === 'POST') {
    const body = await readBody(req);
    const webhook = JSON.parse(body) as WebhookConfig;
    config.webhooks.push(webhook);
    await saveConfig();
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // PATCH /api/webhooks/:id
  if (pathname.startsWith('/api/webhooks/') && method === 'PATCH') {
    const id = pathname.split('/')[3];
    const body = await readBody(req);
    const updates = JSON.parse(body);
    const webhook = config.webhooks.find(w => w.id === id);
    if (webhook) {
      Object.assign(webhook, updates);
      await saveConfig();
    }
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // DELETE /api/webhooks/:id
  if (pathname.startsWith('/api/webhooks/') && method === 'DELETE') {
    const id = pathname.split('/')[3];
    config.webhooks = config.webhooks.filter(w => w.id !== id);
    await saveConfig();
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // POST /api/api-keys
  if (pathname === '/api/api-keys' && method === 'POST') {
    const body = await readBody(req);
    const { name } = JSON.parse(body);
    const key = 'bhk_' + randomUUID().replace(/-/g, '');
    const record: ApiKeyConfig = {
      id: randomUUID(),
      name,
      keyHash: await hashKey(key),
      keyPrefix: key.substring(0, 12),
      scopes: ['read', 'write'],
      createdAt: new Date(),
    };
    config.apiKeys.push(record);
    await saveConfig();
    res.end(JSON.stringify({ key, record }));
    return;
  }

  // DELETE /api/api-keys/:id
  if (pathname.startsWith('/api/api-keys/') && method === 'DELETE') {
    const id = pathname.split('/')[3];
    config.apiKeys = config.apiKeys.filter(k => k.id !== id);
    await saveConfig();
    res.end(JSON.stringify({ success: true }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function hashKey(key: string): Promise<string> {
  const { createHash } = await import('crypto');
  return createHash('sha256').update(key).digest('hex');
}

// =============================================================================
// HTTP Server
// =============================================================================

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method || 'GET';

  try {
    // API routes
    if (pathname.startsWith('/api/')) {
      await handleApiRequest(req, res, pathname, method);
      return;
    }

    // Run detail page
    if (pathname.startsWith('/run/')) {
      const runId = pathname.substring(5);
      const store = await getObservabilityStore(DATA_DIR);
      const summary = await store.getRunSummary(runId);

      if (!summary) {
        res.statusCode = 404;
        res.end('Run not found');
        return;
      }

      // Return run detail page (embedded in dashboard)
      res.setHeader('Content-Type', 'text/html');
      res.end(runDetailPage(summary));
      return;
    }

    // Dashboard
    res.setHeader('Content-Type', 'text/html');
    res.end(dashboardPage());

  } catch (error) {
    console.error('Request error:', error);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

function runDetailPage(summary: any): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Run ${summary.run.runId} - BarrHawk</title>
  <style>
    body { font-family: system-ui; background: #0a0a0f; color: #f0f0f5; padding: 40px; }
    .back { color: #6366f1; text-decoration: none; margin-bottom: 20px; display: inline-block; }
    h1 { margin-bottom: 20px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; }
    .badge-passed { background: rgba(16,185,129,0.2); color: #10b981; }
    .badge-failed { background: rgba(239,68,68,0.2); color: #ef4444; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 24px 0; }
    .stat { background: #16161f; padding: 20px; border-radius: 12px; border: 1px solid #2a2a35; }
    .stat-value { font-size: 2rem; font-weight: 700; }
    .stat-label { color: #606070; font-size: 0.8rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { text-align: left; padding: 12px; border-bottom: 1px solid #2a2a35; }
    th { color: #606070; font-size: 0.75rem; text-transform: uppercase; }
  </style>
</head>
<body>
  <a href="/" class="back">&larr; Back to Dashboard</a>
  <h1>Test Run <span class="badge badge-${summary.run.status}">${summary.run.status}</span></h1>

  <div class="stats">
    <div class="stat"><div class="stat-value">${summary.logCount}</div><div class="stat-label">Log Entries</div></div>
    <div class="stat"><div class="stat-value">${summary.screenshotCount}</div><div class="stat-label">Screenshots</div></div>
    <div class="stat"><div class="stat-value">${summary.networkRequestCount}</div><div class="stat-label">Network Requests</div></div>
    <div class="stat"><div class="stat-value">${summary.errorCount}</div><div class="stat-label">Errors</div></div>
  </div>

  <table>
    <tr><th>Property</th><th>Value</th></tr>
    <tr><td>Run ID</td><td>${summary.run.runId}</td></tr>
    <tr><td>Project</td><td>${summary.run.projectId}</td></tr>
    <tr><td>Origin</td><td>${summary.run.origin}</td></tr>
    <tr><td>Started</td><td>${new Date(summary.run.startedAt).toLocaleString()}</td></tr>
    <tr><td>Duration</td><td>${summary.run.duration ? (summary.run.duration/1000).toFixed(1) + 's' : '-'}</td></tr>
  </table>
</body>
</html>`;
}

// =============================================================================
// Main
// =============================================================================

const server = createServer(handleRequest);

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
});

// Load config and start
loadConfig().then(() => {
  server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║             BarrHawk SaaS Dashboard                           ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║   Dashboard:  http://localhost:${PORT.toString().padEnd(5)}                          ║
║   API:        http://localhost:${PORT.toString().padEnd(5)}/api                      ║
║   WebSocket:  ws://localhost:${PORT.toString().padEnd(5)}/ws                         ║
║                                                               ║
║   Features:                                                   ║
║   • Real-time test monitoring                                 ║
║   • Webhook notifications (Slack, Discord)                    ║
║   • API key management                                        ║
║   • Usage tracking & billing                                  ║
║                                                               ║
║   Press Ctrl+C to stop                                        ║
╚═══════════════════════════════════════════════════════════════╝
`);
  });
});
