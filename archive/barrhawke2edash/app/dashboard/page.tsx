'use client'

import { useState, useEffect } from 'react'

interface Stats {
  testsToday: number
  passRate: number
  avgDuration: number
  failedTests: number
}

interface RecentRun {
  id: string
  suite: string
  status: string
  duration: number
  time: string
}

interface DashboardData {
  stats: Stats
  recentRuns: RecentRun[]
}

function StatCard({ label, value, unit, trend }: { label: string; value: number | string; unit?: string; trend?: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-bold text-gray-900">{value}</span>
        {unit && <span className="text-sm text-gray-500">{unit}</span>}
      </p>
      {trend !== undefined && (
        <p className={`mt-2 text-sm ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {trend >= 0 ? '+' : ''}{trend}% from yesterday
        </p>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: 'passed' | 'failed' | 'running' }) {
  const styles = {
    passed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    running: 'bg-blue-100 text-blue-800',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard')
      .then(res => res.json())
      .then(d => {
        setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetch('/api/dashboard')
        .then(res => res.json())
        .then(setData)
        .catch(() => {})
    }, 30000)

    return () => clearInterval(interval)
  }, [])

  const stats = data?.stats || { testsToday: 0, passRate: 100, avgDuration: 0, failedTests: 0 }
  const recentRuns = data?.recentRuns || []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">BH</span>
              </div>
              <span className="font-semibold text-gray-900">BarrHawk E2E</span>
            </div>
            <nav className="flex items-center gap-6">
              <a href="/dashboard" className="text-sm font-medium text-brand-600">Dashboard</a>
              <a href="/supervisor" className="text-sm font-medium text-gray-500 hover:text-gray-900">Supervisor</a>
              <a href="/observability" className="text-sm font-medium text-gray-500 hover:text-gray-900">Observability</a>
              {loading && <span className="text-xs text-gray-400">Loading...</span>}
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Overview of your testing activity</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard label="Tests Today" value={stats.testsToday} />
          <StatCard label="Pass Rate" value={stats.passRate} unit="%" />
          <StatCard label="Avg Duration" value={stats.avgDuration} unit="sec" />
          <StatCard label="Failed Tests" value={stats.failedTests} />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <button className="flex items-center justify-center gap-2 bg-brand-600 text-white rounded-xl px-6 py-4 hover:bg-brand-700 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Run All Tests
          </button>
          <button className="flex items-center justify-center gap-2 bg-white text-gray-700 rounded-xl px-6 py-4 border border-gray-300 hover:bg-gray-50 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Create Test Suite
          </button>
          <button className="flex items-center justify-center gap-2 bg-white text-gray-700 rounded-xl px-6 py-4 border border-gray-300 hover:bg-gray-50 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            View Analytics
          </button>
        </div>

        {/* Recent Runs */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Recent Test Runs</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {recentRuns.map((run: RecentRun) => (
              <div key={run.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-4">
                  <StatusBadge status={run.status as 'passed' | 'failed'} />
                  <div>
                    <p className="font-medium text-gray-900">{run.suite}</p>
                    <p className="text-sm text-gray-500">{run.time}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{run.duration}s</p>
                  <p className="text-sm text-gray-500">duration</p>
                </div>
              </div>
            ))}
          </div>
          <div className="px-6 py-4 border-t border-gray-200">
            <a href="#" className="text-sm font-medium text-brand-600 hover:text-brand-700">
              View all runs →
            </a>
          </div>
        </div>
      </main>
    </div>
  )
}
