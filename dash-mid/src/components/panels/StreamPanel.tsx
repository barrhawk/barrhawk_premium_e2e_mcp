import { useRef, useEffect } from 'react'
import { Trash2, ArrowDownToLine } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn, formatTime } from '@/lib/utils'
import type { StreamEvent } from '@/types'

interface StreamPanelProps {
  events: StreamEvent[]
  autoScroll: boolean
  onClear: () => void
  onToggleAutoScroll: () => void
}

const typeColors: Record<string, string> = {
  mcp: 'bg-igor/15 text-igor border-igor/30',
  http: 'bg-doctor/15 text-doctor border-doctor/30',
  ws: 'bg-bridge/15 text-bridge border-bridge/30',
  system: 'bg-warning/15 text-warning border-warning/30',
  error: 'bg-error/15 text-error border-error/30',
}

export function StreamPanel({ events, autoScroll, onClear, onToggleAutoScroll }: StreamPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events, autoScroll])

  return (
    <Card glow="stream" className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <div className="w-7 h-7 rounded-md flex items-center justify-center text-white bg-stream">
          <span className="text-sm font-bold">F</span>
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Frankenstream
        </span>

        <div className="ml-auto flex items-center gap-2">
          {/* Filter chips */}
          <FilterChip label="All" active />
          <FilterChip label="MCP" />
          <FilterChip label="Errors" color="text-error" />

          <div className="w-px h-4 bg-border mx-2" />

          {/* Auto-scroll toggle */}
          <Button
            variant={autoScroll ? 'default' : 'outline'}
            size="sm"
            className={cn('h-6 px-2 text-[10px]', autoScroll && 'bg-stream hover:bg-stream/90')}
            onClick={onToggleAutoScroll}
          >
            <ArrowDownToLine className="w-3 h-3" />
            Auto
          </Button>

          {/* Clear */}
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClear}>
            <Trash2 className="w-3 h-3" />
          </Button>

          {/* Count */}
          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded">
            {events.length} events
          </span>
        </div>
      </div>

      {/* Events */}
      <CardContent className="flex-1 overflow-hidden p-0">
        {events.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            No events yet
          </div>
        ) : (
          <div ref={scrollRef} className="h-full overflow-auto p-2">
            {events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function FilterChip({ label, active, color }: { label: string; active?: boolean; color?: string }) {
  return (
    <button
      className={cn(
        'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
        active ? 'bg-stream/20 text-stream border border-stream/30' : 'text-muted-foreground hover:text-foreground',
        color
      )}
    >
      {label}
    </button>
  )
}

function EventRow({ event }: { event: StreamEvent }) {
  const typeClass = typeColors[event.type] || typeColors.system

  return (
    <div
      className={cn(
        'flex items-start gap-2 px-3 py-2 rounded mb-0.5 transition-colors',
        event.level === 'error' && 'bg-error/5'
      )}
    >
      {/* Timestamp */}
      <span className="text-[10px] font-mono text-muted-foreground w-16 shrink-0">
        {formatTime(event.timestamp)}
      </span>

      {/* Type badge */}
      <span className={cn('text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded border w-14 text-center shrink-0', typeClass)}>
        {event.type}
      </span>

      {/* Source */}
      <span className="text-xs font-medium text-muted-foreground w-20 shrink-0 truncate">
        {event.source}
      </span>

      {/* Message */}
      <span
        className={cn(
          'flex-1 text-xs font-mono truncate',
          event.level === 'error' ? 'text-error' : 'text-foreground'
        )}
      >
        {event.message}
      </span>

      {/* Duration */}
      {event.duration && (
        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
          {event.duration}ms
        </span>
      )}
    </div>
  )
}
