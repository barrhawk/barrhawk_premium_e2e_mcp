#!/usr/bin/env bun
/**
 * FakeBarrHawk - Storage Panel Simulator for E2E Testing
 *
 * A fake implementation of BarrHawk Cloud storage for dogfooding.
 *
 * Features:
 * - User auth with tiers (free/pro/enterprise)
 * - Team management
 * - Project and test run organization
 * - File upload/download with quota enforcement
 * - Artifact storage (screenshots, videos, traces, diffs, logs, reports)
 * - Share links for public access
 * - Retention policy simulation
 * - Thumbnail generation (simulated)
 *
 * Test Users:
 * - free@barrhawk.test / free123 (Free tier, 100MB)
 * - pro@barrhawk.test / pro123 (Pro tier, 10GB, team: Acme Corp)
 * - enterprise@barrhawk.test / enterprise123 (Enterprise, 100GB)
 * - teammate1@barrhawk.test / team123 (Pro, Acme Corp member)
 * - admin@barrhawk.test / admin123 (Admin)
 */

import { mkdirSync, existsSync, writeFileSync, readFileSync, unlinkSync, readdirSync, statSync, rmSync } from 'fs';
import { join, extname } from 'path';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { parse as parseUrl } from 'url';
import { randomUUID } from 'crypto';

const PORT = parseInt(process.env.PORT || '4002');
const STORAGE_ROOT = '/tmp/fakebarrhawk';

// =============================================================================
// Types
// =============================================================================

type Tier = 'free' | 'pro' | 'enterprise';
type Role = 'owner' | 'admin' | 'member';
type ArtifactType = 'screenshot' | 'video' | 'trace' | 'diff' | 'log' | 'report';
type RunStatus = 'running' | 'passed' | 'failed' | 'cancelled';

interface User {
  id: string;
  email: string;
  password: string;
  name: string;
  teamId: string;
  role: Role;
  tier: Tier;
  createdAt: number;
  lastLoginAt: number;
  isAdmin?: boolean;
}

interface Team {
  id: string;
  name: string;
  subdomain: string;
  tier: Tier;
  ownerId: string;
  memberIds: string[];
  storageUsedBytes: number;
  storageLimitBytes: number;
  runsToday: number;
  runLimitPerDay: number;
  retentionDays: number;
  createdAt: number;
  lastRunDate: string;
}

interface Project {
  id: string;
  teamId: string;
  name: string;
  slug: string;
  description: string;
  repoUrl: string;
  createdAt: number;
  lastRunAt: number;
  totalRuns: number;
  totalArtifacts: number;
  storageUsedBytes: number;
}

interface TestRun {
  id: string;
  projectId: string;
  teamId: string;
  status: RunStatus;
  branch: string;
  commit: string;
  commitMessage: string;
  triggeredBy: 'manual' | 'ci' | 'api' | 'mcp';
  startedAt: number;
  completedAt: number;
  durationMs: number;
  summary: {
    totalSteps: number;
    passedSteps: number;
    failedSteps: number;
    screenshots: number;
    videos: number;
  };
  tags: string[];
}

interface Artifact {
  id: string;
  runId: string;
  projectId: string;
  teamId: string;
  type: ArtifactType;
  name: string;
  path: string;
  sizeBytes: number;
  mimeType: string;
  step: number;
  stepName: string;
  hasThumbnail: boolean;
  createdAt: number;
}

interface ShareLink {
  id: string;
  runId: string;
  projectId: string;
  teamId: string;
  type: 'public' | 'private';
  password?: string;
  expiresAt?: number;
  viewCount: number;
  createdAt: number;
  createdBy: string;
}

interface APIKey {
  id: string;
  teamId: string;
  userId: string;
  name: string;
  key: string;
  prefix: string;
  permissions: string[];
  lastUsedAt: number;
  createdAt: number;
}

// =============================================================================
// Tier Limits
// =============================================================================

const TIER_LIMITS: Record<Tier, {
  storageLimitBytes: number;
  maxFileSizeBytes: number;
  runsPerDay: number;
  retentionDays: number;
}> = {
  free: {
    storageLimitBytes: 100 * 1024 * 1024,        // 100MB
    maxFileSizeBytes: 10 * 1024 * 1024,          // 10MB
    runsPerDay: 10,
    retentionDays: 7,
  },
  pro: {
    storageLimitBytes: 10 * 1024 * 1024 * 1024,  // 10GB
    maxFileSizeBytes: 500 * 1024 * 1024,         // 500MB
    runsPerDay: Infinity,
    retentionDays: 90,
  },
  enterprise: {
    storageLimitBytes: 100 * 1024 * 1024 * 1024, // 100GB
    maxFileSizeBytes: 2 * 1024 * 1024 * 1024,    // 2GB
    runsPerDay: Infinity,
    retentionDays: 365,
  },
};

// =============================================================================
// In-Memory Data Store
// =============================================================================

const users = new Map<string, User>();
const teams = new Map<string, Team>();
const projects = new Map<string, Project>();
const runs = new Map<string, TestRun>();
const artifacts = new Map<string, Artifact>();
const shareLinks = new Map<string, ShareLink>();
const apiKeys = new Map<string, APIKey>();
const sessions = new Map<string, string>(); // sessionId -> userId

// =============================================================================
// Flaky Behavior
// =============================================================================

let requestCount = 0;
const FLAKY_CONFIG = {
  uploadSlowdown: 0.1,      // 10% chance upload takes 3s extra
  listTimeout: 0.05,        // 5% chance list returns 504
  randomLogout: 0.02,       // 2% chance session invalidates
  quotaGlitch: 0.03,        // 3% chance quota check is wrong temporarily
};

function shouldBeFlaky(type: keyof typeof FLAKY_CONFIG): boolean {
  requestCount++;
  return Math.random() < FLAKY_CONFIG[type];
}

// =============================================================================
// Seed Data
// =============================================================================

