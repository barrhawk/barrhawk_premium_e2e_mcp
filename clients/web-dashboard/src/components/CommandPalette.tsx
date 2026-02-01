import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, RefreshCw, Pause, Play, Plus, Trash2, Power, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Command, IgorState, SwarmInfo } from '@/types'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  paused: boolean
  igors: Map<string, IgorState>
  swarms: SwarmInfo[]
  onRestartDoctor: () => void
  onPause: () => void
  onResume: () => void
  onSpawnIgor: () => void
  onKillIgor: (id: string) => void
  onCancelSwarm: (id: string) => void
  onClearStream: () => void
  onShutdown: () => void
}

export function CommandPalette({
  open,
  onClose,
  paused,
  igors,
  swarms,
  onRestartDoctor,
  onPause,
  onResume,
  onSpawnIgor,
  onKillIgor,
  onCancelSwarm,
  onClearStream,
  onShutdown,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const commands: Command[] = [
    {
      id: 'restart-doctor',
      title: 'Restart Doctor',
      icon: '🔄',
      hotkey: '⌘⇧R',
      category: 'bridge',
      action: () => { onRestartDoctor(); onClose() },
    },
    {
      id: 'pause',
      title: paused ? 'Resume Traffic' : 'Pause Traffic',
      icon: paused ? '▶' : '⏸',
      hotkey: 'P',
      category: 'bridge',
      action: () => { paused ? onResume() : onPause(); onClose() },
    },
    {
      id: 'spawn-igor',
      title: 'Spawn New Igor',
      icon: '➕',
      hotkey: '⌘N',
      category: 'igor',
      action: () => { onSpawnIgor(); onClose() },
    },
    {
      id: 'clear-stream',
      title: 'Clear Stream',
      icon: '🗑',
      hotkey: '⌘L',
      category: 'stream',
      action: () => { onClearStream(); onClose() },
    },
    {
      id: 'shutdown',
      title: 'Shutdown Bridge',
      icon: '⏹',
      hotkey: '⌘⇧Q',
      category: 'bridge',
      action: () => { onShutdown(); onClose() },
    },
    // Dynamic igor kill commands
    ...Array.from(igors.values()).map((igor) => ({
      id: `kill-${igor.id}`,
      title: `Kill ${igor.id}`,
      icon: '💀',
      category: 'igor',
      action: () => { onKillIgor(igor.id); onClose() },
    })),
    // Dynamic swarm cancel commands
    ...swarms.map((swarm) => ({
      id: `cancel-${swarm.id}`,
      title: `Cancel Swarm: ${swarm.name}`,
      icon: '⏹',
      category: 'swarm',
      action: () => { onCancelSwarm(swarm.id); onClose() },
    })),
  ]

  const filteredCommands = query
    ? commands.filter((c) => c.title.toLowerCase().includes(query.toLowerCase()))
    : commands

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      inputRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((i) => Math.max(i - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action()
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    },
    [filteredCommands, selectedIndex, onClose]
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-popover border border-border rounded-xl shadow-2xl overflow-hidden animate-fade-in">
        {/* Search */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="flex-1 border-0 bg-transparent focus-visible:ring-0 px-0"
          />
          <kbd className="px-2 py-1 text-[10px] bg-muted rounded text-muted-foreground">ESC</kbd>
        </div>

        {/* Commands */}
        <div className="max-h-80 overflow-auto">
          {filteredCommands.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No commands found
            </div>
          ) : (
            filteredCommands.map((command, index) => (
              <button
                key={command.id}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                  index === selectedIndex ? 'bg-accent border-l-2 border-l-bridge' : 'hover:bg-accent/50'
                )}
                onClick={command.action}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="text-base w-6 text-center">{command.icon}</span>
                <span className="flex-1 text-sm">{command.title}</span>
                {command.hotkey && (
                  <kbd className="px-2 py-1 text-[10px] bg-muted rounded text-muted-foreground">
                    {command.hotkey}
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
