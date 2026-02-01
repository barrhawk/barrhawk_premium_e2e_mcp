import { Pause, Play, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface HeaderProps {
  connected: boolean
  igorCount: number
  paused: boolean
  onPause: () => void
  onResume: () => void
  onOpenCommandPalette: () => void
}

export function Header({
  connected,
  igorCount,
  paused,
  onPause,
  onResume,
  onOpenCommandPalette,
}: HeaderProps) {
  return (
    <header className="h-12 border-b border-border bg-card/50 backdrop-blur-sm flex items-center px-4 gap-4">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-bridge to-doctor flex items-center justify-center">
          <span className="text-white font-bold text-sm">B</span>
        </div>
        <span className="font-bold text-sm tracking-wider">BARRHAWK</span>
        <span className="px-1.5 py-0.5 text-[9px] font-bold tracking-wide bg-doctor/20 text-doctor rounded">
          MID
        </span>
      </div>

      <div className="flex-1" />

      {/* Status badges */}
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium',
            connected ? 'bg-ok/15 text-ok' : 'bg-error/15 text-error'
          )}
        >
          <div className={cn('w-2 h-2 rounded-full', connected ? 'bg-ok' : 'bg-error')} />
          {connected ? 'Connected' : 'Disconnected'}
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-igor/15 text-igor">
          {igorCount} Igor{igorCount !== 1 && 's'}
        </div>
      </div>

      <div className="w-px h-6 bg-border" />

      {/* Actions */}
      <Button variant="ghost" size="sm" onClick={paused ? onResume : onPause}>
        {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
        <span className="ml-1">{paused ? 'Resume' : 'Pause'}</span>
      </Button>

      <Button variant="ghost" size="sm" onClick={onOpenCommandPalette}>
        <Terminal className="w-4 h-4" />
        <span className="ml-1">⌘K</span>
      </Button>
    </header>
  )
}
