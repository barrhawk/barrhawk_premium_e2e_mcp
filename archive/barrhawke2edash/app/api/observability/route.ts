import { NextResponse } from 'next/server'
import { readdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

// Path to observability data (relative to project root)
const DATA_DIR = path.join(process.cwd(), '..', 'observability-data')
const FLAKY_DATA_DIR = path.join(process.cwd(), '..', 'flaky-data')
const REPLAY_DIR = path.join(process.cwd(), '..', 'replays')
const VISUAL_DIFF_DIR = path.join(process.cwd(), '..', 'visual-diffs')
const VISUAL_BASELINE_DIR = path.join(process.cwd(), '..', 'visual-baselines')

interface TestRun {
  runId: string
  projectId: string
  tenantId: string
  origin: string
  status: string
  startedAt: string
  completedAt?: string
  duration?: number
  summary?: {
    total: number
    passed: number
    failed: number
    skipped: number
  }
}

interface LogEntry {
  id: string
  runId: string
  timestamp: string
  type: string
  level?: string
  message: string
  data?: unknown
}

interface NetworkRecord {
  id: string
  runId: string
  timestamp: string
  method: string
  url: string
  status?: number
  duration?: number
}

async function loadRealData() {
  const runsDir = path.join(DATA_DIR, 'runs')
  const logsDir = path.join(DATA_DIR, 'logs')
  const networkDir = path.join(DATA_DIR, 'network')

  const testRuns: any[] = []
  const consoleLogs: any[] = []
  const networkRequests: any[] = []
  const flakyTests: any[] = []
  const sessionReplays: any[] = []
  const visualDiffs: any[] = []

  // Load runs
  if (existsSync(runsDir)) {
    try {
      const files = await readdir(runsDir)
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        try {
          const data = await readFile(path.join(runsDir, file), 'utf-8')
          const run = JSON.parse(data) as TestRun
          testRuns.push({
            id: run.runId,
            name: run.projectId || 'Test Run',
            status: run.status,
            duration: run.duration || 0,
            origin: run.origin || 'unknown',
            startedAt: run.startedAt,
            completedAt: run.completedAt,
            steps: run.summary?.total || 0,
            screenshots: 0,
            assertions: run.summary?.passed || 0,
            error: run.status === 'failed' ? 'Test failed' : undefined,
          })
        } catch { /* skip bad files */ }
      }
    } catch { /* dir might not exist */ }
  }

  // Load Flaky Data
  const historyPath = path.join(FLAKY_DATA_DIR, 'test-history.json')
  if (existsSync(historyPath)) {
    try {
      const data = await readFile(historyPath, 'utf-8')
      const parsed = JSON.parse(data)
      for (const [testId, results] of Object.entries(parsed.history || {})) {
        const history = results as any[]
        const passCount = history.filter(r => r.status === 'passed').length
        const total = history.length
        const passRate = total > 0 ? passCount / total : 0
        const flakinessScore = Math.max(0, 1 - Math.abs(passRate - 0.5) * 2)
        
        flakyTests.push({
          testId,
          testName: history[0]?.testName || testId,
          flakinessScore,
          totalRuns: total,
          passedRuns: passCount,
          failedRuns: total - passCount,
          passRate,
          avgDuration: history.reduce((a, b) => a + b.duration, 0) / total,
          patterns: [], // Simplified for now
          recommendation: flakinessScore > 0.1 ? 'investigate' : 'stable',
          lastRun: history[history.length - 1]?.timestamp,
          trend: 'stable'
        })
      }
    } catch (e) { console.error('Error loading flaky data:', e) }
  }

  // Load Replays
  if (existsSync(REPLAY_DIR)) {
    try {
      const folders = await readdir(REPLAY_DIR, { withFileTypes: true })
      for (const folder of folders) {
        if (!folder.isDirectory()) continue
        const sessionPath = path.join(REPLAY_DIR, folder.name, 'session.json')
        if (existsSync(sessionPath)) {
          const data = await readFile(sessionPath, 'utf-8')
          const session = JSON.parse(data)
          sessionReplays.push({
            id: session.runId,
            runId: session.runId,
            testName: session.metadata?.testName || 'Unknown Test',
            status: session.metadata?.status || 'passed',
            frames: session.frames?.length || 0,
            duration: session.frames?.length ? (new Date(session.frames[session.frames.length-1].timestamp).getTime() - new Date(session.frames[0].timestamp).getTime()) : 0,
            createdAt: session.startTime,
            hasVideo: true,
            consoleErrors: 0,
            networkRequests: 0
          })
        }
      }
    } catch (e) { console.error('Error loading replays:', e) }
  }

  // Load Visual Diffs
  if (existsSync(VISUAL_DIFF_DIR)) {
    try {
      const files = await readdir(VISUAL_DIFF_DIR)
      for (const file of files) {
        if (!file.endsWith('-diff.png')) continue
        const name = file.replace('-diff.png', '')
        visualDiffs.push({
          id: `diff_${name}`,
          name: name.replace(/_/g, ' '),
          baselineDate: new Date().toISOString(), // Mock
          lastCompared: new Date().toISOString(),
          status: 'diff_detected',
          diffPercentage: 5.0, // Mock for now
          threshold: 0.1
        })
      }
    } catch (e) { console.error('Error loading visual diffs:', e) }
  }

  // Load logs
  if (existsSync(logsDir)) {
    try {
      const files = await readdir(logsDir)
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        try {
          const data = await readFile(path.join(logsDir, file), 'utf-8')
          const logs = JSON.parse(data) as LogEntry[]
          for (const log of logs) {
            consoleLogs.push({
              id: log.id,
              timestamp: log.timestamp,
              level: log.level || 'info',
              message: log.message,
              runId: log.runId,
            })
          }
        } catch { /* skip bad files */ }
      }
    } catch { /* dir might not exist */ }
  }

  // Load network
  if (existsSync(networkDir)) {
    try {
      const files = await readdir(networkDir)
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        try {
          const data = await readFile(path.join(networkDir, file), 'utf-8')
          const records = JSON.parse(data) as NetworkRecord[]
          for (const req of records) {
            networkRequests.push({
              id: req.id,
              timestamp: req.timestamp,
              method: req.method,
              url: req.url,
              status: req.status || 0,
              duration: req.duration || 0,
              runId: req.runId,
            })
          }
        } catch { /* skip bad files */ }
      }
    } catch { /* dir might not exist */ }
  }

  // Sort runs by date (newest first)
  testRuns.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())

  // Calculate stats
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000)

  const runsToday = testRuns.filter(r => new Date(r.startedAt) >= todayStart)
  const runsThisWeek = testRuns.filter(r => new Date(r.startedAt) >= weekStart)
  const passedRuns = testRuns.filter(r => r.status === 'passed')
  const failedRuns = testRuns.filter(r => r.status === 'failed')

  const passRate = testRuns.length > 0 
    ? Math.round((passedRuns.length / testRuns.length) * 1000) / 10 
    : 100

  const avgDuration = testRuns.length > 0
    ? Math.round(testRuns.reduce((sum, r) => sum + (r.duration || 0), 0) / testRuns.length / 100) / 10
    : 0

  // Group by origin
  const byOrigin: Record<string, { count: number; passRate: number }> = {}
  for (const run of testRuns) {
    if (!byOrigin[run.origin]) {
      byOrigin[run.origin] = { count: 0, passRate: 0 }
    }
    byOrigin[run.origin].count++
  }
  for (const origin of Object.keys(byOrigin)) {
    const originRuns = testRuns.filter(r => r.origin === origin)
    const originPassed = originRuns.filter(r => r.status === 'passed')
    byOrigin[origin].passRate = originRuns.length > 0 
      ? Math.round((originPassed.length / originRuns.length) * 1000) / 10 
      : 100
  }

  return {
    stats: {
      testsToday: runsToday.length,
      testsThisWeek: runsThisWeek.length,
      passRate,
      avgDuration,
      failedTests: failedRuns.length,
      flakyTests: flakyTests.length,
      totalScreenshots: visualDiffs.length,
      totalReplays: sessionReplays.length,
      byOrigin,
    },
    testRuns: testRuns.slice(0, 50), // Limit to 50 most recent
    flakyTests,
    sessionReplays,
    visualDiffs,
    consoleLogs: consoleLogs.slice(-100), // Last 100 logs
    networkRequests: networkRequests.slice(-100), // Last 100 requests
  }
}

