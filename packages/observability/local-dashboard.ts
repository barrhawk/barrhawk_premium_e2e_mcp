#!/usr/bin/env npx tsx
/**
 * BarrHawk E2E Local Dashboard
 *
 * A standalone, locally-hosted dashboard that shows real-time test progress.
 * Works completely offline with optional cloud sync for premium features.
 *
 * Usage:
 *   npx tsx packages/observability/local-dashboard.ts
 *   # or after build:
 *   node dist/packages/observability/local-dashboard.js
 *
 * Features:
 *   - Live test progress monitoring
 *   - Screenshot viewer
 *   - Console log streaming
 *   - Network request inspection
 *   - Optional cloud sync for teams/storage
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { readFile, writeFile, mkdir, readdir, stat } from 'fs/promises';
import { existsSync, watch } from 'fs';
import path from 'path';
import { getObservabilityStore } from './store.js';

// =============================================================================
// Configuration
// =============================================================================

const args = process.argv.slice(2);
const PORT = parseInt(args.find(a => a.startsWith('--port='))?.split('=')[1] || '3333');
const DATA_DIR = args.find(a => a.startsWith('--data-dir='))?.split('=')[1] || './observability-data';
const CLOUD_CONFIG_FILE = path.join(DATA_DIR, 'cloud-config.json');

interface CloudConfig {
  connected: boolean;
  apiKey?: string;
  teamId?: string;
  teamName?: string;
  syncEnabled: boolean;
  lastSync?: string;
  cloudUrl: string;
}

let cloudConfig: CloudConfig = {
  connected: false,
  syncEnabled: false,
  cloudUrl: 'https://app.barrhawk.com',
};

// Connected WebSocket clients
const wsClients: Set<WebSocket> = new Set();

// Active test run being watched
let activeRunId: string | null = null;

// =============================================================================
// Cloud Config
// =============================================================================

async function loadCloudConfig(): Promise<void> {
  try {
    if (existsSync(CLOUD_CONFIG_FILE)) {
      const data = await readFile(CLOUD_CONFIG_FILE, 'utf-8');
      cloudConfig = { ...cloudConfig, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error('Failed to load cloud config:', err);
  }
}

async function saveCloudConfig(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(CLOUD_CONFIG_FILE, JSON.stringify(cloudConfig, null, 2));
}

// =============================================================================
// Real-time Updates
// =============================================================================

function broadcast(type: string, data: any): void {
  const message = JSON.stringify({ type, data, timestamp: Date.now() });
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// Watch for file changes in the data directory
function setupFileWatcher(): void {
  const runsDir = path.join(DATA_DIR, 'runs');
  const logsDir = path.join(DATA_DIR, 'logs');

  if (existsSync(runsDir)) {
    watch(runsDir, async (eventType, filename) => {
      if (filename?.endsWith('.json')) {
        const runId = filename.replace('.json', '');
        try {
          const store = await getObservabilityStore(DATA_DIR);
          const run = await store.getRun(runId);
          if (run) {
            broadcast('run_update', run);
          }
        } catch {}
      }
    });
  }

  if (existsSync(logsDir)) {
    watch(logsDir, async (eventType, filename) => {
      if (filename?.endsWith('.json') && activeRunId && filename.includes(activeRunId)) {
        try {
          const store = await getObservabilityStore(DATA_DIR);
          const logs = await store.getLogs(activeRunId, { limit: 50 });
          broadcast('logs_update', { runId: activeRunId, logs: logs.slice(-10) });
        } catch {}
      }
    });
  }
}

// =============================================================================
// HTML Dashboard
// =============================================================================

function localDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BarrHawk - Local Dashboard</title>
  <style>
    :root {
      --bg-0: #09090b;
      --bg-1: #0f0f12;
      --bg-2: #18181b;
      --bg-3: #27272a;
      --text-0: #fafafa;
      --text-1: #a1a1aa;
      --text-2: #71717a;
      --accent: #6366f1;
      --accent-2: #818cf8;
      --green: #22c55e;
      --red: #ef4444;
      --yellow: #eab308;
      --blue: #3b82f6;
      --cyan: #06b6d4;
      --border: #27272a;
    }

    /* Light theme */
    [data-theme="light"] {
      --bg-0: #ffffff;
      --bg-1: #f8fafc;
      --bg-2: #f1f5f9;
      --bg-3: #e2e8f0;
      --text-0: #0f172a;
      --text-1: #475569;
      --text-2: #64748b;
      --border: #e2e8f0;
      --green: #16a34a;
      --red: #dc2626;
      --yellow: #ca8a04;
      --accent: #4f46e5;
      --accent-2: #6366f1;
    }

    [data-theme="light"] .cloud-banner {
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    }

    [data-theme="light"] .toast {
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }

    [data-theme="light"] .modal {
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
    }

    [data-theme="light"] .run-item.running { border-left-color: var(--yellow); }
    [data-theme="light"] .run-item.passed { border-left-color: var(--green); }
    [data-theme="light"] .run-item.failed { border-left-color: var(--red); }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg-0);
      color: var(--text-0);
      min-height: 100vh;
      overflow-x: hidden;
    }

    /* Header */
    .header {
      background: var(--bg-1);
      border-bottom: 1px solid var(--border);
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo-icon {
      width: 32px;
      height: 32px;
      background: var(--accent);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
    }

    .logo-text {
      font-size: 1.1rem;
      font-weight: 600;
    }

    .logo-text span {
      color: var(--text-2);
      font-weight: 400;
      font-size: 0.85rem;
      margin-left: 8px;
    }

    .header-actions {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .status-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 0.8rem;
      background: var(--bg-2);
      border: 1px solid var(--border);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--green);
      animation: pulse 2s infinite;
    }

    .status-dot.disconnected { background: var(--text-2); animation: none; }
    .status-dot.syncing { background: var(--yellow); }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(0.9); }
    }

    .btn {
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid var(--border);
      background: var(--bg-2);
      color: var(--text-0);
      transition: all 0.15s;
    }

    .btn:hover { background: var(--bg-3); }
    .btn-primary { background: var(--accent); border-color: var(--accent); }
    .btn-primary:hover { background: var(--accent-2); }

    /* Main Layout */
    .main {
      display: grid;
      grid-template-columns: 280px 1fr 320px;
      min-height: calc(100vh - 57px);
    }

    @media (max-width: 1200px) {
      .main { grid-template-columns: 1fr; }
      .sidebar, .panel { display: none; }
    }

    /* Sidebar - Run List */
    .sidebar {
      background: var(--bg-1);
      border-right: 1px solid var(--border);
      overflow-y: auto;
    }

    .sidebar-header {
      padding: 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .sidebar-title {
      font-size: 0.8rem;
      color: var(--text-2);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .run-list {
      padding: 8px;
    }

    .run-item {
      padding: 12px;
      border-radius: 8px;
      cursor: pointer;
      margin-bottom: 4px;
      transition: background 0.15s;
    }

    .run-item:hover { background: var(--bg-2); }
    .run-item.active { background: var(--bg-3); }
    .run-item.running { border-left: 3px solid var(--yellow); }
    .run-item.passed { border-left: 3px solid var(--green); }
    .run-item.failed { border-left: 3px solid var(--red); }

    .run-item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }

    .run-id {
      font-family: monospace;
      font-size: 0.85rem;
      color: var(--text-0);
    }

    .run-status {
      font-size: 0.7rem;
      padding: 2px 8px;
      border-radius: 10px;
      text-transform: uppercase;
      font-weight: 600;
    }

    .run-status.running { background: rgba(234,179,8,0.2); color: var(--yellow); }
    .run-status.passed { background: rgba(34,197,94,0.2); color: var(--green); }
    .run-status.failed { background: rgba(239,68,68,0.2); color: var(--red); }

    .run-meta {
      font-size: 0.75rem;
      color: var(--text-2);
    }

    /* Content Area */
    .content {
      padding: 24px;
      overflow-y: auto;
    }

    .content-header {
      margin-bottom: 24px;
    }

    .content-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .content-subtitle {
      color: var(--text-2);
      font-size: 0.9rem;
    }

    /* Stats Row */
    .stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }

    .stat-card {
      background: var(--bg-1);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
    }

    .stat-value {
      font-size: 1.75rem;
      font-weight: 700;
      margin-bottom: 2px;
    }

    .stat-value.green { color: var(--green); }
    .stat-value.red { color: var(--red); }
    .stat-value.yellow { color: var(--yellow); }

    .stat-label {
      font-size: 0.75rem;
      color: var(--text-2);
      text-transform: uppercase;
    }

    /* Live Log Viewer */
    .log-viewer {
      background: var(--bg-1);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 24px;
    }

    .log-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .log-title {
      font-size: 0.9rem;
      font-weight: 500;
    }

    .log-body {
      height: 300px;
      overflow-y: auto;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 0.8rem;
      padding: 8px 0;
    }

    .log-entry {
      padding: 4px 16px;
      display: flex;
      gap: 12px;
      border-bottom: 1px solid var(--bg-2);
    }

    .log-entry:hover { background: var(--bg-2); }

    .log-time {
      color: var(--text-2);
      white-space: nowrap;
      min-width: 80px;
    }

    .log-level {
      min-width: 50px;
      font-weight: 500;
    }

    .log-level.error { color: var(--red); }
    .log-level.warn { color: var(--yellow); }
    .log-level.info { color: var(--blue); }
    .log-level.debug { color: var(--text-2); }

    .log-message {
      flex: 1;
      word-break: break-word;
    }

    /* Screenshots Grid */
    .screenshots-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }

    .screenshot-card {
      background: var(--bg-1);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      cursor: pointer;
      transition: transform 0.15s, box-shadow 0.15s;
    }

    .screenshot-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    }

    .screenshot-img {
      width: 100%;
      height: 120px;
      object-fit: cover;
      background: var(--bg-2);
    }

    .screenshot-info {
      padding: 10px;
      font-size: 0.75rem;
      color: var(--text-2);
    }

    /* Right Panel - Details */
    .panel {
      background: var(--bg-1);
      border-left: 1px solid var(--border);
      overflow-y: auto;
    }

    .panel-section {
      padding: 16px;
      border-bottom: 1px solid var(--border);
    }

    .panel-title {
      font-size: 0.75rem;
      color: var(--text-2);
      text-transform: uppercase;
      margin-bottom: 12px;
    }

    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 0.85rem;
    }

    .detail-label { color: var(--text-2); }
    .detail-value { color: var(--text-0); font-weight: 500; }

    /* Cloud Connect Banner */
    .cloud-banner {
      background: linear-gradient(135deg, var(--accent) 0%, #8b5cf6 100%);
      margin: 16px;
      padding: 16px;
      border-radius: 10px;
    }

    .cloud-banner h3 {
      font-size: 0.95rem;
      margin-bottom: 6px;
    }

    .cloud-banner p {
      font-size: 0.8rem;
      opacity: 0.9;
      margin-bottom: 12px;
    }

    .cloud-banner .btn {
      background: white;
      color: var(--accent);
      border: none;
    }

    .cloud-connected {
      background: var(--bg-2);
      border: 1px solid var(--border);
    }

    .cloud-connected h3 {
      color: var(--green);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Network tab */
    .network-list {
      font-size: 0.8rem;
    }

    .network-item {
      padding: 10px 16px;
      border-bottom: 1px solid var(--border);
      display: grid;
      grid-template-columns: 60px 50px 1fr 80px;
      gap: 12px;
      align-items: center;
    }

    .network-item:hover { background: var(--bg-2); }

    .network-method {
      font-weight: 600;
      color: var(--blue);
    }

    .network-method.POST { color: var(--green); }
    .network-method.DELETE { color: var(--red); }

    .network-status { font-weight: 500; }
    .network-status.ok { color: var(--green); }
    .network-status.error { color: var(--red); }

    .network-url {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text-1);
    }

    .network-duration { color: var(--text-2); text-align: right; }

    /* Tabs */
    .tabs {
      display: flex;
      border-bottom: 1px solid var(--border);
      margin-bottom: 16px;
    }

    .tab {
      padding: 12px 20px;
      font-size: 0.85rem;
      color: var(--text-2);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.15s;
    }

    .tab:hover { color: var(--text-0); }
    .tab.active { color: var(--accent); border-bottom-color: var(--accent); }

    /* Empty state */
    .empty {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-2);
    }

    .empty-icon {
      font-size: 3rem;
      margin-bottom: 16px;
      opacity: 0.3;
    }

    /* Modal */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.8);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal-overlay.active { display: flex; }

    .modal {
      background: var(--bg-1);
      border: 1px solid var(--border);
      border-radius: 12px;
      width: 90%;
      max-width: 500px;
      max-height: 80vh;
      overflow: auto;
    }

    .modal-header {
      padding: 20px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .modal-body { padding: 20px; }

    .form-group { margin-bottom: 16px; }
    .form-label { display: block; font-size: 0.85rem; color: var(--text-2); margin-bottom: 6px; }
    .form-input {
      width: 100%;
      padding: 10px 12px;
      background: var(--bg-2);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text-0);
      font-size: 0.9rem;
    }
    .form-input:focus { outline: none; border-color: var(--accent); }

    /* Progress bar */
    .progress-bar {
      height: 4px;
      background: var(--bg-3);
      border-radius: 2px;
      overflow: hidden;
      margin-top: 8px;
    }

    .progress-fill {
      height: 100%;
      background: var(--accent);
      transition: width 0.3s;
    }

    .progress-fill.green { background: var(--green); }

    /* Live indicator */
    .live-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(239,68,68,0.2);
      color: var(--red);
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .live-tag::before {
      content: '';
      width: 6px;
      height: 6px;
      background: var(--red);
      border-radius: 50%;
      animation: pulse 1s infinite;
    }

    /* Theme toggle button */
    .theme-toggle {
      background: var(--bg-2);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 12px;
      cursor: pointer;
      color: var(--text-0);
      font-size: 1rem;
      transition: all 0.15s;
    }
    .theme-toggle:hover { background: var(--bg-3); }

    /* Filter controls */
    .filter-bar {
      display: flex;
      gap: 12px;
      padding: 12px 16px;
      background: var(--bg-2);
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
      align-items: center;
    }

    .filter-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .filter-label {
      font-size: 0.75rem;
      color: var(--text-2);
      text-transform: uppercase;
    }

    .filter-select, .filter-input {
      padding: 6px 10px;
      background: var(--bg-1);
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--text-0);
      font-size: 0.8rem;
      min-width: 100px;
    }

    .filter-input {
      min-width: 180px;
    }

    .filter-select:focus, .filter-input:focus {
      outline: none;
      border-color: var(--accent);
    }

    .filter-btn {
      padding: 6px 12px;
      background: var(--bg-3);
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--text-1);
      font-size: 0.8rem;
      cursor: pointer;
      transition: all 0.15s;
    }

    .filter-btn:hover {
      background: var(--accent);
      color: var(--text-0);
      border-color: var(--accent);
    }

    .filter-count {
      font-size: 0.75rem;
      color: var(--text-2);
      margin-left: auto;
    }

    /* Network waterfall */
    .network-waterfall {
      font-size: 0.8rem;
    }

    .waterfall-header {
      display: grid;
      grid-template-columns: 60px 50px 1fr 200px 80px;
      gap: 12px;
      padding: 8px 16px;
      background: var(--bg-2);
      border-bottom: 1px solid var(--border);
      font-size: 0.7rem;
      color: var(--text-2);
      text-transform: uppercase;
    }

    .waterfall-item {
      display: grid;
      grid-template-columns: 60px 50px 1fr 200px 80px;
      gap: 12px;
      padding: 10px 16px;
      border-bottom: 1px solid var(--border);
      align-items: center;
      cursor: pointer;
      transition: background 0.15s;
    }

    .waterfall-item:hover { background: var(--bg-2); }
    .waterfall-item.expanded { background: var(--bg-2); }

    .waterfall-bar-container {
      height: 16px;
      background: var(--bg-3);
      border-radius: 2px;
      position: relative;
      overflow: hidden;
    }

    .waterfall-bar {
      position: absolute;
      height: 100%;
      border-radius: 2px;
      min-width: 2px;
    }

    .waterfall-bar.ok { background: var(--green); }
    .waterfall-bar.slow { background: var(--yellow); }
    .waterfall-bar.error { background: var(--red); }

    .waterfall-details {
      grid-column: 1 / -1;
      padding: 12px 16px;
      background: var(--bg-1);
      border-top: 1px solid var(--border);
      display: none;
    }

    .waterfall-item.expanded .waterfall-details {
      display: block;
    }

    .waterfall-detail-section {
      margin-bottom: 12px;
    }

    .waterfall-detail-title {
      font-size: 0.7rem;
      color: var(--text-2);
      text-transform: uppercase;
      margin-bottom: 6px;
    }

    .waterfall-detail-content {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 0.75rem;
      background: var(--bg-2);
      padding: 8px;
      border-radius: 4px;
      max-height: 150px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }

    /* Analytics section */
    .analytics-section {
      margin-bottom: 24px;
    }

    .analytics-title {
      font-size: 0.9rem;
      font-weight: 600;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .trend-chart {
      display: flex;
      align-items: flex-end;
      gap: 4px;
      height: 100px;
      padding: 12px;
      background: var(--bg-1);
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .trend-bar {
      flex: 1;
      background: var(--accent);
      border-radius: 2px 2px 0 0;
      min-height: 4px;
      position: relative;
      transition: height 0.3s;
    }

    .trend-bar:hover {
      background: var(--accent-2);
    }

    .trend-bar::after {
      content: attr(data-label);
      position: absolute;
      bottom: -20px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 0.6rem;
      color: var(--text-2);
      white-space: nowrap;
    }

    .trend-bar.low { background: var(--red); }
    .trend-bar.medium { background: var(--yellow); }
    .trend-bar.high { background: var(--green); }

    .flaky-list {
      background: var(--bg-1);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }

    .flaky-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
    }

    .flaky-item:last-child { border-bottom: none; }

    .flaky-name {
      font-size: 0.85rem;
      color: var(--text-0);
    }

    .flaky-score {
      font-size: 0.75rem;
      padding: 4px 8px;
      border-radius: 4px;
      font-weight: 600;
    }

    .flaky-score.high { background: rgba(239,68,68,0.2); color: var(--red); }
    .flaky-score.medium { background: rgba(234,179,8,0.2); color: var(--yellow); }
    .flaky-score.low { background: rgba(34,197,94,0.2); color: var(--green); }

    /* Toast notifications */
    .toast-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 1001;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .toast {
      padding: 12px 16px;
      background: var(--bg-1);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      gap: 10px;
      animation: slideIn 0.3s ease;
      max-width: 350px;
    }

    .toast.success { border-left: 3px solid var(--green); }
    .toast.error { border-left: 3px solid var(--red); }
    .toast.warning { border-left: 3px solid var(--yellow); }

    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    .toast-message {
      font-size: 0.85rem;
      flex: 1;
    }

    .toast-close {
      background: none;
      border: none;
      color: var(--text-2);
      cursor: pointer;
      font-size: 1.2rem;
    }

    /* Loading spinner */
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px;
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--bg-3);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Delete confirmation */
    .confirm-delete {
      text-align: center;
      padding: 20px;
    }

    .confirm-delete p {
      margin-bottom: 16px;
      color: var(--text-1);
    }

    .confirm-delete .btn-danger {
      background: var(--red);
      border-color: var(--red);
    }

    .confirm-delete .btn-danger:hover {
      background: #dc2626;
    }

    /* Run item actions */
    .run-item-actions {
      display: none;
      gap: 4px;
    }

    .run-item:hover .run-item-actions {
      display: flex;
    }

    .run-action-btn {
      padding: 4px 8px;
      background: var(--bg-3);
      border: none;
      border-radius: 4px;
      color: var(--text-2);
      cursor: pointer;
      font-size: 0.75rem;
    }

    .run-action-btn:hover {
      background: var(--red);
      color: white;
    }

    /* Keyboard shortcut hints */
    .shortcut-hint {
      position: fixed;
      bottom: 24px;
      left: 24px;
      background: var(--bg-1);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 16px;
      font-size: 0.75rem;
      color: var(--text-2);
      display: none;
      z-index: 100;
    }

    .shortcut-hint.visible {
      display: block;
    }

    .shortcut-key {
      display: inline-block;
      padding: 2px 6px;
      background: var(--bg-3);
      border-radius: 3px;
      font-family: monospace;
      margin-right: 8px;
    }

    /* =========================================================================
       SWARM MONITORING STYLES
       ========================================================================= */

    .swarm-section {
      margin-bottom: 24px;
    }

    .swarm-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .swarm-title {
      font-size: 0.9rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .swarm-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 0.7rem;
      font-weight: 600;
    }

    .swarm-badge.running {
      background: rgba(234, 179, 8, 0.2);
      color: var(--yellow);
    }

    .swarm-badge.running::before {
      content: '';
      width: 6px;
      height: 6px;
      background: var(--yellow);
      border-radius: 50%;
      animation: pulse 1s infinite;
    }

    .swarm-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .swarm-card {
      background: var(--bg-1);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .swarm-card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
    }

    .swarm-card.active {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }

    .swarm-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }

    .swarm-intent {
      font-size: 0.9rem;
      font-weight: 500;
      color: var(--text-0);
      flex: 1;
      margin-right: 12px;
    }

    .swarm-status {
      font-size: 0.7rem;
      padding: 4px 10px;
      border-radius: 10px;
      text-transform: uppercase;
      font-weight: 600;
    }

    .swarm-status.running { background: rgba(234,179,8,0.2); color: var(--yellow); }
    .swarm-status.completed { background: rgba(34,197,94,0.2); color: var(--green); }
    .swarm-status.failed { background: rgba(239,68,68,0.2); color: var(--red); }
    .swarm-status.partial { background: rgba(251,146,60,0.2); color: #fb923c; }
    .swarm-status.planning { background: rgba(99,102,241,0.2); color: var(--accent); }

    .swarm-routes {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 8px;
    }

    .swarm-route {
      background: var(--bg-2);
      border-radius: 6px;
      padding: 10px;
      font-size: 0.8rem;
    }

    .swarm-route-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }

    .swarm-route-name {
      font-weight: 500;
      color: var(--text-0);
    }

    .swarm-route-status {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .swarm-route-status.pending { background: var(--text-2); }
    .swarm-route-status.running { background: var(--yellow); animation: pulse 1s infinite; }
    .swarm-route-status.completed { background: var(--green); }
    .swarm-route-status.failed { background: var(--red); }

    .swarm-route-tools {
      font-size: 0.7rem;
      color: var(--text-2);
    }

    .swarm-route-progress {
      margin-top: 8px;
      font-size: 0.75rem;
      color: var(--text-1);
      max-height: 60px;
      overflow-y: auto;
    }

    .swarm-progress-item {
      padding: 2px 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .swarm-progress-item::before {
      content: '→';
      color: var(--accent);
    }

    .swarm-detail {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
    }

    .swarm-meta {
      display: flex;
      gap: 16px;
      font-size: 0.8rem;
      color: var(--text-2);
    }

    .swarm-empty {
      text-align: center;
      padding: 40px 20px;
      background: var(--bg-1);
      border: 1px dashed var(--border);
      border-radius: 10px;
      color: var(--text-2);
    }

    .swarm-empty-icon {
      font-size: 2.5rem;
      margin-bottom: 12px;
    }

    /* Responsive tablet */
    @media (max-width: 1024px) {
      .main {
        grid-template-columns: 1fr;
      }
      .sidebar {
        display: block;
        border-right: none;
        border-bottom: 1px solid var(--border);
        max-height: 200px;
      }
      .panel {
        display: none;
      }
      .filter-bar {
        flex-direction: column;
        align-items: stretch;
      }
      .filter-group {
        flex: 1;
      }
      .filter-select, .filter-input {
        flex: 1;
      }
    }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: var(--bg-1); }
    ::-webkit-scrollbar-thumb { background: var(--bg-3); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--text-2); }
  </style>
