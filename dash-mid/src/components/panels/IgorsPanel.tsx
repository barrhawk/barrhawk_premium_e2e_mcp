import { Plus, Globe, Plug, Bot, Radio, Cpu } from 'lucide-react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { ResourceBar } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { IgorState } from '@/types'

interface IgorsPanelProps {
  igors: Map<string, IgorState>
  onSpawnIgor: () => void
  onKillIgor: (id: string) => void
}

const domainConfig: Record<string, { icon: typeof Globe; color: string; bg: string }> = {
  browser: { icon: Globe, color: 'text-bridge', bg: 'bg-bridge/20' },
  api: { icon: Plug, color: 'text-doctor', bg: 'bg-doctor/20' },
  mcp: { icon: Bot, color: 'text-igor', bg: 'bg-igor/20' },
  network: { icon: Radio, color: 'text-warning', bg: 'bg-warning/20' },
  default: { icon: Cpu, color: 'text-idle', bg: 'bg-idle/20' },
}

export function IgorsPanel({ igors, onSpawnIgor, onKillIgor }: IgorsPanelProps) {
  const igorList = Array.from(igors.values())

  return (
    <Card glow="igor" className="h-full flex flex-col">
      <CardHeader
        title="Igors"
        icon={<span className="text-sm font-bold">I</span>}
        iconBg="bg-igor"
        trailing={
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{igorList.length} active</span>
            <Button size="icon" variant="ghost" className="h-6 w-6 bg-igor/20 hover:bg-igor/30" onClick={onSpawnIgor}>
              <Plus className="w-3 h-3 text-igor" />
            </Button>
          </div>
        }
      />

      <CardContent className="flex-1 overflow-hidden">
        {igorList.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <Bot className="w-8 h-8 mb-2" />
            <span className="text-sm">No Igors spawned</span>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 h-full">
            {igorList.map((igor) => (
              <IgorCard key={igor.id} igor={igor} onKill={() => onKillIgor(igor.id)} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function IgorCard({ igor, onKill }: { igor: IgorState; onKill: () => void }) {
  const config = domainConfig[igor.domain] || domainConfig.default
  const Icon = config.icon

  const statusColor = {
    busy: 'bg-warning',
    ready: 'bg-ok',
    error: 'bg-error',
  }[igor.status] || 'bg-idle'

  return (
    <div className="group w-44 shrink-0 p-3 rounded-lg bg-card border border-border hover:border-igor/50 transition-all">
      {/* Header */}
      <div className="flex items-start gap-2 mb-3">
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', config.bg)}>
          <Icon className={cn('w-4 h-4', config.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold truncate">{igor.id}</div>
          <div className={cn('text-[9px] uppercase font-medium', config.color)}>{igor.domain}</div>
        </div>
        <div className={cn('w-2 h-2 rounded-full', statusColor)} />
      </div>

      {/* Resources */}
      <div className="space-y-1.5 mb-3">
        <ResourceBar label="CPU" value={igor.cpu} color="bg-bridge" />
        <ResourceBar label="MEM" value={igor.memory} color="bg-doctor" />
      </div>

      {/* Current Task */}
      <div className="px-2 py-1 rounded bg-background text-[10px] text-muted-foreground truncate">
        {igor.currentTask || 'Idle'}
      </div>

      {/* Kill Button (on hover) */}
      <button
        onClick={onKill}
        className="w-full mt-2 py-1 rounded text-[10px] font-medium bg-error/10 text-error opacity-0 group-hover:opacity-100 transition-opacity hover:bg-error/20"
      >
        Kill
      </button>
    </div>
  )
}
