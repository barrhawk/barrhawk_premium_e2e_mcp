# BARRHAWK: VERIFY YOUR VIBECODE
### The Operating System for Agentic Verification & Orchestration

```
██████╗  █████╗ ██████╗ ██████╗ ██╗  ██╗ █████╗ ██╗    ██╗██╗  ██╗
██╔══██╗██╔══██╗██╔══██╗██╔══██╗██║  ██║██╔══██╗██║    ██║██║ ██╔╝
██████╔╝███████║██████╔╝██████╔╝███████║███████║██║ █╗ ██║█████╔╝ 
██╔══██╗██╔══██║██╔══██╗██╔══██╗██╔══██║██╔══██║██║███╗██║██╔═██╗ 
██████╔╝██║  ██║██║  ██║██║  ██║██║  ██║██║  ██║╚███╔███╔╝██║  ██╗
╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═╝  ╚═╝
                                            v0.3.1 | AI TINKERERS UPDATE
```

> **"If your Agent can't test itself, it's just a hallucination."**
>
> Shout out to the **Seattle AI Tinkerers** — this one is for the builders who know that "Vibe Coding" needs "Vibe Verification."

---

## 🚨 THE AI TINKERERS UPDATE (v0.3.1)

We have evolved beyond simple browser testing. BarrHawk is now a **Full-Stack Reality Verification Engine** for your AI Agents.

### New Capabilities
*   **OS "God Mode":** Frankenstein has escaped the browser. Use `frank_os_mouse`, `frank_os_keyboard`, and `frank_os_window` to test desktop apps, extensions, and system dialogs.
*   **Video Recording:** Full session recording for demos and debugging.
*   **Swarm Intelligence:** Orchestrate 100s of tests using parallel "Igor" subprocesses via `frank_swarm_execute`.
*   **Self-Healing 2.0:** We don't just find selectors; we *remember* them across sessions using the `experiencegained/` database.

---

## 👁️ THE VISION: Why BarrHawk Exists

AI Agents (Claude, Gemini, Cursor) are powerful but blind. They execute code, but they don't know if it *actually works*. They hallucinate success.

**BarrHawk is the sensory cortex for your AI.**
It provides the eyes (Screenshots/Video), the hands (Mouse/Keyboard), and the brain (Doctor/Igor) to verify that your code does what you think it does.

### The SaaS Model (Coming Soon)
We are building the infrastructure to scale this from localhost to the cloud.
*   **Free Tier (Localhost):** You run the stack. You own the data.
*   **Hive Mind ($20/mo):** Sync your "Experience" database. If one dev's agent fixes a selector, *everyone's* agent knows. Cloud storage for artifacts.
*   **Swarm Cluster ($200/mo):** **The Power Proxy.** Offload the heavy lifting. Don't melt your laptop running 50 Chromes. We run the Igors and Franks in our cloud, tunneling back to your localhost.

---

## 🧠 THE PHILOSOPHY: "Show Your Work"

**If an AI can't tell you exactly how it tested something—where it started, what state changed, and how it ended—it's just "LGTM trust me bro" vibecode.**

We reject the idea that "generating code" is the goal. The goal is **Verified Reality**.
BarrHawk is built on the belief that the only thing that matters is **Holistic, Unified Action Testing**.

*   **Front-Back Unity:** We don't just click buttons. We watch the backend logs, the database state, and the network traffic simultaneously.
*   **Reactive Intelligence:** A test isn't a script; it's a conversation with the system. If a button moves, we find it. If an API is slow, we wait. If a 500 error appears, we read the debug log to find *why*.
*   **The "Live Postman" for Agents:** Just as you use Postman to inspect an API manually, BarrHawk is the live inspection layer for your Agent's actions.

### 🔮 Coming Soon: The "Live AI Watcher"
We are integrating a dedicated LLM observer into the Dashboard. This isn't just a log viewer; it's a second brain that watches the test execution in real-time, effectively "pair programming" with the execution agent to spot anomalies that strict assertions might miss.

---

## 🏛️ THE TRIPARTITE ARCHITECTURE

BarrHawk is not a script. It is a **distributed system** composed of four specialized servers communicating via a high-speed WebSocket Bridge.

### 1. THE BRIDGE (Port 7000) - "The Fortress"
*   **Role:** The Nervous System.
*   **Philosophy:** *Immortality.* The Bridge never crashes.
*   **Tech:** WebSocket Server, Circuit Breakers, Rate Limiters, Dead Letter Queues.
*   **Function:** Routes messages between components. If Frank dies, Bridge holds the message until he is reborn.