</head>
<body>
  <!-- Header -->
  <header class="header">
    <div class="logo">
      <div class="logo-icon">B</div>
      <div class="logo-text">BarrHawk<span>Local Dashboard</span></div>
    </div>
    <div class="header-actions">
      <div class="status-badge">
        <div class="status-dot" id="ws-status"></div>
        <span id="ws-status-text">Connected</span>
      </div>
      <button class="theme-toggle" id="theme-toggle" onclick="toggleTheme()" title="Toggle theme (t)">🌙</button>
      <button class="btn" onclick="refreshData()" title="Refresh (r)">↻ Refresh</button>
      <button class="btn" onclick="clearAllRuns()" title="Clear old runs">🗑 Clear</button>
      <button class="btn btn-primary" onclick="showCloudModal()">☁ Cloud</button>
    </div>
  </header>

  <!-- Main Layout -->
  <div class="main">
    <!-- Sidebar - Test Runs -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">Test Runs</span>
        <span id="run-count" style="color: var(--text-2); font-size: 0.8rem;">0</span>
      </div>
      <div class="run-list" id="run-list">
        <div class="empty">
          <div class="empty-icon">📋</div>
          <p>No test runs yet</p>
          <p style="font-size: 0.8rem; margin-top: 8px;">Run tests with the MCP server to see them here</p>
        </div>
      </div>
    </aside>

    <!-- Content Area -->
    <main class="content" id="content">
      <div class="content-header">
        <h1 class="content-title">Welcome to BarrHawk</h1>
        <p class="content-subtitle">Select a test run from the sidebar to view details</p>
      </div>

      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-value" id="stat-total">0</div>
          <div class="stat-label">Total Runs</div>
        </div>
        <div class="stat-card">
          <div class="stat-value green" id="stat-passed">0</div>
          <div class="stat-label">Passed</div>
        </div>
        <div class="stat-card">
          <div class="stat-value red" id="stat-failed">0</div>
          <div class="stat-label">Failed</div>
        </div>
        <div class="stat-card">
          <div class="stat-value yellow" id="stat-running">0</div>
          <div class="stat-label">Running</div>
        </div>
      </div>

      <!-- Analytics Section -->
      <div class="analytics-section" id="analytics-section">
        <div class="analytics-title">📈 Pass Rate Trend (Last 7 Days)</div>
        <div class="trend-chart" id="trend-chart">
          <div class="loading"><div class="spinner"></div></div>
        </div>
        <div class="analytics-title">⚠️ Flaky Tests</div>
        <div class="flaky-list" id="flaky-list">
          <div class="loading"><div class="spinner"></div></div>
        </div>
      </div>

      <!-- Swarm Section - Multi-Agent Monitoring -->
      <div class="swarm-section" id="swarm-section">
        <div class="swarm-header">
          <div class="swarm-title">
            🐝 Swarm Orchestration
            <span class="swarm-badge running" id="swarm-running-badge" style="display: none;">
              <span id="swarm-running-count">0</span> Running
            </span>
          </div>
        </div>
        <div class="swarm-list" id="swarm-list">
          <div class="swarm-empty" id="swarm-empty">
            <div class="swarm-empty-icon">🐝</div>
            <p>No active swarms</p>
            <p style="font-size: 0.8rem; margin-top: 8px;">
              Swarm mode runs multiple Igor agents in parallel for comprehensive testing
            </p>
          </div>
        </div>
      </div>

      <div id="run-detail" style="display: none;"></div>
    </main>

    <!-- Right Panel -->
    <aside class="panel">
      <div class="panel-section" id="cloud-section">
        <div class="cloud-banner">
          <h3>☁ Connect to Cloud</h3>
          <p>Sync your test data, share with team, and get cloud storage for artifacts.</p>
          <button class="btn" onclick="showCloudModal()">Connect Now</button>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">Quick Stats</div>
        <div class="detail-row">
          <span class="detail-label">Today's Runs</span>
          <span class="detail-value" id="today-runs">0</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Pass Rate</span>
          <span class="detail-value" id="pass-rate">-</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Avg Duration</span>
          <span class="detail-value" id="avg-duration">-</span>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-title">AI vs Human</div>
        <div class="detail-row">
          <span class="detail-label">AI Agent Tests</span>
          <span class="detail-value" id="ai-tests">0</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Human Tests</span>
          <span class="detail-value" id="human-tests">0</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" id="ai-bar" style="width: 0%"></div>
        </div>
      </div>

      <div class="panel-section" id="selected-run-panel" style="display: none;">
        <div class="panel-title">Selected Run</div>
        <div id="selected-run-info"></div>
      </div>
    </aside>
  </div>

  <!-- Cloud Connect Modal -->
  <div class="modal-overlay" id="cloud-modal">
    <div class="modal">
      <div class="modal-header">
        <span style="font-weight: 600;">Connect to BarrHawk Cloud</span>
        <button onclick="closeModal()" style="background: none; border: none; color: var(--text-2); cursor: pointer; font-size: 1.5rem;">&times;</button>
      </div>
      <div class="modal-body">
        <div id="cloud-status"></div>
        <div class="form-group">
          <label class="form-label">API Key</label>
          <input type="password" class="form-input" id="cloud-api-key" placeholder="bhk_...">
        </div>
        <p style="font-size: 0.8rem; color: var(--text-2); margin-bottom: 16px;">
          Get your API key from <a href="https://app.barrhawk.com/settings/api" target="_blank" style="color: var(--accent);">app.barrhawk.com/settings/api</a>
        </p>
        <div style="display: flex; gap: 12px;">
          <button class="btn" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="connectToCloud()">Connect</button>
        </div>

        <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border);">
          <h4 style="font-size: 0.9rem; margin-bottom: 12px;">Premium Features</h4>
          <ul style="font-size: 0.85rem; color: var(--text-1); list-style: none;">
            <li style="padding: 6px 0;">✓ Cloud screenshot storage</li>
            <li style="padding: 6px 0;">✓ Team sharing & collaboration</li>
            <li style="padding: 6px 0;">✓ Historical analytics (90 days)</li>
            <li style="padding: 6px 0;">✓ Slack/Discord notifications</li>
            <li style="padding: 6px 0;">✓ CI/CD integrations</li>
            <li style="padding: 6px 0;">✓ Scheduled test runs</li>
          </ul>
        </div>
      </div>
    </div>
  </div>

  <!-- Screenshot Modal -->
  <div class="modal-overlay" id="screenshot-modal">
    <div class="modal" style="max-width: 90%; max-height: 90%;">
      <div class="modal-header">
        <span id="screenshot-title">Screenshot</span>
        <button onclick="closeScreenshotModal()" style="background: none; border: none; color: var(--text-2); cursor: pointer; font-size: 1.5rem;">&times;</button>
      </div>
      <div class="modal-body" style="padding: 0;">
        <img id="screenshot-img" style="width: 100%; display: block;">
      </div>
    </div>
  </div>

  <!-- Delete Confirmation Modal -->
  <div class="modal-overlay" id="delete-modal">
    <div class="modal" style="max-width: 400px;">
      <div class="modal-header">
        <span style="font-weight: 600;">Confirm Delete</span>
        <button onclick="closeDeleteModal()" style="background: none; border: none; color: var(--text-2); cursor: pointer; font-size: 1.5rem;">&times;</button>
      </div>
      <div class="modal-body confirm-delete">
        <p id="delete-message">Are you sure you want to delete this run?</p>
        <div style="display: flex; gap: 12px; justify-content: center;">
          <button class="btn" onclick="closeDeleteModal()">Cancel</button>
          <button class="btn btn-danger" id="confirm-delete-btn" onclick="confirmDelete()">Delete</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Toast Container -->
  <div class="toast-container" id="toast-container"></div>

  <!-- Keyboard Shortcut Hints -->
  <div class="shortcut-hint" id="shortcut-hint">
    <div><span class="shortcut-key">j/k</span> Navigate runs</div>
    <div><span class="shortcut-key">1/2/3</span> Switch tabs</div>
    <div><span class="shortcut-key">/</span> Search logs</div>
    <div><span class="shortcut-key">r</span> Refresh</div>
    <div><span class="shortcut-key">t</span> Toggle theme</div>
    <div><span class="shortcut-key">?</span> Show/hide shortcuts</div>
    <div><span class="shortcut-key">Esc</span> Close modals</div>
  </div>

  <script>
    // State
    let runs = [];
    let selectedRunId = null;
    let ws = null;
    let cloudConfig = { connected: false };
    let currentLogs = [];
    let currentNetwork = [];
    let deleteTarget = null;
    let logFilters = { level: 'all', type: 'all', search: '' };
    let searchDebounceTimer = null;

    // Initialize
    document.addEventListener('DOMContentLoaded', async () => {
      initTheme();
      await loadData();
      await loadCloudConfig();
      await loadAnalytics();
      await loadSwarms();
      setupWebSocket();
      renderSidebar();
      renderStats();
    });

    // Theme toggle
    function initTheme() {
      const saved = localStorage.getItem('barrhawk-theme') || 'dark';
      document.documentElement.setAttribute('data-theme', saved);
      updateThemeIcon(saved);
    }

    function toggleTheme() {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('barrhawk-theme', next);
      updateThemeIcon(next);
    }

    function updateThemeIcon(theme) {
      document.getElementById('theme-toggle').textContent = theme === 'dark' ? '🌙' : '☀️';
    }

    // Toast notifications
    function showToast(message, type = 'success') {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.className = 'toast ' + type;
      toast.innerHTML = \`
        <span class="toast-message">\${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
      \`;
      container.appendChild(toast);
      setTimeout(() => toast.remove(), 5000);
    }

    // Load data
    async function loadData() {
      try {
        const res = await fetch('/api/runs');
        runs = await res.json();
        runs.forEach(r => r.startedAt = new Date(r.startedAt));
      } catch (err) {
        console.error('Failed to load runs:', err);
        showToast('Failed to load runs', 'error');
      }
    }

    async function refreshData() {
      showToast('Refreshing...', 'success');
      await loadData();
      await loadAnalytics();
      await loadSwarms();
      renderSidebar();
      renderStats();
      if (selectedRunId) showRunDetail(selectedRunId);
    }

    // =========================================================================
    // SWARM MONITORING
    // =========================================================================

    let swarms = [];

    async function loadSwarms() {
      try {
        const res = await fetch('/api/swarms');
        swarms = await res.json();
        renderSwarms();
      } catch (err) {
        console.error('Failed to load swarms:', err);
      }
    }

    function renderSwarms() {
      const container = document.getElementById('swarm-list');
      const emptyEl = document.getElementById('swarm-empty');
      const runningBadge = document.getElementById('swarm-running-badge');
      const runningCount = document.getElementById('swarm-running-count');

      const running = swarms.filter(s => s.status === 'running');

      if (running.length > 0) {
        runningBadge.style.display = 'inline-flex';
        runningCount.textContent = running.length;
      } else {
        runningBadge.style.display = 'none';
      }

      if (swarms.length === 0) {
        container.innerHTML = '';
        container.appendChild(emptyEl);
        emptyEl.style.display = 'block';
        return;
      }

      emptyEl.style.display = 'none';
      container.innerHTML = swarms.slice(0, 10).map(swarm => renderSwarmCard(swarm)).join('');
    }

    function renderSwarmCard(swarm) {
      const routes = swarm.routes || [];
      const completedRoutes = routes.filter(r => r.status === 'completed').length;
      const failedRoutes = routes.filter(r => r.status === 'failed').length;
      const runningRoutes = routes.filter(r => r.status === 'running').length;

      return \`
        <div class="swarm-card" id="swarm-\${swarm.swarmId}" onclick="toggleSwarmDetail('\${swarm.swarmId}')">
          <div class="swarm-card-header">
            <div class="swarm-intent">\${escapeHtml(swarm.masterIntent || 'Unknown intent')}</div>
            <span class="swarm-status \${swarm.status}">\${swarm.status}</span>
          </div>
          <div class="swarm-routes">
            \${routes.map(route => \`
              <div class="swarm-route" id="swarm-route-\${swarm.swarmId}-\${route.routeId}">
                <div class="swarm-route-header">
                  <span class="swarm-route-name">\${escapeHtml(route.routeName)}</span>
                  <span class="swarm-route-status \${route.status}"></span>
                </div>
                <div class="swarm-route-tools">\${(route.toolBag || []).length} tools</div>
                <div class="swarm-route-progress" id="swarm-progress-\${swarm.swarmId}-\${route.routeId}">
                  \${(route.progress || []).slice(-3).map(p => \`
                    <div class="swarm-progress-item">\${escapeHtml(p.action)}</div>
                  \`).join('')}
                </div>
              </div>
            \`).join('')}
          </div>
          <div class="swarm-meta">
            <span>⏱ Started \${formatRelativeTime(swarm.startedAt)}</span>
            <span>📊 \${completedRoutes}/\${routes.length} routes</span>
            \${failedRoutes > 0 ? \`<span style="color: var(--red);">❌ \${failedRoutes} failed</span>\` : ''}
          </div>
        </div>
      \`;
    }

    function toggleSwarmDetail(swarmId) {
      const card = document.getElementById('swarm-' + swarmId);
      if (card) {
        card.classList.toggle('active');
      }
    }

    function handleSwarmEvent(type, data) {
      if (type === 'swarm_swarm_created') {
        loadSwarms();
        showToast('New swarm started: ' + (data.masterIntent || 'Unknown').substring(0, 30), 'success');
      } else if (type === 'swarm_swarm_status') {
        const swarm = swarms.find(s => s.swarmId === data.swarmId);
        if (swarm) {
          swarm.status = data.status;
          renderSwarms();
          if (data.status === 'completed') {
            showToast('Swarm completed: ' + data.swarmId.substring(0, 12), 'success');
          } else if (data.status === 'failed' || data.status === 'partial') {
            showToast('Swarm ' + data.status + ': ' + data.swarmId.substring(0, 12), 'error');
          }
        }
      } else if (type === 'swarm_route_update') {
        const swarm = swarms.find(s => s.swarmId === data.swarmId);
        if (swarm) {
          const route = swarm.routes.find(r => r.routeId === data.routeId);
          if (route) {
            if (data.status) route.status = data.status;
            if (data.igorId) route.igorId = data.igorId;
            if (data.result) route.result = data.result;
            // Update just the route status indicator
            const statusEl = document.querySelector('#swarm-route-' + data.swarmId + '-' + data.routeId + ' .swarm-route-status');
            if (statusEl) statusEl.className = 'swarm-route-status ' + route.status;
          }
        }
      } else if (type === 'swarm_route_progress') {
        const progressEl = document.getElementById('swarm-progress-' + data.swarmId + '-' + data.routeId);
        if (progressEl && data.progress) {
          const item = document.createElement('div');
          item.className = 'swarm-progress-item';
          item.textContent = data.progress.action;
          progressEl.appendChild(item);
          progressEl.scrollTop = progressEl.scrollHeight;
          // Keep only last 5 items visible
          while (progressEl.children.length > 5) {
            progressEl.removeChild(progressEl.firstChild);
          }
        }
      }
    }

    function formatRelativeTime(dateStr) {
      const date = new Date(dateStr);
      const now = new Date();
      const diff = Math.floor((now - date) / 1000);
      if (diff < 60) return 'just now';
      if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
      return Math.floor(diff / 86400) + 'd ago';
    }

    async function loadCloudConfig() {
      try {
        const res = await fetch('/api/cloud-config');
        cloudConfig = await res.json();
        updateCloudUI();
      } catch {}
    }

    // Analytics
    async function loadAnalytics() {
      try {
        const [trendsRes, flakyRes] = await Promise.all([
          fetch('/api/analytics/trends?days=7').then(r => r.json()),
          fetch('/api/analytics/flaky?days=7').then(r => r.json())
        ]);
        renderTrendChart(trendsRes);
        renderFlakyList(flakyRes);
      } catch (err) {
        document.getElementById('trend-chart').innerHTML = '<div class="empty">No trend data available</div>';
        document.getElementById('flaky-list').innerHTML = '<div class="empty">No flaky tests detected</div>';
      }
    }

    function renderTrendChart(trends) {
      if (!trends || trends.length === 0) {
        document.getElementById('trend-chart').innerHTML = '<div class="empty">No trend data available</div>';
        return;
      }
      const maxRate = Math.max(...trends.map(t => t.passRate), 1);
      document.getElementById('trend-chart').innerHTML = trends.map(t => {
        const height = (t.passRate / 100) * 76;
        const colorClass = t.passRate >= 80 ? 'high' : t.passRate >= 50 ? 'medium' : 'low';
        return \`<div class="trend-bar \${colorClass}" style="height: \${height}px" data-label="\${t.date}" title="\${t.passRate}% (\${t.passed}/\${t.total})"></div>\`;
      }).join('');
    }

    function renderFlakyList(flaky) {
      if (!flaky || flaky.length === 0) {
        document.getElementById('flaky-list').innerHTML = '<div class="flaky-item"><span class="flaky-name" style="color: var(--text-2);">No flaky tests detected 🎉</span></div>';
        return;
      }
      document.getElementById('flaky-list').innerHTML = flaky.slice(0, 5).map(f => {
        const scoreClass = f.score >= 0.7 ? 'high' : f.score >= 0.4 ? 'medium' : 'low';
        return \`
          <div class="flaky-item">
            <span class="flaky-name">\${escapeHtml(f.name || f.runId.substring(0, 12))}</span>
            <span class="flaky-score \${scoreClass}">\${Math.round(f.score * 100)}%</span>
          </div>
        \`;
      }).join('');
    }

    // WebSocket
    function setupWebSocket() {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(protocol + '//' + location.host + '/ws');

      ws.onopen = () => {
        document.getElementById('ws-status').classList.remove('disconnected');
        document.getElementById('ws-status-text').textContent = 'Live';
      };

      ws.onclose = () => {
        document.getElementById('ws-status').classList.add('disconnected');
        document.getElementById('ws-status-text').textContent = 'Disconnected';
        setTimeout(setupWebSocket, 3000);
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === 'run_update') {
          const idx = runs.findIndex(r => r.runId === msg.data.runId);
          msg.data.startedAt = new Date(msg.data.startedAt);
          if (idx >= 0) {
            runs[idx] = msg.data;
          } else {
            runs.unshift(msg.data);
          }
          renderSidebar();
          renderStats();
          if (selectedRunId === msg.data.runId) {
            showRunDetail(msg.data.runId);
          }
        }

        if (msg.type === 'logs_update' && msg.data.runId === selectedRunId) {
          appendLogs(msg.data.logs);
        }

        // Handle swarm events for live updates
        if (msg.type && msg.type.startsWith('swarm_')) {
          handleSwarmEvent(msg.type, msg.data);
        }
      };
    }

    // Render sidebar
    function renderSidebar() {
      document.getElementById('run-count').textContent = runs.length;

      if (runs.length === 0) {
        document.getElementById('run-list').innerHTML = \`
          <div class="empty">
            <div class="empty-icon">📋</div>
            <p>No test runs yet</p>
            <p style="font-size: 0.8rem; margin-top: 8px;">Run tests with the MCP server to see them here</p>
          </div>
        \`;
        return;
      }

      document.getElementById('run-list').innerHTML = runs.slice(0, 50).map((run, idx) => \`
        <div class="run-item \${run.status} \${run.runId === selectedRunId ? 'active' : ''}"
             onclick="showRunDetail('\${run.runId}')" data-index="\${idx}">
          <div class="run-item-header">
            <span class="run-id">\${run.runId.substring(0, 12)}...</span>
            <div class="run-item-actions">
              <button class="run-action-btn" onclick="event.stopPropagation(); promptDeleteRun('\${run.runId}')" title="Delete">🗑</button>
            </div>
            <span class="run-status \${run.status}">\${run.status}</span>
          </div>
          <div class="run-meta">
            \${run.origin === 'ai_agent' ? '🤖' : '👤'} \${formatTime(run.startedAt)}
            \${run.duration ? ' · ' + formatDuration(run.duration) : ''}
          </div>
        </div>
      \`).join('');
    }

    // Render stats
    function renderStats() {
      const total = runs.length;
      const passed = runs.filter(r => r.status === 'passed').length;
      const failed = runs.filter(r => r.status === 'failed').length;
      const running = runs.filter(r => r.status === 'running').length;
      const ai = runs.filter(r => r.origin === 'ai_agent').length;
      const human = total - ai;

      document.getElementById('stat-total').textContent = total;
      document.getElementById('stat-passed').textContent = passed;
      document.getElementById('stat-failed').textContent = failed;
      document.getElementById('stat-running').textContent = running;

      const today = new Date().toDateString();
      const todayRuns = runs.filter(r => r.startedAt.toDateString() === today).length;
      document.getElementById('today-runs').textContent = todayRuns;

      const passRate = total > 0 ? Math.round(passed / total * 100) + '%' : '-';
      document.getElementById('pass-rate').textContent = passRate;

      const avgDuration = runs.filter(r => r.duration).reduce((s, r) => s + r.duration, 0) / (runs.filter(r => r.duration).length || 1);
      document.getElementById('avg-duration').textContent = avgDuration > 0 ? formatDuration(avgDuration) : '-';

      document.getElementById('ai-tests').textContent = ai;
      document.getElementById('human-tests').textContent = human;
      document.getElementById('ai-bar').style.width = (total > 0 ? ai / total * 100 : 0) + '%';
    }

    // Show run detail
    async function showRunDetail(runId) {
      selectedRunId = runId;
      document.getElementById('analytics-section').style.display = 'none';
      renderSidebar();

      // Notify server we're watching this run
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'watch', runId }));
      }

      const run = runs.find(r => r.runId === runId);
      if (!run) return;

      // Show loading
      document.getElementById('run-detail').style.display = 'block';
      document.getElementById('run-detail').innerHTML = '<div class="loading"><div class="spinner"></div></div>';

      // Load full details
      const [logsRes, screenshotsRes, networkRes] = await Promise.all([
        fetch('/api/logs/' + runId).then(r => r.json()),
        fetch('/api/screenshots/' + runId).then(r => r.json()),
        fetch('/api/network/' + runId).then(r => r.json()),
      ]);

      currentLogs = logsRes;
      currentNetwork = networkRes;

      document.getElementById('run-detail').innerHTML = \`
        <div class="content-header" style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h1 class="content-title">
              \${run.status === 'running' ? '<span class="live-tag">LIVE</span>' : ''}
              Run \${runId.substring(0, 16)}...
            </h1>
            <p class="content-subtitle">
              \${run.origin === 'ai_agent' ? '🤖 AI Agent' : '👤 Human'} ·
              Started \${formatTime(run.startedAt)}
              \${run.duration ? ' · ' + formatDuration(run.duration) : ''}
            </p>
          </div>
          <button class="btn" onclick="promptDeleteRun('\${runId}')" style="color: var(--red);">🗑 Delete Run</button>
        </div>

        <div class="stats-row">
          <div class="stat-card">
            <div class="stat-value">\${logsRes.length}</div>
            <div class="stat-label">Log Entries</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">\${screenshotsRes.length}</div>
            <div class="stat-label">Screenshots</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">\${networkRes.length}</div>
            <div class="stat-label">Network Requests</div>
          </div>
          <div class="stat-card">
            <div class="stat-value \${logsRes.filter(l => l.level === 'error').length > 0 ? 'red' : 'green'}">
              \${logsRes.filter(l => l.level === 'error').length}
            </div>
            <div class="stat-label">Errors</div>
          </div>
        </div>

        <div class="tabs" id="detail-tabs">
          <div class="tab active" onclick="showTab('logs', this)" data-tab="1">Console Logs</div>
          <div class="tab" onclick="showTab('screenshots', this)" data-tab="2">Screenshots</div>
          <div class="tab" onclick="showTab('network', this)" data-tab="3">Network</div>
        </div>

        <div id="tab-logs" class="tab-content">
          <div class="log-viewer">
            <div class="filter-bar">
              <div class="filter-group">
                <span class="filter-label">Level</span>
                <select class="filter-select" id="filter-level" onchange="applyLogFilters()">
                  <option value="all">All Levels</option>
                  <option value="error">Error</option>
                  <option value="warn">Warning</option>
                  <option value="info">Info</option>
                  <option value="debug">Debug</option>
                </select>
              </div>
              <div class="filter-group">
                <span class="filter-label">Type</span>
                <select class="filter-select" id="filter-type" onchange="applyLogFilters()">
                  <option value="all">All Types</option>
                  <option value="console">Console</option>
                  <option value="navigation">Navigation</option>
                  <option value="click">Click</option>
                  <option value="step">Step</option>
                </select>
              </div>
              <div class="filter-group">
                <span class="filter-label">Search</span>
                <input type="text" class="filter-input" id="filter-search" placeholder="Search logs..." oninput="debounceSearch()">
              </div>
              <button class="filter-btn" onclick="clearLogFilters()">Clear</button>
              <span class="filter-count" id="filter-count">\${logsRes.length} entries</span>
            </div>
            <div class="log-body" id="log-body">
              \${renderLogs(logsRes)}
            </div>
          </div>
        </div>

        <div id="tab-screenshots" class="tab-content" style="display: none;">
          \${screenshotsRes.length === 0 ? '<div class="empty"><div class="empty-icon">📷</div><p>No screenshots captured</p></div>' :
            '<div class="screenshots-grid">' + screenshotsRes.map(ss => \`
              <div class="screenshot-card" onclick="showScreenshot('/screenshot/\${runId}/\${ss.id}', '\${ss.type || 'screenshot'} - \${ss.width || '?'}x\${ss.height || '?'}')">
                <img src="/screenshot/\${runId}/\${ss.id}" class="screenshot-img" onerror="this.style.display='none'">
                <div class="screenshot-info">
                  \${ss.type || 'screenshot'} · \${ss.width || '?'}x\${ss.height || '?'} · \${formatSize(ss.sizeBytes || 0)}
                </div>
              </div>
            \`).join('') + '</div>'}
        </div>

        <div id="tab-network" class="tab-content" style="display: none;">
          <div class="log-viewer">
            <div class="log-header">
              <span class="log-title">Network Requests</span>
              <div style="display: flex; gap: 8px;">
                <button class="filter-btn" onclick="sortNetwork('time')">Sort by Time</button>
                <button class="filter-btn" onclick="sortNetwork('duration')">Sort by Duration</button>
                <button class="filter-btn" onclick="sortNetwork('size')">Sort by Size</button>
              </div>
            </div>
            \${renderNetworkWaterfall(networkRes)}
          </div>
        </div>
      \`;

      // Update panel
      document.getElementById('selected-run-panel').style.display = 'block';
      document.getElementById('selected-run-info').innerHTML = \`
        <div class="detail-row">
          <span class="detail-label">Status</span>
          <span class="detail-value">\${run.status}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Origin</span>
          <span class="detail-value">\${run.origin}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Project</span>
          <span class="detail-value">\${run.projectId}</span>
        </div>
        \${run.summary && run.summary.total !== undefined ? \`
          <div class="detail-row">
            <span class="detail-label">Tests</span>
            <span class="detail-value">\${run.summary.passed || 0}/\${run.summary.total || 0}</span>
          </div>
        \` : ''}
      \`;
    }

    function renderLogs(logs) {
      if (logs.length === 0) return '<div class="empty"><div class="empty-icon">📝</div><p>No logs match filters</p></div>';
      return logs.map(log => \`
        <div class="log-entry" data-level="\${log.level || ''}" data-type="\${log.type || ''}">
          <span class="log-time">\${formatLogTime(log.timestamp)}</span>
          <span class="log-level \${log.level || ''}">\${log.level || log.type}</span>
          <span class="log-message">\${escapeHtml(log.message)}</span>
        </div>
      \`).join('');
    }

    function renderNetworkWaterfall(requests) {
      if (requests.length === 0) return '<div class="empty"><div class="empty-icon">🌐</div><p>No network requests captured</p></div>';

      const minTime = Math.min(...requests.map(r => r.startTime || 0));
      const maxTime = Math.max(...requests.map(r => (r.startTime || 0) + (r.duration || 0)));
      const totalTime = maxTime - minTime || 1;

      return \`
        <div class="network-waterfall" id="network-waterfall">
          <div class="waterfall-header">
            <span>Method</span>
            <span>Status</span>
            <span>URL</span>
            <span>Timeline</span>
            <span>Duration</span>
          </div>
          \${requests.map((req, idx) => {
            const start = ((req.startTime || 0) - minTime) / totalTime * 100;
            const width = Math.max((req.duration || 50) / totalTime * 100, 2);
            const barClass = req.status >= 400 ? 'error' : req.duration > 1000 ? 'slow' : 'ok';
            return \`
              <div class="waterfall-item" onclick="toggleNetworkDetails(this)">
                <span class="network-method \${req.method}">\${req.method}</span>
                <span class="network-status \${req.status < 400 ? 'ok' : 'error'}">\${req.status || '-'}</span>
                <span class="network-url" title="\${escapeHtml(req.url)}">\${truncateUrl(req.url)}</span>
                <div class="waterfall-bar-container">
                  <div class="waterfall-bar \${barClass}" style="left: \${start}%; width: \${width}%;"></div>
                </div>
                <span class="network-duration">\${req.duration ? req.duration + 'ms' : '-'}</span>
                <div class="waterfall-details">
                  <div class="waterfall-detail-section">
                    <div class="waterfall-detail-title">Full URL</div>
                    <div class="waterfall-detail-content">\${escapeHtml(req.url)}</div>
                  </div>
                  \${req.requestHeaders ? \`
                    <div class="waterfall-detail-section">
                      <div class="waterfall-detail-title">Request Headers</div>
                      <div class="waterfall-detail-content">\${escapeHtml(JSON.stringify(req.requestHeaders, null, 2))}</div>
                    </div>
                  \` : ''}
                  \${req.responseHeaders ? \`
                    <div class="waterfall-detail-section">
                      <div class="waterfall-detail-title">Response Headers</div>
                      <div class="waterfall-detail-content">\${escapeHtml(JSON.stringify(req.responseHeaders, null, 2))}</div>
                    </div>
                  \` : ''}
                </div>
              </div>
            \`;
          }).join('')}
        </div>
      \`;
    }

    function toggleNetworkDetails(element) {
      element.classList.toggle('expanded');
    }

    function truncateUrl(url) {
      if (url.length <= 60) return url;
      return url.substring(0, 57) + '...';
    }

    function sortNetwork(by) {
      const sorted = [...currentNetwork].sort((a, b) => {
        if (by === 'time') return (a.startTime || 0) - (b.startTime || 0);
        if (by === 'duration') return (b.duration || 0) - (a.duration || 0);
        if (by === 'size') return (b.size || 0) - (a.size || 0);
        return 0;
      });
      document.getElementById('tab-network').querySelector('.log-viewer').innerHTML = \`
        <div class="log-header">
          <span class="log-title">Network Requests</span>
          <div style="display: flex; gap: 8px;">
            <button class="filter-btn" onclick="sortNetwork('time')">Sort by Time</button>
            <button class="filter-btn" onclick="sortNetwork('duration')">Sort by Duration</button>
            <button class="filter-btn" onclick="sortNetwork('size')">Sort by Size</button>
          </div>
        </div>
        \${renderNetworkWaterfall(sorted)}
      \`;
    }

    // Log filtering
    function debounceSearch() {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(applyLogFilters, 300);
    }

    function applyLogFilters() {
      const level = document.getElementById('filter-level').value;
      const type = document.getElementById('filter-type').value;
      const search = document.getElementById('filter-search').value.toLowerCase();

      const filtered = currentLogs.filter(log => {
        if (level !== 'all' && log.level !== level) return false;
        if (type !== 'all' && log.type !== type) return false;
        if (search && !log.message.toLowerCase().includes(search)) return false;
        return true;
      });

      document.getElementById('log-body').innerHTML = renderLogs(filtered);
      document.getElementById('filter-count').textContent = filtered.length + ' of ' + currentLogs.length + ' entries';
    }

    function clearLogFilters() {
      document.getElementById('filter-level').value = 'all';
      document.getElementById('filter-type').value = 'all';
      document.getElementById('filter-search').value = '';
      document.getElementById('log-body').innerHTML = renderLogs(currentLogs);
      document.getElementById('filter-count').textContent = currentLogs.length + ' entries';
    }

    // Tab switching
    function showTab(tabName, element) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
      element.classList.add('active');
      document.getElementById('tab-' + tabName).style.display = 'block';
    }

    function switchTabByNumber(num) {
      const tabs = document.querySelectorAll('#detail-tabs .tab');
      if (tabs[num - 1]) tabs[num - 1].click();
    }

    // Append new logs (for live streaming)
    function appendLogs(logs) {
      currentLogs = [...currentLogs, ...logs];
      applyLogFilters();
    }

    // Delete run
    function promptDeleteRun(runId) {
      deleteTarget = runId;
      document.getElementById('delete-message').textContent = 'Are you sure you want to delete run ' + runId.substring(0, 12) + '...?';
      document.getElementById('delete-modal').classList.add('active');
    }

    function closeDeleteModal() {
      document.getElementById('delete-modal').classList.remove('active');
      deleteTarget = null;
    }

    async function confirmDelete() {
      if (!deleteTarget) return;
      try {
        const res = await fetch('/api/runs/' + deleteTarget, { method: 'DELETE' });
        if (res.ok) {
          runs = runs.filter(r => r.runId !== deleteTarget);
          if (selectedRunId === deleteTarget) {
            selectedRunId = null;
            document.getElementById('run-detail').style.display = 'none';
            document.getElementById('analytics-section').style.display = 'block';
          }
          renderSidebar();
          renderStats();
          showToast('Run deleted successfully', 'success');
        } else {
          showToast('Failed to delete run', 'error');
        }
      } catch (err) {
        showToast('Error deleting run', 'error');
      }
      closeDeleteModal();
    }

    async function clearAllRuns() {
      if (!confirm('Delete all runs older than 7 days?')) return;
      try {
        const res = await fetch('/api/runs/clear-old', { method: 'DELETE' });
        const data = await res.json();
        await loadData();
        renderSidebar();
        renderStats();
        showToast('Cleared ' + (data.deleted || 0) + ' old runs', 'success');
      } catch (err) {
        showToast('Error clearing runs', 'error');
      }
    }

    // Cloud
    function showCloudModal() {
      document.getElementById('cloud-modal').classList.add('active');
      updateCloudUI();
    }

    function closeModal() {
      document.getElementById('cloud-modal').classList.remove('active');
    }

    async function connectToCloud() {
      const apiKey = document.getElementById('cloud-api-key').value;
      if (!apiKey) return showToast('Please enter your API key', 'warning');

      await fetch('/api/cloud-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, connected: true, syncEnabled: true })
      });

      cloudConfig.connected = true;
      cloudConfig.apiKey = apiKey;
      updateCloudUI();
      closeModal();
      showToast('Connected to cloud!', 'success');
    }

    function updateCloudUI() {
      const section = document.getElementById('cloud-section');
      if (cloudConfig.connected) {
        section.innerHTML = \`
          <div class="cloud-banner cloud-connected">
            <h3>✓ Connected to Cloud</h3>
            <p>Syncing enabled. Your test data is being backed up.</p>
            <button class="btn" onclick="disconnectCloud()">Disconnect</button>
          </div>
        \`;
      }

      const statusEl = document.getElementById('cloud-status');
      if (statusEl) {
        statusEl.innerHTML = cloudConfig.connected ? \`
          <div style="background: rgba(34,197,94,0.1); border: 1px solid var(--green); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
            ✓ Currently connected
          </div>
        \` : '';
      }
    }

    async function disconnectCloud() {
      await fetch('/api/cloud-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connected: false, syncEnabled: false })
      });
      cloudConfig.connected = false;
      showToast('Disconnected from cloud', 'success');
      location.reload();
    }

    // Screenshots
    function showScreenshot(url, title) {
      document.getElementById('screenshot-title').textContent = title;
      document.getElementById('screenshot-img').src = url;
      document.getElementById('screenshot-modal').classList.add('active');
    }

    function closeScreenshotModal() {
      document.getElementById('screenshot-modal').classList.remove('active');
    }

    // Helpers
    function formatTime(date) {
      if (!(date instanceof Date)) date = new Date(date);
      const now = new Date();
      const diff = now - date;

      if (diff < 60000) return 'Just now';
      if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
      if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
      return date.toLocaleDateString();
    }

    function formatLogTime(ts) {
      const d = new Date(ts);
      return d.toTimeString().substring(0, 8);
    }

    function formatDuration(ms) {
      if (ms < 1000) return ms + 'ms';
      if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
      return (ms / 60000).toFixed(1) + 'm';
    }

    function formatSize(bytes) {
      if (bytes < 1024) return bytes + 'B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
      return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
    }

    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ignore if typing in input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') e.target.blur();
        return;
      }

      switch (e.key) {
        case 'Escape':
          closeModal();
          closeScreenshotModal();
          closeDeleteModal();
          break;
        case 'j':
          navigateRuns(1);
          break;
        case 'k':
          navigateRuns(-1);
          break;
        case '1':
        case '2':
        case '3':
          switchTabByNumber(parseInt(e.key));
          break;
        case '/':
          e.preventDefault();
          const searchInput = document.getElementById('filter-search');
          if (searchInput) searchInput.focus();
          break;
        case 'r':
          refreshData();
          break;
        case 't':
          toggleTheme();
          break;
        case '?':
          document.getElementById('shortcut-hint').classList.toggle('visible');
          break;
      }
    });

    function navigateRuns(direction) {
      const runItems = document.querySelectorAll('.run-item');
      if (runItems.length === 0) return;

      let currentIdx = -1;
      runItems.forEach((item, idx) => {
        if (item.classList.contains('active')) currentIdx = idx;
      });

      let nextIdx = currentIdx + direction;
      if (nextIdx < 0) nextIdx = 0;
      if (nextIdx >= runItems.length) nextIdx = runItems.length - 1;

      if (runs[nextIdx]) showRunDetail(runs[nextIdx].runId);
    }
  </script>
</body>
</html>`;
}