// Fallback fake data if no real data exists
function generateFakeData() {
  const now = Date.now()

  const testRuns = [
    {
      id: 'run_' + (now - 120000),
      name: 'Login Flow E2E',
      status: 'passed',
      duration: 8234,
      origin: 'ai_agent',
      startedAt: new Date(now - 120000).toISOString(),
      completedAt: new Date(now - 111766).toISOString(),
      steps: 12,
      screenshots: 8,
      assertions: 24,
    },
    {
      id: 'run_' + (now - 300000),
      name: 'Checkout Process',
      status: 'failed',
      duration: 45123,
      origin: 'ci_cd',
      startedAt: new Date(now - 300000).toISOString(),
      completedAt: new Date(now - 254877).toISOString(),
      steps: 28,
      screenshots: 15,
      assertions: 42,
      error: 'Element not found: #payment-submit-btn',
    },
    {
      id: 'run_' + (now - 600000),
      name: 'User Profile Update',
      status: 'passed',
      duration: 12456,
      origin: 'human_dashboard',
      startedAt: new Date(now - 600000).toISOString(),
      completedAt: new Date(now - 587544).toISOString(),
      steps: 8,
      screenshots: 5,
      assertions: 16,
    },
    {
      id: 'run_' + (now - 900000),
      name: 'Search Functionality',
      status: 'passed',
      duration: 18723,
      origin: 'scheduled',
      startedAt: new Date(now - 900000).toISOString(),
      completedAt: new Date(now - 881277).toISOString(),
      steps: 15,
      screenshots: 10,
      assertions: 30,
    },
    {
      id: 'run_' + (now - 1200000),
      name: 'API Health Check',
      status: 'passed',
      duration: 3102,
      origin: 'ai_agent',
      startedAt: new Date(now - 1200000).toISOString(),
      completedAt: new Date(now - 1196898).toISOString(),
      steps: 5,
      screenshots: 2,
      assertions: 10,
    },
    {
      id: 'run_' + (now - 1800000),
      name: 'Dashboard Load Test',
      status: 'flaky',
      duration: 22456,
      origin: 'ci_cd',
      startedAt: new Date(now - 1800000).toISOString(),
      completedAt: new Date(now - 1777544).toISOString(),
      steps: 18,
      screenshots: 12,
      assertions: 36,
      flakinessScore: 0.35,
    },
  ]

  // Flaky tests with analysis
  const flakyTests = [
    {
      testId: 'test_login_flow',
      testName: 'Login Flow E2E',
      flakinessScore: 0.42,
      totalRuns: 25,
      passedRuns: 15,
      failedRuns: 10,
      passRate: 0.6,
      avgDuration: 8500,
      patterns: ['time_of_day', 'load_related'],
      recommendation: 'investigate',
      lastRun: new Date(now - 120000).toISOString(),
      trend: 'improving',
    },
    {
      testId: 'test_checkout',
      testName: 'Checkout Process',
      flakinessScore: 0.28,
      totalRuns: 50,
      passedRuns: 36,
      failedRuns: 14,
      passRate: 0.72,
      avgDuration: 45000,
      patterns: ['network_dependent'],
      recommendation: 'monitor',
      lastRun: new Date(now - 300000).toISOString(),
      trend: 'stable',
    },
    {
      testId: 'test_dashboard_load',
      testName: 'Dashboard Load Test',
      flakinessScore: 0.55,
      totalRuns: 30,
      passedRuns: 14,
      failedRuns: 16,
      passRate: 0.47,
      avgDuration: 22000,
      patterns: ['race_condition', 'timing_sensitive'],
      recommendation: 'fix_urgently',
      lastRun: new Date(now - 1800000).toISOString(),
      trend: 'degrading',
    },
  ]

  // Session replays
  const sessionReplays = [
    {
      id: 'session_' + (now - 120000),
      runId: 'run_' + (now - 120000),
      testName: 'Login Flow E2E',
      status: 'passed',
      frames: 45,
      duration: 8234,
      createdAt: new Date(now - 120000).toISOString(),
      hasVideo: true,
      consoleErrors: 0,
      networkRequests: 12,
    },
    {
      id: 'session_' + (now - 300000),
      runId: 'run_' + (now - 300000),
      testName: 'Checkout Process',
      status: 'failed',
      frames: 78,
      duration: 45123,
      createdAt: new Date(now - 300000).toISOString(),
      hasVideo: true,
      consoleErrors: 3,
      networkRequests: 28,
    },
    {
      id: 'session_' + (now - 600000),
      runId: 'run_' + (now - 600000),
      testName: 'User Profile Update',
      status: 'passed',
      frames: 32,
      duration: 12456,
      createdAt: new Date(now - 600000).toISOString(),
      hasVideo: true,
      consoleErrors: 0,
      networkRequests: 8,
    },
  ]

  // Visual diffs
  const visualDiffs = [
    {
      id: 'diff_login_page',
      name: 'Login Page',
      baselineDate: new Date(now - 86400000 * 7).toISOString(),
      lastCompared: new Date(now - 3600000).toISOString(),
      status: 'match',
      diffPercentage: 0.02,
      threshold: 1.0,
    },
    {
      id: 'diff_dashboard',
      name: 'Dashboard Overview',
      baselineDate: new Date(now - 86400000 * 3).toISOString(),
      lastCompared: new Date(now - 7200000).toISOString(),
      status: 'diff_detected',
      diffPercentage: 4.8,
      threshold: 2.0,
    },
    {
      id: 'diff_checkout',
      name: 'Checkout Form',
      baselineDate: new Date(now - 86400000 * 5).toISOString(),
      lastCompared: new Date(now - 1800000).toISOString(),
      status: 'match',
      diffPercentage: 0.15,
      threshold: 1.0,
    },
    {
      id: 'diff_profile',
      name: 'User Profile',
      baselineDate: new Date(now - 86400000 * 2).toISOString(),
      lastCompared: new Date(now - 900000).toISOString(),
      status: 'no_baseline',
      diffPercentage: null,
      threshold: 1.0,
    },
  ]

  // Console logs from recent runs
  const consoleLogs = [
    { id: 'log_1', timestamp: new Date(now - 115000).toISOString(), level: 'info', message: 'User logged in successfully', runId: 'run_' + (now - 120000) },
    { id: 'log_2', timestamp: new Date(now - 114000).toISOString(), level: 'info', message: 'Navigating to dashboard', runId: 'run_' + (now - 120000) },
    { id: 'log_3', timestamp: new Date(now - 280000).toISOString(), level: 'error', message: 'Failed to load payment provider script', runId: 'run_' + (now - 300000) },
    { id: 'log_4', timestamp: new Date(now - 275000).toISOString(), level: 'warn', message: 'Retrying payment form submission', runId: 'run_' + (now - 300000) },
    { id: 'log_5', timestamp: new Date(now - 270000).toISOString(), level: 'error', message: 'Element not found: #payment-submit-btn', runId: 'run_' + (now - 300000) },
    { id: 'log_6', timestamp: new Date(now - 590000).toISOString(), level: 'info', message: 'Profile update form submitted', runId: 'run_' + (now - 600000) },
  ]

  // Network requests
  const networkRequests = [
    { id: 'req_1', timestamp: new Date(now - 118000).toISOString(), method: 'POST', url: '/api/auth/login', status: 200, duration: 245, runId: 'run_' + (now - 120000) },
    { id: 'req_2', timestamp: new Date(now - 116000).toISOString(), method: 'GET', url: '/api/user/profile', status: 200, duration: 123, runId: 'run_' + (now - 120000) },
    { id: 'req_3', timestamp: new Date(now - 285000).toISOString(), method: 'GET', url: '/api/cart', status: 200, duration: 189, runId: 'run_' + (now - 300000) },
    { id: 'req_4', timestamp: new Date(now - 278000).toISOString(), method: 'POST', url: '/api/checkout/init', status: 500, duration: 2345, runId: 'run_' + (now - 300000) },
    { id: 'req_5', timestamp: new Date(now - 592000).toISOString(), method: 'PUT', url: '/api/user/profile', status: 200, duration: 312, runId: 'run_' + (now - 600000) },
  ]

  // Aggregate stats
  const stats = {
    testsToday: 247,
    testsThisWeek: 1523,
    passRate: 87.4,
    avgDuration: 18.6,
    failedTests: 31,
    flakyTests: flakyTests.length,
    totalScreenshots: 1247,
    totalReplays: sessionReplays.length,
    byOrigin: {
      ai_agent: { count: 89, passRate: 92.1 },
      ci_cd: { count: 78, passRate: 84.6 },
      human_dashboard: { count: 45, passRate: 88.9 },
      scheduled: { count: 35, passRate: 85.7 },
    },
  }

  return {
    stats,
    testRuns,
    flakyTests,
    sessionReplays,
    visualDiffs,
    consoleLogs,
    networkRequests,
  }
}

export async function GET() {
  try {
    // Try loading real data first
    const realData = await loadRealData()
    
    // If we have real test runs, use real data
    if (realData.testRuns.length > 0) {
      return NextResponse.json(realData)
    }
  } catch (error) {
    console.error('Error loading real observability data:', error)
  }
  
  // Fall back to demo data if no real data exists
  const data = generateFakeData()
  return NextResponse.json(data)
}
