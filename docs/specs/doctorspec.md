# Doctor Specification

**Component:** Doctor
**Role:** Intent Analyzer, Task Router, Igor Commander
**Language:** TypeScript (Bun runtime)

---

## Purpose

Doctor is the **brain** of BarrHawk. It receives tool calls from Bridge, analyzes intent, selects optimal execution strategy, dispatches work to Igor workers, and aggregates results.

Doctor understands:
- All 120+ tool definitions
- Intent classification
- Tool bag curation
- Worker orchestration
- Swarm/Squad coordination

---

## Architecture Position

```
         BRIDGE
            │
            │ stdio (JSON-RPC)
            ▼
┌───────────────────────────────────────┐
│               DOCTOR                   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ │
│  │ Intent  │ │ToolBag  │ │ Swarm   │ │
│  │Analyzer │ │ Curator │ │ Control │ │
│  └─────────┘ └─────────┘ └─────────┘ │
│                   │                    │
│         ┌─────────┼─────────┐         │
│         ▼         ▼         ▼         │
│     ┌───────┐ ┌───────┐ ┌───────┐    │
│     │Igor 1 │ │Igor 2 │ │Igor N │    │
│     └───────┘ └───────┘ └───────┘    │
└───────────────────────────────────────┘
```

---

## Core Responsibilities

### 1. MCP Server Implementation (Priority: Critical)

**Full MCP Protocol Support:**
```typescript
// Required MCP methods
"initialize"           // Client handshake
"tools/list"           // Return available tools
"tools/call"           // Execute a tool
"resources/list"       // List available resources (optional)
"prompts/list"         // List available prompts (optional)
```

**Tool Registration:**
```typescript
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  category: ToolCategory;
  requiresWorker: boolean;  // true = dispatch to Igor
  timeout?: number;
  retries?: number;
}

type ToolCategory =
  | "browser"
  | "database"
  | "github"
  | "docker"
  | "filesystem"
  | "orchestration"
  | "meta"
  | "utility";
```

### 2. Intent Analysis (Priority: High)

Before executing, Doctor analyzes what the caller actually needs:

```typescript
interface IntentAnalysis {
  primaryDomain: ToolCategory;      // Main domain
  secondaryDomains: ToolCategory[]; // Supporting domains
  complexity: "simple" | "compound" | "swarm";
  suggestedTools: string[];         // Curated tool bag
  parallelizable: boolean;          // Can split across Igors
  estimatedSteps: number;
}
```

**Analysis Triggers:**
- Compound tool names (e.g., `test_and_report`)
- Natural language in tool params
- Multi-resource operations
- Explicit swarm requests

**Simple Example:**
```json
// Input
{"tool": "browser_click", "args": {"selector": "#submit"}}

// Analysis
{
  "primaryDomain": "browser",
  "complexity": "simple",
  "suggestedTools": ["browser_click"],
  "parallelizable": false
}
```

**Compound Example:**
```json
// Input
{"tool": "test_login_flow", "args": {"url": "https://app.com"}}

// Analysis
{
  "primaryDomain": "browser",
  "secondaryDomains": ["utility"],
  "complexity": "compound",
  "suggestedTools": [
    "browser_launch",
    "browser_navigate",
    "browser_type",
    "browser_click",
    "browser_screenshot",
    "assert_visible",
    "assert_url"
  ],
  "parallelizable": false,
  "estimatedSteps": 7
}
```

### 3. Tool Bag Curation (Priority: High)

Doctor curates a minimal tool set for each task to avoid token bloat:

```typescript
interface ToolBag {
  tools: ToolDefinition[];    // Curated subset
  reason: string;             // Why these tools
  excludedCount: number;      // How many excluded
}

function curateToolBag(intent: IntentAnalysis): ToolBag {
  // Start with primary domain tools
  // Add supporting tools from secondary domains
  // Exclude clearly irrelevant tools
  // Cap at reasonable size (20-30 tools)
}
```

**Curation Rules:**
1. Always include tools from primary domain
2. Include cross-cutting utilities (assert_*, data_*)
3. Exclude unrelated domains entirely
4. For swarm tasks, give each Igor domain-specific bags

### 4. Igor Management (Priority: Critical)

**Worker Pool:**
```typescript
interface IgorPool {
  workers: Map<string, IgorWorker>;
  maxWorkers: number;           // Default: CPU cores
  idleTimeout: number;          // Kill idle workers after N ms
  taskQueue: TaskQueue;
}

interface IgorWorker {
  id: string;
  pid: number;
  status: "idle" | "busy" | "dead";
  currentTask?: string;
  toolBag: ToolBag;             // Tools this Igor knows
  metrics: WorkerMetrics;
}
```

**Dispatch Strategies:**
```typescript
type DispatchStrategy =
  | "single"      // One Igor handles everything
  | "round-robin" // Distribute across available Igors
  | "specialized" // Route by domain (browser Igor, db Igor)
  | "swarm"       // All Igors work in parallel
  | "squad";      // Named team with shared context
```

**Worker Lifecycle:**
```
spawn → initialize → idle ←→ busy → terminate
                       ↑         │
                       └─────────┘
```

### 5. Swarm Coordination (Priority: Medium)

For parallel execution across multiple Igors:

```typescript
interface SwarmTask {
  id: string;
  subtasks: SubTask[];
  strategy: "parallel" | "pipeline" | "map-reduce";
  timeout: number;
  onPartialFailure: "abort" | "continue" | "retry";
}

interface SubTask {
  id: string;
  igorId: string;
  tool: string;
  args: any;
  dependsOn?: string[];   // SubTask IDs
  status: "pending" | "running" | "done" | "failed";
  result?: any;
}
```

