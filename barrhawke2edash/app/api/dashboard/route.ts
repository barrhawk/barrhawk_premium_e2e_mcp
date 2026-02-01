import { NextResponse } from 'next/server'
import { readdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

// Path to observability data (relative to project root)
const DATA_DIR = path.join(process.cwd(), '..', 'observability-data')

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

export async function GET() {
  const runsDir = path.join(DATA_DIR, 'runs')
  const testRuns: any[] = []

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
            suite: run.projectId || 'Test Run',
            status: run.status,
            duration: run.duration ? (run.duration / 1000) : 0,
            time: run.startedAt,
          })
        } catch { /* skip bad files */ }
      }
    } catch { /* dir might not exist */ }
  }

  // Sort by date (newest first)
  testRuns.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

  // Calculate stats
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  
  const runsToday = testRuns.filter(r => new Date(r.time) >= todayStart)
  const passedRuns = testRuns.filter(r => r.status === 'passed')
  const failedRuns = testRuns.filter(r => r.status === 'failed')

  const passRate = testRuns.length > 0 
    ? Math.round((passedRuns.length / testRuns.length) * 1000) / 10 
    : 100

  const avgDuration = testRuns.length > 0
    ? Math.round(testRuns.reduce((sum, r) => sum + (r.duration || 0), 0) / testRuns.length * 10) / 10
    : 0

  // Format times as relative
  const recentRuns = testRuns.slice(0, 10).map(run => {
    const diff = Date.now() - new Date(run.time).getTime()
    let timeAgo: string
    if (diff < 60000) timeAgo = 'just now'
    else if (diff < 3600000) timeAgo = Math.floor(diff / 60000) + ' min ago'
    else if (diff < 86400000) timeAgo = Math.floor(diff / 3600000) + ' hour ago'
    else timeAgo = Math.floor(diff / 86400000) + ' day ago'
    
    return {
      ...run,
      time: timeAgo,
    }
  })

  return NextResponse.json({
    stats: {
      testsToday: runsToday.length,
      passRate,
      avgDuration,
      failedTests: failedRuns.length,
    },
    recentRuns,
  })
}
