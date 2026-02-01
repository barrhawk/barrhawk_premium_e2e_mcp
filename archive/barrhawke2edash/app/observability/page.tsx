'use client'

import { useEffect, useState } from 'react'

interface TestRun {
  id: string
  name: string
  status: string
  duration: number
  origin: string
  startedAt: string
  completedAt: string
  steps: number
  screenshots: number
  assertions: number
  error?: string
  flakinessScore?: number
}

interface FlakyTest {
  testId: string
  testName: string
  flakinessScore: number
  totalRuns: number
  passedRuns: number
  failedRuns: number
  passRate: number
  avgDuration: number
  patterns: string[]
  recommendation: string
  lastRun: string
  trend: string
}

interface SessionReplay {
  id: string
  runId: string
  testName: string
  status: string
  frames: number
  duration: number
  createdAt: string
  hasVideo: boolean
  consoleErrors: number
  networkRequests: number
}

interface VisualDiff {
  id: string
  name: string
  baselineDate: string
  lastCompared: string
  status: string
  diffPercentage: number | null
  threshold: number
}

interface ConsoleLog {
  id: string
  timestamp: string
  level: string
  message: string
  runId: string
}

interface NetworkRequest {
  id: string
  timestamp: string
  method: string
  url: string
  status: number
  duration: number
  runId: string
}

interface Stats {
  testsToday: number
  testsThisWeek: number
  passRate: number
  avgDuration: number
  failedTests: number
  flakyTests: number
  totalScreenshots: number
  totalReplays: number
  byOrigin: Record<string, { count: number; passRate: number }>
}

interface ObservabilityData {
  stats: Stats
  testRuns: TestRun[]
  flakyTests: FlakyTest[]
  sessionReplays: SessionReplay[]
  visualDiffs: VisualDiff[]
  consoleLogs: ConsoleLog[]
  networkRequests: NetworkRequest[]
}

function formatDuration(ms: number): string {
  if (ms < 1000) return ms + 'ms'
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's'
  return (ms / 60000).toFixed(1) + 'm'
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago'
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago'
  return Math.floor(diff / 86400000) + 'd ago'
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    passed: 'bg-green-100 text-green-800 border-green-200',
    failed: 'bg-red-100 text-red-800 border-red-200',
    flaky: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    running: 'bg-blue-100 text-blue-800 border-blue-200',
    match: 'bg-green-100 text-green-800 border-green-200',
    diff_detected: 'bg-orange-100 text-orange-800 border-orange-200',
    no_baseline: 'bg-gray-100 text-gray-600 border-gray-200',
  }
  return (
    <span className={'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ' + (styles[status] || styles.running)}>
      {status.replace('_', ' ')}
    </span>
  )
}

function OriginBadge({ origin }: { origin: string }) {
  const styles: Record<string, string> = {
    ai_agent: 'bg-purple-100 text-purple-800',
    ci_cd: 'bg-blue-100 text-blue-800',
    human_dashboard: 'bg-teal-100 text-teal-800',
    scheduled: 'bg-gray-100 text-gray-800',
  }
  const labels: Record<string, string> = {
    ai_agent: 'AI',
    ci_cd: 'CI/CD',
    human_dashboard: 'Manual',
    scheduled: 'Scheduled',
  }
  return (
    <span className={'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ' + (styles[origin] || 'bg-gray-100 text-gray-800')}>
      {labels[origin] || origin}
    </span>
  )
}

function LogLevelBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    error: 'text-red-600',
    warn: 'text-yellow-600',
    info: 'text-blue-600',
    debug: 'text-gray-500',
  }
  return <span className={'font-mono text-xs ' + (styles[level] || 'text-gray-600')}>[{level.toUpperCase()}]</span>
}

function StatCard({ label, value, unit, icon, color }: { label: string; value: number | string; unit?: string; icon: string; color: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="mt-1 flex items-baseline gap-1">
            <span className={'text-2xl font-bold ' + color}>{value}</span>
            {unit && <span className="text-sm text-gray-500">{unit}</span>}
          </p>
        </div>
        <div className={'text-2xl ' + color}>{icon}</div>
      </div>
    </div>
  )
}