### 2. THE DOCTOR (Port 7001) - "The Brain"
*   **Role:** Orchestrator & Planner.
*   **Philosophy:** *Context Compression.*
*   **Tech:** Planner Logic, Intent Parser, Experience Engine.
*   **Function:**
    *   Takes a vague user request ("Check checkout").
    *   Consults the `experiencegained` database.
    *   Generates a precise JSON Plan.
    *   **Critical:** Curates a specific "Tool Bag" for Igor (reducing 120 tools to 15 relevant ones) to save token costs and increase accuracy.

### 3. IGOR (Port 7002) - "The Hand"
*   **Role:** Executor & Worker.
*   **Philosophy:** *Dual-Mode Intelligence.*
*   **Tech:** Agent Loop, Lightning Strike System.
*   **Modes:**
    *   **Dumb Mode:** Fast, regex-based execution. Extremely cheap.
    *   **Lightning Strike (Claude Mode):** If a step fails, Igor "Strikes" — elevating to a full LLM context to reason through the error, fix it, and then power down.

### 4. FRANKENSTEIN (Port 7003) - "The Body"
*   **Role:** The Toolmaker.
*   **Philosophy:** *Dynamic Runtime.*
*   **Tech:** Playwright, Ydotool, Grim, TypeScript Compiler.
*   **Function:**
    *   Controls the Browser and OS.
    *   **Dynamic Tool Forge:** Can write and compile *new tools* at runtime to solve unforeseen problems.
    *   **Hollow Shell:** Can "Go Dark" (unload tools) to save context window space when not in use.

---

## 🛠️ INSTALLATION & SETUP

### Prerequisites
*   **Bun:** `curl -fsSL https://bun.sh/install | bash`
*   **Linux:** (Optimized for Wayland/X11). Mac/Windows support is experimental.

### Quick Start
```bash
# 1. Clone the repo
git clone git@github.com:barrhawk/barrhawk_premium_e2e_mcp.git
cd barrhawk_premium_e2e_mcp

# 2. Install dependencies
bun install

# 3. Generate MCP Configs (The "Inception" Script)
# Automatically configures Claude, Gemini, Cursor, and Windsurf
./scripts/generate-mcp-configs.sh

# 4. Start the Stack
cd tripartite && ./start.sh
```

