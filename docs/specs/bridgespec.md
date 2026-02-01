# Bridge Specification

**Component:** Bridge
**Role:** Microkernel Supervisor & Observability Gateway
**Language:** Dart | Rust | Go (language-agnostic, pick one)

---

## Purpose

Bridge is the **sole MCP endpoint** that Claude connects to. It acts as a transparent proxy between Claude and Doctor, while providing lifecycle management and observability infrastructure.

Bridge knows nothing about testing, browsers, databases, or any domain logic. It only understands:
- Bytes flowing in/out
- Processes living/dying
- Events worth broadcasting

---

## Architecture Position

```
Claude (MCP Client)
       │
       │ stdio (JSON-RPC 2.0)
       ▼
┌─────────────────────────────────────┐
│              BRIDGE                  │
│  ┌─────────┐ ┌─────────┐ ┌───────┐ │
│  │  Proxy  │ │Lifecycle│ │ Obsrv │ │
│  └─────────┘ └─────────┘ └───────┘ │
└─────────────────┬───────────────────┘
                  │ stdio
                  ▼
              DOCTOR
```

---

## Core Responsibilities

### 1. MCP Proxy (Priority: Critical)

```
INPUT:  stdin from Claude (JSON-RPC requests)
OUTPUT: stdout to Claude (JSON-RPC responses)
RELAY:  Bidirectional pipe to Doctor subprocess
```

