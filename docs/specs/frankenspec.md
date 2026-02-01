# Frankenspec: The Complete Monster

**System:** BarrHawk MCP
**Codename:** Frankenstein
**Status:** Assembled from parts, ready to terrorize the village

---

## The Monster Lives

```
                            ╔═══════════════════════════════════════╗
                            ║           C L A U D E                 ║
                            ║        (The Mad Scientist)            ║
                            ╚═══════════════════╦═══════════════════╝
                                                ║
                                          stdio MCP
                                                ║
╔═══════════════════════════════════════════════╩═══════════════════════════════════════════════╗
║                                                                                                ║
║                              F R A N K E N S T E I N                                          ║
║                                  (The Monster)                                                 ║
║                                                                                                ║
║  ┌─────────────────────────────────────────────────────────────────────────────────────────┐  ║
║  │                                    BRIDGE                                                │  ║
║  │                              (The Bolts in the Neck)                                     │  ║
║  │                                                                                          │  ║
║  │    ┌──────────────┐       ┌──────────────┐       ┌──────────────┐                      │  ║
║  │    │  MCP Proxy   │       │  Lifecycle   │       │ Observability│◀───── Dashboard     │  ║
║  │    │  stdin/out   │       │   Manager    │       │   Gateway    │      (WebSocket)    │  ║
║  │    └──────┬───────┘       └──────┬───────┘       └──────────────┘                      │  ║
║  │           │                      │                                                      │  ║
║  └───────────┼──────────────────────┼──────────────────────────────────────────────────────┘  ║
║              │                      │                                                          ║
║              │ stdio                │ spawn/kill                                               ║
║              ▼                      ▼                                                          ║
║  ┌─────────────────────────────────────────────────────────────────────────────────────────┐  ║
║  │                                    DOCTOR                                                │  ║
║  │                                  (The Brain)                                             │  ║
║  │                                                                                          │  ║
║  │    ┌──────────────┐       ┌──────────────┐       ┌──────────────┐                      │  ║
║  │    │    Intent    │       │   Tool Bag   │       │    Swarm     │                      │  ║
║  │    │   Analyzer   │──────▶│   Curator    │──────▶│   Control    │                      │  ║
║  │    └──────────────┘       └──────────────┘       └──────┬───────┘                      │  ║
║  │                                                         │                               │  ║
║  │                           ┌─────────────────────────────┼─────────────────────────┐    │  ║
║  │                           │                             │                         │    │  ║
║  └───────────────────────────┼─────────────────────────────┼─────────────────────────┼────┘  ║
║                              │                             │                         │        ║
║                        spawn │                       spawn │                   spawn │        ║
║                              ▼                             ▼                         ▼        ║
║  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐     ║
║  │      IGOR 1      │  │      IGOR 2      │  │      IGOR 3      │  │      IGOR N      │     ║
║  │   (The Hands)    │  │   (The Hands)    │  │   (The Hands)    │  │   (The Hands)    │     ║
║  │                  │  │                  │  │                  │  │                  │     ║
║  │  ┌────────────┐  │  │  ┌────────────┐  │  │  ┌────────────┐  │  │  ┌────────────┐  │     ║
║  │  │  Browser   │  │  │  │  Database  │  │  │  │   GitHub   │  │  │  │   Docker   │  │     ║
║  │  │  Tools     │  │  │  │  Tools     │  │  │  │   Tools    │  │  │  │   Tools    │  │     ║
║  │  └────────────┘  │  │  └────────────┘  │  │  └────────────┘  │  │  └────────────┘  │     ║
║  └──────────────────┘  └──────────────────┘  └──────────────────┘  └──────────────────┘     ║
║                                                                                                ║
╚════════════════════════════════════════════════════════════════════════════════════════════════╝
                                                ▲
                                                ║
                                          WebSocket
                                                ║
                            ╔═══════════════════╩═══════════════════╗
                            ║          D A S H B O A R D            ║
                            ║      (The Villagers Watching)         ║
                            ╚═══════════════════════════════════════╝
```

---

## Component Summary

| Component | Role | Language | Process | Spec |
|-----------|------|----------|---------|------|
| **Bridge** | Microkernel supervisor | Dart/Rust/Go | 1 (main) | [bridgespec.md](./bridgespec.md) |
| **Doctor** | Brain, orchestrator | TypeScript (Bun) | 1 (child of Bridge) | [doctorspec.md](./doctorspec.md) |
| **Igor** | Hands, executor | TypeScript (Bun) | 0-N (children of Doctor) | [igorspec.md](./igorspec.md) |
| **Dashboard** | Eyes, observer | Web (any) | External | N/A |

---

## Communication Flows

### 1. Normal Tool Call

```
Claude ──MCP──▶ Bridge ──stdio──▶ Doctor ──stdio──▶ Igor
                                                      │
                                                  (execute)
                                                      │
Claude ◀──MCP── Bridge ◀──stdio── Doctor ◀──stdio────┘
```

