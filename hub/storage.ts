/**
 * Hub Storage - SQLite persistence for projects, targets, and runs
 */

import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type {
  Project,
  Target,
  TestRun,
  TriggerDef,
  WatcherDef,
  AssertionDef,
  DashboardConfig,
} from './schema.js';
import { generateId } from './schema.js';

// =============================================================================
// Database Setup
// =============================================================================

const DEFAULT_DB_PATH = process.env.HUB_DB_PATH || '/home/raptor/narcis/data/hub.db';

let db: Database | null = null;

export function initStorage(dbPath: string = DEFAULT_DB_PATH): Database {
  if (db) return db;

  // Ensure directory exists
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  // Create tables
  db.exec(`
    -- Projects
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      description TEXT,
      connections TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Targets (test definitions)
    CREATE TABLE IF NOT EXISTS targets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      source TEXT NOT NULL DEFAULT 'user',
      enabled INTEGER NOT NULL DEFAULT 1,
      trigger_def TEXT NOT NULL,
      watchers TEXT NOT NULL DEFAULT '[]',
      assertions TEXT NOT NULL DEFAULT '[]',
      settle_time_ms INTEGER NOT NULL DEFAULT 1000,
      timeout_ms INTEGER NOT NULL DEFAULT 30000,
      tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_run_at TEXT,
      last_run_status TEXT
    );

    -- Test Runs (execution history)
    CREATE TABLE IF NOT EXISTS test_runs (
      id TEXT PRIMARY KEY,
      target_id TEXT NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      started_at TEXT NOT NULL,
      completed_at TEXT,
      duration_ms INTEGER,
      triggered_by TEXT NOT NULL DEFAULT 'manual',
      trigger_context TEXT,
      watcher_states TEXT NOT NULL DEFAULT '{}',
      assertion_results TEXT NOT NULL DEFAULT '[]',
      artifacts TEXT NOT NULL DEFAULT '[]',
      error TEXT
    );

    -- Dashboard Configs
    CREATE TABLE IF NOT EXISTS dashboards (
      project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      layout TEXT NOT NULL,
      auto_refresh INTEGER NOT NULL DEFAULT 1,
      refresh_interval_ms INTEGER NOT NULL DEFAULT 5000
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_targets_project ON targets(project_id);
    CREATE INDEX IF NOT EXISTS idx_runs_target ON test_runs(target_id);
    CREATE INDEX IF NOT EXISTS idx_runs_project ON test_runs(project_id);
    CREATE INDEX IF NOT EXISTS idx_runs_status ON test_runs(status);
    CREATE INDEX IF NOT EXISTS idx_runs_started ON test_runs(started_at DESC);
  `);

  return db;
}

export function getDb(): Database {
  if (!db) {
    return initStorage();
  }
  return db;
}

// =============================================================================
// Projects
// =============================================================================

export function createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Project {
  const db = getDb();
  const now = new Date().toISOString();
  const id = generateId();

  const stmt = db.prepare(`
    INSERT INTO projects (id, name, base_url, description, connections, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    project.name,
    project.baseUrl,
    project.description || null,
    JSON.stringify(project.connections || {}),
    now,
    now
  );

  return {
    id,
    name: project.name,
    baseUrl: project.baseUrl,
    description: project.description,
    connections: project.connections || {},
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
}

export function getProject(id: string): Project | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    description: row.description,
    connections: JSON.parse(row.connections),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function listProjects(): Project[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as any[];

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    description: row.description,
    connections: JSON.parse(row.connections),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));
}

export function updateProject(id: string, updates: Partial<Project>): Project | null {
  const db = getDb();
  const existing = getProject(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE projects SET
      name = COALESCE(?, name),
      base_url = COALESCE(?, base_url),
      description = COALESCE(?, description),
      connections = COALESCE(?, connections),
      updated_at = ?
    WHERE id = ?
  `);

  stmt.run(
    updates.name ?? null,
    updates.baseUrl ?? null,
    updates.description ?? null,
    updates.connections ? JSON.stringify(updates.connections) : null,
    now,
    id
  );

  return getProject(id);
}

export function deleteProject(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  return result.changes > 0;
}

// =============================================================================
// Targets
// =============================================================================

