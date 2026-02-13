# Dashboard Specification

**Component:** Dashboard
**Role:** Observability UI & Control Center
**Tech:** Hono (server) + Vanilla JS + WebSocket (live updates)

---

## Purpose

Dashboard is the **eyes and hands** of the operator. It provides real-time visibility into all BarrHawk components and allows live control without touching the terminal.

Dashboard sees everything:
- Bridge status and throughput
- Doctor's task routing decisions
- Every Igor's state and resource usage
- Full event stream with filtering
- Frankenmode: the assembled view

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         DASHBOARD                                │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                     Hono Server (:3333)                     │ │
│  │                                                             │ │
│  │   GET /              → Main dashboard HTML                  │ │
│  │   GET /assets/*      → JS, CSS                              │ │
│  │   GET /api/snapshot  → Current state (REST fallback)        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                         serves                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                     Browser Client                          │ │
│  │                                                             │ │
│  │   ┌─────────────────────────────────────────────────────┐  │ │
│  │   │                  WebSocket Client                    │  │ │
│  │   │            connects to Bridge:3334                   │  │ │
│  │   └─────────────────────────────────────────────────────┘  │ │
│  │                           │                                 │ │
│  │                      live events                            │ │
│  │                           ▼                                 │ │
│  │   ┌─────────────────────────────────────────────────────┐  │ │
│  │   │                   DOM Renderer                       │  │ │
│  │   │              Updates UI in real-time                 │  │ │
│  │   └─────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                                  │
                            WebSocket
                                  │
                                  ▼
                              BRIDGE:3334
```

---

## Layout: Four Windows

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  BarrHawk Dashboard                                    [⚡ Connected] [⏸ Pause] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │         BRIDGE              │  │              DOCTOR                  │  │
│  │  ┌─────────────────────┐   │  │  ┌─────────────────────────────┐    │  │
│  │  │ Status: ● Running   │   │  │  │ Status: ● Ready             │    │  │
│  │  │ Uptime: 2h 34m      │   │  │  │ Uptime: 2h 34m              │    │  │
│  │  │ Doctor: ● Healthy   │   │  │  │ Active Tasks: 3             │    │  │
│  │  │ Restarts: 0         │   │  │  │ Queued: 12                  │    │  │
│  │  └─────────────────────┘   │  │  │ Igors: 4/8                  │    │  │
│  │                            │  │  └─────────────────────────────┘    │  │
│  │  Throughput                │  │                                      │  │
│  │  ├─ In:  847 msg (2.3MB)  │  │  Swarms                              │  │
│  │  └─ Out: 845 msg (14.1MB) │  │  ├─ Active: 1                        │  │
│  │                            │  │  └─ "a11y-audit" [████░░] 60%       │  │
│  │  [Restart Doctor]          │  │                                      │  │
│  │  [Pause Traffic]           │  │  Squads                              │  │
│  │  [Shutdown]                │  │  ├─ "browser-team" (3 igors)        │  │
│  │                            │  │  └─ "db-team" (2 igors)             │  │
│  │                            │  │                                      │  │
│  │                            │  │  [+ New Squad] [Dissolve All]        │  │
│  └────────────────────────────┘  └──────────────────────────────────────┘  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                              IGORS                                   │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │   │
│  │  │ igor-001    │ │ igor-002    │ │ igor-003    │ │ igor-004    │   │   │
│  │  │ ● Busy      │ │ ● Busy      │ │ ● Idle      │ │ ● Busy      │   │   │
│  │  │             │ │             │ │             │ │             │   │   │
│  │  │ 🌐 Browser  │ │ 🗄️ Database │ │ 🌐 Browser  │ │ 🐙 GitHub   │   │   │
│  │  │ 2 pages    │ │ 3 conns     │ │ 0 pages    │ │ 5 requests  │   │   │
│  │  │ 127MB      │ │ 45MB        │ │ 38MB       │ │ 52MB        │   │   │
│  │  │             │ │             │ │             │ │             │   │   │
│  │  │ Task:       │ │ Task:       │ │             │ │ Task:       │   │   │
│  │  │ browser_    │ │ db_pg_      │ │ (waiting)   │ │ gh_pr_      │   │   │
│  │  │ screenshot  │ │ query       │ │             │ │ create      │   │   │
│  │  │ [Kill]      │ │ [Kill]      │ │ [Kill]      │ │ [Kill]      │   │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │   │
│  │                                                                     │   │
│  │  ◀ scroll ▶                                      [+ Spawn Igor]    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                           FRANKENSTREAM                              │   │
│  │  Filter: [All ▼] [Bridge ▼] [Doctor ▼] [Igor ▼]  Search: [_______]  │   │
│  │  ──────────────────────────────────────────────────────────────────  │   │
│  │  14:32:05.123  BRIDGE   mcp:request     browser_screenshot           │   │
│  │  14:32:05.125  DOCTOR   task:dispatch   → igor-001                   │   │
│  │  14:32:05.127  IGOR-001 task:start      browser_screenshot           │   │
│  │  14:32:05.892  IGOR-001 task:complete   765ms ✓                      │   │
│  │  14:32:05.894  DOCTOR   task:response   aggregating...               │   │
│  │  14:32:05.896  BRIDGE   mcp:response    → Claude                     │   │
│  │  14:32:06.001  IGOR-002 task:start      db_pg_query                  │   │
│  │  14:32:06.045  IGOR-002 task:complete   44ms ✓                       │   │
│  │  14:32:07.234  BRIDGE   stats           847 in / 845 out             │   │
│  │  14:32:08.001  DOCTOR   swarm:progress  a11y-audit 65%               │   │
│  │  ...                                                                 │   │
│  │  ──────────────────────────────────────────────────────────────────  │   │
│  │  ◀ older                                              [⏬ Auto-scroll] │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Window Specifications

### 1. Bridge Window

**Purpose:** Infrastructure health at a glance

**Data Sources:**
```typescript
interface BridgeState {
  status: "starting" | "running" | "paused" | "stopping";
  uptime: number;              // seconds
  doctorStatus: "starting" | "ready" | "crashed" | "restarting";
  doctorRestarts: number;
  messagesIn: number;
  messagesOut: number;
  bytesIn: number;
  bytesOut: number;
  paused: boolean;
}
```

**Controls:**
| Button | Action | Confirmation |
|--------|--------|--------------|
| Restart Doctor | `{"action":"doctor:restart"}` | Yes |
| Pause Traffic | `{"action":"bridge:pause"}` | No |
| Resume Traffic | `{"action":"bridge:resume"}` | No |
| Shutdown | `{"action":"bridge:shutdown"}` | Yes |

**Update Frequency:** Every `bridge:stats` event (~5s) + immediate on state change

---

### 2. Doctor Window

**Purpose:** Task orchestration visibility

**Data Sources:**
```typescript
interface DoctorState {
  status: "initializing" | "ready" | "busy" | "overloaded";
  uptime: number;
  activeTasks: number;
  queuedTasks: number;
  igorCount: number;
  maxIgors: number;

  swarms: Array<{
    id: string;
    name: string;
    progress: number;      // 0-100
    igorCount: number;
    status: "running" | "completing" | "failed";
  }>;

  squads: Array<{
    name: string;
    igorIds: string[];
    createdAt: number;
    lastActivity: number;
  }>;
}
```

**Controls:**
| Button | Action | Confirmation |
|--------|--------|--------------|
| + New Squad | Opens modal to create squad | No |
| Dissolve All | `{"action":"squad:dissolve_all"}` | Yes |
| Cancel Swarm | `{"action":"swarm:cancel","id":"..."}` | Yes |

**Swarm Progress Bar:**
```
"a11y-audit" [████████░░░░░░░░] 52% (26/50 pages)
             ↑ green for done  ↑ gray for pending
```

---

### 3. Igors Window

**Purpose:** Worker pool status and control

**Data Sources:**
```typescript
interface IgorState {
  id: string;
  status: "spawning" | "idle" | "busy" | "dying";
  pid: number;
  uptime: number;

  // Specialization
  toolBag: string[];           // ["browser_*", "assert_*"]
  domain: "browser" | "database" | "github" | "docker" | "general";

  // Resources
  memoryMB: number;
  browserPages: number;
  dbConnections: number;

  // Current task (if busy)
  currentTask?: {
    id: string;
    tool: string;
    startedAt: number;
  };

  // Stats
  tasksCompleted: number;
  tasksFailed: number;
  avgDuration: number;
}
```

**Igor Card Layout:**
```
┌─────────────────┐
│ igor-001        │  ← ID
│ ● Busy          │  ← Status (green dot = busy, gray = idle, red = error)
│                 │
│ 🌐 Browser      │  ← Domain icon + label
│ 2 pages         │  ← Primary resource count
│ 127MB           │  ← Memory usage
│                 │
│ Task:           │  ← Current task (if busy)
│ browser_click   │
│ 2.3s elapsed    │  ← Time running
│                 │
│ [Kill] [Logs]   │  ← Actions
└─────────────────┘
```

**Domain Icons:**
| Domain | Icon |
|--------|------|
| browser | 🌐 |
| database | 🗄️ |
| github | 🐙 |
| docker | 🐳 |
| filesystem | 📁 |
| general | ⚡ |

**Controls:**
| Button | Action | Confirmation |
|--------|--------|--------------|
| Kill | `{"action":"igor:kill","id":"..."}` | Yes |
| Logs | Opens Igor log modal | No |
| + Spawn Igor | `{"action":"igor:spawn"}` | No |

**Scrolling:** Horizontal scroll for many Igors, cards are fixed width

---

### 4. Frankenstream Window

**Purpose:** Unified event log with filtering

**Data Sources:**
```typescript
interface StreamEvent {
  timestamp: number;          // Unix ms
  source: "bridge" | "doctor" | "igor";
  sourceId?: string;          // e.g., "igor-001"
  type: string;               // e.g., "task:start"
  summary: string;            // Human-readable
  details?: any;              // Full event data
  level: "debug" | "info" | "warn" | "error";
}
```

**Event Formatting:**
```
14:32:05.123  BRIDGE   mcp:request     browser_screenshot
└── time     └── source └── type       └── summary
```

**Color Coding:**
| Source | Color |
|--------|-------|
| BRIDGE | Blue |
| DOCTOR | Purple |
| IGOR-* | Green |
| ERROR | Red background |
| WARN | Yellow text |

**Filters:**
```typescript
interface StreamFilters {
  sources: ("bridge" | "doctor" | "igor")[];
  levels: ("debug" | "info" | "warn" | "error")[];
  search: string;             // Substring match
  igorIds?: string[];         // Specific Igors
  taskId?: string;            // Follow specific task
}
```

**Controls:**
| Control | Function |
|---------|----------|
| Source dropdowns | Toggle visibility by source |
| Search box | Filter by substring |
| Auto-scroll toggle | Pin to bottom vs freeze |
| Clear | Clear visible log |
| Export | Download as JSON/CSV |

**Buffer:** Keep last 1000 events in memory, older events available via scroll-up fetch

---

## WebSocket Protocol

### Connection

```javascript
const ws = new WebSocket('ws://localhost:3334/events');

ws.onopen = () => {
  // Subscribe to all events
  ws.send(JSON.stringify({ type: 'subscribe', channels: ['all'] }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  handleEvent(data);
};
```

### Event Types Received

```typescript
type DashboardEvent =
  // Bridge events
  | { type: "bridge:stats"; data: BridgeState }
  | { type: "bridge:doctor_status"; data: { status: string } }

  // Doctor events
  | { type: "doctor:state"; data: DoctorState }
  | { type: "doctor:task_queued"; data: { taskId: string; tool: string } }
  | { type: "doctor:task_dispatched"; data: { taskId: string; igorId: string } }
  | { type: "doctor:swarm_progress"; data: { swarmId: string; progress: number } }

  // Igor events
  | { type: "igor:spawned"; data: { id: string; domain: string } }
  | { type: "igor:state"; data: IgorState }
  | { type: "igor:task_start"; data: { igorId: string; taskId: string; tool: string } }
  | { type: "igor:task_end"; data: { igorId: string; taskId: string; duration: number; status: string } }
  | { type: "igor:terminated"; data: { id: string; reason: string } }

  // Stream events (for Frankenstream)
  | { type: "stream"; data: StreamEvent };
```

### Commands Sent

```typescript
type DashboardCommand =
  | { action: "bridge:pause" }
  | { action: "bridge:resume" }
  | { action: "bridge:shutdown" }
  | { action: "doctor:restart" }
  | { action: "igor:kill"; id: string }
  | { action: "igor:spawn"; domain?: string }
  | { action: "swarm:cancel"; id: string }
  | { action: "squad:create"; name: string; igorCount: number }
  | { action: "squad:dissolve"; name: string }
  | { action: "squad:dissolve_all" }
  | { action: "subscribe"; channels: string[] }
  | { action: "unsubscribe"; channels: string[] };
```

---

## Hono Server Routes

```typescript
import { Hono } from 'hono';
import { serveStatic } from 'hono/serve-static';

const app = new Hono();

// Main dashboard
app.get('/', (c) => c.html(dashboardHTML));

// Static assets
app.use('/assets/*', serveStatic({ root: './public' }));

// REST fallback for initial state
app.get('/api/snapshot', async (c) => {
  // Fetch current state from Bridge
  const state = await fetchBridgeState();
  return c.json(state);
});

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

export default app;
```

**Note:** Dashboard server is separate from Bridge. It serves static files and provides REST fallback. All live data comes via WebSocket directly from Bridge:3334.

---

## Client-Side Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     dashboard.js                                 │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    State Store                           │   │
│  │  bridge: BridgeState                                     │   │
│  │  doctor: DoctorState                                     │   │
│  │  igors: Map<string, IgorState>                          │   │
│  │  stream: StreamEvent[]                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                      │
│                      on change                                   │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Renderers                             │   │
│  │  renderBridge(state.bridge)                              │   │
│  │  renderDoctor(state.doctor)                              │   │
│  │  renderIgors(state.igors)                                │   │
│  │  renderStream(state.stream, filters)                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                      │
│                      updates                                     │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      DOM                                 │   │
│  │  #bridge-window                                          │   │
│  │  #doctor-window                                          │   │
│  │  #igors-window                                           │   │
│  │  #stream-window                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Rendering Strategy:**
- Use DOM diffing for efficiency (or just innerHTML for simplicity)
- Igors window: Re-render only changed cards
- Stream: Append new events, remove old (keep 1000 max)
- Throttle renders to 60fps max

---

## Responsive Behavior

**Desktop (>1200px):**
```
┌──────────┬──────────┐
│  Bridge  │  Doctor  │
├──────────┴──────────┤
│       Igors         │
├─────────────────────┤
│    Frankenstream    │
└─────────────────────┘
```

**Tablet (800-1200px):**
```
┌─────────────────────┐
│  Bridge  │  Doctor  │
├─────────────────────┤
│       Igors         │
├─────────────────────┤
│    Frankenstream    │
└─────────────────────┘
```

**Mobile (<800px):**
```
┌─────────────────────┐
│      [Tabs]         │
│  B | D | I | F      │
├─────────────────────┤
│                     │
│   (selected tab)    │
│                     │
└─────────────────────┘
```

---

## Styling

**Color Palette:**
```css
:root {
  --bg-primary: #1a1a2e;      /* Dark blue-gray */
  --bg-secondary: #16213e;    /* Darker panels */
  --bg-card: #0f3460;         /* Igor cards */

  --text-primary: #e8e8e8;
  --text-secondary: #a0a0a0;

  --accent-bridge: #3498db;   /* Blue */
  --accent-doctor: #9b59b6;   /* Purple */
  --accent-igor: #2ecc71;     /* Green */

  --status-ok: #2ecc71;
  --status-warn: #f39c12;
  --status-error: #e74c3c;
  --status-idle: #7f8c8d;
}
```

**Typography:**
```css
body {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
}
```

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Cmd/Ctrl + K` | **Command Palette** |
| `1` | Focus Bridge window |
| `2` | Focus Doctor window |
| `3` | Focus Igors window |
| `4` | Focus Frankenstream |
| `p` | Toggle pause |
| `r` | Restart Doctor (with confirm) |
| `/` | Focus search |
| `Esc` | Clear focus / close modal |
| `j/k` | Scroll stream up/down |