### 2. Swarm Execution

```
Claude ──MCP──▶ Bridge ──stdio──▶ Doctor
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
                 Igor 1          Igor 2          Igor 3
                    │               │               │
                (browser)       (database)      (github)
                    │               │               │
                    └───────────────┼───────────────┘
                                    ▼
Claude ◀──MCP── Bridge ◀──stdio── Doctor (aggregates)
```

### 3. Dashboard Observation

```
Bridge ────────────┬────────────▶ Dashboard
    │              │                  │
    │         (events)           (commands)
    │              │                  │
    │              │                  ▼
    │              │            "kill igor-2"
    │              │                  │
    └──────────────┼──────────────────┘
                   │
              Doctor ──▶ kill Igor 2
```

---

## Startup Sequence

```
┌─────┐      ┌────────┐      ┌────────┐      ┌────────┐
│ t=0 │      │ t=50ms │      │t=150ms │      │t=200ms │
└──┬──┘      └───┬────┘      └───┬────┘      └───┬────┘
   │             │               │               │
   ▼             ▼               ▼               ▼
Bridge        Doctor          Doctor          Bridge
starts        spawned         ready           ready
   │             │               │               │
   │             │               │               ▼
   │             │               │          Claude can
   │             │               │          connect
   │             │               │
   └─────────────┴───────────────┴───────────────
```

**Detailed Sequence:**
1. `bridge` binary starts
2. Bridge reads config
3. Bridge spawns Doctor: `bun run doctor/index.ts`
4. Doctor initializes tool registry
5. Doctor sends `{"ready": true}` to Bridge
6. Bridge marks system healthy
7. Bridge begins accepting MCP on stdin
8. (Optional) Dashboard connects to Bridge:3334

---

## Shutdown Sequence

```
SIGTERM
   │
   ▼
Bridge
   │
   ├──▶ Sends SIGTERM to Doctor
   │         │
   │         ├──▶ Doctor sends shutdown to all Igors
   │         │         │
   │         │         └──▶ Igors cleanup + exit
   │         │
   │         └──▶ Doctor cleanup + exit
   │
   └──▶ Bridge cleanup + exit
```

**Timeouts:**
- Igors: 3s to cleanup
- Doctor: 5s to cleanup (includes waiting for Igors)
- Bridge: 7s to cleanup (includes waiting for Doctor)
- After timeout: SIGKILL

---

## Process Tree

```
bridge (PID 1000)
└── doctor (PID 1001)
    ├── igor-001 (PID 1002)
    ├── igor-002 (PID 1003)
    ├── igor-003 (PID 1004)
    └── ...
```

---

## Failure Modes & Recovery

### Igor Crashes

```
Igor dies
    │
    ▼
Doctor detects (process exit)
    │
    ├──▶ Task was running? → Retry on new Igor or return error
    │
    └──▶ Spawn replacement Igor if pool not full
```

**Impact:** Single task may fail, system continues

### Doctor Crashes

```
Doctor dies
    │
    ▼
Bridge detects (process exit)
    │
    ├──▶ All Igors orphaned (auto-die)
    │
    ├──▶ Bridge restarts Doctor
    │
    └──▶ Doctor spawns fresh Igors
```

**Impact:** All in-flight tasks lost, 100-200ms recovery

### Bridge Crashes

```
Bridge dies
    │
    ▼
All children die (process group)
    │
    ▼
Claude MCP connection lost
    │
    ▼
User must restart manually (or systemd restarts)
```

**Impact:** Full system down, requires external restart

---

## Configuration Hierarchy

```
bridge.config.json          (Bridge reads)
    │
    └──▶ doctor.config.json (Doctor reads)
             │
             └──▶ barrhawk.config.json (Tools read)
```

**Environment Variable Precedence:**
```
1. Explicit env var (highest)
2. Config file
3. Default value (lowest)
```

---

## Tool Count by Domain

| Domain | Tools | Owner |
|--------|-------|-------|
| Browser | 36 | Igor |
| Database | 18 | Igor |
| GitHub | 18 | Igor |
| Docker | 18 | Igor |
| Filesystem | 19 | Igor |
| Orchestration | 10 | Doctor |
| Meta-MCP | 10 | Doctor |
| Utility | ~20 | Igor |
| **Total** | **~150** | |

---

## Data Flow Examples

### Example 1: Simple Browser Test

```
Claude: "Click the login button"

1. Claude → Bridge: {"method":"tools/call","params":{"name":"browser_click"}}
2. Bridge → Doctor: (forward)
3. Doctor: Intent = simple browser action
4. Doctor → Igor-1: {"tool":"browser_click","args":{"selector":"#login"}}
5. Igor-1: page.click("#login")
6. Igor-1 → Doctor: {"status":"success","result":{...}}
7. Doctor → Bridge: (forward)
8. Bridge → Claude: {"result":{...}}

Total: ~150ms
```