### The "War Room" Dashboard
Open **[http://localhost:3333](http://localhost:3333)** to see the live neural activity of your swarm.
*   **Visual Pipeline:** Watch Doctor hand plans to Igor.
*   **Live Stream:** See what Frankenstein sees.
*   **Holistic State:** Watch backend logs and UI changes in sync.
*   **Token Nuke:** Toggle the "Active" switch to remove BarrHawk from your AI's context when you want to save tokens.

---

## 🎮 USAGE GUIDE (For your AI)

Once installed, your AI (Claude/Gemini/Cursor) will have access to these tools. **Teach your AI these patterns:**

### 1. The "Do It" Command
```javascript
// Natural language automation
frank_execute({
  task: "Log into github.com and check my notifications",
  url: "https://github.com"
})
```

### 2. The "Swarm" Command (Parallel Testing)
```javascript
// Analyze if we need a swarm
const analysis = frank_swarm_analyze({ intent: "Test the full checkout flow for Guest and Admin" });

// Execute the swarm
frank_swarm_execute({
  intent: "Test the full checkout flow",
  maxIgors: 4
});
```

### 3. The "God Mode" Command (OS Control)
```javascript
// Click an extension in the Chrome toolbar
frank_os_mouse({
  action: "click",
  x: 1850,
  y: 45
})
```

---

## 📂 PROJECT STRUCTURE (Deep Dive)

```
/
├── tripartite/               # The Core Engines
│   ├── bridge/               # Message Bus (Port 7000)
│   ├── doctor/               # Planner (Port 7001)
│   ├── igor/                 # Executor (Port 7002)
│   └── frankenstein/         # Toolmaker (Port 7003)
│
├── packages/                 # Shared Libraries
│   ├── self-heal/            # Selector Strategy Engine
│   ├── ai-backend/           # Claude/Gemini/Ollama Abstraction
│   ├── system-tools/         # OS Automation (Mouse/Key)
│   ├── golden/               # Visual Regression Logic
│   └── mcp-client/           # (Coming Soon) Testing other MCPs
│
├── experiencegained/         # The Hive Mind Database (JSON)
│   ├── selectors.json        # Learned selector mappings
│   └── errors.json           # Known error patterns
│
└── docs/                     # Documentation
    ├── planning/             # Future Arch (Token Nuke, Proxy)
    └── specs/                # Component Specifications
```

---

## 🔮 ROADMAP: The Road to 100 Stars

We are actively building the connective tissue to make this a seamless SaaS product.

### Phase 1: Connective Tissue (Current)
- [ ] **`barrhawk init`**: A unified installer that detects your IDE/CLI and injects the "God Prompt" rules file (`.barrhawkrules`).
- [ ] **Token Nuke:** Fully implementing the "Hollow Shell" pattern to toggle tool visibility on demand.

### Phase 2: The SaaS Layer (Next)
- [ ] **Cloud Experience Sync:** Upload your local `experiencegained` to the cloud to share with your team.
- [ ] **The BarrHawk Proxy:** A secure gateway allowing Tier 3 users to leverage Enterprise-grade AI rate limits via Igor.

### Phase 3: The Universal Standard
- [ ] **MCP Client Tools:** Enabling Igor to connect to *other* MCP servers and verify *their* behavior.

---

## 🤝 CONTRIBUTING

We are open source. We are building the future of AI verification.

*   **Repo:** `github.com/barrhawk/barrhawk_premium_e2e_mcp`
*   **Push Access:** Ask Sparrow.
*   **Issues:** Use the Issue Tracker.

> **"Trust, but Verify."** — BarrHawk

---

# APPENDIX: DEVTESTING BRANCH - February 2026 Updates

## 🎬 THE CALLBACK ARCHITECTURE REVOLUTION

### The Problem We Solved

The original intelligent loop required a separate `ANTHROPIC_API_KEY` because Frankenstein was calling the Claude API directly to analyze screenshots. This was:
- **Redundant:** Claude CLI is already Claude - why call another Claude?
- **Expensive:** Double API calls
- **Broken:** Required users to have their own API key

### The Solution: Claude CLI IS the Intelligence

We rebuilt the intelligent loop so that **Claude CLI itself provides the intelligence**. The MCP just provides:
- **Eyes:** Screenshots via `takeScreenshot()`
- **Hands:** Mouse/keyboard via `executeAction()`

The brain is YOU (Claude CLI).

### New Architecture Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Claude CLI (The Brain)                      │
│                                                                 │
│  1. Call frank_loop_start({ goal: "..." })                     │
│  2. LOOK at the returned screenshot (I have vision!)            │
│  3. DECIDE what to click/type                                   │
│  4. Call frank_loop_continue({ action: {...} })                │
│  5. LOOK at the new screenshot                                  │
│  6. REPEAT until done                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📹 DESKTOP RECORDING (New Module)

### File: `tripartite/frankenstein/desktop-recorder.ts`

Full desktop screen recording that captures EVERYTHING - not just the browser viewport.

### Why Desktop Recording?

Playwright's built-in recording only captures the browser content. But for testing Chrome extensions, sidepanels, system dialogs, etc., we need to record the ENTIRE DESKTOP.

### Supported Tools

| Environment | Tool | Notes |
|-------------|------|-------|
| X11 | `ffmpeg` | Full support, tested |
| Wayland | `wf-recorder` | Experimental |
| Headless | `Xvfb` + `ffmpeg` | Virtual framebuffer |

### MCP Tools

#### `frank_desktop_record_start`
Start recording the entire desktop.

```javascript
frank_desktop_record_start({
  outputDir: "/tmp/recordings",
  filename: "my_test",
  format: "mp4",      // mp4, webm, mkv
  fps: 30,
  audio: false
})
// Returns: { id, outputPath, status: "recording", pid }
```

#### `frank_desktop_record_stop`
Stop recording and finalize the video file.

```javascript
frank_desktop_record_stop()
// Returns: { outputPath, duration, status: "stopped" }
```

#### `frank_desktop_record_status`
Check current recording status.

```javascript
frank_desktop_record_status()
// Returns: { recording: { id, duration, outputPath } | null }
```

### Headless Recording

For CI/CD environments without a display:

#### `frank_headless_start`
Start a virtual X display using Xvfb.

```javascript
frank_headless_start({
  display: ":99",
  resolution: { width: 1920, height: 1080 }
})
```

#### `frank_headless_record_start`
Combined headless display + recording in one call.

```javascript
frank_headless_record_start({
  display: ":99",
  resolution: { width: 1920, height: 1080 },
  outputDir: "/tmp/ci-recordings",
  filename: "ci_test_run"
})
```

---

## 🔄 INTELLIGENT LOOP (Callback Architecture)

### File: `tripartite/frankenstein/intelligent-loop.ts`

The core think-act-observe loop, now powered by Claude CLI itself.

### Key Concepts

1. **startLoop()** - Begins a session, takes first screenshot, returns it
2. **continueLoop()** - Executes an action, takes next screenshot, returns it
3. **stopLoop()** - Aborts the session
4. **getLoopStatus()** - Returns current session state

### Action Types

| Type | Params | Description |
|------|--------|-------------|
| `click` | `{ x, y, button? }` | Click at coordinates |
| `type` | `{ text, delay? }` | Type text |
| `press_key` | `{ key, modifiers? }` | Press key combo |
| `scroll` | `{ direction, amount? }` | Scroll up/down |
| `wait` | `{ ms }` | Wait milliseconds |
| `focus_window` | `{ name }` | Focus window by name |
| `done` | `{ success, message }` | **END LOOP** - goal achieved |
| `error` | `{ message }` | **END LOOP** - stuck/failed |

### MCP Tools

#### `frank_loop_start`
Start an intelligent loop session.

```javascript
frank_loop_start({
  goal: "Navigate to Medicare.gov and compare Part D plans",
  successCriteria: ["See plan comparison table", "At least 3 plans visible"],
  maxIterations: 30,
  timeoutMs: 180000
})
// Returns: {
//   sessionId: "loop_xxx",
//   iteration: 1,
//   screenshot: { base64: "...", path: "/tmp/..." },
//   instructions: "ANALYZE THE SCREENSHOT..."
// }
```

#### `frank_loop_continue`
Continue with your decided action.

```javascript
frank_loop_continue({
  sessionId: "loop_xxx",
  action: {
    type: "click",
    params: { x: 500, y: 300 },
    reasoning: "Clicking the 'Find Plans' button"
  }
})
// Returns: {
//   sessionId: "loop_xxx",
//   iteration: 2,
//   status: "awaiting_action",
//   screenshot: { base64: "...", path: "/tmp/..." }
// }
```

#### `frank_capture`
One-shot screenshot for analysis (no loop).

```javascript
frank_capture({
  context: "Looking for the Medicare login button"
})
// Returns: { screenshot, context, prompt }
```

#### `frank_action`
Execute a single action without a loop.

```javascript
frank_action({
  action: { type: "click", params: { x: 100, y: 200 } }
})
```

---

## 🐝 SWARM COORDINATOR (Multi-Igor Parallel Execution)

### File: `tripartite/frankenstein/swarm-coordinator.ts`

Orchestrates multiple Igor subagents running test routes in parallel.

### The Architecture

```
                    Claude CLI (Master)
                           │
                           ▼
                   ┌───────────────┐
                   │    Swarm      │
                   │  Coordinator  │
                   └───────┬───────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
    ┌─────────┐       ┌─────────┐       ┌─────────┐
    │ Igor-1  │       │ Igor-2  │       │ Igor-3  │
    │ (Task)  │       │ (Task)  │       │ (Task)  │
    └────┬────┘       └────┬────┘       └────┬────┘
         │                 │                 │
         └─────────────────┴─────────────────┘
                           │
                           ▼
                    Frankenstein
                  (Shared Executor)
```

### Goal Parsing

The swarm coordinator intelligently parses natural language goals into discrete routes:

**Input:**
```
"Test PURL PAL: navigate to Medicare.gov, open sidepanel, ask about Part D plans, verify AI response"
```

**Output Routes:**
1. **Navigation** - "navigate to Medicare.gov"
2. **Extension Interaction** - "open sidepanel"
3. **AI Interaction** - "ask about Part D plans"
4. **Verification** - "verify AI response"

### Route Detection Patterns

| Keywords | Route Name | Estimated Steps |
|----------|-----------|-----------------|
| login, sign in, auth | Authentication | 5 |
| navigate, go to, open | Navigation | 3 |
| sidepanel, sidebar, extension | Extension Interaction | 8 |
| compare, plans, medicare | Plan Comparison | 15 |
| form, fill, input, submit | Form Filling | 10 |
| verify, check, assert | Verification | 5 |
| chat, message, ask, ai | AI Interaction | 10 |

---

## 🏆 GOLDEN TEST (The Big One)

### The Vision

One command to rule them all:

```javascript
frank_golden_test({
  goal: "Full PURL PAL E2E: navigate, open extension, ask AI, verify response"
})
```

And out comes a video of multiple parallel agents executing the full test.

### The Flow

```
Step 1: frank_golden_test({ goal: "..." })
        │
        ├── Parses goal into routes
        ├── Creates swarm session
        └── Returns: swarmId, routes, igorCount

Step 2: frank_golden_run({ swarmId: "..." })
        │
        ├── Starts desktop recording
        ├── Generates Igor Task prompts
        └── Returns: recording info, Task configs to spawn

Step 3: Claude CLI spawns Igor Tasks in parallel
        │
        ├── Task({ prompt: "Igor 1...", run_in_background: true })
        ├── Task({ prompt: "Igor 2...", run_in_background: true })
        └── Task({ prompt: "Igor 3...", run_in_background: true })

Step 4: Monitor with frank_swarm_status_live()
        │
        └── Returns: { routes: [{ status, steps }...], allComplete }

Step 5: frank_golden_finish({ swarmId: "..." })
        │
        ├── Stops recording
        └── Returns: { videoPath, duration, results }
```

### MCP Tools

#### `frank_golden_test`
Plan a comprehensive E2E test.

```javascript
frank_golden_test({
  goal: "Test PURL PAL extension: navigate to Medicare.gov, open sidepanel, ask about Part D plans, verify AI responds",
  maxIgors: 3,
  recordVideo: true
})
// Returns: {
//   swarmId: "swarm_xxx",
//   masterGoal: "...",
//   routeCount: 4,
//   routes: [
//     { routeId: "route_1", name: "Navigation", goal: "...", estimatedSteps: 3 },
//     { routeId: "route_2", name: "Extension Interaction", ... },
//     ...
//   ],
//   nextStep: "Call frank_golden_run with swarmId..."
// }
```

#### `frank_golden_run`
Start recording and get Igor prompts ready to spawn.

```javascript
frank_golden_run({
  swarmId: "swarm_xxx",
  recordVideo: true
})
// Returns: {
//   swarmId: "swarm_xxx",
//   recording: { active: true, path: "/tmp/golden-tests/..." },
//   igorCount: 3,
//   spawnThese: [
//     { igorId: "...", routeName: "...", taskConfig: { subagent_type, description, model, prompt } },
//     ...
//   ],
//   instructions: "Use Task tool to spawn these Igors IN PARALLEL..."
// }
```

#### `frank_golden_finish`
Stop recording and finalize.

```javascript
frank_golden_finish({ swarmId: "swarm_xxx" })
// Returns: {
//   status: "completed",
//   recording: { videoPath: "/tmp/golden-tests/golden_swarm_xxx.mp4", duration: 45000 },
//   swarmResults: { totalRoutes: 3, results: [...] }
// }
```

#### `frank_swarm_status_live`
Check live status of all Igors.

```javascript
frank_swarm_status_live()
// Returns: {
//   swarmId: "swarm_xxx",
//   status: "running",
//   duration: 15000,
//   routes: [
//     { routeId: "route_1", name: "Navigation", status: "completed", steps: 3 },
//     { routeId: "route_2", name: "Extension Interaction", status: "running", steps: 5 },
//     ...
//   ],
//   allComplete: false
// }
```

---

## 📋 COMPLETE TOOL REFERENCE (devtesting branch)

### Intelligent Loop Tools
| Tool | Description |
|------|-------------|
| `frank_loop_start` | Start a loop, get first screenshot |
| `frank_loop_continue` | Provide action, get next screenshot |
| `frank_loop_stop` | Abort current loop |
| `frank_loop_status` | Check loop state |
| `frank_capture` | One-shot screenshot for analysis |
| `frank_action` | Execute single action outside loop |

### Desktop Recording Tools
| Tool | Description |
|------|-------------|
| `frank_desktop_record_start` | Start desktop recording |
| `frank_desktop_record_stop` | Stop recording, get video path |
| `frank_desktop_record_status` | Check recording status |

### Headless Tools
| Tool | Description |
|------|-------------|
| `frank_headless_start` | Start Xvfb virtual display |
| `frank_headless_stop` | Stop virtual display |
| `frank_headless_record_start` | Start headless + recording |
| `frank_headless_record_stop` | Stop headless + recording |

### Golden Test Tools
| Tool | Description |
|------|-------------|
| `frank_golden_test` | Plan comprehensive E2E test |
| `frank_golden_run` | Start recording, get Igor prompts |
| `frank_golden_finish` | Stop recording, finalize test |
| `frank_swarm_status_live` | Live status of all Igors |

### Existing Tools (from main branch)
| Tool | Description |
|------|-------------|
| `frank_execute` | Natural language task execution |
| `frank_screenshot` | Browser screenshot |
| `frank_status` | Stack component status |
| `frank_health` | Stack health check |
| `frank_browser_*` | Browser control (launch, navigate, click, type, close) |
| `frank_video_status` | Playwright video status |
| `frank_lightning_*` | Lightning Strike control |
| `frank_os_*` | OS-level automation (screenshot, keyboard, mouse, window) |
| `frank_tools_*` | Dynamic tool management |
| `frank_swarm_*` | Swarm mode (analyze, plan, execute, status, report) |

---

## 🔧 CONFIGURATION

### MCP Server Configuration

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "barrhawk-frank": {
      "command": "/home/YOUR_USER/.bun/bin/bun",
      "args": ["run", "mcp-frank.ts"],
      "cwd": "/path/to/barrhawk_premium_e2e_mcp/tripartite"
    }
  }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BRIDGE_URL` | `ws://localhost:7000` | Bridge WebSocket URL |
