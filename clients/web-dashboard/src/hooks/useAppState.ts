import { useState, useEffect, useCallback, useRef } from 'react'
import type { AppState, BridgeState, DoctorState, IgorState, StreamEvent } from '@/types'

const BRIDGE_WS_URL = 'ws://localhost:3334'

const initialBridge: BridgeState = {
  status: 'unknown',
  uptime: 0,
  doctorStatus: 'unknown',
  doctorRestarts: 0,
  messagesIn: 0,
  messagesOut: 0,
  bytesIn: 0,
  bytesOut: 0,
}

const initialDoctor: DoctorState = {
  status: 'unknown',
  uptime: 0,
  activeTasks: 0,
  queuedTasks: 0,
  igorCount: 0,
  maxIgors: 8,
  swarms: [],
}

export function useAppState() {
  const [connected, setConnected] = useState(false)
  const [paused, setPaused] = useState(false)
  const [bridge, setBridge] = useState<BridgeState>(initialBridge)
  const [doctor, setDoctor] = useState<DoctorState>(initialDoctor)
  const [igors, setIgors] = useState<Map<string, IgorState>>(new Map())
  const [stream, setStream] = useState<StreamEvent[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const wsRef = useRef<WebSocket | null>(null)

  const addStreamEvent = useCallback((event: Omit<StreamEvent, 'id'>) => {
    setStream(prev => {
      const newEvent = { ...event, id: crypto.randomUUID() }
      const updated = [...prev, newEvent].slice(-500)
      return updated
    })
  }, [])

  // WebSocket connection
  useEffect(() => {
    const connect = () => {
      try {
        const ws = new WebSocket(BRIDGE_WS_URL)
        wsRef.current = ws

        ws.onopen = () => {
          setConnected(true)
          addStreamEvent({
            timestamp: new Date(),
            source: 'Bridge',
            type: 'ws',
            message: 'Connected to Bridge',
            level: 'info',
          })
        }

        ws.onclose = () => {
          setConnected(false)
          setTimeout(connect, 3000)
        }

        ws.onerror = () => {
          setConnected(false)
        }

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            handleMessage(data)
          } catch (e) {
            console.error('Failed to parse message:', e)
          }
        }
      } catch (e) {
        console.error('WebSocket error:', e)
        setTimeout(connect, 3000)
      }
    }

    const handleMessage = (data: Record<string, unknown>) => {
      const type = data.type as string

      switch (type) {
        case 'bridge:status':
          setBridge(data.payload as BridgeState)
          break
        case 'doctor:status':
          setDoctor(data.payload as DoctorState)
          break
        case 'igor:status':
          setIgors(prev => {
            const updated = new Map(prev)
            const igor = data.payload as IgorState
            updated.set(igor.id, igor)
            return updated
          })
          break
        case 'igor:killed':
          setIgors(prev => {
            const updated = new Map(prev)
            updated.delete(data.igorId as string)
            return updated
          })
          break
        case 'stream:event':
          addStreamEvent(data.payload as Omit<StreamEvent, 'id'>)
          break
      }
    }

    connect()

    // Load demo data after timeout if not connected
    const demoTimeout = setTimeout(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        loadDemoData()
      }
    }, 2000)

    return () => {
      clearTimeout(demoTimeout)
      wsRef.current?.close()
    }
  }, [addStreamEvent])

  const loadDemoData = useCallback(() => {
    setBridge({
      status: 'running',
      uptime: 3847,
      doctorStatus: 'ok',
      doctorRestarts: 0,
      messagesIn: 12453,
      messagesOut: 11892,
      bytesIn: 4521789,
      bytesOut: 3892541,
    })

    setDoctor({
      status: 'running',
      uptime: 3845,
      activeTasks: 3,
      queuedTasks: 7,
      igorCount: 4,
      maxIgors: 8,
      swarms: [
        { id: 'swarm-1', name: 'E2E Smoke Tests', progress: 67, igorCount: 2, status: 'running' },
        { id: 'swarm-2', name: 'API Regression', progress: 23, igorCount: 1, status: 'running' },
      ],
    })

    const demoIgors = new Map<string, IgorState>([
      ['igor-001', { id: 'igor-001', status: 'busy', domain: 'browser', cpu: 45, memory: 62, currentTask: 'browser_click', tasksCompleted: 127 }],
      ['igor-002', { id: 'igor-002', status: 'busy', domain: 'browser', cpu: 38, memory: 54, currentTask: 'browser_screenshot', tasksCompleted: 89 }],
      ['igor-003', { id: 'igor-003', status: 'ready', domain: 'api', cpu: 12, memory: 28, currentTask: null, tasksCompleted: 234 }],
      ['igor-004', { id: 'igor-004', status: 'busy', domain: 'mcp', cpu: 67, memory: 71, currentTask: 'mcp_invoke', tasksCompleted: 56 }],
    ])
    setIgors(demoIgors)

    const demoEvents: Omit<StreamEvent, 'id'>[] = [
      { timestamp: new Date(Date.now() - 5000), source: 'igor-001', type: 'mcp', message: 'browser_navigate → https://app.example.com', level: 'info', duration: 234 },
      { timestamp: new Date(Date.now() - 4000), source: 'igor-001', type: 'mcp', message: 'browser_click → #login-button', level: 'info', duration: 45 },
      { timestamp: new Date(Date.now() - 3000), source: 'igor-002', type: 'mcp', message: 'browser_type → #email-input', level: 'info', duration: 89 },
      { timestamp: new Date(Date.now() - 2000), source: 'Doctor', type: 'system', message: 'Swarm "E2E Smoke Tests" progress: 67%', level: 'info' },
      { timestamp: new Date(Date.now() - 1000), source: 'igor-004', type: 'mcp', message: 'mcp_invoke → data_generate', level: 'info', duration: 12 },
      { timestamp: new Date(), source: 'Bridge', type: 'ws', message: 'Demo mode active - no live connection', level: 'warn' },
    ]

    demoEvents.forEach(event => addStreamEvent(event))
    setConnected(false)
  }, [addStreamEvent])

  const sendCommand = useCallback((command: string, payload?: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: command, payload }))
    }
  }, [])

  const pauseTraffic = useCallback(() => {
    setPaused(true)
    sendCommand('traffic:pause')
  }, [sendCommand])

  const resumeTraffic = useCallback(() => {
    setPaused(false)
    sendCommand('traffic:resume')
  }, [sendCommand])

  const restartDoctor = useCallback(() => {
    sendCommand('doctor:restart')
  }, [sendCommand])

  const spawnIgor = useCallback(() => {
    sendCommand('igor:spawn')
  }, [sendCommand])

  const killIgor = useCallback((id: string) => {
    sendCommand('igor:kill', { id })
    setIgors(prev => {
      const updated = new Map(prev)
      updated.delete(id)
      return updated
    })
  }, [sendCommand])

  const cancelSwarm = useCallback((id: string) => {
    sendCommand('swarm:cancel', { id })
  }, [sendCommand])

  const clearStream = useCallback(() => {
    setStream([])
  }, [])

  const toggleAutoScroll = useCallback(() => {
    setAutoScroll(prev => !prev)
  }, [])

  return {
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
  }
}
