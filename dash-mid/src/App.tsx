import { useState, useEffect, useCallback } from 'react'
import { Header } from '@/components/Header'
import { CommandPalette } from '@/components/CommandPalette'
import { BridgePanel } from '@/components/panels/BridgePanel'
import { DoctorPanel } from '@/components/panels/DoctorPanel'
import { IgorsPanel } from '@/components/panels/IgorsPanel'
import { StreamPanel } from '@/components/panels/StreamPanel'
import { useAppState } from '@/hooks/useAppState'

export default function App() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  const {
    connected,
    paused,
    bridge,
    doctor,
    igors,
    stream,
    autoScroll,
    pauseTraffic,
    resumeTraffic,
    restartDoctor,
    spawnIgor,
    killIgor,
    cancelSwarm,
    clearStream,
    toggleAutoScroll,
  } = useAppState()

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(true)
        return
      }

      // Don't handle other shortcuts if command palette is open
      if (commandPaletteOpen) return

      // P for pause/resume
      if (e.key === 'p' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        paused ? resumeTraffic() : pauseTraffic()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [commandPaletteOpen, paused, pauseTraffic, resumeTraffic])

  const handleShutdown = useCallback(() => {
    // Would send shutdown command
    console.log('Shutdown requested')
  }, [])

  return (
    <div className="h-screen flex flex-col bg-background">
      <Header
        connected={connected}
        igorCount={igors.size}
        paused={paused}
        onPause={pauseTraffic}
        onResume={resumeTraffic}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
      />

      <main className="flex-1 p-4 overflow-hidden">
        <div className="h-full flex flex-col gap-4">
          {/* Top row: Bridge + Doctor */}
          <div className="h-72 flex gap-4">
            <div className="w-80">
              <BridgePanel
                bridge={bridge}
                paused={paused}
                onRestartDoctor={restartDoctor}
                onPause={pauseTraffic}
                onResume={resumeTraffic}
              />
            </div>
            <div className="flex-1">
              <DoctorPanel
                doctor={doctor}
                onSpawnIgor={spawnIgor}
                onCancelSwarm={cancelSwarm}
              />
            </div>
          </div>

          {/* Middle: Igors */}
          <div className="h-44">
            <IgorsPanel
              igors={igors}
              onSpawnIgor={spawnIgor}
              onKillIgor={killIgor}
            />
          </div>

          {/* Bottom: Stream */}
          <div className="flex-1 min-h-0">
            <StreamPanel
              events={stream}
              autoScroll={autoScroll}
              onClear={clearStream}
              onToggleAutoScroll={toggleAutoScroll}
            />
          </div>
        </div>
      </main>

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        paused={paused}
        igors={igors}
        swarms={doctor.swarms}
        onRestartDoctor={restartDoctor}
        onPause={pauseTraffic}
        onResume={resumeTraffic}
        onSpawnIgor={spawnIgor}
        onKillIgor={killIgor}
        onCancelSwarm={cancelSwarm}
        onClearStream={clearStream}
        onShutdown={handleShutdown}
      />
    </div>
  )
}