| `DASHBOARD_URL` | `http://localhost:3333` | Dashboard URL for swarm reporting |

---

## 🧪 TESTING THE NEW FEATURES

### Test Desktop Recording

```bash
# Start the tripartite stack
cd tripartite && ./start.sh

# Test via HTTP
curl -X POST http://localhost:7003/recording/start -H 'Content-Type: application/json' -d '{}'
sleep 5
curl -X POST http://localhost:7003/recording/stop
# Video saved to /tmp/barrhawk-recordings/
```

### Test Intelligent Loop (via MCP)

```javascript
// In Claude CLI:
frank_loop_start({ goal: "Click the first link on the page" })
// Look at the screenshot
frank_loop_continue({
  sessionId: "<from above>",
  action: { type: "click", params: { x: 100, y: 200 }, reasoning: "Clicking the link" }
})
// Repeat until done
```

### Test Golden Test (Full Flow)

```javascript
// 1. Plan the test
frank_golden_test({
  goal: "Navigate to google.com and search for 'barrhawk'"
})

// 2. Start recording and get Igor configs
frank_golden_run({ swarmId: "<from step 1>" })

// 3. Spawn Igors (Claude CLI does this with Task tool)
// Task({ subagent_type: "general-purpose", ... })

// 4. Monitor
frank_swarm_status_live()

// 5. Finish
frank_golden_finish({ swarmId: "..." })
```