**Swarm Modes:**

1. **Parallel** - All subtasks run simultaneously
   ```
   Igor1: browser test on Chrome
   Igor2: browser test on Firefox
   Igor3: browser test on Safari
   → Aggregate results
   ```

2. **Pipeline** - Sequential with handoff
   ```
   Igor1: Generate test data
   → Igor2: Run tests with data
   → Igor3: Generate report
   ```

3. **Map-Reduce** - Split, process, combine
   ```
   Split: 100 URLs to test
   Map: 10 Igors test 10 URLs each
   Reduce: Combine into single report
   ```

### 6. Squad Mode (Priority: Medium)

Named teams with persistent context:

```typescript
interface Squad {
  name: string;
  igors: IgorWorker[];
  sharedContext: Map<string, any>;  // Shared state
  toolBag: ToolBag;
  createdAt: number;
  lastActivity: number;
}

// Squad operations
"squad:create"    // Create named squad
"squad:dispatch"  // Send task to squad
"squad:share"     // Share context across squad
"squad:dissolve"  // Terminate squad
```

---

## Configuration

**Environment Variables:**
```bash
DOCTOR_MAX_IGORS=8                    # Max worker pool size
DOCTOR_IGOR_IDLE_TIMEOUT=300000       # Kill idle workers after 5min
DOCTOR_TOOL_TIMEOUT=30000             # Default tool timeout
DOCTOR_ENABLE_INTENT_ANALYSIS=true    # Use AI for intent
DOCTOR_ENABLE_HOT_RELOAD=true         # Watch for tool changes
DOCTOR_LOG_LEVEL=info
```

**Config File:** `doctor.config.json`
```json
{
  "igors": {
    "maxWorkers": 8,
    "idleTimeout": 300000,
    "spawnDelay": 100
  },
  "tools": {
    "defaultTimeout": 30000,
    "enableDynamic": true,
    "hotReload": true
  },
  "intent": {
    "enabled": true,
    "cacheResults": true
  }
}
```

---

## Interface Contracts

### Bridge Interface (stdio)

**Incoming (stdin):**
```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {...}}
```

**Outgoing (stdout):**
```json
{"jsonrpc": "2.0", "id": 1, "result": {...}}
```

**Special Messages:**
```json
{"ready": true}                    // Initialization complete
{"health": "ok", "igors": 3}       // Heartbeat response
{"event": "igor:spawned", ...}     // Lifecycle events
```

### Igor Interface (subprocess stdio)

Doctor spawns Igors and communicates via JSON-RPC over stdio:

**To Igor:**
```json
{
  "id": "task-123",
  "tool": "browser_click",
  "args": {"selector": "#btn"},
  "toolBag": ["browser_click", "browser_wait", ...],
  "context": {}
}
```

**From Igor:**
```json
{
  "id": "task-123",
  "status": "success",
  "result": {"clicked": true},
  "duration": 150
}
```

---

## State Management

Doctor maintains ephemeral state (lost on restart):

```typescript
interface DoctorState {
  // Worker pool
  igors: Map<string, IgorWorker>;

  // Active tasks
  tasks: Map<string, Task>;

  // Squads
  squads: Map<string, Squad>;

  // Tool registry (can be persisted)
  tools: Map<string, ToolDefinition>;
  dynamicTools: Map<string, DynamicTool>;

  // Metrics
  metrics: DoctorMetrics;
}
```

**Persistence (optional):**
- Dynamic tools → `~/.barrhawk/dynamic-tools/`
- Tool configs → `barrhawk.config.json`
- Nothing else persists (stateless restart)

---

## Error Handling

| Error | Action |
|-------|--------|
| Igor crashes | Remove from pool, retry task on new Igor |
| Tool timeout | Kill Igor, return timeout error |
| Invalid tool call | Return error, don't spawn Igor |
| All Igors busy | Queue task, spawn new Igor if under limit |
| Swarm partial failure | Depends on `onPartialFailure` setting |
| Unknown tool | Return error with suggestions |

---

## Events Emitted

Doctor emits events for Bridge to forward to Dashboard:

```typescript
type DoctorEvent =
  | { type: "igor:spawned"; igorId: string }
  | { type: "igor:terminated"; igorId: string; reason: string }
  | { type: "task:started"; taskId: string; tool: string }
  | { type: "task:completed"; taskId: string; duration: number }
  | { type: "task:failed"; taskId: string; error: string }
  | { type: "swarm:started"; swarmId: string; igorCount: number }
  | { type: "swarm:completed"; swarmId: string; results: any }
  | { type: "squad:created"; squadName: string }
  | { type: "tool:registered"; toolName: string }
  | { type: "tool:hot-reloaded"; count: number };
```

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Tool dispatch latency | <5ms |
| Igor spawn time | <100ms |
| Max concurrent Igors | 32 |
| Tools/list response | <10ms |
| Intent analysis (cached) | <1ms |
| Intent analysis (uncached) | <100ms |

---

## Non-Goals

Doctor does NOT:
- Execute tools directly (Igor's job)
- Manage Bridge lifecycle (Bridge manages itself)
- Persist test results (Dashboard's job)
- Connect to Claude directly (Bridge's job)
- Implement MCP transport (Bridge handles stdio)

Doctor is **orchestration**, not **execution**.
