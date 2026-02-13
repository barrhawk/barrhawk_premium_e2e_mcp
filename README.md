# BARRHAWK: VERIFY YOUR VIBECODE
### The Operating System for Agentic Verification & Orchestration

```
██████╗  █████╗ ██████╗ ██████╗ ██╗  ██╗ █████╗ ██╗    ██╗██╗  ██╗
██╔══██╗██╔══██╗██╔══██╗██╔══██╗██║  ██║██╔══██╗██║    ██║██║ ██╔╝
██████╔╝███████║██████╔╝██████╔╝███████║███████║██║ █╗ ██║█████╔╝
██╔══██╗██╔══██║██╔══██╗██╔══██╗██╔══██║██╔══██║██║███╗██║██╔═██╗
██████╔╝██║  ██║██║  ██║██║  ██║██║  ██║██║  ██║╚███╔███╔╝██║  ██╗
╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═╝  ╚═╝
                                            v0.5.0 | TRIPARTITE RELEASE
```

> **"If your Agent can't test itself, it's just a hallucination."**

---

## What's New in v0.5.0

- **Unified Stack** - Single command `bun run barrhawk` starts everything
- **Integrated Dashboard** - Live monitoring at `http://localhost:7000/dashboard`
- **Experience System** - Self-healing selectors that learn across sessions
- **Tool Injection** - New tools broadcast to running Igors in real-time
- **Lightning Strike** - Igor auto-escalates to Claude when stuck
- **Hub Mode** - Multi-Igor test orchestration with `--hub` flag

---

## Quick Start

```bash
# 1. Clone and install
git clone git@github.com:barrhawk/barrhawk_premium_e2e_mcp.git
cd barrhawk_premium_e2e_mcp
bun install

# 2. Start the stack
bun run barrhawk

# 3. Submit a test
curl -X POST http://localhost:7001/plan \
  -H "Content-Type: application/json" \
  -d '{"intent":"take a screenshot of the homepage","url":"https://example.com"}'
```

### Stack Modes

```bash
bun run barrhawk           # Full tripartite stack (Bridge, Doctor, Igor, Frank)
bun run barrhawk --minimal # Just Bridge + Igor (lightweight)
bun run barrhawk --hub     # Full stack + Test Orchestration Hub
```

---

## The Tripartite Architecture

Four specialized servers communicating via WebSocket:

| Component | Port | Role |
|-----------|------|------|
| **Bridge** | 7000 | Message bus, circuit breakers, dashboard |
| **Doctor** | 7001 | Planner, intent parser, experience engine |
| **Igor** | 7002 | Executor, Lightning Strike dual-mode |
| **Frankenstein** | 7003 | Browser control, dynamic tool forge |

### How It Works

1. **You** send an intent to Doctor: `"test the login flow"`
2. **Doctor** consults experience, generates a plan, selects tools
3. **Igor** executes the plan step-by-step
4. **Frankenstein** controls the browser, takes screenshots
5. **Experience** records what worked for next time

### Lightning Strike (Dual-Mode Igor)

Igor starts in "dumb mode" - fast, regex-based execution. When a step fails 3 times, Igor "strikes" - elevating to full Claude reasoning to solve the problem, then powers back down.

---

## Endpoints

### Doctor (Port 7001)
```bash
# Submit a plan
POST /plan
{"intent": "click the login button", "url": "https://example.com"}

# Check plan status
GET /plans
GET /plans/:id
```

### Bridge (Port 7000)
```bash
# Health check
GET /health

# Live dashboard
GET /dashboard
```

### Igor (Port 7002)
```bash
# Status
GET /status
GET /health

# Current tool bag
GET /toolbag
```

### Frankenstein (Port 7003)
```bash
# Health and tools
GET /health
GET /tools
```

---

## Project Structure

```
/
├── bin/barrhawk.ts          # CLI entry point
├── tripartite/              # The Core Stack
│   ├── bridge/              # Message Bus + Dashboard (7000)
│   ├── doctor/              # Planner + Swarm Logic (7001)
│   ├── igor/                # Executor + Lightning (7002)
│   ├── frankenstein/        # Browser + Tool Forge (7003)
│   └── shared/              # Common utilities
│       ├── experience.ts    # Learning system
│       ├── tool-registry.ts # 120+ tool definitions
│       └── types.ts         # Shared types
├── hub/                     # Test Orchestration (--hub mode)
│   ├── index.ts             # Hub API (7010)
│   ├── coordinator.ts       # Multi-Igor sync (7011)
│   └── igor-db.ts           # Database watcher (7012)
├── packages/                # Feature modules
│   ├── golden/              # Visual regression
│   ├── self-heal/           # Selector strategies
│   └── ...                  # 30+ packages
└── docs/                    # Documentation
    └── specs/               # Component specifications
```

---

## MCP Integration

BarrHawk exposes MCP tools for Claude Code, Cursor, and other AI assistants.

### Configure Claude Code
```bash
./scripts/generate-mcp-configs.sh
```

### Key Tools
```javascript
// Natural language automation
frank_execute({ task: "Log into github.com", url: "https://github.com" })

// Parallel testing
frank_swarm_execute({ intent: "Test checkout flow", maxIgors: 4 })

// OS-level control (extensions, dialogs)
frank_os_mouse({ action: "click", x: 100, y: 200 })
frank_os_keyboard({ combo: "ctrl+shift+i" })

// Screenshots
frank_screenshot({ fullPage: true })
```

---

## Experience System

BarrHawk learns from every test run:

- **Selectors**: Which CSS selectors work for which elements
- **Timings**: How long actions typically take per site
- **Errors**: Common error patterns and their fixes
- **Sites**: Known site patterns with pre-mapped selectors

Data stored in `experiencegained/experience.json` (configurable via `EXPERIENCE_DIR`).

---

## Development

```bash
# Run tests
bun test

# Type check
bun run typecheck

# View logs
tail -f /tmp/tripartite-*.log
```

---

## License

MIT

---

> **"Trust, but Verify."** — BarrHawk
