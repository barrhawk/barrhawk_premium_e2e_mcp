'use client'

import { useState, useEffect, useRef } from 'react'

// Types
interface ServerHealth {
  role: string
  status: 'healthy' | 'degraded' | 'unhealthy' | 'offline'
  uptime: number
  load: number
  tasksProcessed: number
  tasksQueued: number
  tasksFailed: number
  lastError?: string
  memory: {
    used: number
    total: number
    percentage: number
  }
  // Igor-specific
  cacheHitRate?: number
  poolSize?: number
  activeExecutions?: number
  // Frankenstein-specific
  toolsLoaded?: string[]
  hotReloadEnabled?: boolean
  // Doctor-specific
  igors?: any[]
  totalCapacity?: number
  activeConnections?: number
}

interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  server: string
  message: string
}

type TabId = 'overview' | 'doctor' | 'igor' | 'frankenstein' | 'logs' | 'tasks'

const SERVERS = [
  { id: 'doctor', name: 'Doctor', port: 3000, color: '#6366f1', emoji: '🩺', role: 'Foolproof Orchestrator' },
  { id: 'igor', name: 'Igor', port: 3001, color: '#22c55e', emoji: '⚡', role: 'Performance Executor' },
  { id: 'frankenstein', name: 'Frankenstein', port: 3100, color: '#f59e0b', emoji: '🧪', role: 'Adaptive Sandbox' },
]