function seedData() {
  // Create storage directory
  mkdirSync(STORAGE_ROOT, { recursive: true });
  mkdirSync(join(STORAGE_ROOT, 'uploads'), { recursive: true });
  mkdirSync(join(STORAGE_ROOT, 'thumbnails'), { recursive: true });
  mkdirSync(join(STORAGE_ROOT, 'temp'), { recursive: true });

  // Teams
  const acmeTeam: Team = {
    id: 'team-acme',
    name: 'Acme Corp',
    subdomain: 'acme',
    tier: 'pro',
    ownerId: 'user-pro',
    memberIds: ['user-pro', 'user-teammate1', 'user-teammate2'],
    storageUsedBytes: 8 * 1024 * 1024 * 1024, // 8GB used
    storageLimitBytes: TIER_LIMITS.pro.storageLimitBytes,
    runsToday: 45,
    runLimitPerDay: Infinity,
    retentionDays: 90,
    createdAt: Date.now() - 90 * 24 * 60 * 60 * 1000,
    lastRunDate: new Date().toISOString().split('T')[0],
  };
  teams.set(acmeTeam.id, acmeTeam);

  const freeTeam: Team = {
    id: 'team-free',
    name: 'Free User',
    subdomain: 'freeuser',
    tier: 'free',
    ownerId: 'user-free',
    memberIds: ['user-free'],
    storageUsedBytes: 95 * 1024 * 1024, // 95MB used (near limit)
    storageLimitBytes: TIER_LIMITS.free.storageLimitBytes,
    runsToday: 8, // 2 runs left
    runLimitPerDay: 10,
    retentionDays: 7,
    createdAt: Date.now() - 14 * 24 * 60 * 60 * 1000,
    lastRunDate: new Date().toISOString().split('T')[0],
  };
  teams.set(freeTeam.id, freeTeam);

  const megaTeam: Team = {
    id: 'team-mega',
    name: 'MegaCorp',
    subdomain: 'megacorp',
    tier: 'enterprise',
    ownerId: 'user-enterprise',
    memberIds: ['user-enterprise'],
    storageUsedBytes: 45 * 1024 * 1024 * 1024, // 45GB
    storageLimitBytes: TIER_LIMITS.enterprise.storageLimitBytes,
    runsToday: 234,
    runLimitPerDay: Infinity,
    retentionDays: 365,
    createdAt: Date.now() - 180 * 24 * 60 * 60 * 1000,
    lastRunDate: new Date().toISOString().split('T')[0],
  };
  teams.set(megaTeam.id, megaTeam);

  // Users
  const seedUsers: User[] = [
    {
      id: 'user-free',
      email: 'free@barrhawk.test',
      password: 'free123',
      name: 'Free User',
      teamId: 'team-free',
      role: 'owner',
      tier: 'free',
      createdAt: Date.now() - 14 * 24 * 60 * 60 * 1000,
      lastLoginAt: Date.now() - 2 * 60 * 60 * 1000,
    },
    {
      id: 'user-pro',
      email: 'pro@barrhawk.test',
      password: 'pro123',
      name: 'Pro User',
      teamId: 'team-acme',
      role: 'owner',
      tier: 'pro',
      createdAt: Date.now() - 90 * 24 * 60 * 60 * 1000,
      lastLoginAt: Date.now() - 30 * 60 * 1000,
    },
    {
      id: 'user-enterprise',
      email: 'enterprise@barrhawk.test',
      password: 'enterprise123',
      name: 'Enterprise User',
      teamId: 'team-mega',
      role: 'owner',
      tier: 'enterprise',
      createdAt: Date.now() - 180 * 24 * 60 * 60 * 1000,
      lastLoginAt: Date.now() - 5 * 60 * 1000,
    },
    {
      id: 'user-teammate1',
      email: 'teammate1@barrhawk.test',
      password: 'team123',
      name: 'Team Mate 1',
      teamId: 'team-acme',
      role: 'member',
      tier: 'pro',
      createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000,
      lastLoginAt: Date.now() - 4 * 60 * 60 * 1000,
    },
    {
      id: 'user-teammate2',
      email: 'teammate2@barrhawk.test',
      password: 'team123',
      name: 'Team Mate 2',
      teamId: 'team-acme',
      role: 'member',
      tier: 'pro',
      createdAt: Date.now() - 45 * 24 * 60 * 60 * 1000,
      lastLoginAt: Date.now() - 24 * 60 * 60 * 1000,
    },
    {
      id: 'user-admin',
      email: 'admin@barrhawk.test',
      password: 'admin123',
      name: 'Admin User',
      teamId: 'team-acme',
      role: 'admin',
      tier: 'enterprise',
      createdAt: Date.now() - 365 * 24 * 60 * 60 * 1000,
      lastLoginAt: Date.now() - 10 * 60 * 1000,
      isAdmin: true,
    },
  ];
  seedUsers.forEach(u => users.set(u.id, u));

  // Projects for Acme
  const acmeProjects: Project[] = [
    {
      id: 'proj-frontend',
      teamId: 'team-acme',
      name: 'Frontend Tests',
      slug: 'frontend-tests',
      description: 'E2E tests for the main web application',
      repoUrl: 'https://github.com/acme/frontend',
      createdAt: Date.now() - 80 * 24 * 60 * 60 * 1000,
      lastRunAt: Date.now() - 2 * 60 * 60 * 1000,
      totalRuns: 156,
      totalArtifacts: 2450,
      storageUsedBytes: 5 * 1024 * 1024 * 1024,
    },
    {
      id: 'proj-api',
      teamId: 'team-acme',
      name: 'API Tests',
      slug: 'api-tests',
      description: 'Integration tests for REST API',
      repoUrl: 'https://github.com/acme/api',
      createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000,
      lastRunAt: Date.now() - 8 * 60 * 60 * 1000,
      totalRuns: 89,
      totalArtifacts: 420,
      storageUsedBytes: 3 * 1024 * 1024 * 1024,
    },
  ];
  acmeProjects.forEach(p => projects.set(p.id, p));

  // Project for Free user
  const freeProject: Project = {
    id: 'proj-myapp',
    teamId: 'team-free',
    name: 'My App',
    slug: 'my-app',
    description: 'Personal project tests',
    repoUrl: '',
    createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
    lastRunAt: Date.now() - 6 * 60 * 60 * 1000,
    totalRuns: 23,
    totalArtifacts: 87,
    storageUsedBytes: 95 * 1024 * 1024,
  };
  projects.set(freeProject.id, freeProject);

  // Some test runs
  const sampleRuns: TestRun[] = [
    {
      id: 'run-001',
      projectId: 'proj-frontend',
      teamId: 'team-acme',
      status: 'passed',
      branch: 'main',
      commit: 'abc123f',
      commitMessage: 'Fix login button alignment',
      triggeredBy: 'ci',
      startedAt: Date.now() - 2 * 60 * 60 * 1000,
      completedAt: Date.now() - 2 * 60 * 60 * 1000 + 180000,
      durationMs: 180000,
      summary: { totalSteps: 24, passedSteps: 24, failedSteps: 0, screenshots: 24, videos: 1 },
      tags: ['smoke', 'login'],
    },
    {
      id: 'run-002',
      projectId: 'proj-frontend',
      teamId: 'team-acme',
      status: 'failed',
      branch: 'feature/checkout',
      commit: 'def456a',
      commitMessage: 'Add checkout flow',
      triggeredBy: 'ci',
      startedAt: Date.now() - 5 * 60 * 60 * 1000,
      completedAt: Date.now() - 5 * 60 * 60 * 1000 + 95000,
      durationMs: 95000,
      summary: { totalSteps: 18, passedSteps: 15, failedSteps: 3, screenshots: 18, videos: 1 },
      tags: ['checkout', 'regression'],
    },
    {
      id: 'run-003',
      projectId: 'proj-myapp',
      teamId: 'team-free',
      status: 'passed',
      branch: 'main',
      commit: 'xyz789b',
      commitMessage: 'Update homepage',
      triggeredBy: 'manual',
      startedAt: Date.now() - 6 * 60 * 60 * 1000,
      completedAt: Date.now() - 6 * 60 * 60 * 1000 + 45000,
      durationMs: 45000,
      summary: { totalSteps: 8, passedSteps: 8, failedSteps: 0, screenshots: 8, videos: 0 },
      tags: ['homepage'],
    },
  ];
  sampleRuns.forEach(r => runs.set(r.id, r));

  // Sample artifacts for run-001
  for (let i = 1; i <= 5; i++) {
    const artifact: Artifact = {
      id: `artifact-run001-${i}`,
      runId: 'run-001',
      projectId: 'proj-frontend',
      teamId: 'team-acme',
      type: 'screenshot',
      name: `step_${String(i).padStart(3, '0')}_screenshot.png`,
      path: `team-acme/proj-frontend/run-001/screenshots/step_${String(i).padStart(3, '0')}.png`,
      sizeBytes: 150000 + Math.floor(Math.random() * 50000),
      mimeType: 'image/png',
      step: i,
      stepName: ['Navigate to login', 'Enter email', 'Enter password', 'Click submit', 'Verify dashboard'][i - 1],
      hasThumbnail: true,
      createdAt: Date.now() - 2 * 60 * 60 * 1000 + i * 5000,
    };
    artifacts.set(artifact.id, artifact);
  }

  // API key for pro user
  const apiKey: APIKey = {
    id: 'key-001',
    teamId: 'team-acme',
    userId: 'user-pro',
    name: 'CI Pipeline Key',
    key: 'bh_live_acme_1234567890abcdef',
    prefix: 'bh_live_acme',
    permissions: ['upload', 'read'],
    lastUsedAt: Date.now() - 30 * 60 * 1000,
    createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
  };
  apiKeys.set(apiKey.id, apiKey);

  console.log('Seeded data: %d users, %d teams, %d projects, %d runs, %d artifacts',
    users.size, teams.size, projects.size, runs.size, artifacts.size);
}

// =============================================================================
// Helpers
// =============================================================================

function getSession(req: IncomingMessage): User | null {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return null;

  // Flaky: random logout
  if (shouldBeFlaky('randomLogout')) {
    sessions.delete(match[1]);
    return null;
  }

  const userId = sessions.get(match[1]);
  if (!userId) return null;
  return users.get(userId) || null;
}

function requireAuth(req: IncomingMessage, res: ServerResponse): User | null {
  const user = getSession(req);
  if (!user) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return null;
  }
  return user;
}

function json(res: ServerResponse, data: any, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function redirect(res: ServerResponse, url: string) {
  res.writeHead(302, { Location: url });
  res.end();
}

async function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        if (req.headers['content-type']?.includes('application/json')) {
          resolve(JSON.parse(body || '{}'));
        } else if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
          resolve(Object.fromEntries(new URLSearchParams(body)));
        } else {
          resolve(body);
        }
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

