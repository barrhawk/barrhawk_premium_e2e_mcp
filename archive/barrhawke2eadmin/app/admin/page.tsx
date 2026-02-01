'use client'

/**
 * NOTE: This is the SaaS Admin View (Mock).
 * This is NOT the local BarrHawk dashboard.
 * 
 * Purpose: This interface demonstrates what the BarrHawk SaaS platform super-admins see.
 * It is currently mock-data driven and serves as a product interface prototype.
 * 
 * For the local agent dashboard, see packages/dashboard-min.
 */

// Mock data - replace with real API calls
const mockCompanyStats = {
  mrr: 24750,
  arr: 297000,
  totalCustomers: 142,
  activeToday: 89,
  testsToday: 12847,
  newSignups: 8,
  churnedThisMonth: 2,
}

const mockRecentCustomers = [
  { id: '1', name: 'Acme Corp', email: 'admin@acme.com', plan: 'Pro', mrr: 299, status: 'active', signedUp: '2 hours ago' },
  { id: '2', name: 'TechStart', email: 'dev@techstart.io', plan: 'Starter', mrr: 49, status: 'trial', signedUp: '5 hours ago' },
  { id: '3', name: 'BigCo', email: 'qa@bigco.com', plan: 'Enterprise', mrr: 999, status: 'active', signedUp: '1 day ago' },
  { id: '4', name: 'DevShop', email: 'hello@devshop.dev', plan: 'Pro', mrr: 299, status: 'active', signedUp: '2 days ago' },
]

const mockSystemHealth = [
  { name: 'API', status: 'healthy', latency: 45 },
  { name: 'Database', status: 'healthy', latency: 12 },
  { name: 'Workers', status: 'healthy', latency: null },
  { name: 'Storage', status: 'healthy', latency: 89 },
]

function AdminStatCard({ label, value, subvalue, trend, color = 'purple' }: {
  label: string;
  value: string | number;
  subvalue?: string;
  trend?: { value: number; label: string };
  color?: 'purple' | 'green' | 'blue' | 'red'
}) {
  const colors = {
    purple: 'from-admin-600 to-admin-800',
    green: 'from-green-600 to-green-800',
    blue: 'from-blue-600 to-blue-800',
    red: 'from-red-600 to-red-800',
  }
  return (
    <div className={`bg-gradient-to-br ${colors[color]} rounded-xl p-6`}>
      <p className="text-sm font-medium text-white/70">{label}</p>
      <p className="mt-2 text-3xl font-bold text-white">{value}</p>
      {subvalue && <p className="mt-1 text-sm text-white/60">{subvalue}</p>}
      {trend && (
        <p className={`mt-2 text-sm ${trend.value >= 0 ? 'text-green-300' : 'text-red-300'}`}>
          {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
        </p>
      )}
    </div>
  )
}

function HealthIndicator({ status }: { status: 'healthy' | 'degraded' | 'down' }) {
  const styles = {
    healthy: 'bg-green-500',
    degraded: 'bg-yellow-500',
    down: 'bg-red-500',
  }
  return <span className={`inline-block w-2 h-2 rounded-full ${styles[status]}`}></span>
}

function PlanBadge({ plan }: { plan: string }) {
  const styles: Record<string, string> = {
    Free: 'bg-gray-700 text-gray-300',
    Starter: 'bg-blue-900 text-blue-300',
    Pro: 'bg-admin-900 text-admin-300',
    Enterprise: 'bg-yellow-900 text-yellow-300',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[plan] || styles.Free}`}>
      {plan}
    </span>
  )
}

export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-gray-900">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 w-64 bg-gray-800 border-r border-gray-700">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-700">
          <div className="w-8 h-8 bg-admin-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">BH</span>
          </div>
          <div>
            <span className="font-semibold text-white">BarrHawk</span>
            <span className="ml-2 text-xs bg-admin-600 text-white px-1.5 py-0.5 rounded">ADMIN</span>
          </div>
        </div>
        <nav className="px-4 py-6 space-y-1">
          <a href="#" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-white bg-gray-700 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Dashboard
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            Customers
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Revenue
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            Growth
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
            System
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            Support
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
            </svg>
            Features
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            Audit Log
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Costs
          </a>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="ml-64 p-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
            <p className="text-sm text-gray-400">Company overview and metrics</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">Last updated: just now</span>
            <button className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors">
              Refresh
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <AdminStatCard
            label="Monthly Recurring Revenue"
            value={`$${mockCompanyStats.mrr.toLocaleString()}`}
            subvalue={`ARR: $${mockCompanyStats.arr.toLocaleString()}`}
            trend={{ value: 8.2, label: 'vs last month' }}
            color="purple"
          />
          <AdminStatCard
            label="Total Customers"
            value={mockCompanyStats.totalCustomers}
            subvalue={`${mockCompanyStats.activeToday} active today`}
            trend={{ value: 12, label: 'vs last month' }}
            color="blue"
          />
          <AdminStatCard
            label="Tests Run Today"
            value={mockCompanyStats.testsToday.toLocaleString()}
            trend={{ value: 23, label: 'vs yesterday' }}
            color="green"
          />
          <AdminStatCard
            label="New Signups Today"
            value={mockCompanyStats.newSignups}
            subvalue={`${mockCompanyStats.churnedThisMonth} churned this month`}
            color="blue"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Customers */}
          <div className="lg:col-span-2 bg-gray-800 rounded-xl border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-white">Recent Customers</h2>
              <a href="#" className="text-sm text-admin-400 hover:text-admin-300">View all →</a>
            </div>
            <div className="divide-y divide-gray-700">
              {mockRecentCustomers.map((customer) => (
                <div key={customer.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-750">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center text-white font-medium">
                      {customer.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-white">{customer.name}</p>
                      <p className="text-sm text-gray-400">{customer.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <PlanBadge plan={customer.plan} />
                    <div className="text-right">
                      <p className="text-sm font-medium text-white">${customer.mrr}/mo</p>
                      <p className="text-xs text-gray-500">{customer.signedUp}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* System Health */}
          <div className="bg-gray-800 rounded-xl border border-gray-700">
            <div className="px-6 py-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-white">System Health</h2>
            </div>
            <div className="p-6 space-y-4">
              {mockSystemHealth.map((service) => (
                <div key={service.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <HealthIndicator status={service.status as 'healthy'} />
                    <span className="text-sm text-white">{service.name}</span>
                  </div>
                  {service.latency !== null && (
                    <span className="text-sm text-gray-400">{service.latency}ms</span>
                  )}
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-gray-700">
              <a href="#" className="text-sm text-admin-400 hover:text-admin-300">View system details →</a>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
