# BarrHawk Tripartite Architecture - Master Guide

## The Core Principle

**This is an MCP (Model Context Protocol) server.** It will be operated by AI CLI tools - not humans directly.

The calling AI (Claude Code, Gemini CLI, Windsurf, Antigravity, Cursor, etc.) is the **real intelligence**. The tripartite stack is a **lean execution layer** - it doesn't think, it does.

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI CLI TOOL (The Brain)                       │
│         Claude Code / Gemini / Windsurf / Antigravity            │
│                                                                  │
│   • Understands user intent                                      │
│   • Decides what to test                                         │
│   • Interprets results                                           │
│   • Can spawn sub-agents for parallel work                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ MCP Protocol
                              │ frank_execute("test login flow on example.com")
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BARRHAWK TRIPARTITE STACK                     │
│                     (Lean Execution Layer)                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## The Four Components

### 1. Bridge - The Immortal Router
```
Role: Keep everything alive, route messages
Does NOT think. Just delivers.
```
- WebSocket message broker
- Keeps Doctor alive (immortal process)
- Routes messages between components
- Stores execution reports
- Zero intelligence, 100% reliability

### 2. Doctor - The Orchestrator
```
Role: Distribute tools, handle failures, restart Frank
Does NOT plan complex tasks. The calling AI does that.
```
- **Knows ALL available tools** (browser actions, Frank's dynamic tools, OS tools)
- **Distributes tool SUBSETS to Igor** - keeps Igor's context window small
- **Creates tools for Frank** when Igor fails on a pattern
- **Auto-restarts Frank** with `bun` after creating new tools
- Tracks failure patterns across executions

### 3. Igor - The Small Context Executor
```
Role: Execute with minimal context
Gets only what he needs. Stays lean.
```
- Receives **tool subset** from Doctor (not all tools)
- Executes step-by-step plans
- Reports success/failure back to Doctor
- **Small context window** = faster, cheaper, more reliable
- When stuck, Doctor handles it (not Igor's problem)

### 4. Frankenstein - The Dynamic Tool Factory
```
Role: Browser automation + custom tool creation
Gets restarted when new tools are added.
```
- Playwright browser control (launch, navigate, click, type, screenshot)
- **Dynamic tool creation** - Doctor requests new tools for failure patterns
- **OS-level tools** - xdotool for mouse/keyboard outside DOM
- Gets **restarted by Doctor** after tool creation (fresh bun process)

---

## The Flow

### Happy Path
```
AI CLI calls frank_execute("log into example.com as admin")
    │
    ▼
Bridge routes to Doctor
    │
    ▼
Doctor picks tool subset for this task:
  - browser.launch
  - browser.navigate
  - browser.type
  - browser.click
  - browser.screenshot
    │
    ▼
Doctor sends plan + tools to Igor
    │
    ▼
Igor executes via Frankenstein
    │
    ▼
Success → Report back to AI CLI
```

### Failure Path (The Magic)
```
Igor fails on step: click('#old-button-id')
    │
    ▼
Doctor sees failure pattern:
  - Action: click
  - Selector: #old-button-id
  - Error: Element not found
  - Occurred: 3 times
    │
    ▼
Doctor creates tool for Frank:
  frank_tools_create({
    name: "click_login_button_v2",
    description: "Click login using data-testid",
    code: "page.click('[data-testid=login]')"
  })
    │
    ▼
Doctor restarts Frank: `bun run frankenstein/index.ts`
    │
    ▼
Frank comes back with new tool registered
    │
    ▼
Doctor tells Igor to retry with new tool
    │
    ▼
Success → Failure pattern marked as solved
```

---

## Why This Architecture?

### 1. Context Window Efficiency
AI models have limited context. Igor gets **only the tools he needs** for the current task, not 500 tools he'll never use.

### 2. The Calling AI is Smart
Claude Code, Gemini, etc. are already genius-level. We don't need Doctor to be smart - we need Doctor to be a good **tool manager** and **failure handler**.

### 3. Dynamic Adaptation
When something breaks, we don't update code and redeploy. Doctor creates a new tool, restarts Frank, and the sprint continues.

### 4. MCP-Native
Built for the MCP protocol. AI CLI tools can:
- Call `frank_execute` for E2E tests
- Call `frank_swarm_execute` for parallel testing
- Get structured results back
- Spawn sub-agents that each use Frank independently

---

## For MCP Client Developers

### Available Tools (via MCP)
```typescript
frank_execute(task, url?)        // Natural language E2E task
frank_browser_launch(opts)       // Manual browser control
frank_browser_navigate(url)
frank_browser_click(selector)
frank_browser_type(selector, text)
frank_screenshot()
frank_browser_close()
frank_swarm_execute(intent)      // Parallel multi-route testing
frank_tools_create(name, desc, code)  // Create custom tool
```

### Example: AI CLI Using Frank
```
User: "Test that users can log in and see their dashboard"

AI CLI thinks: I need to test login flow
AI CLI calls: frank_execute("Navigate to app.example.com,
              log in with test@example.com / password123,
              verify dashboard loads with user's name")

Frank executes → Returns success/failure + screenshot

AI CLI interprets result and responds to user
```

### Example: Parallel Testing with Sub-Agents
```
User: "Test all critical paths on staging"

AI CLI spawns 4 sub-agents:
  Agent 1: frank_execute("test login flow")
  Agent 2: frank_execute("test checkout flow")
  Agent 3: frank_execute("test search functionality")
  Agent 4: frank_execute("test user settings")

All run in parallel via frank_swarm_execute
AI CLI aggregates results
```

---

## Summary

| Component | Role | Intelligence |
|-----------|------|--------------|
| AI CLI | The brain | HIGH |
| Bridge | Message routing | NONE |
| Doctor | Tool distribution + failure handling | LOW (orchestration only) |
| Igor | Step execution | NONE (just follows orders) |
| Frank | Browser + tool factory | NONE (just executes) |

**The calling AI is the intelligence. The stack is the hands.**
