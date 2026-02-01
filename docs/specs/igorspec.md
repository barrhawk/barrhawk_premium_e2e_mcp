# Igor Specification

**Component:** Igor
**Role:** Execution Worker
**Language:** TypeScript (Bun runtime)

---

## Purpose

Igor is the **muscle** of BarrHawk. Igor receives tool execution requests from Doctor, runs the actual tool code, and returns results. Igor is intentionally simple - it doesn't think, analyze, or decide. It executes.

Igor understands:
- Tool implementations
- Execution context
- Resource management (browser instances, DB connections)
- Error reporting

---

## Architecture Position

```
              DOCTOR
                 │
                 │ stdio (JSON-RPC)
                 ▼
┌────────────────────────────────────┐
│              IGOR                   │
│  ┌──────────┐  ┌────────────────┐ │
│  │ Executor │  │   Resources    │ │
│  │          │  │ ┌────────────┐ │ │
│  │  tool()  │  │ │  Browser   │ │ │
│  │    ↓     │  │ │  DB Conn   │ │ │
│  │ result   │  │ │  FS Handle │ │ │
│  └──────────┘  │ └────────────┘ │ │
│                └────────────────┘ │
└────────────────────────────────────┘
```

---

## Core Responsibilities

### 1. Tool Execution (Priority: Critical)

**Execution Loop:**
```typescript
while (alive) {
  const task = await receiveTask();   // From Doctor via stdin
  const result = await execute(task); // Run the tool
  await sendResult(result);           // To Doctor via stdout
}
```

**Task Structure:**
```typescript
interface Task {
  id: string;                    // Unique task ID
  tool: string;                  // Tool name to execute
  args: Record<string, any>;     // Tool arguments
  timeout?: number;              // Override default timeout
  context?: ExecutionContext;    // Shared context from Squad
}

interface ExecutionContext {
  squadId?: string;
  sharedVars?: Map<string, any>;
  browserContext?: string;       // Reuse browser context
  dbConnection?: string;         // Reuse DB connection
}
```

**Result Structure:**
```typescript
interface TaskResult {
  id: string;                    // Matches task ID
  status: "success" | "error" | "timeout";
  result?: any;                  // Tool return value
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  duration: number;              // Execution time in ms
  resources?: ResourceUsage;     // Memory, handles, etc.
}
```

### 2. Resource Management (Priority: High)

Igor manages long-lived resources to avoid recreation overhead:

**Browser Resources:**
```typescript
interface BrowserResources {
  browser?: Browser;             // Playwright browser instance
  contexts: Map<string, BrowserContext>;
  pages: Map<string, Page>;
}

// Lifecycle
"browser_launch"  → Creates browser, stores in resources
"browser_*"       → Uses stored browser
"browser_close"   → Cleans up browser resources
// Igor death     → Automatic cleanup via process exit
```

**Database Resources:**
```typescript
interface DatabaseResources {
  pgPools: Map<string, Pool>;           // PostgreSQL pools
  sqliteConns: Map<string, Database>;   // SQLite connections
  redisClients: Map<string, RedisClient>;
}

// Connection aliasing
db_pg_connect(alias: "prod")  → Creates pool["prod"]
db_pg_query(alias: "prod")    → Uses pool["prod"]
db_pg_disconnect(alias: "prod") → Destroys pool["prod"]
```

**File Resources:**
```typescript
interface FileResources {
  watchers: Map<string, FSWatcher>;     // Active file watchers
  tempFiles: Set<string>;               // Cleanup on exit
  openHandles: Map<string, FileHandle>;
}
```

### 3. Tool Bag Awareness (Priority: Medium)

Igor only loads tools it needs (curated by Doctor):

```typescript
interface IgorConfig {
  toolBag: string[];  // Tool names this Igor can execute
}

// On startup, Igor receives its tool bag
{"type": "init", "toolBag": ["browser_*", "assert_*"]}

// Igor only loads matching tool implementations
// Reduces memory footprint for specialized workers
```

