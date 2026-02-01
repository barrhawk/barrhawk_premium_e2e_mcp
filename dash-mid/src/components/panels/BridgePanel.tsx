import { Activity, RefreshCw, Pause, Play } from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatUptime } from '@/lib/utils'
import type { BridgeState } from '@/types'

interface BridgePanelProps {
  bridge: BridgeState
  paused: boolean
  onRestartDoctor: () => void
  onPause: () => void
  onResume: () => void
}

// Fake sparkline data
const sparklineData = [
  { v: 30 }, { v: 50 }, { v: 70 }, { v: 60 }, { v: 80 },
  { v: 90 }, { v: 70 }, { v: 80 }, { v: 60 }, { v: 50 },
  { v: 70 }, { v: 80 },
]

export function BridgePanel({ bridge, paused, onRestartDoctor, onPause, onResume }: BridgePanelProps) {
  return (
    <Card glow="bridge" className="h-full flex flex-col">
      <CardHeader
        title="Bridge"
        icon={<span className="text-sm font-bold">B</span>}
        iconBg="bg-bridge"
        trailing={<StatusBadge status={bridge.status} />}
      />

      <CardContent className="flex-1 flex flex-col gap-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <Stat label="STATUS" value={bridge.status} />
          <Stat label="UPTIME" value={formatUptime(bridge.uptime)} />
          <Stat label="DOCTOR" value={bridge.doctorStatus} />
          <Stat label="RESTARTS" value={bridge.doctorRestarts.toString()} />
        </div>

        {/* Throughput */}
        <div>
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Throughput
          </span>
          <div className="flex items-baseline gap-6 mt-2">
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] text-muted-foreground">IN</span>
              <span className="text-xl font-bold">{bridge.messagesIn.toLocaleString()}</span>
              <span className="text-[10px] text-muted-foreground">msg</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] text-muted-foreground">OUT</span>
              <span className="text-xl font-bold">{bridge.messagesOut.toLocaleString()}</span>
              <span className="text-[10px] text-muted-foreground">msg</span>
            </div>
          </div>
        </div>

        {/* Sparkline */}
        <div className="h-8 bg-card rounded">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparklineData}>
              <defs>
                <linearGradient id="bridgeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(217 91% 60%)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke="hsl(217 91% 60%)"
                strokeWidth={2}
                fill="url(#bridgeGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Actions */}
        <div className="mt-auto flex gap-2">
          <Button variant="destructive" size="sm" onClick={onRestartDoctor}>
            <RefreshCw className="w-3 h-3" />
            Restart Doctor
          </Button>
          <Button variant="outline" size="sm" onClick={paused ? onResume : onPause}>
            {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            {paused ? 'Resume' : 'Pause'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  )
}
