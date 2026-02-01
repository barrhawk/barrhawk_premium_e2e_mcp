# Frank: The Complete Guide to the Tripartite Architecture

## Overview

The BarrHawk tripartite architecture is a distributed system for intelligent E2E testing. It consists of four components that communicate through a central message bus.

```
┌─────────────────────────────────────────────────────────────────┐
│                     BRIDGE (Port 7000)                          │
│                    The Nervous System                           │
│  • WebSocket message bus                                        │
│  • Routes messages between components                           │
│  • Deduplication, dead letter queue, rate limiting              │
└────────────────────┬───────────────────────────────────────────┘
                     │
       ┌─────────────┼─────────────┬─────────────┐
       │             │             │             │
       ▼             ▼             ▼             ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│   DOCTOR    │ │    IGOR     │ │ FRANKENSTEIN│ │ DASHBOARD   │
│  Port 7001  │ │  Port 7002  │ │  Port 7003  │ │  Port 3333  │
│             │ │             │ │             │ │             │
│  The Mind   │ │  The Face   │ │  The Body   │ │  The Eyes   │
│  • Plans    │ │  • Executes │ │  • Browser  │ │  • Monitor  │
│  • Learns   │ │  • Retries  │ │  • Tools    │ │  • Observe  │
│  • Adapts   │ │  • Reports  │ │  • Reload   │ │  • Control  │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

## Why This Architecture?

### Problem
Traditional E2E testing is brittle:
- Selectors break when UI changes
- No learning from past failures
- Same errors repeat across test runs
- No adaptation to new UI patterns

### Solution
The tripartite architecture separates concerns:
1. **Doctor** plans and learns from experience
2. **Igor** executes reliably with retries
3. **Frankenstein** provides dynamic tool creation
4. **Bridge** ensures reliable communication

When Igor fails at a task, Doctor can ask Frankenstein to create a new tool on-the-fly. This tool can then be used for retry attempts and future test runs.

---

## Component Details

### Bridge (Port 7000)
**Role**: Message bus and supervisor

**Responsibilities**:
- Accept WebSocket connections from components
- Route messages based on target
- Deduplicate messages (prevent replay attacks)
- Queue undeliverable messages (dead letter queue)
- Rate limit connections
- Track component health via heartbeats

**Key Features**:
```
• Circular buffer for message history (no memory leaks)
• Per-component circuit breakers
• Memory pressure load shedding
• Correlation ID tracing
• Version compatibility checking
```

**HTTP Endpoints**:
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Bridge health status |
| `/components` | GET | Connected components |
| `/metrics` | GET | Message metrics |
| `/dlq` | GET | Dead letter queue |

---

### Doctor (Port 7001)
**Role**: Orchestrator and planner

**Responsibilities**:
- Interpret test intents (natural language → plan)
- Generate execution plans with steps
- Track failure patterns
- Request tool creation from Frankenstein
- Learn from experience (selector failures, error patterns)
- Manage Igor pool for parallel execution

**Key Features**:
```
• Failure→Create Flow: Auto-requests tools when Igor fails
• Experience Manager: Learns from past runs
• Branch Detection: Parallel testing of different user flows
• Tool Bag Selection: Chooses optimal tools per intent
```

**HTTP Endpoints**:
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Doctor health |
| `/igors` | GET | Igor pool status |
| `/plans` | GET | Active plans |
| `/branches` | GET | Branching plans |
| `/frank` | GET | Failure→Create flow status |
| `/plan` | POST | Submit test intent |
| `/plan/:id` | GET | Get plan status |

**Failure→Create Flow Configuration**:
| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `FRANK_TOOL_CREATION_ENABLED` | `true` | Enable auto tool creation |
| `FAILURE_THRESHOLD_FOR_TOOL` | `2` | Failures before requesting tool |

---

### Igor (Port 7002)
**Role**: Worker and executor

**Responsibilities**:
- Receive plans from Doctor
- Execute steps sequentially
- Retry failed steps with exponential backoff
- Report progress (step.started, step.completed, step.failed)
- Query Frankenstein for helper tools before retrying
- Lightning Strike mode: escalate to Claude API on repeated failures

**Key Features**:
```
• Stable Toolkit: Proven tools for common actions
• Lightning Strike: Dumb mode → Claude mode elevation
• Frank Integration: Uses dynamic tools for failures
• Circuit Breaker: Protects against Frankenstein failures
```

**Lightning Strike System**:
When Igor fails repeatedly, it can "strike" to Claude mode:
```
Dumb Mode: Just executes steps mechanically
     │
     ▼ (after N consecutive failures)