### Example 2: Swarm Test Run

```
Claude: "Run accessibility audit on 10 pages"

1. Claude → Bridge: {"method":"tools/call","params":{"name":"swarm_accessibility"}}
2. Bridge → Doctor: (forward)
3. Doctor: Intent = swarm, 10 subtasks
4. Doctor: Spawn Igor-1 through Igor-10
5. Doctor → Igor-*: Each gets one page to audit
6. Igor-*: (parallel execution)
7. Igor-* → Doctor: Results stream in
8. Doctor: Aggregate all results
9. Doctor → Bridge: {"result":{"pages":10,"issues":47,...}}
10. Bridge → Claude: (forward)

Total: ~5s (parallel) vs ~50s (sequential)
```

### Example 3: Dashboard Kill Command

```
Dashboard: "Kill igor-003"

1. Dashboard → Bridge: {"action":"igor:kill","params":{"id":"igor-003"}}
2. Bridge → Doctor: {"command":"kill_igor","id":"igor-003"}
3. Doctor: process.kill(igor003.pid, "SIGTERM")
4. Igor-003: cleanup + exit
5. Doctor → Bridge: {"event":"igor:terminated","id":"igor-003"}
6. Bridge → Dashboard: (broadcast)
```

---

## Observability Events

All events flow: `Igor → Doctor → Bridge → Dashboard`

```typescript
// Igor events
"igor:ready"           // Igor initialized
"igor:task_start"      // Started executing task
"igor:task_end"        // Finished task (success or error)
"igor:resource_warn"   // High memory/CPU
"igor:dying"           // About to exit

// Doctor events
"doctor:ready"         // Doctor initialized
"doctor:igor_spawned"  // New Igor created
"doctor:igor_died"     // Igor exited
"doctor:swarm_start"   // Swarm task began
"doctor:swarm_end"     // Swarm task complete
"doctor:tool_reload"   // Hot reload triggered

// Bridge events
"bridge:doctor_start"  // Doctor spawned
"bridge:doctor_ready"  // Doctor sent ready
"bridge:doctor_crash"  // Doctor died
"bridge:mcp_request"   // Incoming from Claude
"bridge:mcp_response"  // Outgoing to Claude
"bridge:stats"         // Periodic stats
```

---

## Security Model

```
┌─────────────────────────────────────────────────┐
│                 TRUST BOUNDARY                   │
│                                                  │
│  Claude ◀═══════════▶ Bridge                    │
│                          │                       │
│                     (same user)                  │
│                          │                       │
│                       Doctor                     │
│                          │                       │
│                     (same user)                  │
│                          │                       │
│                       Igors                      │
│                                                  │
└─────────────────────────────────────────────────┘
```

**Principles:**
1. All processes run as same user
2. No privilege escalation
3. No network listeners except Dashboard (localhost only by default)
4. Credentials passed per-task, not stored
5. Igors are isolated from each other (separate processes)

---

## Resource Limits

| Resource | Limit | Enforced By |
|----------|-------|-------------|
| Max Igors | 32 | Doctor |
| Igor memory | 512MB | OS/cgroups |
| Task timeout | 30s default | Doctor |
| Browser pages per Igor | 10 | Igor |
| DB connections per Igor | 5 | Igor |

---

## Deployment Options

### Option 1: Single Binary (Ideal)

```bash
# Rust Bridge, bundled Doctor+Igor
./barrhawk
```

### Option 2: Separate Processes

```bash
# Terminal 1
./bridge

# Bridge spawns Doctor and Igors automatically
```

### Option 3: Development Mode

```bash
# Terminal 1: Bridge
dart run bridge/main.dart

# Terminal 2: Doctor (hot reload)
bun --hot run doctor/index.ts

# Igors spawned by Doctor
```

---

## The Monster's Mantra

```
Bridge: "I don't think. I connect."
Doctor: "I don't execute. I orchestrate."
Igor:   "I don't decide. I do."
```

Together, they are Frankenstein - a monster assembled from parts,
each part simple, the whole greater than the sum.

---

## Version History

| Version | Codename | Components |
|---------|----------|------------|
| 0.1.0 | Prototype | Monolith |
| 0.2.0 | Split | Doctor + Igor |
| 0.3.0 | Tripartite | Bridge + Doctor + Igor |
| 0.4.0 | ABCD | Full tool suite |
| 0.5.0 | Frankenstein | Production architecture |

---

## What's Next

1. **Bridge implementation** - Pick language, implement spec
2. **Doctor refactor** - Extract from current monolith
3. **Igor extraction** - Separate execution layer
4. **Dashboard v2** - Full observability
5. **Registry** - Publish/discover MCPs

The monster awaits its creator.