export default function ObservabilityPage() {
  const [data, setData] = useState<ObservabilityData | null>(null)
  const [activeTab, setActiveTab] = useState<'runs' | 'flaky' | 'replays' | 'visual' | 'logs'>('runs')
  const [selectedRun, setSelectedRun] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/observability')
      .then((res) => res.json())
      .then(setData)
      .catch(console.error)

    // Auto-refresh every 10 seconds
    const interval = setInterval(() => {
      fetch('/api/observability')
        .then((res) => res.json())
        .then(setData)
        .catch(console.error)
    }, 10000)

    return () => clearInterval(interval)
  }, [])

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="animate-pulse text-lg">Loading observability data...</div>
      </div>
    )
  }

  const filteredLogs = selectedRun ? data.consoleLogs.filter((l) => l.runId === selectedRun) : data.consoleLogs
  const filteredNetwork = selectedRun ? data.networkRequests.filter((r) => r.runId === selectedRun) : data.networkRequests

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold">BH</span>
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">BarrHawk Observability</h1>
                <p className="text-xs text-gray-400">Real-time test monitoring & analysis</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <span className="text-gray-400">Live</span>
              </div>
              <a href="/dashboard" className="text-sm text-gray-400 hover:text-white transition-colors">
                Dashboard
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
          <StatCard label="Tests Today" value={data.stats.testsToday} icon="+" color="text-white" />
          <StatCard label="Pass Rate" value={data.stats.passRate} unit="%" icon="%" color="text-green-400" />
          <StatCard label="Avg Duration" value={data.stats.avgDuration} unit="s" icon="~" color="text-blue-400" />
          <StatCard label="Failed" value={data.stats.failedTests} icon="!" color="text-red-400" />
          <StatCard label="Flaky" value={data.stats.flakyTests} icon="?" color="text-yellow-400" />
          <StatCard label="Screenshots" value={data.stats.totalScreenshots} icon="#" color="text-purple-400" />
          <StatCard label="Replays" value={data.stats.totalReplays} icon=">" color="text-cyan-400" />
          <StatCard label="This Week" value={data.stats.testsThisWeek} icon="W" color="text-gray-400" />
        </div>

        {/* Origin Breakdown */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 mb-6">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Tests by Origin</h3>
          <div className="flex flex-wrap gap-4">
            {Object.entries(data.stats.byOrigin).map(([origin, stats]) => (
              <div key={origin} className="flex items-center gap-3 bg-gray-700/50 rounded-lg px-3 py-2">
                <OriginBadge origin={origin} />
                <span className="text-white font-medium">{stats.count}</span>
                <span className="text-xs text-gray-400">({stats.passRate}% pass)</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-4 bg-gray-800 rounded-lg p-1 w-fit">
          {[
            { id: 'runs', label: 'Test Runs', count: data.testRuns.length },
            { id: 'flaky', label: 'Flaky Tests', count: data.flakyTests.length },
            { id: 'replays', label: 'Session Replays', count: data.sessionReplays.length },
            { id: 'visual', label: 'Visual Diffs', count: data.visualDiffs.length },
            { id: 'logs', label: 'Console & Network', count: data.consoleLogs.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={
                'px-4 py-2 rounded-md text-sm font-medium transition-colors ' +
                (activeTab === tab.id ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white')
              }
            >
              {tab.label}
              <span className="ml-2 text-xs opacity-60">({tab.count})</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          {/* Test Runs Tab */}
          {activeTab === 'runs' && (
            <div>
              <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                <h2 className="font-medium text-white">Recent Test Runs</h2>
                <span className="text-xs text-gray-400">Auto-refreshing every 10s</span>
              </div>
              <div className="divide-y divide-gray-700">
                {data.testRuns.map((run) => (
                  <div
                    key={run.id}
                    className={'px-4 py-3 hover:bg-gray-700/50 cursor-pointer transition-colors ' + (selectedRun === run.id ? 'bg-gray-700/50' : '')}
                    onClick={() => setSelectedRun(selectedRun === run.id ? null : run.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <StatusBadge status={run.status} />
                        <OriginBadge origin={run.origin} />
                        <span className="font-medium text-white">{run.name}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-400">
                        <span>{run.steps} steps</span>
                        <span>{run.screenshots} screenshots</span>
                        <span>{formatDuration(run.duration)}</span>
                        <span>{formatTimeAgo(run.startedAt)}</span>
                      </div>
                    </div>
                    {run.error && <p className="mt-2 text-sm text-red-400 font-mono">{run.error}</p>}
                    {run.flakinessScore && (
                      <p className="mt-2 text-sm text-yellow-400">Flakiness Score: {(run.flakinessScore * 100).toFixed(0)}%</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Flaky Tests Tab */}
          {activeTab === 'flaky' && (
            <div>
              <div className="px-4 py-3 border-b border-gray-700">
                <h2 className="font-medium text-white">Flaky Test Analysis</h2>
              </div>
              <div className="divide-y divide-gray-700">
                {data.flakyTests.map((test) => (
                  <div key={test.testId} className="px-4 py-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{test.testName}</span>
                          <span
                            className={
                              'text-xs px-2 py-0.5 rounded ' +
                              (test.recommendation === 'fix_urgently'
                                ? 'bg-red-900 text-red-300'
                                : test.recommendation === 'investigate'
                                ? 'bg-yellow-900 text-yellow-300'
                                : 'bg-gray-700 text-gray-300')
                            }
                          >
                            {test.recommendation.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-4 text-sm text-gray-400">
                          <span>
                            {test.passedRuns}/{test.totalRuns} passed ({(test.passRate * 100).toFixed(0)}%)
                          </span>
                          <span>Avg: {formatDuration(test.avgDuration)}</span>
                          <span>Last: {formatTimeAgo(test.lastRun)}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          {test.patterns.map((pattern) => (
                            <span key={pattern} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                              {pattern.replace('_', ' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={'text-2xl font-bold ' + (test.flakinessScore > 0.4 ? 'text-red-400' : test.flakinessScore > 0.2 ? 'text-yellow-400' : 'text-green-400')}>
                          {(test.flakinessScore * 100).toFixed(0)}%
                        </div>
                        <div className="text-xs text-gray-400">flakiness</div>
                        <div className={'text-xs mt-1 ' + (test.trend === 'degrading' ? 'text-red-400' : test.trend === 'improving' ? 'text-green-400' : 'text-gray-400')}>
                          {test.trend === 'degrading' ? 'Degrading' : test.trend === 'improving' ? 'Improving' : 'Stable'}
                        </div>
                      </div>
                    </div>
                    {/* Flakiness bar */}
                    <div className="mt-3 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={'h-full transition-all ' + (test.flakinessScore > 0.4 ? 'bg-red-500' : test.flakinessScore > 0.2 ? 'bg-yellow-500' : 'bg-green-500')}
                        style={{ width: (test.flakinessScore * 100) + '%' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Session Replays Tab */}
          {activeTab === 'replays' && (
            <div>
              <div className="px-4 py-3 border-b border-gray-700">
                <h2 className="font-medium text-white">Session Replays</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                {data.sessionReplays.map((replay) => (
                  <div key={replay.id} className="bg-gray-700/50 rounded-lg overflow-hidden hover:bg-gray-700 transition-colors cursor-pointer">
                    {/* Thumbnail placeholder */}
                    <div className="aspect-video bg-gray-900 flex items-center justify-center relative">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors">
                          <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                      <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded">
                        {replay.frames} frames
                      </span>
                    </div>
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-white text-sm">{replay.testName}</span>
                        <StatusBadge status={replay.status} />
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>{formatDuration(replay.duration)}</span>
                        <span>{replay.consoleErrors > 0 ? replay.consoleErrors + ' errors' : 'No errors'}</span>
                        <span>{formatTimeAgo(replay.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Visual Diffs Tab */}
          {activeTab === 'visual' && (
            <div>
              <div className="px-4 py-3 border-b border-gray-700">
                <h2 className="font-medium text-white">Visual Regression Testing</h2>
              </div>
              <div className="divide-y divide-gray-700">
                {data.visualDiffs.map((diff) => (
                  <div key={diff.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-700/50 cursor-pointer transition-colors">
                    <div className="flex items-center gap-4">
                      {/* Thumbnail placeholder */}
                      <div className="w-16 h-12 bg-gray-700 rounded flex items-center justify-center text-gray-500">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <span className="font-medium text-white">{diff.name}</span>
                        <div className="text-xs text-gray-400 mt-1">
                          Baseline: {formatTimeAgo(diff.baselineDate)} | Last check: {formatTimeAgo(diff.lastCompared)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {diff.diffPercentage !== null && (
                        <span className={'text-sm font-medium ' + (diff.diffPercentage > diff.threshold ? 'text-orange-400' : 'text-green-400')}>
                          {diff.diffPercentage.toFixed(2)}% diff
                        </span>
                      )}
                      <StatusBadge status={diff.status} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Console & Network Tab */}
          {activeTab === 'logs' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-700">
              {/* Console Logs */}
              <div>
                <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                  <h2 className="font-medium text-white">Console Logs</h2>
                  {selectedRun && (
                    <button onClick={() => setSelectedRun(null)} className="text-xs text-blue-400 hover:text-blue-300">
                      Clear filter
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {filteredLogs.map((log) => (
                    <div key={log.id} className="px-4 py-2 border-b border-gray-700/50 hover:bg-gray-700/30 text-sm font-mono">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 text-xs">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        <LogLevelBadge level={log.level} />
                      </div>
                      <p className={'mt-1 ' + (log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-yellow-400' : 'text-gray-300')}>
                        {log.message}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Network Requests */}
              <div>
                <div className="px-4 py-3 border-b border-gray-700">
                  <h2 className="font-medium text-white">Network Requests</h2>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {filteredNetwork.map((req) => (
                    <div key={req.id} className="px-4 py-2 border-b border-gray-700/50 hover:bg-gray-700/30 text-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={'font-medium ' + (req.method === 'GET' ? 'text-green-400' : req.method === 'POST' ? 'text-blue-400' : 'text-yellow-400')}>
                            {req.method}
                          </span>
                          <span className="text-gray-300 font-mono truncate max-w-xs">{req.url}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className={req.status >= 400 ? 'text-red-400' : 'text-green-400'}>{req.status}</span>
                          <span className="text-gray-500">{req.duration}ms</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
