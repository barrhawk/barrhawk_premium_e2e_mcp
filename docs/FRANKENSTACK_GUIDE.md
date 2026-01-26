# The Frankenstack Guide: Multi-Component Architecture

## Overview

The Frankenstack is BarrHawk's four-component architecture for intelligent E2E testing. It provides fault tolerance, automatic tool generation, and adaptive AI escalation.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          BRIDGE                                  │
│                    (TypeScript - Bun)                            │
│                                                                  │
│   Rate Limiter ─── Circuit Breakers ─── Connection Manager       │
│                        │                                         │
│   Dead Letter Queue ─── Metrics ─── Seen Cache                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ WebSocket / HTTP
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────────┐
│    DOCTOR     │  │     IGOR      │  │   FRANKENSTEIN    │
│ (TypeScript)  │  │ (TypeScript)  │  │   (TypeScript)    │
│               │  │               │  │                   │
│ • Planner     │  │ • Executor    │  │ • Playwright      │
│ • Failure     │  │ • Lightning   │  │ • Dynamic Tools   │
│   Tracking    │  │   Strike      │  │ • Hot Reload      │
│ • Swarm       │  │ • Toolkit     │  │ • System Tools    │
│   Coord       │  │               │  │                   │
└───────────────┘  └───────────────┘  └───────────────────┘
```

## Why This Architecture?

1. **Fault Tolerance**: If Frankenstein crashes (running experimental code), Doctor restarts it. If Doctor crashes, Bridge restarts it. The system self-heals.

2. **Performance**: Bridge handles high-volume message routing without blocking the AI components.

3. **Safety**: Experimental tools run in isolated Frankenstein process. Stable tools run in Igor.

4. **Learning**: Failure patterns in Igor automatically trigger tool creation in Frankenstein.

## Component Responsibilities

### Bridge (Port 7000)
The indestructible kernel. Handles all inter-component communication.

| Feature | Implementation |
|---------|---------------|
| Rate Limiting | Token bucket (100/sec, 200 burst) |
| Circuit Breakers | Per-component with failure thresholds |
| Connection Manager | Health scoring, reconnection logic |
| Dead Letter Queue | Failed messages for debugging |
| Seen Cache | Deduplication of messages |

### Doctor (Port 7001)
The orchestrator. Plans and coordinates all testing activity.

| Feature | Implementation |
|---------|---------------|
| Plan Generation | Converts intent to executable steps |
| Failure Tracking | Patterns by action/error/selector |
| Tool Requests | Auto-requests tools after threshold |
| Swarm Coordination | Manages parallel Igor instances |
| Experience System | Learns from past failures |

### Igor (Port 7002)
The executor. Runs the actual test steps.

| Feature | Implementation |
|---------|---------------|
| Plan Execution | Step-by-step with result reporting |
| Lightning Strike | Dumb → Claude escalation |
| Stable Toolkit | Pre-verified tools |
| Frank Manager | Spawns Frankenstein workers |

### Frankenstein (Port 7003)
The laboratory. Creates and runs experimental tools.

| Feature | Implementation |
|---------|---------------|
| Browser Control | Playwright integration |
| Dynamic Tools | Runtime compilation |
| Hot Reload | File watching with auto-reload |
| System Tools | Screenshot, mouse, keyboard |
| Tool Export | "Igorification" for stable tools |

## Message Flow

### Standard Test Execution
```
1. User → Doctor: "Test login flow"
2. Doctor → Igor: plan.submit {steps: [...]}
3. Igor → Doctor: plan.accepted
4. Igor → Doctor: step.completed (for each step)
5. Igor → Doctor: plan.completed
```

### Failure→Create Flow
```
1. Igor → Doctor: step.failed {error: "element not found", selector: "#btn"}
2. Doctor tracks pattern, increments counter
3. [After threshold reached]
4. Doctor → Frankenstein: tool.create {type: "smart_selector", ...}
5. Frankenstein compiles tool
6. Frankenstein → Doctor: tool.created {name: "auto_smart_selector_xyz"}
```

### Lightning Strike Escalation
```
1. Igor in dumb mode: pattern matching only
2. Igor fails 3 consecutive times
3. Igor → Lightning Strike: escalate to Claude mode
4. Igor uses Claude API for reasoning
5. Igor succeeds, remains in Claude mode
6. After success streak, returns to dumb mode
```

## Shared Infrastructure

Located in `tripartite/shared/`:

| File | Purpose |
|------|---------|
| `circuit-breaker.ts` | Failure isolation per component |
| `rate-limiter.ts` | Token bucket rate limiting |
| `connection-manager.ts` | Health scoring, reconnection |
| `dead-letter.ts` | Failed message storage |
| `experience.ts` | Learning from past runs |
| `tool-registry.ts` | Dynamic tool management |
| `validation.ts` | Message and tool validation |
| `logger.ts` | Structured logging |
| `metrics.ts` | Performance metrics |

## Running the Stack

### Full Stack
```bash
cd tripartite
./start.sh
```

### Individual Components
```bash
# Bridge (start first)
bun run tripartite/bridge/index.ts

# Doctor (after Bridge)
bun run tripartite/doctor/index.ts

# Igor (after Bridge)
bun run tripartite/igor/index.ts

# Frankenstein (after Bridge)
bun run tripartite/frankenstein/index.ts
```

### MCP Integration
```bash
# For Claude CLI integration
bun run tripartite/mcp-frank.ts
```

## Configuration

### Environment Variables
```bash
# Ports
BRIDGE_PORT=7000
DOCTOR_PORT=7001
IGOR_PORT=7002
FRANK_PORT=7003

# Feature Flags
FRANK_TOOL_CREATION_ENABLED=true
FAILURE_THRESHOLD_FOR_TOOL=2
LIGHTNING_AUTO_THRESHOLD=3

# API Keys (for Lightning Strike Claude mode)
ANTHROPIC_API_KEY=sk-ant-...
```

## Development Workflow

1. **Add new tool pattern**: Edit Doctor's `analyzeFailurePattern()` to recognize new error types

2. **Add stable tool**: Create in `igor/stable-toolkit.ts`, register in toolkit

3. **Add dynamic tool**: Use `frank_tools_create` MCP call or add to `frankenstein/dynamic-tools.ts`

4. **Test failure flow**: Use `tests/failure-create-flow.test.ts`

## Monitoring

### Health Endpoints
```bash
curl http://localhost:7000/health  # Bridge
curl http://localhost:7001/health  # Doctor
curl http://localhost:7002/health  # Igor
curl http://localhost:7003/health  # Frankenstein
```

### Status Endpoints
```bash
curl http://localhost:7001/frank   # Doctor's Frank integration status
curl http://localhost:7002/lightning  # Igor's Lightning Strike status
curl http://localhost:7003/tools   # Frankenstein's tool list
```

## Troubleshooting

### Component won't connect to Bridge
- Check Bridge is running first
- Verify port is not in use: `lsof -i :7000`
- Check circuit breaker state: `curl http://localhost:7000/health`

### Tools not being created
- Verify `FRANK_TOOL_CREATION_ENABLED=true`
- Check threshold: default is 2 failures
- Check Doctor's failure tracking: `curl http://localhost:7001/frank`

### Lightning Strike not escalating
- Verify `ANTHROPIC_API_KEY` is set
- Check threshold: default is 3 failures
- Check Igor status: `curl http://localhost:7002/lightning`