**Specialized Igor Examples:**
- Browser Igor: `browser_*`, `assert_*`, `accessibility_*`
- Database Igor: `db_pg_*`, `db_sqlite_*`, `db_redis_*`
- GitHub Igor: `gh_*`
- Full Igor: All tools (default)

### 4. Context Sharing (Priority: Medium)

For Squad mode, Igors share context:

```typescript
interface SharedContext {
  // Variables set by one Igor, readable by others
  vars: Map<string, any>;

  // Shared browser context ID (for multi-Igor browser tests)
  browserContextId?: string;

  // Shared database transaction (for coordinated writes)
  transactionId?: string;
}

// Set by one Igor
{"tool": "context_set", "args": {"key": "userId", "value": 123}}

// Read by another Igor in same Squad
{"tool": "context_get", "args": {"key": "userId"}}
// Returns 123
```

---

## Configuration

Igor is configured by Doctor at spawn time:

**Spawn Arguments:**
```bash
bun run igor/index.ts --id=igor-001 --toolbag=browser,assert
```

**Init Message (from Doctor):**
```json
{
  "type": "init",
  "id": "igor-001",
  "toolBag": ["browser_*", "assert_*"],
  "config": {
    "timeout": 30000,
    "browserHeadless": false,
    "screenshotDir": "/tmp/screenshots"
  },
  "context": {}
}
```

**Ready Response (to Doctor):**
```json
{
  "type": "ready",
  "id": "igor-001",
  "toolsLoaded": 45,
  "pid": 12345,
  "memoryUsage": 52428800
}
```

---

## Interface Contract

### Doctor Interface (stdio)

**Incoming Tasks (stdin):**
```json
{
  "id": "task-abc-123",
  "tool": "browser_click",
  "args": {
    "selector": "#submit-btn"
  },
  "timeout": 5000
}
```

**Outgoing Results (stdout):**
```json
{
  "id": "task-abc-123",
  "status": "success",
  "result": {
    "clicked": true,
    "element": {
      "tagName": "BUTTON",
      "text": "Submit"
    }
  },
  "duration": 127
}
```

**Error Response:**
```json
{
  "id": "task-abc-123",
  "status": "error",
  "error": {
    "message": "Element not found: #submit-btn",
    "code": "ELEMENT_NOT_FOUND",
    "stack": "Error: Element not found..."
  },
  "duration": 5001
}
```

### Special Messages

**Heartbeat (from Doctor):**
```json
{"type": "ping"}
```

**Heartbeat Response:**
```json
{
  "type": "pong",
  "status": "idle",
  "resourceUsage": {
    "memory": 52428800,
    "browserPages": 2,
    "dbConnections": 1
  }
}
```

**Shutdown (from Doctor):**
```json
{"type": "shutdown", "graceful": true}
```

**Shutdown Ack:**
```json
{"type": "shutdown_ack", "cleanedUp": ["browser", "db_pg"]}
```

---

## Tool Implementation Pattern

All tools follow this pattern:

```typescript
// src/tools/browser.ts
export async function handleBrowserClick(
  args: { selector: string; button?: "left" | "right" },
  resources: BrowserResources,
  context: ExecutionContext
): Promise<ClickResult> {
  const page = resources.pages.get("default");
  if (!page) throw new Error("No browser page. Call browser_launch first.");

  const element = await page.click(args.selector, {
    button: args.button || "left"
  });

  return {
    clicked: true,
    element: {
      tagName: await element.evaluate(el => el.tagName),
      text: await element.textContent()
    }
  };
}
```

**Tool Handler Signature:**
```typescript
type ToolHandler<TArgs, TResult> = (
  args: TArgs,
  resources: Resources,
  context: ExecutionContext
) => Promise<TResult>;
```

---

## Lifecycle