Claude Mode: Can think and reason about problems
```

**HTTP Endpoints**:
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Igor health |
| `/lightning` | GET | Lightning Strike status |
| `/execute` | POST | Execute a plan |

---

### Frankenstein (Port 7003)
**Role**: Dynamic tool creator and browser controller

**Responsibilities**:
- Launch and manage browsers (Playwright)
- Create dynamic tools at runtime
- Hot reload tool code without restart
- Execute browser commands (navigate, click, type)
- Export successful tools for "igorification"
- System-level automation (screenshots, mouse, keyboard)

**Key Features**:
```
• Dynamic Tool Registry: Create tools from code at runtime
• Hot Reloading: Update tools without restart
• Tool Lifecycle: experimental → stable → igorified
• System Tools: Desktop automation (ydotool, grim)
```

**HTTP Endpoints**:
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Frankenstein health |
| `/tools` | GET | List dynamic tools |

**Tool Lifecycle**:
```
1. EXPERIMENTAL (new tool, untested)
      │
      ▼ (after 5 successful invocations)
2. STABLE (proven to work)
      │
      ▼ (manually exported)
3. IGORIFIED (added to Igor's stable toolkit)
```

---

### Dashboard-Min (Port 3333)
**Role**: Centralized observability

**Responsibilities**:
- Monitor all component health in real-time
- Subscribe to Bridge WebSocket for live events
- Display Failure→Create flow metrics
- Show dynamic tools from Frankenstein
- Provide single pane of glass for the tripartite system

**Key Features**:
```
• Real-time WebSocket connection to Bridge
• Component health panels (Bridge, Doctor, Igor, Frank)
• Failure→Create metrics (requests, successes, failures, rate)
• Live event stream from Bridge
• Dynamic tools list from Frankenstein
```

**HTTP Endpoints**:
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Dashboard UI |
| `/health` | GET | Dashboard health + component status |
| `/api/state` | GET | Full system state JSON |
| `/ws` | WS | Real-time updates |

**Starting**:
```bash
# Standalone
bun run packages/dashboard-min/server.ts

# With tripartite stack
./start.sh --with-dashboard
# or
./start.sh -d
```

---

## Message Flow

### Normal Execution Flow
```
User Intent: "Login to example.com with test@test.com"
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Doctor receives intent via POST /plan                     │
│ 2. Doctor generates plan:                                    │
│    - navigate to example.com                                 │
│    - type test@test.com into #email                         │
│    - type password into #password                           │
│    - click #login                                            │
│ 3. Doctor sends plan.submit to Igor via Bridge              │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Igor receives plan, sends plan.accepted                   │
│ 5. Igor executes each step:                                  │
│    - Sends step.started                                      │
│    - Calls Frankenstein (browser.navigate, browser.type)     │
│    - Sends step.completed                                    │
│ 6. Igor sends plan.completed                                 │
└─────────────────────────────────────────────────────────────┘
```

### Failure→Create Flow
```
Step fails: "element not found: #login-btn"
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Igor sends step.failed to Doctor                          │
│ 2. Doctor tracks failure pattern:                            │
│    key: "click:#login-btn:element not found"                │
│    occurrences: 1                                            │
└─────────────────────────────────────────────────────────────┘
         │
         ▼ (same failure occurs again)
┌─────────────────────────────────────────────────────────────┐
│ 3. Doctor sees occurrences >= threshold (2)                  │
│ 4. Doctor analyzes error: matches "smart_selector" pattern   │
│ 5. Doctor generates tool spec                                │
│ 6. Doctor sends tool.create to Frankenstein                  │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Frankenstein compiles tool code                           │
│ 8. Frankenstein registers tool in registry                   │
│ 9. Frankenstein sends tool.created to Doctor                 │
└─────────────────────────────────────────────────────────────┘
         │
         ▼ (next retry)
┌─────────────────────────────────────────────────────────────┐
│ 10. Igor queries Frankenstein: tool.list                     │
│ 11. Igor finds matching helper tool                          │
│ 12. Igor invokes tool: tool.invoke                           │
│ 13. Tool returns alternative selector                        │
│ 14. Igor retries step with new selector                      │
│ 15. Step succeeds!                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Message Types

### Lifecycle Messages
| Type | Direction | Description |
|------|-----------|-------------|
| `component.register` | Any → Bridge | Register component |
| `heartbeat` | Bridge → All | Health check |
| `version.announce` | Any → Bridge | Version notification |

### Planning Messages
| Type | Direction | Description |
|------|-----------|-------------|
| `plan.submit` | Doctor → Igor | Send plan for execution |
| `plan.accepted` | Igor → Doctor | Plan accepted |
| `plan.rejected` | Igor → Doctor | Plan rejected |
| `plan.completed` | Igor → Doctor | Plan finished |
| `plan.cancel` | Doctor → Igor | Cancel running plan |

### Execution Messages
| Type | Direction | Description |
|------|-----------|-------------|
| `step.started` | Igor → Doctor | Step execution started |
| `step.completed` | Igor → Doctor | Step succeeded |
| `step.failed` | Igor → Doctor | Step failed |
| `step.retrying` | Igor → Doctor | Step retrying |

### Browser Messages
| Type | Direction | Description |
|------|-----------|-------------|
| `browser.launch` | Igor → Frank | Launch browser |
| `browser.navigate` | Igor → Frank | Navigate to URL |
| `browser.click` | Igor → Frank | Click element |
| `browser.type` | Igor → Frank | Type into element |
| `browser.screenshot` | Igor → Frank | Take screenshot |

### Tool Messages
| Type | Direction | Description |
|------|-----------|-------------|
| `tool.create` | Doctor → Frank | Create new tool |
| `tool.created` | Frank → Doctor | Tool created |
| `tool.invoke` | Igor → Frank | Invoke tool |
| `tool.invoked` | Frank → Igor | Tool result |
| `tool.list` | Igor → Frank | List tools |
| `tool.listed` | Frank → Igor | Tool list |
| `tool.error` | Frank → Any | Tool operation failed |

---

## Monitoring

### Dashboard-Min (Recommended)
```bash
# Start the dashboard with tripartite stack
./start.sh --with-dashboard

# Open in browser
open http://localhost:3333
```

The dashboard provides a single pane of glass for:
- All component health status
- Failure→Create flow metrics
- Live Bridge events
- Dynamic tools list

### Check System Health (CLI)
```bash
# All components
curl http://localhost:7000/health  # Bridge
curl http://localhost:7001/health  # Doctor
curl http://localhost:7002/health  # Igor
curl http://localhost:7003/health  # Frankenstein
curl http://localhost:3333/health  # Dashboard (aggregated)
```

### Check Failure→Create Status
```bash
curl http://localhost:7001/frank | jq .
```

Response:
```json
{
  "config": {
    "enabled": true,
    "failureThreshold": 2
  },
  "metrics": {
    "toolCreationRequests": 5,
    "toolCreationSuccesses": 4,
    "toolCreationFailures": 1,
    "successRate": "80.0%",
    "avgCreationLatencyMs": 127
  },
  "failurePatterns": {
    "total": 3,
    "withTools": 2,
    "pending": 0,
    "patterns": [...]
  }
}
```

### Check Available Frank Tools
```bash
curl http://localhost:7003/tools | jq .
```

### View Message Flow
```bash
# Bridge message metrics
curl http://localhost:7000/metrics | jq .
```

---

## Tool-Worthy Error Patterns

Doctor recognizes these error patterns and creates appropriate tools:

| Error Pattern | Tool Type | What It Does |
|--------------|-----------|--------------|
| `element not found`, `selector not found` | `smart_selector` | Tries multiple selector strategies |
| `timeout`, `timed out`, `waiting for` | `wait_helper` | Enhanced polling/waiting |
| `popup`, `modal`, `dialog`, `overlay` | `popup_handler` | Dismisses blocking elements |
| `dropdown`, `select`, `combobox` | `dropdown_handler` | Handles various dropdowns |
| `iframe`, `frame`, `shadow` | `frame_handler` | Navigates frames/shadow DOM |
| `navigation`, `page load`, `network` | `network_helper` | Network wait strategies |
| `scroll`, `viewport`, `visible` | `visibility_helper` | Scroll into view helpers |
| `captcha`, `recaptcha`, `challenge` | `captcha_handler` | Challenge detection |
| `date`, `calendar`, `picker` | `date_picker` | Date picker automation |
| `upload`, `file input` | `file_upload` | File upload handling |

---

## Configuration Reference

### Bridge
| Variable | Default | Description |
|----------|---------|-------------|
| `BRIDGE_PORT` | `7000` | HTTP/WebSocket port |
| `BRIDGE_AUTH_TOKEN` | `` | Auth token (empty = disabled) |
| `MAX_CONNECTIONS` | `100` | Max WebSocket connections |
| `RATE_LIMIT_PER_SECOND` | `100` | Messages per second limit |

### Doctor
| Variable | Default | Description |
|----------|---------|-------------|
| `DOCTOR_PORT` | `7001` | HTTP port |
| `BRIDGE_URL` | `ws://localhost:7000` | Bridge WebSocket URL |
| `FRANK_TOOL_CREATION_ENABLED` | `true` | Enable auto tool creation |
| `FAILURE_THRESHOLD_FOR_TOOL` | `2` | Failures before tool request |
| `MAX_ACTIVE_PLANS` | `100` | Maximum concurrent plans |

### Igor
| Variable | Default | Description |
|----------|---------|-------------|
| `IGOR_PORT` | `7002` | HTTP port |
| `LIGHTNING_ENABLED` | `true` | Enable Lightning Strike |
| `LIGHTNING_AUTO_THRESHOLD` | `3` | Failures before auto-strike |
| `ANTHROPIC_API_KEY` | `` | Required for Claude mode |

### Frankenstein
| Variable | Default | Description |
|----------|---------|-------------|
| `FRANKENSTEIN_PORT` | `7003` | HTTP port |
| `MAX_BROWSERS` | `3` | Maximum browser instances |
| `BROWSER_IDLE_TIMEOUT` | `300000` | Idle browser eviction (5 min) |

---

## File Structure

```
tripartite/
├── bridge/
│   └── index.ts          # Bridge server
├── doctor/
│   ├── index.ts          # Doctor server (includes failure→create)
│   └── swarm.ts          # Swarm mode (parallel Igors)
├── igor/
│   ├── index.ts          # Igor server (includes Frank integration)
│   ├── stable-toolkit.ts # Stable tool definitions
│   └── frank-manager.ts  # Frank worker pool
├── frankenstein/
│   ├── index.ts          # Frankenstein server
│   ├── dynamic-tools.ts  # Dynamic tool registry
│   └── system-tools.ts   # Desktop automation
├── shared/
│   ├── types.ts          # Message types, interfaces
│   ├── client.ts         # Bridge client (used by all)
│   ├── validation.ts     # Input validation
│   ├── errors.ts         # Error types
│   ├── logger.ts         # Structured logging
│   ├── experience.ts     # Experience manager
│   └── tool-registry.ts  # Tool definitions
├── tests/
│   └── failure-create-flow.test.ts
├── start.sh              # Start all components
├── README.md             # Quick start guide
└── frank.md              # This file
```

---

## Testing

### Run Tests
```bash
# Failure→Create flow tests
bun test tests/failure-create-flow.test.ts
```

### Manual Testing
```bash
# Submit a test intent
curl -X POST http://localhost:7001/plan \
  -H "Content-Type: application/json" \
  -d '{"intent": "Navigate to example.com and click the login button", "url": "https://example.com"}'

# Watch the plan execute
watch -n 1 'curl -s http://localhost:7001/plans | jq .'
```

---

## Troubleshooting

### Component Not Connecting
1. Check Bridge is running: `curl http://localhost:7000/health`
2. Check WebSocket URL: Should be `ws://localhost:7000`
3. Check auth token matches (if enabled)

### Tools Not Being Created
1. Check feature is enabled: `curl http://localhost:7001/frank | jq .config`
2. Check failure threshold: May need more failures
3. Check error pattern: Must match a tool-worthy pattern

### Igor Not Using Frank Tools
1. Check Frankenstein has tools: `curl http://localhost:7003/tools`
2. Check Igor → Frank connection: Both should show `bridgeConnected: true`
3. Check circuit breaker: May be open from previous failures

---

## Summary

The tripartite architecture enables:

1. **Separation of Concerns**: Planning (Doctor), Execution (Igor), Capabilities (Frank)
2. **Automatic Learning**: Failure patterns trigger tool creation
3. **Graceful Degradation**: Components can fail independently
4. **Extensibility**: New tools can be created at runtime
5. **Observability**: Full message tracing and metrics

**The key innovation is the Failure→Create Flow**: When Igor fails, Doctor automatically creates a tool to help, and Igor uses it on retry. This makes the system self-healing for common UI testing problems.