export function createTarget(target: Omit<Target, 'id' | 'createdAt' | 'updatedAt'>): Target {
  const db = getDb();
  const now = new Date().toISOString();
  const id = generateId();

  const stmt = db.prepare(`
    INSERT INTO targets (
      id, project_id, name, description, source, enabled,
      trigger_def, watchers, assertions, settle_time_ms, timeout_ms, tags,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    target.projectId,
    target.name,
    target.description || null,
    target.source || 'user',
    target.enabled ? 1 : 0,
    JSON.stringify(target.trigger),
    JSON.stringify(target.watchers || []),
    JSON.stringify(target.assertions || []),
    target.settleTimeMs || 1000,
    target.timeoutMs || 30000,
    JSON.stringify(target.tags || []),
    now,
    now
  );

  return {
    id,
    projectId: target.projectId,
    name: target.name,
    description: target.description,
    source: target.source || 'user',
    enabled: target.enabled ?? true,
    trigger: target.trigger,
    watchers: target.watchers || [],
    assertions: target.assertions || [],
    settleTimeMs: target.settleTimeMs || 1000,
    timeoutMs: target.timeoutMs || 30000,
    tags: target.tags || [],
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
}

export function getTarget(id: string): Target | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM targets WHERE id = ?').get(id) as any;
  if (!row) return null;

  return rowToTarget(row);
}

export function listTargets(projectId?: string): Target[] {
  const db = getDb();
  let rows: any[];

  if (projectId) {
    rows = db.prepare('SELECT * FROM targets WHERE project_id = ? ORDER BY updated_at DESC').all(projectId) as any[];
  } else {
    rows = db.prepare('SELECT * FROM targets ORDER BY updated_at DESC').all() as any[];
  }

  return rows.map(rowToTarget);
}

export function listEnabledTargets(projectId?: string): Target[] {
  const db = getDb();
  let rows: any[];

  if (projectId) {
    rows = db.prepare('SELECT * FROM targets WHERE project_id = ? AND enabled = 1 ORDER BY updated_at DESC').all(projectId) as any[];
  } else {
    rows = db.prepare('SELECT * FROM targets WHERE enabled = 1 ORDER BY updated_at DESC').all() as any[];
  }

  return rows.map(rowToTarget);
}

function rowToTarget(row: any): Target {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    source: row.source as 'auto' | 'user',
    enabled: row.enabled === 1,
    trigger: JSON.parse(row.trigger_def) as TriggerDef,
    watchers: JSON.parse(row.watchers) as WatcherDef[],
    assertions: JSON.parse(row.assertions) as AssertionDef[],
    settleTimeMs: row.settle_time_ms,
    timeoutMs: row.timeout_ms,
    tags: JSON.parse(row.tags),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    lastRunAt: row.last_run_at ? new Date(row.last_run_at) : undefined,
    lastRunStatus: row.last_run_status as 'passed' | 'failed' | 'error' | undefined,
  };
}

export function updateTarget(id: string, updates: Partial<Target>): Target | null {
  const db = getDb();
  const existing = getTarget(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE targets SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      enabled = COALESCE(?, enabled),
      trigger_def = COALESCE(?, trigger_def),
      watchers = COALESCE(?, watchers),
      assertions = COALESCE(?, assertions),
      settle_time_ms = COALESCE(?, settle_time_ms),
      timeout_ms = COALESCE(?, timeout_ms),
      tags = COALESCE(?, tags),
      updated_at = ?
    WHERE id = ?
  `);

  stmt.run(
    updates.name ?? null,
    updates.description ?? null,
    updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : null,
    updates.trigger ? JSON.stringify(updates.trigger) : null,
    updates.watchers ? JSON.stringify(updates.watchers) : null,
    updates.assertions ? JSON.stringify(updates.assertions) : null,
    updates.settleTimeMs ?? null,
    updates.timeoutMs ?? null,
    updates.tags ? JSON.stringify(updates.tags) : null,
    now,
    id
  );

  return getTarget(id);
}

export function deleteTarget(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM targets WHERE id = ?').run(id);
  return result.changes > 0;
}

export function updateTargetLastRun(id: string, status: 'passed' | 'failed' | 'error'): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE targets SET last_run_at = ?, last_run_status = ?, updated_at = ?
    WHERE id = ?
  `).run(now, status, now, id);
}

// =============================================================================
// Test Runs
// =============================================================================

export function createTestRun(run: Omit<TestRun, 'id'>): TestRun {
  const db = getDb();
  const id = generateId();

  const stmt = db.prepare(`
    INSERT INTO test_runs (
      id, target_id, project_id, status, started_at, triggered_by,
      trigger_context, watcher_states, assertion_results, artifacts
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    run.targetId,
    run.projectId,
    run.status,
    run.startedAt.toISOString(),
    run.triggeredBy,
    run.triggerContext ? JSON.stringify(run.triggerContext) : null,
    JSON.stringify(run.watcherStates || {}),
    JSON.stringify(run.assertionResults || []),
    JSON.stringify(run.artifacts || [])
  );

  return { id, ...run };
}

export function getTestRun(id: string): TestRun | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM test_runs WHERE id = ?').get(id) as any;
  if (!row) return null;

  return rowToTestRun(row);
}

export function listTestRuns(options: {
  targetId?: string;
  projectId?: string;
  status?: string;
  limit?: number;
  offset?: number;
} = {}): TestRun[] {
  const db = getDb();
  let query = 'SELECT * FROM test_runs WHERE 1=1';
  const params: any[] = [];

  if (options.targetId) {
    query += ' AND target_id = ?';
    params.push(options.targetId);
  }
  if (options.projectId) {
    query += ' AND project_id = ?';
    params.push(options.projectId);
  }
  if (options.status) {
    query += ' AND status = ?';
    params.push(options.status);
  }

  query += ' ORDER BY started_at DESC';

  if (options.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }
  if (options.offset) {
    query += ' OFFSET ?';
    params.push(options.offset);
  }

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(rowToTestRun);
}