async function parseMultipart(req: IncomingMessage): Promise<{ fields: Record<string, string>; files: Array<{ name: string; filename: string; data: Buffer; mimeType: string }> }> {
  return new Promise((resolve, reject) => {
    const boundary = req.headers['content-type']?.split('boundary=')[1];
    if (!boundary) return resolve({ fields: {}, files: [] });

    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const parts = buffer.toString('binary').split(`--${boundary}`);
      const fields: Record<string, string> = {};
      const files: Array<{ name: string; filename: string; data: Buffer; mimeType: string }> = [];

      for (const part of parts) {
        if (part.includes('Content-Disposition')) {
          const nameMatch = part.match(/name="([^"]+)"/);
          const filenameMatch = part.match(/filename="([^"]+)"/);
          const contentTypeMatch = part.match(/Content-Type:\s*([^\r\n]+)/);

          if (nameMatch) {
            const content = part.split('\r\n\r\n')[1]?.split('\r\n--')[0] || '';
            if (filenameMatch) {
              files.push({
                name: nameMatch[1],
                filename: filenameMatch[1],
                data: Buffer.from(content, 'binary'),
                mimeType: contentTypeMatch?.[1] || 'application/octet-stream',
              });
            } else {
              fields[nameMatch[1]] = content.trim();
            }
          }
        }
      }
      resolve({ fields, files });
    });
    req.on('error', reject);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatDuration(ms: number): string {
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  return Math.floor(ms / 60000) + 'm ' + Math.floor((ms % 60000) / 1000) + 's';
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' minutes ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' hours ago';
  return Math.floor(diff / 86400000) + ' days ago';
}

// =============================================================================
// HTML Templates
// =============================================================================

const styles = `
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; width: 100%; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%); color: #e4e4e9; min-height: 100vh; }
  a { color: #818cf8; text-decoration: none; }
  a:hover { text-decoration: underline; }

  .layout { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; width: 100%; }
  .sidebar { background: #0f0f14; border-right: 1px solid #1c1c26; padding: 20px 0; }
  .sidebar-header { padding: 0 20px 20px; border-bottom: 1px solid #1c1c26; margin-bottom: 20px; }
  .logo { font-weight: 700; font-size: 18px; color: #818cf8; }
  .nav-section { margin-bottom: 20px; }
  .nav-section-title { font-size: 10px; text-transform: uppercase; color: #5a5a6e; padding: 0 20px; margin-bottom: 8px; letter-spacing: 0.05em; }
  .nav-link { display: flex; align-items: center; gap: 10px; padding: 10px 20px; color: #a0a0b0; transition: all 0.15s; }
  .nav-link:hover { background: #1c1c26; color: #e4e4e9; text-decoration: none; }
  .nav-link.active { background: #1c1c26; color: #818cf8; border-left: 3px solid #818cf8; }

  .main { padding: 24px 32px; }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
  .page-title { font-size: 24px; font-weight: 600; }
  .breadcrumb { font-size: 13px; color: #5a5a6e; margin-bottom: 8px; }

  .card { background: #0f0f14; border: 1px solid #1c1c26; border-radius: 8px; padding: 20px; margin-bottom: 16px; }
  .card-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; }

  .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
  .stat-card { background: #0f0f14; border: 1px solid #1c1c26; border-radius: 8px; padding: 16px; }
  .stat-value { font-size: 28px; font-weight: 700; font-family: 'SF Mono', monospace; }
  .stat-value.green { color: #22c55e; }
  .stat-value.red { color: #ef4444; }
  .stat-value.yellow { color: #eab308; }
  .stat-label { font-size: 12px; color: #5a5a6e; margin-top: 4px; }

  .table { width: 100%; border-collapse: collapse; }
  .table th { text-align: left; padding: 12px; font-size: 11px; text-transform: uppercase; color: #5a5a6e; border-bottom: 1px solid #1c1c26; }
  .table td { padding: 12px; border-bottom: 1px solid #1c1c26; }
  .table tr:hover { background: #141419; }

  .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .badge.passed, .badge.green { background: rgba(34,197,94,0.15); color: #22c55e; }
  .badge.failed, .badge.red { background: rgba(239,68,68,0.15); color: #ef4444; }
  .badge.running, .badge.yellow { background: rgba(234,179,8,0.15); color: #eab308; }
  .badge.neutral { background: #1c1c26; color: #a0a0b0; }

  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; transition: opacity 0.15s; }
  .btn:hover { opacity: 0.85; text-decoration: none; }
  .btn-primary { background: #818cf8; color: white; }
  .btn-secondary { background: #1c1c26; color: #e4e4e9; }
  .btn-danger { background: #ef4444; color: white; }
  .btn-sm { padding: 5px 10px; font-size: 12px; }

  .form-group { margin-bottom: 16px; }
  .form-label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; color: #a0a0b0; }
  .form-input { width: 100%; padding: 10px 12px; background: #0a0a0f; border: 1px solid #1c1c26; border-radius: 6px; color: #e4e4e9; font-size: 14px; }
  .form-input:focus { outline: none; border-color: #818cf8; }

  .progress-bar { height: 8px; background: #1c1c26; border-radius: 4px; overflow: hidden; }
  .progress-fill { height: 100%; background: #818cf8; transition: width 0.3s; }
  .progress-fill.warning { background: #eab308; }
  .progress-fill.danger { background: #ef4444; }

  .empty-state { text-align: center; padding: 60px 20px; color: #5a5a6e; }
  .empty-state-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.5; }
  .empty-state-text { font-size: 16px; margin-bottom: 8px; }

  .auth-container { display: flex; justify-content: center; align-items: center; min-height: 100vh; width: 100%; background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%); }
  .auth-card { background: #0f0f14; border: 1px solid #1c1c26; border-radius: 12px; padding: 40px; width: 100%; max-width: 400px; }
  .auth-title { font-size: 24px; font-weight: 700; text-align: center; margin-bottom: 8px; }
  .auth-subtitle { text-align: center; color: #5a5a6e; margin-bottom: 24px; }

  .user-menu { display: flex; align-items: center; gap: 12px; }
  .user-avatar { width: 32px; height: 32px; border-radius: 50%; background: #818cf8; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; }
  .user-name { font-size: 14px; }
  .user-tier { font-size: 11px; color: #5a5a6e; }

  .storage-meter { margin-top: 12px; }
  .storage-text { font-size: 12px; color: #5a5a6e; margin-bottom: 4px; display: flex; justify-content: space-between; }

  .artifact-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
  .artifact-card { background: #141419; border: 1px solid #1c1c26; border-radius: 6px; overflow: hidden; cursor: pointer; transition: border-color 0.15s; }
  .artifact-card:hover { border-color: #818cf8; }
  .artifact-thumb { width: 100%; height: 120px; background: #0a0a0f; display: flex; align-items: center; justify-content: center; color: #5a5a6e; }
  .artifact-info { padding: 10px; }
  .artifact-name { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .artifact-meta { font-size: 10px; color: #5a5a6e; margin-top: 4px; }

  .dropzone { border: 2px dashed #1c1c26; border-radius: 8px; padding: 40px; text-align: center; cursor: pointer; transition: all 0.15s; }
  .dropzone:hover, .dropzone.drag-over { border-color: #818cf8; background: rgba(129,140,248,0.05); }
  .dropzone-icon { font-size: 36px; margin-bottom: 12px; opacity: 0.5; }
  .dropzone-text { color: #a0a0b0; }

  .toast { position: fixed; bottom: 20px; right: 20px; padding: 12px 20px; background: #0f0f14; border: 1px solid #1c1c26; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); z-index: 1000; }
  .toast.success { border-color: #22c55e; }
  .toast.error { border-color: #ef4444; }
</style>
`;