export default function SupervisorPage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [health, setHealth] = useState<Record<string, ServerHealth | null>>({})
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const logEndRef = useRef<HTMLDivElement>(null)

  // Fetch health from all servers
  const fetchHealth = async () => {
    const results: Record<string, ServerHealth | null> = {}

    for (const server of SERVERS) {
      try {
        const res = await fetch(`http://localhost:${server.port}/health`, {
          signal: AbortSignal.timeout(2000),
        })
        if (res.ok) {
          results[server.id] = await res.json()
        } else {
          results[server.id] = null
        }
      } catch {
        results[server.id] = null
      }
    }

    setHealth(results)
    setIsLoading(false)
  }

  // Server control actions
  const serverAction = async (serverId: string, action: 'reload' | 'shutdown') => {
    const server = SERVERS.find(s => s.id === serverId)
    if (!server) return

    try {
      await fetch(`http://localhost:${server.port}/${action}`, { method: 'POST' })
      addLog('info', serverId, `${action} requested`)
      setTimeout(fetchHealth, 1000)
    } catch (err) {
      addLog('error', serverId, `Failed to ${action}: ${err}`)
    }
  }

  const addLog = (level: LogEntry['level'], server: string, message: string) => {
    setLogs(prev => [...prev.slice(-199), {
      timestamp: new Date().toISOString(),
      level,
      server,
      message,
    }])
  }

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchHealth()

    if (autoRefresh) {
      const interval = setInterval(fetchHealth, 5000)
      return () => clearInterval(interval)
    }
  }, [autoRefresh])

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-500'
      case 'degraded': return 'bg-yellow-500'
      case 'unhealthy': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const formatUptime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0f0f15]">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold">
                FC
              </div>
              <div>
                <h1 className="text-xl font-bold">Frankencode Supervisor</h1>
                <p className="text-sm text-gray-400">Three-Tier Architecture Control</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <nav className="flex items-center gap-4 text-sm">
                <a href="/dashboard" className="text-gray-400 hover:text-white transition-colors">Dashboard</a>
                <span className="text-indigo-400 font-medium">Supervisor</span>
                <a href="/observability" className="text-gray-400 hover:text-white transition-colors">Observability</a>
              </nav>
              <div className="w-px h-6 bg-white/20" />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded border-gray-600 bg-gray-800"
                />
                Auto-refresh
              </label>
              <button
                onClick={fetchHealth}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors"
              >
                ↻ Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-white/10 bg-[#0f0f15]/50">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-1">
            {[
              { id: 'overview', label: 'Overview', icon: '📊' },
              { id: 'doctor', label: 'Doctor', icon: '🩺' },
              { id: 'igor', label: 'Igor', icon: '⚡' },
              { id: 'frankenstein', label: 'Frankenstein', icon: '🧪' },
              { id: 'logs', label: 'Logs', icon: '📜' },
              { id: 'tasks', label: 'Tasks', icon: '📋' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabId)}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-white'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-8">
                {/* Server Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {SERVERS.map((server) => {
                    const h = health[server.id]
                    const isOnline = h !== null

                    return (
                      <div
                        key={server.id}
                        className="bg-[#12121a] rounded-2xl border border-white/10 overflow-hidden hover:border-white/20 transition-colors"
                      >
                        <div className="p-6">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                                style={{ backgroundColor: server.color + '20' }}
                              >
                                {server.emoji}
                              </div>
                              <div>
                                <h3 className="font-semibold text-lg">{server.name}</h3>
                                <p className="text-sm text-gray-400">{server.role}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${isOnline ? getStatusColor(h?.status) : 'bg-gray-600'}`} />
                              <span className="text-sm text-gray-400">
                                {isOnline ? h?.status : 'offline'}
                              </span>
                            </div>
                          </div>

                          {isOnline && h ? (
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="bg-white/5 rounded-lg p-3">
                                  <p className="text-gray-400 text-xs">Uptime</p>
                                  <p className="font-medium">{formatUptime(h.uptime)}</p>
                                </div>
                                <div className="bg-white/5 rounded-lg p-3">
                                  <p className="text-gray-400 text-xs">Tasks</p>
                                  <p className="font-medium">{h.tasksProcessed}</p>
                                </div>
                                <div className="bg-white/5 rounded-lg p-3">
                                  <p className="text-gray-400 text-xs">Memory</p>
                                  <p className="font-medium">{formatBytes(h.memory.used)}</p>
                                </div>
                                <div className="bg-white/5 rounded-lg p-3">
                                  <p className="text-gray-400 text-xs">Load</p>
                                  <p className="font-medium">{(h.load * 100).toFixed(0)}%</p>
                                </div>
                              </div>

                              {/* Memory bar */}
                              <div>
                                <div className="flex justify-between text-xs text-gray-400 mb-1">
                                  <span>Memory Usage</span>
                                  <span>{h.memory.percentage.toFixed(1)}%</span>
                                </div>
                                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                      width: `${h.memory.percentage}%`,
                                      backgroundColor: h.memory.percentage > 80 ? '#ef4444' : server.color,
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-6 text-gray-500">
                              <p className="text-3xl mb-2">🔌</p>
                              <p>Server offline</p>
                              <p className="text-xs mt-1">Port {server.port}</p>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="border-t border-white/10 p-3 bg-white/5 flex gap-2">
                          <button
                            onClick={() => serverAction(server.id, 'reload')}
                            disabled={!isOnline}
                            className="flex-1 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            ↻ Reload
                          </button>
                          <button
                            onClick={() => serverAction(server.id, 'shutdown')}
                            disabled={!isOnline}
                            className="flex-1 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            ⏹ Stop
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Stats Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard
                    label="Total Tasks"
                    value={Object.values(health).reduce((sum, h) => sum + (h?.tasksProcessed || 0), 0)}
                    icon="📊"
                  />
                  <StatCard
                    label="Queued"
                    value={Object.values(health).reduce((sum, h) => sum + (h?.tasksQueued || 0), 0)}
                    icon="📥"
                  />
                  <StatCard
                    label="Failed"
                    value={Object.values(health).reduce((sum, h) => sum + (h?.tasksFailed || 0), 0)}
                    icon="❌"
                    danger={Object.values(health).reduce((sum, h) => sum + (h?.tasksFailed || 0), 0) > 0}
                  />
                  <StatCard
                    label="Cache Hit Rate"
                    value={`${((health.igor?.cacheHitRate || 0) * 100).toFixed(0)}%`}
                    icon="💾"
                  />
                </div>

                {/* Architecture Diagram */}
                <div className="bg-[#12121a] rounded-2xl border border-white/10 p-6">
                  <h3 className="font-semibold mb-4">Architecture Flow</h3>
                  <div className="flex items-center justify-center gap-4 py-8">
                    <div className="text-center">
                      <div className="w-16 h-16 rounded-xl bg-indigo-500/20 flex items-center justify-center text-2xl mb-2">
                        🤖
                      </div>
                      <p className="text-sm font-medium">AI Client</p>
                      <p className="text-xs text-gray-400">Claude / Gemini</p>
                    </div>
                    <div className="text-2xl text-gray-600">→</div>
                    <ServerBox server={SERVERS[0]} health={health.doctor} />
                    <div className="text-2xl text-gray-600">→</div>
                    <ServerBox server={SERVERS[1]} health={health.igor} />
                    <div className="text-2xl text-gray-600">→</div>
                    <ServerBox server={SERVERS[2]} health={health.frankenstein} />
                  </div>
                  <p className="text-center text-sm text-gray-400">
                    Fallback Chain: Doctor → Igor → Frankenstein
                  </p>
                </div>
              </div>
            )}

            {/* Individual Server Tabs */}
            {(activeTab === 'doctor' || activeTab === 'igor' || activeTab === 'frankenstein') && (
              <ServerDetail
                server={SERVERS.find(s => s.id === activeTab)!}
                health={health[activeTab]}
                onAction={serverAction}
              />
            )}

            {/* Logs Tab */}
            {activeTab === 'logs' && (
              <div className="bg-[#12121a] rounded-2xl border border-white/10 overflow-hidden">
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                  <h3 className="font-semibold">System Logs</h3>
                  <button
                    onClick={() => setLogs([])}
                    className="text-sm text-gray-400 hover:text-white"
                  >
                    Clear
                  </button>
                </div>
                <div className="h-[600px] overflow-y-auto font-mono text-sm">
                  {logs.length === 0 ? (
                    <div className="text-center py-20 text-gray-500">
                      <p className="text-3xl mb-2">📜</p>
                      <p>No logs yet</p>
                    </div>
                  ) : (
                    logs.map((log, i) => (
                      <div
                        key={i}
                        className="px-4 py-2 border-b border-white/5 hover:bg-white/5 flex gap-4"
                      >
                        <span className="text-gray-500 w-20 shrink-0">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span className={`w-12 shrink-0 font-medium ${
                          log.level === 'error' ? 'text-red-400' :
                          log.level === 'warn' ? 'text-yellow-400' :
                          log.level === 'info' ? 'text-blue-400' :
                          'text-gray-400'
                        }`}>
                          {log.level.toUpperCase()}
                        </span>
                        <span className="text-indigo-400 w-24 shrink-0">[{log.server}]</span>
                        <span className="text-gray-300">{log.message}</span>
                      </div>
                    ))
                  )}
                  <div ref={logEndRef} />
                </div>
              </div>
            )}

            {/* Tasks Tab */}
            {activeTab === 'tasks' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Task Queue */}
                  <div className="bg-[#12121a] rounded-2xl border border-white/10 p-6">
                    <h3 className="font-semibold mb-4">Task Queue</h3>
                    <div className="space-y-2">
                      {['critical', 'high', 'normal', 'low'].map((priority) => (
                        <div key={priority} className="flex items-center justify-between py-2">
                          <span className="capitalize text-gray-400">{priority}</span>
                          <span className="font-mono">0</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recent Tasks */}
                  <div className="bg-[#12121a] rounded-2xl border border-white/10 p-6">
                    <h3 className="font-semibold mb-4">Recent Tasks</h3>
                    <div className="text-center py-8 text-gray-500">
                      <p>No recent tasks</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

// Components
function StatCard({ label, value, icon, danger }: { label: string; value: string | number; icon: string; danger?: boolean }) {
  return (
    <div className="bg-[#12121a] rounded-xl border border-white/10 p-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className="text-sm text-gray-400">{label}</p>
          <p className={`text-xl font-bold ${danger ? 'text-red-400' : ''}`}>{value}</p>
        </div>
      </div>
    </div>
  )
}

function ServerBox({ server, health }: { server: typeof SERVERS[0]; health: ServerHealth | null }) {
  const isOnline = health !== null
  return (
    <div className="text-center">
      <div
        className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl mb-2 relative"
        style={{ backgroundColor: server.color + '20' }}
      >
        {server.emoji}
        <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-[#12121a] ${
          isOnline ? 'bg-green-500' : 'bg-gray-600'
        }`} />
      </div>
      <p className="text-sm font-medium">{server.name}</p>
      <p className="text-xs text-gray-400">:{server.port}</p>
    </div>
  )
}

function ServerDetail({ server, health, onAction }: {
  server: typeof SERVERS[0]
  health: ServerHealth | null
  onAction: (id: string, action: 'reload' | 'shutdown') => void
}) {
  const isOnline = health !== null

  if (!isOnline) {
    return (
      <div className="text-center py-20">
        <div
          className="w-24 h-24 rounded-2xl mx-auto flex items-center justify-center text-5xl mb-4"
          style={{ backgroundColor: server.color + '20' }}
        >
          {server.emoji}
        </div>
        <h2 className="text-2xl font-bold mb-2">{server.name}</h2>
        <p className="text-gray-400 mb-4">{server.role}</p>
        <p className="text-red-400">Server is offline</p>
        <p className="text-sm text-gray-500 mt-2">Expected at port {server.port}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
            style={{ backgroundColor: server.color + '20' }}
          >
            {server.emoji}
          </div>
          <div>
            <h2 className="text-2xl font-bold">{server.name}</h2>
            <p className="text-gray-400">{server.role}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            health.status === 'healthy' ? 'bg-green-500/20 text-green-400' :
            health.status === 'degraded' ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-red-500/20 text-red-400'
          }`}>
            {health.status}
          </div>
          <button
            onClick={() => onAction(server.id, 'reload')}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors"
          >
            ↻ Reload
          </button>
          <button
            onClick={() => onAction(server.id, 'shutdown')}
            className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm font-medium transition-colors"
          >
            ⏹ Shutdown
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Uptime" value={formatUptime(health.uptime)} icon="⏱" />
        <StatCard label="Tasks Processed" value={health.tasksProcessed} icon="✅" />
        <StatCard label="Tasks Queued" value={health.tasksQueued} icon="📥" />
        <StatCard label="Tasks Failed" value={health.tasksFailed} icon="❌" danger={health.tasksFailed > 0} />
      </div>

      {/* Server-specific info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Memory */}
        <div className="bg-[#12121a] rounded-2xl border border-white/10 p-6">
          <h3 className="font-semibold mb-4">Memory Usage</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Heap Used</span>
                <span>{formatBytes(health.memory.used)} / {formatBytes(health.memory.total)}</span>
              </div>
              <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${health.memory.percentage}%`,
                    backgroundColor: health.memory.percentage > 80 ? '#ef4444' : server.color,
                  }}
                />
              </div>
            </div>
            <div className="text-center text-3xl font-bold" style={{ color: server.color }}>
              {health.memory.percentage.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Server-specific panel */}
        {server.id === 'igor' && (
          <div className="bg-[#12121a] rounded-2xl border border-white/10 p-6">
            <h3 className="font-semibold mb-4">Performance Metrics</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Cache Hit Rate</span>
                <span className="font-medium">{((health.cacheHitRate || 0) * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Pool Size</span>
                <span className="font-medium">{health.poolSize || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Active Executions</span>
                <span className="font-medium">{health.activeExecutions || 0}</span>
              </div>
            </div>
          </div>
        )}

        {server.id === 'frankenstein' && (
          <div className="bg-[#12121a] rounded-2xl border border-white/10 p-6">
            <h3 className="font-semibold mb-4">Tools & Config</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Tools Loaded</span>
                <span className="font-medium">{health.toolsLoaded?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Hot Reload</span>
                <span className={`font-medium ${health.hotReloadEnabled ? 'text-green-400' : 'text-gray-500'}`}>
                  {health.hotReloadEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
            {health.toolsLoaded && health.toolsLoaded.length > 0 && (
              <div className="mt-4">
                <p className="text-sm text-gray-400 mb-2">Loaded Tools:</p>
                <div className="flex flex-wrap gap-1">
                  {health.toolsLoaded.slice(0, 10).map((tool) => (
                    <span key={tool} className="px-2 py-1 bg-white/10 rounded text-xs">
                      {tool}
                    </span>
                  ))}
                  {health.toolsLoaded.length > 10 && (
                    <span className="px-2 py-1 text-gray-400 text-xs">
                      +{health.toolsLoaded.length - 10} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {server.id === 'doctor' && (
          <div className="bg-[#12121a] rounded-2xl border border-white/10 p-6">
            <h3 className="font-semibold mb-4">Orchestration</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Total Capacity</span>
                <span className="font-medium">{health.totalCapacity || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Active Connections</span>
                <span className="font-medium">{health.activeConnections || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Igor Instances</span>
                <span className="font-medium">{health.igors?.length || 0}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Last Error */}
      {health.lastError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <h4 className="text-red-400 font-medium mb-1">Last Error</h4>
          <p className="text-sm text-gray-300 font-mono">{health.lastError}</p>
        </div>
      )}
    </div>
  )
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