---

## Command Palette

Press `Cmd+K` (or `Ctrl+K` on Linux/Windows):

```
┌─────────────────────────────────────────────────────────────────┐
│  🔍  Type a command...                                    [Esc] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ▶  Restart Doctor                                    ⌘⇧R       │
│     Pause Traffic                                     P          │
│     Resume Traffic                                               │
│     ─────────────────────────────────────────────────────────   │
│     Kill igor-001                                                │
│     Kill igor-002                                                │
│     Kill igor-003                                                │
│     Spawn New Igor                                    ⌘N         │
│     ─────────────────────────────────────────────────────────   │
│     Create Squad                                                 │
│     Dissolve All Squads                                          │
│     Cancel Swarm: a11y-audit                                    │
│     ─────────────────────────────────────────────────────────   │
│     Clear Stream                                      ⌘L         │
│     Export Logs                                       ⌘E         │
│     Toggle Auto-scroll                                           │
│     ─────────────────────────────────────────────────────────   │
│     Shutdown Bridge                                   ⌘⇧Q       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Features:**
- Fuzzy search (type "kil" matches "Kill igor-001")
- Arrow keys to navigate, Enter to execute
- Shows keyboard shortcut hints
- Grouped by category (Bridge, Igor, Squad, Stream)
- Recently used commands float to top

**Implementation Options:**

### Option 1: ninja-keys (Recommended)
```html
<script type="module" src="https://unpkg.com/ninja-keys?module"></script>
<ninja-keys id="ninja"></ninja-keys>