```
                    ┌─────────────────────────────────────┐
                    ▼                                     │
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐ │
│ Spawned │───▶│  Init   │───▶│  Idle   │◀──▶│  Busy   │ │
└─────────┘    └─────────┘    └─────────┘    └─────────┘ │
                                   │              │       │
                                   ▼              │       │
                              ┌─────────┐        │       │
                              │Shutdown │◀───────┘       │
                              └────┬────┘                │
                                   │                     │
                                   ▼                     │
                              ┌─────────┐                │
                              │  Dead   │                │
                              └─────────┘                │
                                   │                     │
                                   └─────────────────────┘
                                   (crash → Doctor respawns)
```

**States:**
- **Spawned**: Process started, not yet initialized
- **Init**: Loading tool bag, setting up resources
- **Idle**: Ready for tasks
- **Busy**: Executing a task
- **Shutdown**: Cleaning up resources
- **Dead**: Process exited

---

## Error Handling

| Error | Action |
|-------|--------|
| Tool throws | Catch, return error result, stay alive |
| Tool timeout | Kill tool execution, return timeout, stay alive |
| Resource exhaustion | Log warning, attempt cleanup, continue |
| Fatal error | Log, cleanup, exit (Doctor will respawn) |
| Doctor disconnect | Cleanup, exit |
| SIGTERM | Graceful shutdown |
| SIGKILL | Immediate death |

**Self-Healing:**
```typescript
// If a tool corrupts state, Igor can request restart
if (resourcesCorrupted) {
  stdout.write(JSON.stringify({
    type: "request_restart",
    reason: "Resource corruption detected"
  }));
  // Doctor will kill and respawn
}
```

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Startup time | <200ms |
| Task overhead | <2ms |
| Memory baseline | <50MB |
| Memory per browser page | ~30MB |
| Memory per DB connection | ~5MB |

---

## Security Considerations

1. **Process isolation**: Each Igor is separate process
2. **Resource limits**: Doctor can set memory/CPU limits
3. **No network listen**: Igor never opens ports
4. **Stderr separation**: Errors don't leak to MCP
5. **Credential handling**: Passed per-task, not stored

---

## Resource Cleanup

Igor must clean up on exit:

```typescript
async function cleanup(): Promise<void> {
  // Close browser
  await browser?.close();

  // Close DB connections
  for (const pool of pgPools.values()) {
    await pool.end();
  }
  for (const db of sqliteConns.values()) {
    db.close();
  }
  for (const client of redisClients.values()) {
    await client.quit();
  }

  // Remove temp files
  for (const file of tempFiles) {
    await fs.unlink(file).catch(() => {});
  }

  // Close file watchers
  for (const watcher of watchers.values()) {
    watcher.close();
  }
}

// Register cleanup
process.on("exit", cleanup);
process.on("SIGTERM", async () => {
  await cleanup();
  process.exit(0);
});
```

---

## Non-Goals

Igor does NOT:
- Analyze intent (Doctor's job)
- Route tasks (Doctor's job)
- Manage other Igors (Doctor's job)
- Connect to Claude (Bridge's job)
- Persist results (Dashboard's job)
- Make strategic decisions (Doctor's job)

Igor is **execution**, not **orchestration**.

---

## Example: Full Task Cycle

```
Doctor                              Igor
   │                                  │
   │──── spawn ──────────────────────▶│
   │                                  │ (loads tools)
   │◀─── {"type":"ready"} ───────────│
   │                                  │
   │──── {"id":"1","tool":"browser_launch"} ─▶│
   │                                  │ (launches browser)
   │◀─── {"id":"1","status":"success"} ──────│
   │                                  │
   │──── {"id":"2","tool":"browser_navigate", ─▶│
   │      "args":{"url":"..."}}       │
   │                                  │ (navigates)
   │◀─── {"id":"2","status":"success"} ──────│
   │                                  │
   │──── {"type":"shutdown"} ────────▶│
   │                                  │ (cleanup)
   │◀─── {"type":"shutdown_ack"} ────│
   │                                  │ (exit)
```
