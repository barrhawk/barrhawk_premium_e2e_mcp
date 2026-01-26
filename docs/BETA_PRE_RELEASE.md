# BarrHawk v0.2.0 Release: Tripartite Architecture

## Overview

BarrHawk v0.2.0 introduces the complete **Tripartite Architecture** - a four-component system for intelligent, self-healing E2E testing with Claude AI integration.

```
┌─────────────────────────────────────────────────────────────────┐
│                          BRIDGE                                  │
│  Port 7000 | Message Bus | Rate Limiter | Circuit Breakers       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────────┐
│    DOCTOR     │  │     IGOR      │  │   FRANKENSTEIN    │
│   Port 7001   │  │   Port 7002   │  │     Port 7003     │
│               │  │               │  │                   │
│  Orchestrator │  │    Worker     │  │  Dynamic Tools    │
│  Failure      │  │  Lightning    │  │  Browser Control  │
│  Tracking     │  │  Strike       │  │  Hot Reload       │
│  Swarm Coord  │  │  Execution    │  │  Tool Export      │
└───────────────┘  └───────────────┘  └───────────────────┘
```

## Current Status: PRODUCTION READY

All components verified working as of 2026-01-26:

```
Bridge:       v11 | healthy | 0% error rate
Doctor:       v16 | healthy | failure-create flow active
Igor:         v15 | healthy | lightning mode available
Frankenstein: v8  | healthy | 7 dynamic tools loaded
```

## Quick Start

### Option 1: Full Tripartite Stack

```bash
cd tripartite
./start.sh
```

Verify health:
```bash
curl http://localhost:7000/health  # Bridge
curl http://localhost:7001/health  # Doctor
curl http://localhost:7002/health  # Igor
curl http://localhost:7003/health  # Frankenstein
```

### Option 2: MCP-Frank Server (Claude CLI Integration)

Add to your Claude Code MCP config:

```json
{
  "mcpServers": {
    "barrhawk-frank": {
      "command": "bun",
      "args": ["run", "/path/to/tripartite/mcp-frank.ts"],
      "env": {}
    }
  }
}
```

This provides access to:
- `frank_execute` - Natural language automation
- `frank_swarm_execute` - Multi-agent parallel testing
- `frank_browser_*` - Direct browser control
- `frank_tools_create` - Runtime tool generation

## Component Details

### Bridge (7000)
The indestructible kernel. Never crashes, delegates all risky work.

- Message routing between all components
- Rate limiting (100 tokens/sec, 200 burst)
- Circuit breakers per component
- Connection health scoring
- Dead letter queue for failed messages

### Doctor (7001)
The brain. Plans and orchestrates.

- Interprets test intent from natural language
- Generates execution plans for Igor
- Tracks failure patterns across runs
- Requests tool creation from Frankenstein when patterns repeat
- Swarm coordination for parallel testing

### Igor (7002)
The hands. Executes plans.

- Executes steps from Doctor's plans
- Lightning Strike mode: starts "dumb" (fast), escalates to Claude when stuck
- Stable toolkit for reliable operations
- Reports results back to Doctor

### Frankenstein (7003)
The lab. Creates tools dynamically.

- Playwright browser automation
- Dynamic tool creation at runtime
- Hot-reload for rapid iteration
- Tool export ("igorification") for stable tools
- System tools (screenshot, mouse, keyboard)

## Key Features

### Failure→Create Flow
When Igor fails at the same task repeatedly:
1. Doctor tracks the failure pattern
2. After threshold (default: 2), Doctor analyzes
3. Doctor requests Frankenstein to create a tool
4. Frankenstein compiles and registers the tool
5. Tool is available for future use

### Lightning Strike
Adaptive intelligence for Igor:
- **Dumb mode**: Fast pattern matching, no API calls
- **Claude mode**: Full LLM reasoning when stuck
- Auto-escalates after consecutive failures
- Configurable threshold

### Swarm Mode
Parallel testing with multiple agents:
```
frank_swarm_execute with intent: "Test login, cart, checkout, and profile"
```
Spawns multiple Igors, each with their own tool bag, running in parallel.

## MCP Tools Available

### Frank Integration (via barrhawk-frank)
| Tool | Description |
|------|-------------|
| `frank_execute` | Natural language automation |
| `frank_screenshot` | Capture browser state |
| `frank_browser_launch` | Launch browser |
| `frank_browser_navigate` | Navigate to URL |
| `frank_browser_click` | Click elements |
| `frank_browser_type` | Type into inputs |
| `frank_swarm_execute` | Parallel multi-agent testing |
| `frank_swarm_analyze` | Analyze task for swarm routing |
| `frank_tools_create` | Create dynamic tools |
| `frank_lightning_strike` | Manual escalation to Claude |

### Beta Tools (via barrhawk-beta)
| Tool | Description |
|------|-------------|
| `worker_status` | Secondary worker health |
| `worker_restart` | Restart worker |
| `worker_snapshot` | Create rollback point |
| `worker_rollback` | Restore to snapshot |
| `dynamic_tool_create` | Create tool at runtime |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BRIDGE_PORT` | 7000 | Bridge HTTP port |
| `DOCTOR_PORT` | 7001 | Doctor HTTP port |
| `IGOR_PORT` | 7002 | Igor HTTP port |
| `FRANK_PORT` | 7003 | Frankenstein HTTP port |
| `FRANK_TOOL_CREATION_ENABLED` | true | Enable auto tool creation |
| `FAILURE_THRESHOLD_FOR_TOOL` | 2 | Failures before tool request |
| `LIGHTNING_AUTO_THRESHOLD` | 3 | Failures before Claude escalation |
| `ANTHROPIC_API_KEY` | - | Required for Lightning Strike Claude mode |

## Architecture Benefits

1. **Fault Tolerance**: Components restart independently without losing state
2. **Observability**: All messages flow through Bridge for debugging
3. **Scalability**: Spawn multiple Igors for parallel execution
4. **Learning**: Failure patterns automatically generate tools
5. **Flexibility**: Hot-reload Frankenstein without restarting stack

## Comparison to Alternatives

| Feature | BarrHawk | Claude-Flow | ccswarm |
|---------|----------|-------------|---------|
| Browser Automation | Native Playwright | External | None |
| Tool Generation | Auto from failures | Manual | Manual |
| Intelligence | Lightning Strike | Always-on | Always-on |
| Architecture | 4-tier supervised | Swarm mesh | Git worktree |
| Focus | E2E Testing | General agents | Code collab |

## Next Steps

- Add more tool-worthy error patterns
- Expand Igor stable toolkit
- Dashboard-max with full observability
- Multi-browser support in Frankenstein