<script>
  const ninja = document.querySelector('#ninja');
  ninja.data = [
    { id: 'restart', title: 'Restart Doctor', icon: '🔄', hotkey: 'cmd+shift+r',
      handler: () => ws.send({action: 'doctor:restart'}) },
    { id: 'kill-igor-001', title: 'Kill igor-001', icon: '💀', parent: 'igors',
      handler: () => ws.send({action: 'igor:kill', id: 'igor-001'}) },
    // ... dynamic entries for each Igor
  ];
</script>
```

### Option 2: Custom (No Dependencies)
```javascript
class CommandPalette {
  constructor(commands) {
    this.commands = commands;
    this.visible = false;
    this.selected = 0;
    this.filtered = commands;
    this.init();
  }

  init() {
    // Create DOM
    this.el = document.createElement('div');
    this.el.className = 'cmd-palette hidden';
    this.el.innerHTML = `
      <div class="cmd-backdrop"></div>
      <div class="cmd-modal">
        <input type="text" class="cmd-input" placeholder="Type a command...">
        <div class="cmd-list"></div>
      </div>
    `;
    document.body.appendChild(this.el);

    // Keyboard handler
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        this.toggle();
      }
      if (this.visible) {
        if (e.key === 'Escape') this.hide();
        if (e.key === 'ArrowDown') this.moveSelection(1);
        if (e.key === 'ArrowUp') this.moveSelection(-1);
        if (e.key === 'Enter') this.execute();
      }
    });

    // Input handler
    this.el.querySelector('.cmd-input').addEventListener('input', (e) => {
      this.filter(e.target.value);
    });
  }

  filter(query) {
    this.filtered = this.commands.filter(cmd =>
      cmd.title.toLowerCase().includes(query.toLowerCase())
    );
    this.selected = 0;
    this.render();
  }

  render() {
    const list = this.el.querySelector('.cmd-list');
    list.innerHTML = this.filtered.map((cmd, i) => `
      <div class="cmd-item ${i === this.selected ? 'selected' : ''}" data-index="${i}">
        <span class="cmd-icon">${cmd.icon || '▶'}</span>
        <span class="cmd-title">${cmd.title}</span>
        ${cmd.hotkey ? `<span class="cmd-hotkey">${cmd.hotkey}</span>` : ''}
      </div>
    `).join('');
  }

  execute() {
    const cmd = this.filtered[this.selected];
    if (cmd?.handler) cmd.handler();
    this.hide();
  }

  toggle() { this.visible ? this.hide() : this.show(); }
  show() { this.visible = true; this.el.classList.remove('hidden'); this.render(); }
  hide() { this.visible = false; this.el.classList.add('hidden'); }
  moveSelection(delta) {
    this.selected = Math.max(0, Math.min(this.filtered.length - 1, this.selected + delta));
    this.render();
  }
}