function rowToTestRun(row: any): TestRun {
  return {
    id: row.id,
    targetId: row.target_id,
    projectId: row.project_id,
    status: row.status as TestRun['status'],
    startedAt: new Date(row.started_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    durationMs: row.duration_ms,
    triggeredBy: row.triggered_by as TestRun['triggeredBy'],
    triggerContext: row.trigger_context ? JSON.parse(row.trigger_context) : undefined,
    watcherStates: JSON.parse(row.watcher_states),
    assertionResults: JSON.parse(row.assertion_results),
    artifacts: JSON.parse(row.artifacts),
    error: row.error ? JSON.parse(row.error) : undefined,
  };
}

export function updateTestRun(id: string, updates: Partial<TestRun>): TestRun | null {
  const db = getDb();
  const existing = getTestRun(id);
  if (!existing) return null;

  const stmt = db.prepare(`
    UPDATE test_runs SET
      status = COALESCE(?, status),
      completed_at = COALESCE(?, completed_at),
      duration_ms = COALESCE(?, duration_ms),
      watcher_states = COALESCE(?, watcher_states),
      assertion_results = COALESCE(?, assertion_results),
      artifacts = COALESCE(?, artifacts),
      error = COALESCE(?, error)
    WHERE id = ?
  `);

  stmt.run(
    updates.status ?? null,
    updates.completedAt?.toISOString() ?? null,
    updates.durationMs ?? null,
    updates.watcherStates ? JSON.stringify(updates.watcherStates) : null,
    updates.assertionResults ? JSON.stringify(updates.assertionResults) : null,
    updates.artifacts ? JSON.stringify(updates.artifacts) : null,
    updates.error ? JSON.stringify(updates.error) : null,
    id
  );

  // Update target's last run status
  if (updates.status && ['passed', 'failed', 'error'].includes(updates.status)) {
    updateTargetLastRun(existing.targetId, updates.status as 'passed' | 'failed' | 'error');
  }

  return getTestRun(id);
}

// =============================================================================
// Stats & Aggregations
// =============================================================================

export interface ProjectStats {
  projectId: string;
  totalTargets: number;
  enabledTargets: number;
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  passRate: number;
  lastRunAt?: Date;
}

export function getProjectStats(projectId: string): ProjectStats {
  const db = getDb();

  const targetStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) as enabled
    FROM targets WHERE project_id = ?
  `).get(projectId) as any;

  const runStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      MAX(completed_at) as last_run
    FROM test_runs WHERE project_id = ?
  `).get(projectId) as any;

  const total = runStats.total || 0;
  const passed = runStats.passed || 0;

  return {
    projectId,
    totalTargets: targetStats.total || 0,
    enabledTargets: targetStats.enabled || 0,
    totalRuns: total,
    passedRuns: passed,
    failedRuns: runStats.failed || 0,
    passRate: total > 0 ? (passed / total) * 100 : 0,
    lastRunAt: runStats.last_run ? new Date(runStats.last_run) : undefined,
  };
}

export interface TargetStats {
  targetId: string;
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  passRate: number;
  avgDurationMs: number;
  lastRunAt?: Date;
  lastStatus?: string;
}

export function getTargetStats(targetId: string): TargetStats {
  const db = getDb();

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      AVG(duration_ms) as avg_duration,
      MAX(completed_at) as last_run
    FROM test_runs WHERE target_id = ?
  `).get(targetId) as any;

  const lastRun = db.prepare(`
    SELECT status FROM test_runs WHERE target_id = ?
    ORDER BY started_at DESC LIMIT 1
  `).get(targetId) as any;

  const total = stats.total || 0;
  const passed = stats.passed || 0;

  return {
    targetId,
    totalRuns: total,
    passedRuns: passed,
    failedRuns: stats.failed || 0,
    passRate: total > 0 ? (passed / total) * 100 : 0,
    avgDurationMs: stats.avg_duration || 0,
    lastRunAt: stats.last_run ? new Date(stats.last_run) : undefined,
    lastStatus: lastRun?.status,
  };
}

// =============================================================================
// Dashboard Config
// =============================================================================

export function getDashboard(projectId: string): DashboardConfig | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM dashboards WHERE project_id = ?').get(projectId) as any;
  if (!row) return null;

  return {
    projectId: row.project_id,
    layout: JSON.parse(row.layout),
    autoRefresh: row.auto_refresh === 1,
    refreshIntervalMs: row.refresh_interval_ms,
  };
}

export function saveDashboard(config: DashboardConfig): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO dashboards (project_id, layout, auto_refresh, refresh_interval_ms)
    VALUES (?, ?, ?, ?)
  `);

  stmt.run(
    config.projectId,
    JSON.stringify(config.layout),
    config.autoRefresh ? 1 : 0,
    config.refreshIntervalMs
  );
}