---

## 📝 COMMITS IN DEVTESTING BRANCH

| Commit | Description |
|--------|-------------|
| `4d45911` | Add desktop-recorder.ts and intelligent-loop.ts modules |
| `b693074` | Integrate into Frankenstein main server with HTTP endpoints |
| `3f992f5` | Refactor intelligent loop to callback architecture |
| `11210ae` | Add Golden Test - multi-Igor swarm execution with recording |

---

## 🐛 KNOWN ISSUES / TODO

1. **Xvfb not installed by default** - Headless features require `sudo dnf install xorg-x11-server-Xvfb`
2. **Wayland support experimental** - wf-recorder support is untested
3. **Igor Task coordination** - Igors don't yet share state or coordinate on failures
4. **Frankenstein dynamic tool injection** - Not yet wired to running Igors

---

## 🔮 NEXT STEPS

1. **Wire Igor failure escalation** - When Igor fails, auto-escalate to Doctor
2. **Dynamic tool broadcast** - When Frankenstein creates a tool, notify all Igors
3. **Shared state coordination** - Let Igors communicate via Bridge
4. **Cloud recording upload** - Auto-upload recordings to cloud storage
5. **Dashboard live view** - Show real-time screenshots from all Igors

---

*Last updated: 2026-02-05 by Claude Opus 4.5*
*Branch: devtesting*
*Version: 2026-02-05-v7-swarm-golden-test*