// Usage
const palette = new CommandPalette([
  { title: 'Restart Doctor', icon: '🔄', hotkey: '⌘⇧R', handler: restartDoctor },
  { title: 'Pause Traffic', icon: '⏸', hotkey: 'P', handler: pauseTraffic },
  // ...
]);
```

**Dynamic Commands:**

Commands update based on state:
```javascript
function updatePaletteCommands() {
  const commands = [
    // Static commands
    { title: 'Restart Doctor', handler: restartDoctor },
    { title: state.paused ? 'Resume Traffic' : 'Pause Traffic', handler: togglePause },
    // Dynamic Igor commands
    ...Object.keys(state.igors).map(id => ({
      title: `Kill ${id}`,
      icon: '💀',
      handler: () => killIgor(id)
    })),
    // Dynamic Swarm commands
    ...state.swarms.map(s => ({
      title: `Cancel Swarm: ${s.name}`,
      icon: '⏹',
      handler: () => cancelSwarm(s.id)
    })),
  ];
  palette.commands = commands;
}
```

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Initial load | <500ms |
| Event render latency | <16ms (60fps) |
| Memory usage | <50MB |
| Max events in DOM | 1000 |
| Reconnect time | <1s |

---

## Error States

**WebSocket Disconnected:**
```
┌─────────────────────────────────────┐
│  ⚠️ Connection Lost                 │
│                                     │
│  Attempting to reconnect...         │
│  [████░░░░░░] 3/10 attempts         │
│                                     │
│  [Retry Now] [Use REST Fallback]    │
└─────────────────────────────────────┘
```

**Bridge Down:**
```
┌─────────────────────────────────────┐
│  🔴 Bridge Unavailable              │
│                                     │
│  Cannot connect to localhost:3334   │
│  Is BarrHawk running?               │
│                                     │
│  [Retry] [Show Last Known State]    │
└─────────────────────────────────────┘
```

---

## Future Enhancements

1. **Task Inspector** - Click task to see full details
2. **Resource Graphs** - Memory/CPU over time
3. **Replay Mode** - Scrub through recorded sessions
4. **Multi-Instance** - Connect to multiple BarrHawk instances
5. **Alerts** - Configurable notifications
6. **Export** - Session recording to file

---

## File Structure

```
dashboard/
├── public/
│   ├── index.html
│   ├── assets/
│   │   ├── dashboard.js
│   │   ├── dashboard.css
│   │   └── icons/
│   └── favicon.ico
├── src/
│   └── server.ts          # Hono server
├── package.json
└── tsconfig.json
```

**Deployment:** Can be served by:
1. Standalone Hono server
2. Bundled into Bridge (Bridge serves static files)
3. Any static file server (nginx, etc.)

---

## The View from Above

Dashboard is where operators watch the monster work.

When everything flows smoothly:
- Bridge glows blue
- Doctor glows purple
- Igors pulse green
- Stream scrolls peacefully

When things go wrong:
- Red flashes demand attention
- Igors can be killed with a click
- Doctor can be restarted instantly
- Every event is logged for forensics

The monster is powerful. The dashboard keeps it tame.