**Requirements:**
- Zero modification of messages (transparent proxy)
- Buffer management for high-throughput
- Graceful handling of malformed JSON (log + skip, don't crash)
- Backpressure handling if Doctor is slow

**Non-Requirements:**
- Message validation (Doctor's job)
- Tool routing (Doctor's job)
- Response generation (Doctor's job)

### 2. Lifecycle Manager (Priority: Critical)

**Managed Processes:**
| Process | Restart Policy | Max Restarts | Cooldown |
|---------|---------------|--------------|----------|
| Doctor  | Always        | 10 in 60s    | 1s       |

**Lifecycle Events:**
```
doctor:starting    - About to spawn Doctor
doctor:ready       - Doctor sent ready signal
doctor:crashed     - Doctor exited unexpectedly
doctor:restarting  - Attempting restart
doctor:fatal       - Max restarts exceeded, Bridge exits
```

**Startup Sequence:**
1. Bridge starts
2. Bridge spawns Doctor as subprocess
3. Doctor sends `{"ready": true}` on stdout
4. Bridge marks Doctor as healthy
5. Bridge begins proxying MCP traffic

**Crash Recovery:**
1. Doctor exits (any reason)
2. Bridge detects via process exit event
3. Bridge emits `doctor:crashed` event
4. Bridge waits cooldown period
5. Bridge spawns new Doctor
6. Resume from step 3

**Graceful Shutdown:**
1. Bridge receives SIGTERM/SIGINT
2. Bridge sends SIGTERM to Doctor
3. Bridge waits up to 5s for Doctor to exit
4. Bridge sends SIGKILL if still running
5. Bridge exits 0

### 3. Observability Server (Priority: High)

**Transport:** WebSocket on configurable port (default: 3334)

**Event Stream (Bridge → Dashboard):**
```typescript
interface BridgeEvent {
  ts: number;           // Unix timestamp ms
  type: string;         // Event type
  data?: any;           // Event payload
}

// Event Types:
"mcp:request"       // Tool call from Claude
"mcp:response"      // Tool response to Claude
"doctor:starting"   // Lifecycle event
"doctor:ready"      // Lifecycle event
"doctor:crashed"    // Lifecycle event
"bridge:stats"      // Periodic stats (every 5s)
```

**Command Channel (Dashboard → Bridge):**
```typescript
interface BridgeCommand {
  id: string;           // Command ID for ack
  action: string;       // Command type
  params?: any;         // Command parameters
}

// Supported Commands:
"doctor:restart"    // Force restart Doctor
"doctor:kill"       // Kill Doctor (no restart)
"bridge:pause"      // Stop forwarding to Doctor
"bridge:resume"     // Resume forwarding
"bridge:shutdown"   // Graceful shutdown
"bridge:stats"      // Request immediate stats
```

**Stats Payload:**
```typescript
interface BridgeStats {
  uptime: number;           // Bridge uptime in seconds
  doctorRestarts: number;   // Total Doctor restarts
  doctorUptime: number;     // Current Doctor uptime
  messagesIn: number;       // Total MCP requests
  messagesOut: number;      // Total MCP responses
  bytesIn: number;          // Total bytes from Claude
  bytesOut: number;         // Total bytes to Claude
  dashboardClients: number; // Connected dashboards
}
```

---

## Configuration

**Environment Variables:**
```bash
BRIDGE_DOCTOR_CMD="bun run doctor/index.ts"  # Command to start Doctor
BRIDGE_DOCTOR_CWD="/path/to/barrhawk"        # Working directory
BRIDGE_OBS_PORT=3334                          # Observability port
BRIDGE_OBS_ENABLED=true                       # Enable/disable dashboard
BRIDGE_MAX_RESTARTS=10                        # Max restarts before fatal
BRIDGE_RESTART_WINDOW=60                      # Window for max restarts (seconds)
BRIDGE_RESTART_COOLDOWN=1000                  # Cooldown between restarts (ms)
BRIDGE_LOG_LEVEL=info                         # debug|info|warn|error
```

**Config File (optional):** `bridge.config.json`
```json
{
  "doctor": {
    "command": "bun",
    "args": ["run", "doctor/index.ts"],
    "cwd": "/path/to/barrhawk",
    "env": {}
  },
  "observability": {
    "enabled": true,
    "port": 3334,
    "host": "127.0.0.1"
  },
  "lifecycle": {
    "maxRestarts": 10,
    "restartWindow": 60,
    "cooldown": 1000
  }
}
```

---

## Interface Contracts

### MCP Interface (stdio)

Bridge implements MCP server protocol:
- Receives JSON-RPC 2.0 requests on stdin
- Sends JSON-RPC 2.0 responses on stdout
- Stderr reserved for Bridge's own logs

### Doctor Interface (subprocess stdio)

Bridge spawns Doctor and communicates via:
- Doctor stdin: receives JSON-RPC from Bridge
- Doctor stdout: sends JSON-RPC to Bridge
- Doctor stderr: captured and logged by Bridge

**Special Messages from Doctor:**
```json
{"ready": true}              // Doctor initialized
{"health": "ok"}             // Heartbeat response
{"shutdown": "graceful"}     // Doctor requesting restart
```

### Dashboard Interface (WebSocket)

```
ws://localhost:3334/events   // Event stream
ws://localhost:3334/control  // Command channel
```

---

## Error Handling

| Error | Action |
|-------|--------|
| Doctor won't start | Retry up to maxRestarts, then exit 1 |
| Doctor crashes | Restart with cooldown |
| Malformed MCP JSON | Log warning, skip message |
| Dashboard disconnect | Clean up, continue operating |
| stdin EOF | Graceful shutdown |
| SIGTERM/SIGINT | Graceful shutdown |
| SIGKILL | Immediate exit |

---

## Security Considerations

1. **Dashboard binding:** Default to 127.0.0.1 only
2. **No auth by default:** Dashboard is local-only
3. **Optional auth:** Token-based for remote access
4. **No secrets in events:** Redact sensitive tool params
5. **Process isolation:** Doctor runs as same user (no escalation)

---

## Implementation Size Target

| Language | Target LOC | Target Binary |
|----------|-----------|---------------|
| Rust     | ~300      | ~2MB          |
| Go       | ~250      | ~5MB          |
| Dart     | ~200      | ~10MB         |

Bridge should be **auditable in one sitting**. If it exceeds 500 LOC, it's doing too much.

---

## Testing Requirements

1. **Unit Tests:**
   - JSON-RPC parsing
   - Event serialization
   - Restart logic

2. **Integration Tests:**
   - Full proxy round-trip
   - Crash recovery
   - Dashboard connection

3. **Stress Tests:**
   - 1000 msg/sec throughput
   - Rapid Doctor crashes
   - Many dashboard clients

---

## Non-Goals

Bridge does NOT:
- Parse or validate tool calls
- Route requests to specific tools
- Generate responses
- Know what Igor is
- Understand test results
- Make decisions about anything

Bridge is **infrastructure**, not **application**.