function layout(content: string, user: User | null, title = 'BarrHawk'): string {
  const team = user ? teams.get(user.teamId) : null;
  const storagePercent = team ? Math.round((team.storageUsedBytes / team.storageLimitBytes) * 100) : 0;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - FakeBarrHawk</title>
  ${styles}
</head>
<body>
  ${user ? `
  <div class="layout">
    <nav class="sidebar">
      <div class="sidebar-header">
        <div class="logo">FakeBarrHawk</div>
      </div>

      <div class="nav-section">
        <div class="nav-section-title">Main</div>
        <a href="/dashboard" class="nav-link">Dashboard</a>
        <a href="/projects" class="nav-link">Projects</a>
        <a href="/upload" class="nav-link">Upload</a>
      </div>

      <div class="nav-section">
        <div class="nav-section-title">Team</div>
        <a href="/team" class="nav-link">Members</a>
        <a href="/api-keys" class="nav-link">API Keys</a>
        <a href="/integrations" class="nav-link">Integrations</a>
      </div>

      <div class="nav-section">
        <div class="nav-section-title">Account</div>
        <a href="/settings" class="nav-link">Settings</a>
        <a href="/billing" class="nav-link">Billing</a>
      </div>

      ${user.isAdmin ? `
      <div class="nav-section">
        <div class="nav-section-title">Admin</div>
        <a href="/admin" class="nav-link">Dashboard</a>
        <a href="/admin/teams" class="nav-link">Teams</a>
        <a href="/admin/users" class="nav-link">Users</a>
      </div>
      ` : ''}

      <div class="nav-section" style="margin-top: auto; padding: 20px;">
        <div class="storage-meter">
          <div class="storage-text">
            <span>Storage</span>
            <span>${formatBytes(team?.storageUsedBytes || 0)} / ${formatBytes(team?.storageLimitBytes || 0)}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill ${storagePercent > 90 ? 'danger' : storagePercent > 70 ? 'warning' : ''}" style="width: ${storagePercent}%"></div>
          </div>
        </div>
      </div>
    </nav>

    <main class="main">
      <div class="header">
        <div></div>
        <div class="user-menu">
          <div>
            <div class="user-name">${user.name}</div>
            <div class="user-tier">${team?.name || 'Personal'} (${user.tier})</div>
          </div>
          <div class="user-avatar">${user.name.charAt(0).toUpperCase()}</div>
          <a href="/logout" class="btn btn-secondary btn-sm">Logout</a>
        </div>
      </div>
      ${content}
    </main>
  </div>
  ` : content}
</body>
</html>`;
}

function loginPage(error?: string): string {
  return layout(`
  <div class="auth-container">
    <div class="auth-card">
      <div class="auth-title">Welcome back</div>
      <div class="auth-subtitle">Sign in to FakeBarrHawk</div>
      ${error ? `<div style="color: #ef4444; text-align: center; margin-bottom: 16px;">${error}</div>` : ''}
      <form method="POST" action="/login">
        <div class="form-group">
          <label class="form-label">Email</label>
          <input type="email" name="email" class="form-input" placeholder="you@example.com" required />
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input type="password" name="password" class="form-input" placeholder="Enter your password" required />
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%; justify-content: center;">Sign In</button>
      </form>
      <p style="text-align: center; margin-top: 16px; color: #5a5a6e; font-size: 13px;">
        Don't have an account? <a href="/signup">Sign up</a>
      </p>
      <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #1c1c26;">
        <p style="color: #5a5a6e; font-size: 12px; margin-bottom: 8px;">Test accounts:</p>
        <ul style="color: #5a5a6e; font-size: 11px; list-style: none;">
          <li>free@barrhawk.test / free123</li>
          <li>pro@barrhawk.test / pro123</li>
          <li>enterprise@barrhawk.test / enterprise123</li>
          <li>admin@barrhawk.test / admin123</li>
        </ul>
      </div>
    </div>
  </div>
  `, null, 'Login');
}

function dashboardPage(user: User): string {
  const team = teams.get(user.teamId)!;
  const userProjects = Array.from(projects.values()).filter(p => p.teamId === team.id);
  const userRuns = Array.from(runs.values()).filter(r => r.teamId === team.id);
  const recentRuns = userRuns.sort((a, b) => b.startedAt - a.startedAt).slice(0, 5);

  const passedRuns = userRuns.filter(r => r.status === 'passed').length;
  const failedRuns = userRuns.filter(r => r.status === 'failed').length;
  const successRate = userRuns.length > 0 ? Math.round((passedRuns / userRuns.length) * 100) : 0;
  const storagePercent = Math.round((team.storageUsedBytes / team.storageLimitBytes) * 100);

  return layout(`
    <h1 class="page-title">Dashboard</h1>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${userProjects.length}</div>
        <div class="stat-label">Projects</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${userRuns.length}</div>
        <div class="stat-label">Total Runs</div>
      </div>
      <div class="stat-card">
        <div class="stat-value ${successRate >= 80 ? 'green' : successRate >= 50 ? 'yellow' : 'red'}">${successRate}%</div>
        <div class="stat-label">Success Rate</div>
      </div>
      <div class="stat-card">
        <div class="stat-value ${storagePercent > 90 ? 'red' : storagePercent > 70 ? 'yellow' : ''}">${storagePercent}%</div>
        <div class="stat-label">Storage Used</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Recent Test Runs</div>
      ${recentRuns.length > 0 ? `
      <table class="table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Project</th>
            <th>Branch</th>
            <th>Duration</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          ${recentRuns.map(run => {
            const project = projects.get(run.projectId);
            return `
            <tr>
              <td><span class="badge ${run.status}">${run.status.toUpperCase()}</span></td>
              <td><a href="/projects/${run.projectId}/runs/${run.id}">${project?.name || 'Unknown'}</a></td>
              <td>${run.branch}</td>
              <td>${formatDuration(run.durationMs)}</td>
              <td>${timeAgo(run.startedAt)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      ` : `
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <div class="empty-state-text">No test runs yet</div>
        <p style="color: #5a5a6e; font-size: 13px;">Upload your first test results to get started</p>
        <a href="/upload" class="btn btn-primary" style="margin-top: 16px;">Upload Results</a>
      </div>
      `}
    </div>
  `, user, 'Dashboard');
}

function projectsPage(user: User): string {
  const team = teams.get(user.teamId)!;
  const userProjects = Array.from(projects.values()).filter(p => p.teamId === team.id);

  return layout(`
    <div class="header">
      <h1 class="page-title">Projects</h1>
      <a href="/projects/new" class="btn btn-primary">New Project</a>
    </div>

    ${userProjects.length > 0 ? `
    <table class="table">
      <thead>
        <tr>
          <th>Project</th>
          <th>Last Run</th>
          <th>Total Runs</th>
          <th>Artifacts</th>
          <th>Storage</th>
        </tr>
      </thead>
      <tbody>
        ${userProjects.map(p => `
        <tr>
          <td>
            <a href="/projects/${p.id}" style="font-weight: 500;">${p.name}</a>
            <div style="font-size: 12px; color: #5a5a6e;">${p.slug}</div>
          </td>
          <td>${p.lastRunAt ? timeAgo(p.lastRunAt) : 'Never'}</td>
          <td>${p.totalRuns}</td>
          <td>${p.totalArtifacts}</td>
          <td>${formatBytes(p.storageUsedBytes)}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>
    ` : `
    <div class="empty-state">
      <div class="empty-state-icon">📁</div>
      <div class="empty-state-text">No projects yet</div>
      <p style="color: #5a5a6e; font-size: 13px;">Create a project to organize your test runs</p>
      <a href="/projects/new" class="btn btn-primary" style="margin-top: 16px;">Create Project</a>
    </div>
    `}
  `, user, 'Projects');
}

function projectDetailPage(user: User, project: Project): string {
  const projectRuns = Array.from(runs.values())
    .filter(r => r.projectId === project.id)
    .sort((a, b) => b.startedAt - a.startedAt);

  return layout(`
    <div class="breadcrumb">
      <a href="/projects">Projects</a> / ${project.name}
    </div>
    <div class="header">
      <h1 class="page-title">${project.name}</h1>
      <a href="/projects/${project.id}/settings" class="btn btn-secondary">Settings</a>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${project.totalRuns}</div>
        <div class="stat-label">Total Runs</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${project.totalArtifacts}</div>
        <div class="stat-label">Artifacts</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatBytes(project.storageUsedBytes)}</div>
        <div class="stat-label">Storage Used</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${project.lastRunAt ? timeAgo(project.lastRunAt) : 'Never'}</div>
        <div class="stat-label">Last Run</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Test Runs</div>
      ${projectRuns.length > 0 ? `
      <table class="table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Branch</th>
            <th>Commit</th>
            <th>Steps</th>
            <th>Duration</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          ${projectRuns.map(run => `
          <tr>
            <td><span class="badge ${run.status}">${run.status.toUpperCase()}</span></td>
            <td><a href="/projects/${project.id}/runs/${run.id}">${run.branch}</a></td>
            <td><code style="font-size: 12px; color: #5a5a6e;">${run.commit}</code></td>
            <td>${run.summary.passedSteps}/${run.summary.totalSteps}</td>
            <td>${formatDuration(run.durationMs)}</td>
            <td>${timeAgo(run.startedAt)}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
      ` : `
      <div class="empty-state">
        <div class="empty-state-icon">🧪</div>
        <div class="empty-state-text">No test runs yet</div>
        <a href="/upload" class="btn btn-primary" style="margin-top: 16px;">Upload Results</a>
      </div>
      `}
    </div>
  `, user, project.name);
}

function runDetailPage(user: User, project: Project, run: TestRun): string {
  const runArtifacts = Array.from(artifacts.values())
    .filter(a => a.runId === run.id)
    .sort((a, b) => a.step - b.step);

  return layout(`
    <div class="breadcrumb">
      <a href="/projects">Projects</a> / <a href="/projects/${project.id}">${project.name}</a> / Run ${run.id.substring(0, 8)}
    </div>
    <div class="header">
      <div>
        <h1 class="page-title" style="display: flex; align-items: center; gap: 12px;">
          <span class="badge ${run.status}" style="font-size: 14px;">${run.status.toUpperCase()}</span>
          ${run.branch}
        </h1>
        <div style="color: #5a5a6e; font-size: 13px; margin-top: 4px;">
          ${run.commitMessage} &middot; <code>${run.commit}</code>
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn btn-secondary" onclick="createShareLink('${run.id}')">Share</button>
        <button class="btn btn-danger btn-sm" onclick="deleteRun('${run.id}')">Delete</button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value ${run.summary.failedSteps === 0 ? 'green' : 'red'}">${run.summary.passedSteps}/${run.summary.totalSteps}</div>
        <div class="stat-label">Steps Passed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${run.summary.screenshots}</div>
        <div class="stat-label">Screenshots</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${run.summary.videos}</div>
        <div class="stat-label">Videos</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatDuration(run.durationMs)}</div>
        <div class="stat-label">Duration</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Artifacts (${runArtifacts.length})</div>
      ${runArtifacts.length > 0 ? `
      <div class="artifact-grid">
        ${runArtifacts.map(a => `
        <div class="artifact-card" onclick="viewArtifact('${a.id}')">
          <div class="artifact-thumb">
            ${a.type === 'screenshot' || a.type === 'diff' ? '🖼️' : a.type === 'video' ? '🎬' : a.type === 'log' ? '📄' : '📦'}
          </div>
          <div class="artifact-info">
            <div class="artifact-name">${a.name}</div>
            <div class="artifact-meta">${a.stepName} &middot; ${formatBytes(a.sizeBytes)}</div>
          </div>
        </div>
        `).join('')}
      </div>
      ` : `
      <div class="empty-state">
        <div class="empty-state-icon">📁</div>
        <div class="empty-state-text">No artifacts</div>
      </div>
      `}
    </div>

    <script>
    function viewArtifact(id) {
      window.open('/api/artifacts/' + id + '/download', '_blank');
    }
    function createShareLink(runId) {
      fetch('/api/runs/' + runId + '/share', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          const url = location.origin + '/gallery/' + data.id;
          prompt('Share link created:', url);
        });
    }
    function deleteRun(runId) {
      if (confirm('Delete this run and all artifacts?')) {
        fetch('/api/runs/' + runId, { method: 'DELETE' })
          .then(() => location.href = '/projects/${project.id}');
      }
    }
    </script>
  `, user, `Run - ${run.branch}`);
}

function uploadPage(user: User): string {
  const team = teams.get(user.teamId)!;
  const userProjects = Array.from(projects.values()).filter(p => p.teamId === team.id);

  return layout(`
    <h1 class="page-title">Upload Test Results</h1>

    <div class="card">
      <form method="POST" action="/api/upload" enctype="multipart/form-data" id="upload-form">
        <div class="form-group">
          <label class="form-label">Project</label>
          <select name="projectId" class="form-input" required>
            <option value="">Select a project...</option>
            ${userProjects.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Branch</label>
          <input type="text" name="branch" class="form-input" placeholder="main" value="main" />
        </div>

        <div class="form-group">
          <label class="form-label">Commit</label>
          <input type="text" name="commit" class="form-input" placeholder="abc123" />
        </div>

        <div class="form-group">
          <label class="form-label">Files</label>
          <div class="dropzone" id="dropzone" onclick="document.getElementById('files').click()">
            <div class="dropzone-icon">📁</div>
            <div class="dropzone-text">Drop files here or click to browse</div>
            <div style="font-size: 12px; color: #5a5a6e; margin-top: 8px;">
              Screenshots, videos, traces, logs, reports
            </div>
          </div>
          <input type="file" name="files" id="files" multiple hidden />
          <div id="file-list" style="margin-top: 12px;"></div>
        </div>

        <button type="submit" class="btn btn-primary">Upload</button>
      </form>
    </div>

    <div class="card">
      <div class="card-title">Upload via API</div>
      <p style="color: #5a5a6e; font-size: 13px; margin-bottom: 12px;">
        Use your API key to upload from CI/CD:
      </p>
      <pre style="background: #0a0a0f; padding: 12px; border-radius: 6px; font-size: 12px; overflow-x: auto;">
curl -X POST ${`http://localhost:${PORT}`}/api/runs/{runId}/upload \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -F "file=@screenshot.png" \\
  -F "type=screenshot" \\
  -F "step=1" \\
  -F "stepName=Navigate to login"
      </pre>
    </div>

    <script>
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('files');
    const fileList = document.getElementById('file-list');

    dropzone.addEventListener('dragover', e => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-over');
    });
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      fileInput.files = e.dataTransfer.files;
      updateFileList();
    });
    fileInput.addEventListener('change', updateFileList);

    function updateFileList() {
      fileList.innerHTML = Array.from(fileInput.files).map(f =>
        '<div style="padding: 8px; background: #141419; border-radius: 4px; margin-bottom: 4px;">' +
        f.name + ' <span style="color: #5a5a6e;">(' + (f.size / 1024).toFixed(1) + ' KB)</span></div>'
      ).join('');
    }
    </script>
  `, user, 'Upload');
}

function billingPage(user: User): string {
  const team = teams.get(user.teamId)!;
  const limits = TIER_LIMITS[team.tier];
  const storagePercent = Math.round((team.storageUsedBytes / team.storageLimitBytes) * 100);

  return layout(`
    <h1 class="page-title">Billing</h1>

    <div class="card">
      <div class="card-title">Current Plan</div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 24px; font-weight: 700; text-transform: capitalize;">${team.tier}</div>
          <div style="color: #5a5a6e;">
            ${team.tier === 'free' ? 'Free forever' : team.tier === 'pro' ? '$20/month' : '$99/month'}
          </div>
        </div>
        ${team.tier !== 'enterprise' ? `
        <a href="/billing/upgrade" class="btn btn-primary">Upgrade</a>
        ` : ''}
      </div>
    </div>

    <div class="card">
      <div class="card-title">Usage</div>
      <div style="margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span>Storage</span>
          <span>${formatBytes(team.storageUsedBytes)} / ${formatBytes(limits.storageLimitBytes)}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${storagePercent > 90 ? 'danger' : storagePercent > 70 ? 'warning' : ''}" style="width: ${storagePercent}%"></div>
        </div>
      </div>

      ${team.tier === 'free' ? `
      <div style="margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span>Daily Runs</span>
          <span>${team.runsToday} / ${limits.runsPerDay}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${team.runsToday >= 8 ? 'danger' : team.runsToday >= 5 ? 'warning' : ''}" style="width: ${(team.runsToday / limits.runsPerDay) * 100}%"></div>
        </div>
      </div>
      ` : ''}

      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 20px;">
        <div>
          <div style="color: #5a5a6e; font-size: 12px;">Retention</div>
          <div style="font-weight: 600;">${limits.retentionDays} days</div>
        </div>
        <div>
          <div style="color: #5a5a6e; font-size: 12px;">Max File Size</div>
          <div style="font-weight: 600;">${formatBytes(limits.maxFileSizeBytes)}</div>
        </div>
        <div>
          <div style="color: #5a5a6e; font-size: 12px;">Daily Runs</div>
          <div style="font-weight: 600;">${limits.runsPerDay === Infinity ? 'Unlimited' : limits.runsPerDay}</div>
        </div>
      </div>
    </div>

    ${team.tier !== 'free' ? `
    <div class="card">
      <div class="card-title">Payment Method</div>
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="background: #1c1c26; padding: 8px 12px; border-radius: 4px;">💳</div>
        <div>
          <div>Visa ending in 4242</div>
          <div style="color: #5a5a6e; font-size: 12px;">Expires 12/2027</div>
        </div>
      </div>
    </div>
    ` : ''}
  `, user, 'Billing');
}

function teamPage(user: User): string {
  const team = teams.get(user.teamId)!;
  const members = team.memberIds.map(id => users.get(id)).filter(Boolean) as User[];

  return layout(`
    <div class="header">
      <h1 class="page-title">${team.name}</h1>
      ${user.role === 'owner' || user.role === 'admin' ? `
      <button class="btn btn-primary" onclick="showInviteModal()">Invite Member</button>
      ` : ''}
    </div>

    <div class="card">
      <div class="card-title">Members (${members.length})</div>
      <table class="table">
        <thead>
          <tr>
            <th>Member</th>
            <th>Role</th>
            <th>Joined</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${members.map(m => `
          <tr>
            <td>
              <div style="display: flex; align-items: center; gap: 10px;">
                <div class="user-avatar" style="width: 28px; height: 28px; font-size: 12px;">${m.name.charAt(0)}</div>
                <div>
                  <div>${m.name}</div>
                  <div style="font-size: 12px; color: #5a5a6e;">${m.email}</div>
                </div>
              </div>
            </td>
            <td><span class="badge ${m.role === 'owner' ? 'green' : m.role === 'admin' ? 'yellow' : 'neutral'}">${m.role}</span></td>
            <td>${timeAgo(m.createdAt)}</td>
            <td>
              ${m.id !== user.id && (user.role === 'owner' || user.role === 'admin') ? `
              <button class="btn btn-secondary btn-sm" onclick="removeMember('${m.id}')">Remove</button>
              ` : ''}
            </td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <script>
    function showInviteModal() {
      const email = prompt('Enter email to invite:');
      if (email) {
        fetch('/api/team/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        }).then(() => location.reload());
      }
    }
    function removeMember(userId) {
      if (confirm('Remove this member?')) {
        fetch('/api/team/members/' + userId, { method: 'DELETE' })
          .then(() => location.reload());
      }
    }
    </script>
  `, user, 'Team');
}

function apiKeysPage(user: User): string {
  const team = teams.get(user.teamId)!;
  const teamKeys = Array.from(apiKeys.values()).filter(k => k.teamId === team.id);

  return layout(`
    <div class="header">
      <h1 class="page-title">API Keys</h1>
      <button class="btn btn-primary" onclick="createApiKey()">Create Key</button>
    </div>

    <div class="card">
      ${teamKeys.length > 0 ? `
      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Key</th>
            <th>Permissions</th>
            <th>Last Used</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${teamKeys.map(k => `
          <tr>
            <td>${k.name}</td>
            <td><code style="font-size: 12px; color: #5a5a6e;">${k.prefix}_...</code></td>
            <td>${k.permissions.map(p => `<span class="badge neutral">${p}</span>`).join(' ')}</td>
            <td>${k.lastUsedAt ? timeAgo(k.lastUsedAt) : 'Never'}</td>
            <td><button class="btn btn-danger btn-sm" onclick="revokeKey('${k.id}')">Revoke</button></td>
          </tr>
          `).join('')}
        </tbody>
      </table>
      ` : `
      <div class="empty-state">
        <div class="empty-state-icon">🔑</div>
        <div class="empty-state-text">No API keys yet</div>
        <p style="color: #5a5a6e; font-size: 13px;">Create a key to upload from CI/CD</p>
      </div>
      `}
    </div>

    <script>
    function createApiKey() {
      const name = prompt('Key name (e.g., "CI Pipeline"):');
      if (name) {
        fetch('/api/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        })
        .then(r => r.json())
        .then(data => {
          alert('API Key created! Save this - it won\\'t be shown again:\\n\\n' + data.key);
          location.reload();
        });
      }
    }
    function revokeKey(id) {
      if (confirm('Revoke this API key?')) {
        fetch('/api/keys/' + id, { method: 'DELETE' })
          .then(() => location.reload());
      }
    }
    </script>
  `, user, 'API Keys');
}

function galleryPage(shareLink: ShareLink): string {
  const run = runs.get(shareLink.runId);
  const project = run ? projects.get(run.projectId) : null;
  const runArtifacts = run ? Array.from(artifacts.values()).filter(a => a.runId === run.id) : [];

  if (!run || !project) {
    return `<!DOCTYPE html><html><body><h1>Run not found</h1></body></html>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Test Run - ${project.name}</title>
  ${styles}
</head>
<body style="padding: 40px;">
  <div style="max-width: 1000px; margin: 0 auto;">
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="font-size: 12px; color: #5a5a6e; margin-bottom: 8px;">Shared Test Run</div>
      <h1 style="font-size: 28px; margin-bottom: 8px;">${project.name}</h1>
      <div style="display: flex; justify-content: center; align-items: center; gap: 12px;">
        <span class="badge ${run.status}" style="font-size: 14px;">${run.status.toUpperCase()}</span>
        <span>${run.branch}</span>
        <span style="color: #5a5a6e;">&middot;</span>
        <span style="color: #5a5a6e;">${formatDuration(run.durationMs)}</span>
      </div>
    </div>

    <div class="stats-grid" style="grid-template-columns: repeat(4, 1fr);">
      <div class="stat-card">
        <div class="stat-value ${run.summary.failedSteps === 0 ? 'green' : 'red'}">${run.summary.passedSteps}/${run.summary.totalSteps}</div>
        <div class="stat-label">Steps</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${run.summary.screenshots}</div>
        <div class="stat-label">Screenshots</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${run.summary.videos}</div>
        <div class="stat-label">Videos</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatDuration(run.durationMs)}</div>
        <div class="stat-label">Duration</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Artifacts</div>
      <div class="artifact-grid">
        ${runArtifacts.map(a => `
        <a href="/public/artifacts/${shareLink.id}/${a.id}" target="_blank" class="artifact-card" style="text-decoration: none; color: inherit;">
          <div class="artifact-thumb">
            ${a.type === 'screenshot' ? '🖼️' : a.type === 'video' ? '🎬' : '📦'}
          </div>
          <div class="artifact-info">
            <div class="artifact-name">${a.name}</div>
            <div class="artifact-meta">${formatBytes(a.sizeBytes)}</div>
          </div>
        </a>
        `).join('')}
      </div>
    </div>

    <div style="text-align: center; margin-top: 32px; padding-top: 32px; border-top: 1px solid #1c1c26;">
      <div style="color: #5a5a6e; font-size: 13px;">
        Powered by <a href="/" style="color: #818cf8;">FakeBarrHawk</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// =============================================================================
// HTTP Server
// =============================================================================

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = parseUrl(req.url || '/', true);
  const path = url.pathname || '/';
  const method = req.method || 'GET';

  console.log(`${method} ${path}`);

  try {
    // Static routes
    if (method === 'GET') {
      if (path === '/' || path === '/login') {
        const user = getSession(req);
        if (user) return redirect(res, '/dashboard');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(loginPage());
      }

      if (path === '/dashboard') {
        const user = requireAuth(req, res);
        if (!user) return;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(dashboardPage(user));
      }

      if (path === '/projects') {
        const user = requireAuth(req, res);
        if (!user) return;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(projectsPage(user));
      }

      if (path.match(/^\/projects\/([^/]+)$/)) {
        const user = requireAuth(req, res);
        if (!user) return;
        const projectId = path.split('/')[2];
        const project = projects.get(projectId);
        if (!project || project.teamId !== user.teamId) {
          res.writeHead(404);
          return res.end('Project not found');
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(projectDetailPage(user, project));
      }

      if (path.match(/^\/projects\/([^/]+)\/runs\/([^/]+)$/)) {
        const user = requireAuth(req, res);
        if (!user) return;
        const [, , projectId, , runId] = path.split('/');
        const project = projects.get(projectId);
        const run = runs.get(runId);
        if (!project || !run || project.teamId !== user.teamId) {
          res.writeHead(404);
          return res.end('Not found');
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(runDetailPage(user, project, run));
      }

      if (path === '/upload') {
        const user = requireAuth(req, res);
        if (!user) return;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(uploadPage(user));
      }

      if (path === '/billing') {
        const user = requireAuth(req, res);
        if (!user) return;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(billingPage(user));
      }

      if (path === '/team') {
        const user = requireAuth(req, res);
        if (!user) return;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(teamPage(user));
      }

      if (path === '/api-keys') {
        const user = requireAuth(req, res);
        if (!user) return;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(apiKeysPage(user));
      }

      if (path === '/logout') {
        const cookie = req.headers.cookie || '';
        const match = cookie.match(/session=([^;]+)/);
        if (match) sessions.delete(match[1]);
        res.writeHead(302, {
          Location: '/login',
          'Set-Cookie': 'session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        });
        return res.end();
      }

      // Public gallery
      if (path.match(/^\/gallery\/([^/]+)$/)) {
        const shareId = path.split('/')[2];
        const share = shareLinks.get(shareId);
        if (!share) {
          res.writeHead(404);
          return res.end('Share link not found or expired');
        }
        if (share.expiresAt && share.expiresAt < Date.now()) {
          res.writeHead(403);
          return res.end('Share link expired');
        }
        share.viewCount++;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(galleryPage(share));
      }

      // API: Artifact download
      if (path.match(/^\/api\/artifacts\/([^/]+)\/download$/)) {
        const user = requireAuth(req, res);
        if (!user) return;
        const artifactId = path.split('/')[3];
        const artifact = artifacts.get(artifactId);
        if (!artifact || artifact.teamId !== user.teamId) {
          return json(res, { error: 'Not found' }, 404);
        }
        // Return dummy data for now
        res.writeHead(200, {
          'Content-Type': artifact.mimeType,
          'Content-Disposition': `attachment; filename="${artifact.name}"`,
        });
        return res.end(Buffer.from('FAKE_FILE_DATA_' + artifact.id));
      }

      // Public artifact download
      if (path.match(/^\/public\/artifacts\/([^/]+)\/([^/]+)$/)) {
        const [, , , shareId, artifactId] = path.split('/');
        const share = shareLinks.get(shareId);
        const artifact = artifacts.get(artifactId);
        if (!share || !artifact || artifact.runId !== share.runId) {
          res.writeHead(404);
          return res.end('Not found');
        }
        res.writeHead(200, {
          'Content-Type': artifact.mimeType,
          'Content-Disposition': `attachment; filename="${artifact.name}"`,
        });
        return res.end(Buffer.from('FAKE_FILE_DATA_' + artifact.id));
      }

      // API: List projects
      if (path === '/api/projects') {
        const user = requireAuth(req, res);
        if (!user) return;
        const userProjects = Array.from(projects.values()).filter(p => p.teamId === user.teamId);
        return json(res, { projects: userProjects });
      }

      // API: Get run
      if (path.match(/^\/api\/runs\/([^/]+)$/)) {
        const user = requireAuth(req, res);
        if (!user) return;
        const runId = path.split('/')[3];
        const run = runs.get(runId);
        if (!run || run.teamId !== user.teamId) {
          return json(res, { error: 'Not found' }, 404);
        }
        return json(res, { run });
      }

      // API: List artifacts for run
      if (path.match(/^\/api\/runs\/([^/]+)\/artifacts$/)) {
        const user = requireAuth(req, res);
        if (!user) return;
        const runId = path.split('/')[3];
        const runArtifacts = Array.from(artifacts.values()).filter(a => a.runId === runId && a.teamId === user.teamId);
        return json(res, { artifacts: runArtifacts });
      }

      // API: Team storage
      if (path === '/api/team/storage') {
        const user = requireAuth(req, res);
        if (!user) return;
        const team = teams.get(user.teamId)!;
        return json(res, {
          usedBytes: team.storageUsedBytes,
          limitBytes: team.storageLimitBytes,
          percentUsed: Math.round((team.storageUsedBytes / team.storageLimitBytes) * 100),
        });
      }

      // API: List API keys
      if (path === '/api/keys') {
        const user = requireAuth(req, res);
        if (!user) return;
        const teamKeys = Array.from(apiKeys.values())
          .filter(k => k.teamId === user.teamId)
          .map(k => ({ ...k, key: k.prefix + '_...' }));
        return json(res, { keys: teamKeys });
      }
    }

    // POST routes
    if (method === 'POST') {
      if (path === '/login') {
        const body = await parseBody(req);
        const user = Array.from(users.values()).find(u => u.email === body.email);
        if (!user || user.password !== body.password) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          return res.end(loginPage('Invalid email or password'));
        }
        const sessionId = randomUUID();
        sessions.set(sessionId, user.id);
        user.lastLoginAt = Date.now();
        res.writeHead(302, {
          Location: '/dashboard',
          'Set-Cookie': `session=${sessionId}; Path=/; HttpOnly`,
        });
        return res.end();
      }

      // API: Create project
      if (path === '/api/projects') {
        const user = requireAuth(req, res);
        if (!user) return;
        const body = await parseBody(req);
        const project: Project = {
          id: 'proj-' + randomUUID().substring(0, 8),
          teamId: user.teamId,
          name: body.name,
          slug: body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          description: body.description || '',
          repoUrl: body.repoUrl || '',
          createdAt: Date.now(),
          lastRunAt: 0,
          totalRuns: 0,
          totalArtifacts: 0,
          storageUsedBytes: 0,
        };
        projects.set(project.id, project);
        return json(res, { project }, 201);
      }

      // API: Create run
      if (path.match(/^\/api\/projects\/([^/]+)\/runs$/)) {
        const user = requireAuth(req, res);
        if (!user) return;
        const projectId = path.split('/')[3];
        const project = projects.get(projectId);
        if (!project || project.teamId !== user.teamId) {
          return json(res, { error: 'Project not found' }, 404);
        }

        const team = teams.get(user.teamId)!;
        const today = new Date().toISOString().split('T')[0];

        // Reset daily counter if new day
        if (team.lastRunDate !== today) {
          team.runsToday = 0;
          team.lastRunDate = today;
        }

        // Check run limit
        if (team.runsToday >= team.runLimitPerDay) {
          return json(res, { error: 'Daily run limit exceeded', code: 'RUN_LIMIT' }, 429);
        }

        const body = await parseBody(req);
        const run: TestRun = {
          id: 'run-' + randomUUID().substring(0, 8),
          projectId,
          teamId: user.teamId,
          status: 'running',
          branch: body.branch || 'main',
          commit: body.commit || randomUUID().substring(0, 7),
          commitMessage: body.commitMessage || 'Test run',
          triggeredBy: body.triggeredBy || 'api',
          startedAt: Date.now(),
          completedAt: 0,
          durationMs: 0,
          summary: { totalSteps: 0, passedSteps: 0, failedSteps: 0, screenshots: 0, videos: 0 },
          tags: body.tags || [],
        };
        runs.set(run.id, run);
        team.runsToday++;
        project.totalRuns++;
        project.lastRunAt = Date.now();
        return json(res, { run }, 201);
      }

      // API: Upload artifact
      if (path.match(/^\/api\/runs\/([^/]+)\/upload$/) || path === '/api/upload') {
        const user = requireAuth(req, res);
        if (!user) return;

        // Flaky: slow upload
        if (shouldBeFlaky('uploadSlowdown')) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        const team = teams.get(user.teamId)!;
        const { fields, files } = await parseMultipart(req);

        // Get or create run
        let runId = path.includes('/runs/') ? path.split('/')[3] : fields.runId;
        let run = runs.get(runId);
        let project: Project | undefined;

        if (!run && fields.projectId) {
          // Create a new run
          project = projects.get(fields.projectId);
          if (!project || project.teamId !== user.teamId) {
            return json(res, { error: 'Project not found' }, 404);
          }
          run = {
            id: 'run-' + randomUUID().substring(0, 8),
            projectId: project.id,
            teamId: user.teamId,
            status: 'running',
            branch: fields.branch || 'main',
            commit: fields.commit || randomUUID().substring(0, 7),
            commitMessage: 'Upload',
            triggeredBy: 'manual',
            startedAt: Date.now(),
            completedAt: 0,
            durationMs: 0,
            summary: { totalSteps: 0, passedSteps: 0, failedSteps: 0, screenshots: 0, videos: 0 },
            tags: [],
          };
          runs.set(run.id, run);
          project.totalRuns++;
        }

        if (!run) {
          return json(res, { error: 'Run not found and no projectId provided' }, 400);
        }

        project = project || projects.get(run.projectId);

        const uploadedArtifacts: Artifact[] = [];

        for (const file of files) {
          // Check quota
          if (team.storageUsedBytes + file.data.length > team.storageLimitBytes) {
            return json(res, {
              error: 'Storage quota exceeded',
              code: 'QUOTA_EXCEEDED',
              currentUsage: team.storageUsedBytes,
              limit: team.storageLimitBytes,
              requested: file.data.length,
            }, 402);
          }

          // Check file size
          const limits = TIER_LIMITS[team.tier];
          if (file.data.length > limits.maxFileSizeBytes) {
            return json(res, {
              error: 'File too large',
              code: 'FILE_TOO_LARGE',
              maxSize: limits.maxFileSizeBytes,
              fileSize: file.data.length,
            }, 413);
          }

          // Determine type from extension
          const ext = extname(file.filename).toLowerCase();
          let type: ArtifactType = 'screenshot';
          if (['.webm', '.mp4'].includes(ext)) type = 'video';
          else if (['.zip', '.trace'].includes(ext)) type = 'trace';
          else if (['.log', '.txt'].includes(ext)) type = 'log';
          else if (['.json', '.html'].includes(ext)) type = 'report';

          const artifact: Artifact = {
            id: 'artifact-' + randomUUID().substring(0, 8),
            runId: run.id,
            projectId: run.projectId,
            teamId: user.teamId,
            type: (fields.type as ArtifactType) || type,
            name: file.filename,
            path: `${user.teamId}/${run.projectId}/${run.id}/${file.filename}`,
            sizeBytes: file.data.length,
            mimeType: file.mimeType,
            step: parseInt(fields.step) || run.summary.totalSteps + 1,
            stepName: fields.stepName || file.filename,
            hasThumbnail: ['screenshot', 'video', 'diff'].includes(type),
            createdAt: Date.now(),
          };

          artifacts.set(artifact.id, artifact);
          uploadedArtifacts.push(artifact);

          // Update counters
          team.storageUsedBytes += file.data.length;
          if (project) project.storageUsedBytes += file.data.length;
          if (project) project.totalArtifacts++;
          run.summary.totalSteps = Math.max(run.summary.totalSteps, artifact.step);
          if (type === 'screenshot') run.summary.screenshots++;
          if (type === 'video') run.summary.videos++;

          // Save file to disk (for real file serving)
          const filePath = join(STORAGE_ROOT, 'uploads', artifact.path);
          mkdirSync(join(filePath, '..'), { recursive: true });
          writeFileSync(filePath, file.data);
        }

        // Complete run if all files uploaded
        if (fields.complete === 'true' || fields.complete === '1') {
          run.status = run.summary.failedSteps > 0 ? 'failed' : 'passed';
          run.completedAt = Date.now();
          run.durationMs = run.completedAt - run.startedAt;
          run.summary.passedSteps = run.summary.totalSteps - run.summary.failedSteps;
        }

        return json(res, { artifacts: uploadedArtifacts, run }, 201);
      }

      // API: Create share link
      if (path.match(/^\/api\/runs\/([^/]+)\/share$/)) {
        const user = requireAuth(req, res);
        if (!user) return;
        const runId = path.split('/')[3];
        const run = runs.get(runId);
        if (!run || run.teamId !== user.teamId) {
          return json(res, { error: 'Not found' }, 404);
        }
        const share: ShareLink = {
          id: randomUUID().substring(0, 12),
          runId,
          projectId: run.projectId,
          teamId: user.teamId,
          type: 'public',
          viewCount: 0,
          createdAt: Date.now(),
          createdBy: user.id,
        };
        shareLinks.set(share.id, share);
        return json(res, share, 201);
      }

      // API: Create API key
      if (path === '/api/keys') {
        const user = requireAuth(req, res);
        if (!user) return;
        const body = await parseBody(req);
        const key = 'bh_live_' + user.teamId.replace('team-', '') + '_' + randomUUID().replace(/-/g, '').substring(0, 24);
        const apiKey: APIKey = {
          id: 'key-' + randomUUID().substring(0, 8),
          teamId: user.teamId,
          userId: user.id,
          name: body.name || 'Unnamed Key',
          key,
          prefix: key.substring(0, 20),
          permissions: ['upload', 'read'],
          lastUsedAt: 0,
          createdAt: Date.now(),
        };
        apiKeys.set(apiKey.id, apiKey);
        return json(res, { ...apiKey, key }, 201);  // Return full key only on creation
      }

      // API: Complete run
      if (path.match(/^\/api\/runs\/([^/]+)\/complete$/)) {
        const user = requireAuth(req, res);
        if (!user) return;
        const runId = path.split('/')[3];
        const run = runs.get(runId);
        if (!run || run.teamId !== user.teamId) {
          return json(res, { error: 'Not found' }, 404);
        }
        const body = await parseBody(req);
        run.status = body.status || (run.summary.failedSteps > 0 ? 'failed' : 'passed');
        run.completedAt = Date.now();
        run.durationMs = run.completedAt - run.startedAt;
        run.summary.passedSteps = run.summary.totalSteps - (body.failedSteps || run.summary.failedSteps);
        run.summary.failedSteps = body.failedSteps || run.summary.failedSteps;
        return json(res, { run });
      }
    }

    // DELETE routes
    if (method === 'DELETE') {
      // API: Delete run
      if (path.match(/^\/api\/runs\/([^/]+)$/)) {
        const user = requireAuth(req, res);
        if (!user) return;
        const runId = path.split('/')[3];
        const run = runs.get(runId);
        if (!run || run.teamId !== user.teamId) {
          return json(res, { error: 'Not found' }, 404);
        }
        // Delete artifacts
        const team = teams.get(user.teamId)!;
        const project = projects.get(run.projectId);
        for (const [id, artifact] of artifacts) {
          if (artifact.runId === runId) {
            team.storageUsedBytes -= artifact.sizeBytes;
            if (project) {
              project.storageUsedBytes -= artifact.sizeBytes;
              project.totalArtifacts--;
            }
            artifacts.delete(id);
          }
        }
        runs.delete(runId);
        if (project) project.totalRuns--;
        return json(res, { deleted: true });
      }

      // API: Delete artifact
      if (path.match(/^\/api\/artifacts\/([^/]+)$/)) {
        const user = requireAuth(req, res);
        if (!user) return;
        const artifactId = path.split('/')[3];
        const artifact = artifacts.get(artifactId);
        if (!artifact || artifact.teamId !== user.teamId) {
          return json(res, { error: 'Not found' }, 404);
        }
        const team = teams.get(user.teamId)!;
        const project = projects.get(artifact.projectId);
        team.storageUsedBytes -= artifact.sizeBytes;
        if (project) {
          project.storageUsedBytes -= artifact.sizeBytes;
          project.totalArtifacts--;
        }
        artifacts.delete(artifactId);
        return json(res, { deleted: true });
      }

      // API: Revoke API key
      if (path.match(/^\/api\/keys\/([^/]+)$/)) {
        const user = requireAuth(req, res);
        if (!user) return;
        const keyId = path.split('/')[3];
        const key = apiKeys.get(keyId);
        if (!key || key.teamId !== user.teamId) {
          return json(res, { error: 'Not found' }, 404);
        }
        apiKeys.delete(keyId);
        return json(res, { deleted: true });
      }
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end('<h1>404 Not Found</h1>');
  } catch (err: any) {
    console.error('Error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

// =============================================================================
// Start
// =============================================================================

seedData();

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                      FakeBarrHawk                             ║
║                   Storage Panel Simulator                     ║
╠═══════════════════════════════════════════════════════════════╣
║  URL:        http://localhost:${PORT}                           ║
║  Storage:    ${STORAGE_ROOT}                         ║
║                                                               ║
║  Test Accounts:                                               ║
║    free@barrhawk.test / free123      (Free tier, 100MB)       ║
║    pro@barrhawk.test / pro123        (Pro tier, 10GB)         ║
║    enterprise@barrhawk.test / ent..  (Enterprise, 100GB)      ║
║    admin@barrhawk.test / admin123    (Admin access)           ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});
