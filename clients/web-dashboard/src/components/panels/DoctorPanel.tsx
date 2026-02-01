import { Plus, X } from 'lucide-react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { DoctorState, SwarmInfo } from '@/types'

interface DoctorPanelProps {
  doctor: DoctorState
  onSpawnIgor: () => void
  onCancelSwarm: (id: string) => void
}

export function DoctorPanel({ doctor, onSpawnIgor, onCancelSwarm }: DoctorPanelProps) {
  return (
    <Card glow="doctor" className="h-full flex flex-col">
      <CardHeader
        title="Doctor"
        icon={<span className="text-sm font-bold">D</span>}
        iconBg="bg-doctor"
        trailing={<StatusBadge status={doctor.status} />}
      />

      <CardContent className="flex-1 flex gap-4">
        {/* Left: Stats */}
        <div className="w-36 flex flex-col gap-3">
          <StatWithBar label="ACTIVE SWARMS" value={doctor.swarms.filter(s => s.status === 'running').length} color="bg-doctor" />
          <StatWithBar label="SQUADS" value={doctor.igorCount} color="bg-igor" />
          <StatWithBar label="QUEUE" value={doctor.queuedTasks} color="bg-warning" />

          <div className="mt-auto">
            <Button size="sm" className="w-full bg-doctor hover:bg-doctor/90" onClick={onSpawnIgor}>
              <Plus className="w-3 h-3" />
              Spawn Igor
            </Button>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px bg-border" />

        {/* Right: Swarms */}
        <div className="flex-1 flex flex-col min-w-0">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Active Swarms
          </span>

          {doctor.swarms.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              No active swarms
            </div>
          ) : (
            <div className="flex-1 overflow-auto space-y-2">
              {doctor.swarms.map((swarm) => (
                <SwarmCard key={swarm.id} swarm={swarm} onCancel={() => onCancelSwarm(swarm.id)} />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function StatWithBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <div className="flex items-center gap-2 mt-1">
        <div className={`w-1 h-5 rounded-sm ${color}`} />
        <span className="text-2xl font-bold">{value}</span>
      </div>
    </div>
  )
}

function SwarmCard({ swarm, onCancel }: { swarm: SwarmInfo; onCancel: () => void }) {
  const statusColor = {
    running: 'bg-ok',
    queued: 'bg-warning',
    paused: 'bg-idle',
    error: 'bg-error',
  }[swarm.status] || 'bg-idle'

  return (
    <div className="p-3 rounded-lg bg-card border border-border">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium truncate">{swarm.name}</span>
        <StatusBadge status={swarm.status} />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">{swarm.progress}%</span>
        <Progress value={swarm.progress} className="flex-1" indicatorClassName={statusColor} />
        <span className="text-[10px] text-muted-foreground">{swarm.igorCount} igors</span>
        <button
          onClick={onCancel}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
