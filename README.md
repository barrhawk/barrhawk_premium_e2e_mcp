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