// =============================================================================
// HTTP Server
// =============================================================================

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method || 'GET';

  try {
    const store = await getObservabilityStore(DATA_DIR);

    // API routes
    if (pathname === '/api/runs' && method === 'GET') {
      const runs = await store.getRuns({ limit: 100 });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(runs));
      return;
    }

    if (pathname.startsWith('/api/logs/') && method === 'GET') {
      const runId = pathname.split('/')[3];
      const logs = await store.getLogs(runId, { limit: 500 });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(logs));
      return;
    }

    if (pathname.startsWith('/api/screenshots/') && method === 'GET') {
      const runId = pathname.split('/')[3];
      const screenshots = await store.getScreenshots(runId);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(screenshots));
      return;
    }

    if (pathname.startsWith('/api/network/') && method === 'GET') {
      const runId = pathname.split('/')[3];
      const network = await store.getNetworkRequests(runId);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(network));
      return;
    }

    if (pathname === '/api/cloud-config' && method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(cloudConfig));
      return;
    }

    if (pathname === '/api/cloud-config' && method === 'POST') {
      const body = await readBody(req);
      const updates = JSON.parse(body);
      cloudConfig = { ...cloudConfig, ...updates };
      await saveCloudConfig();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // Enhanced stats endpoint
    if (pathname === '/api/stats' && method === 'GET') {
      const runs = await store.getRuns({ limit: 1000 });
      const total = runs.length;
      const passed = runs.filter(r => r.status === 'passed').length;
      const failed = runs.filter(r => r.status === 'failed').length;
      const running = runs.filter(r => r.status === 'running').length;
      const passRate = total > 0 ? Math.round(passed / total * 100) : 0;
      const durations = runs.filter(r => r.duration !== undefined).map(r => r.duration as number);
      const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ total, passed, failed, running, passRate, avgDuration }));
      return;
    }

    // Analytics: Trends endpoint
    if (pathname === '/api/analytics/trends' && method === 'GET') {
      const days = parseInt(url.searchParams.get('days') || '7');
      const runs = await store.getRuns({ limit: 10000 });

      // Group runs by day
      const dayMap: Record<string, { total: number; passed: number }> = {};
      const now = Date.now();
      const cutoff = now - days * 24 * 60 * 60 * 1000;

      for (const run of runs) {
        const runTime = new Date(run.startedAt).getTime();
        if (runTime < cutoff) continue;

        const dateStr = new Date(run.startedAt).toISOString().split('T')[0];
        if (!dayMap[dateStr]) dayMap[dateStr] = { total: 0, passed: 0 };
        dayMap[dateStr].total++;
        if (run.status === 'passed') dayMap[dateStr].passed++;
      }

      // Fill in missing days and convert to array
      const trends = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now - i * 24 * 60 * 60 * 1000);
        const dateStr = d.toISOString().split('T')[0];
        const data = dayMap[dateStr] || { total: 0, passed: 0 };
        trends.push({
          date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          total: data.total,
          passed: data.passed,
          passRate: data.total > 0 ? Math.round(data.passed / data.total * 100) : 0
        });
      }

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(trends));
      return;
    }

    // Analytics: Flaky tests endpoint
    if (pathname === '/api/analytics/flaky' && method === 'GET') {
      const days = parseInt(url.searchParams.get('days') || '7');
      const runs = await store.getRuns({ limit: 10000 });
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

      // Group by projectId (or origin) and track pass/fail patterns
      const projectStats: Record<string, { passes: number; fails: number; name: string }> = {};

      for (const run of runs) {
        const runTime = new Date(run.startedAt).getTime();
        if (runTime < cutoff) continue;

        const key = run.projectId || 'unknown';
        if (!projectStats[key]) projectStats[key] = { passes: 0, fails: 0, name: key };

        if (run.status === 'passed') projectStats[key].passes++;
        else if (run.status === 'failed') projectStats[key].fails++;
      }

      // Calculate flakiness score (tests that flip between pass/fail)
      const flaky = Object.values(projectStats)
        .filter(p => p.passes > 0 && p.fails > 0)
        .map(p => {
          const total = p.passes + p.fails;
          const score = Math.min(p.passes, p.fails) / total * 2; // Higher = more flaky
          return { name: p.name, score, passes: p.passes, fails: p.fails };
        })
        .filter(p => p.score > 0.1)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(flaky));
      return;
    }

    // Delete single run
    if (pathname.match(/^\/api\/runs\/[^/]+$/) && method === 'DELETE') {
      const runId = pathname.split('/')[3];
      try {
        await store.deleteRun(runId);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, deleted: runId }));
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Failed to delete run' }));
      }
      return;
    }

    // Clear old runs (older than 7 days)
    if (pathname === '/api/runs/clear-old' && method === 'DELETE') {
      const runs = await store.getRuns({ limit: 10000 });
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      let deleted = 0;

      for (const run of runs) {
        const runTime = new Date(run.startedAt).getTime();
        if (runTime < cutoff) {
          try {
            await store.deleteRun(run.runId);
            deleted++;
          } catch {}
        }
      }

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, deleted }));
      return;
    }

    // Screenshot serving
    if (pathname.startsWith('/screenshot/')) {
      const parts = pathname.split('/');
      const runId = parts[2];
      const ssId = parts[3];

      const screenshots = await store.getScreenshots(runId);
      const ss = screenshots.find(s => s.id === ssId);

      if (ss && ss.url && existsSync(ss.url)) {
        const content = await readFile(ss.url);
        res.setHeader('Content-Type', 'image/png');
        res.end(content);
        return;
      }

      res.statusCode = 404;
      res.end('Not found');
      return;
    }

    // =========================================================================
    // SWARM API - Multi-Agent Orchestration
    // =========================================================================

    // List all swarms
    if (pathname === '/api/swarms' && method === 'GET') {
      const swarms = await store.getSwarms({ limit: 50 });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(swarms));
      return;
    }

    // Get swarm stats
    if (pathname === '/api/swarms/stats' && method === 'GET') {
      const stats = await store.getSwarmStats();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(stats));
      return;
    }

    // Create a new swarm (called by MCP or Claude CLI)
    if (pathname === '/api/swarms' && method === 'POST') {
      const body = await readBody(req);
      const data = JSON.parse(body);

      const swarm = {
        swarmId: data.swarmId || `swarm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        masterIntent: data.masterIntent || data.intent || 'Unknown intent',
        status: 'running' as const,
        startedAt: new Date(),
        routes: (data.routes || []).map((r: any) => ({
          routeId: r.routeId || r.id,
          routeName: r.routeName || r.name,
          status: 'pending' as const,
          toolBag: r.toolBag?.map((t: any) => t.name || t) || [],
          progress: [],
        })),
        config: {
          maxIgors: data.config?.maxIgors || 4,
          toolBagSize: data.config?.toolBagSize || 15,
        },
      };

      await store.createSwarm(swarm);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, swarmId: swarm.swarmId, swarm }));
      return;
    }

    // Get single swarm
    if (pathname.match(/^\/api\/swarms\/[^/]+$/) && method === 'GET') {
      const swarmId = pathname.split('/')[3];
      const swarm = await store.getSwarm(swarmId);
      if (!swarm) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Swarm not found' }));
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(swarm));
      return;
    }

    // Update route status (called by Igor agents)
    if (pathname.match(/^\/api\/swarms\/[^/]+\/routes\/[^/]+$/) && method === 'PATCH') {
      const parts = pathname.split('/');
      const swarmId = parts[3];
      const routeId = parts[5];
      const body = await readBody(req);
      const update = JSON.parse(body);

      await store.updateRouteStatus(swarmId, routeId, update);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // Add progress to route (called by Igor agents for live updates)
    if (pathname.match(/^\/api\/swarms\/[^/]+\/routes\/[^/]+\/progress$/) && method === 'POST') {
      const parts = pathname.split('/');
      const swarmId = parts[3];
      const routeId = parts[5];
      const body = await readBody(req);
      const progress = JSON.parse(body);

      await store.addRouteProgress(swarmId, routeId, progress);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // Update swarm status
    if (pathname.match(/^\/api\/swarms\/[^/]+\/status$/) && method === 'PATCH') {
      const swarmId = pathname.split('/')[3];
      const body = await readBody(req);
      const { status } = JSON.parse(body);

      await store.updateSwarmStatus(swarmId, status);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // Delete swarm
    if (pathname.match(/^\/api\/swarms\/[^/]+$/) && method === 'DELETE') {
      const swarmId = pathname.split('/')[3];
      await store.deleteSwarm(swarmId);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // Dashboard
    res.setHeader('Content-Type', 'text/html');
    res.end(localDashboardHtml());

  } catch (error) {
    console.error('Request error:', error);
    res.statusCode = 500;
    res.end('Internal server error');
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
  });
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await loadCloudConfig();

  // Initialize store and subscribe to swarm events
  const store = await getObservabilityStore(DATA_DIR);

  // Subscribe to swarm events for real-time broadcasting
  store.onSwarmEvent((event) => {
    broadcast(`swarm_${event.type}`, {
      swarmId: event.swarmId,
      ...event.data,
    });
  });

  const server = createServer(handleRequest);

  // WebSocket server
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    wsClients.add(ws);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'watch' && msg.runId) {
          activeRunId = msg.runId;
        }
        // Support watching specific swarm
        if (msg.type === 'watch_swarm' && msg.swarmId) {
          // Could track active swarm here if needed
        }
      } catch {}
    });

    ws.on('close', () => wsClients.delete(ws));
  });

  // Setup file watcher for real-time updates
  setupFileWatcher();

  server.listen(PORT, () => {
    console.log('');
    console.log('  BarrHawk Local Dashboard');
    console.log('  ========================');
    console.log('');
    console.log('  Dashboard: http://localhost:' + PORT);
    console.log('  Data Dir:  ' + DATA_DIR);
    console.log('');
    console.log('  Features:');
    console.log('  - Live test progress monitoring');
    console.log('  - Screenshot viewer');
    console.log('  - Console log streaming');
    console.log('  - Network request inspection');
    console.log('  - 🐝 Swarm multi-agent monitoring');
    console.log('  - Optional cloud sync for premium');
    console.log('');
    console.log('  Press Ctrl+C to stop');
    console.log('');
  });
}

main().catch(console.error);
