export interface BridgeState {
  status: string
  uptime: number
  doctorStatus: string
  doctorRestarts: number
  messagesIn: number
  messagesOut: number
  bytesIn: number
  bytesOut: number
}

export interface SwarmInfo {
  id: string
  name: string
  progress: number
  igorCount: number
  status: string
}

export interface DoctorState {
  status: string
  uptime: number
  activeTasks: number
  queuedTasks: number
  igorCount: number
  maxIgors: number
  swarms: SwarmInfo[]
}

export interface IgorState {
  id: string
  status: string
  domain: string
  cpu: number
  memory: number
  currentTask: string | null
  tasksCompleted: number
}

export interface StreamEvent {
  id: string
  timestamp: Date
  source: string
  type: string
  message: string
  level: 'info' | 'warn' | 'error'
  duration?: number
}

export interface Command {
  id: string
  title: string
  icon: string
  hotkey?: string
  category: string
  action: () => void
}

export interface AppState {
  connected: boolean
  paused: boolean
  bridge: BridgeState
  doctor: DoctorState
  igors: Map<string, IgorState>
  stream: StreamEvent[]
  autoScroll: boolean
}
