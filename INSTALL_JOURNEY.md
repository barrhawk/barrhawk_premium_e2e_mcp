# BarrHawk Beta

A hot-reloadable MCP server with dynamic tool creation for Claude Code.

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Creating Tools](#creating-tools)
- [Management Tools](#management-tools)
- [Available Tools](#available-tools)
- [API Reference](#api-reference)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

---

## Requirements

| Dependency | Version | Purpose |
|------------|---------|---------|
| Bun | >= 1.0.0 | Runtime with native TypeScript and hot-reload support |
| Claude Code | Latest | MCP client |

### Installing Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

After installation, restart your terminal or run:
```bash
source ~/.bashrc  # or ~/.zshrc
```

Verify installation:
```bash
bun --version
```

---

## Installation

### Step 1: Clone the Repository

```bash
git clone <repo-url> barrhawk-beta
cd barrhawk-beta
```

### Step 2: Install Dependencies

```bash
bun install
```

This installs the MCP SDK and other dependencies defined in `package.json`.

### Step 3: Verify Directory Structure

Ensure the following structure exists:

```
barrhawk-beta/
├── package.json
├── packages/
│   └── supervisor/
│       ├── primary/
│       │   ├── index.ts
│       │   ├── health-monitor.ts
│       │   └── snapshot-manager.ts
│       ├── secondary/
│       │   ├── index.ts
│       │   ├── tool-loader.ts
│       │   └── tools/
│       │       ├── dynamic_tool_create.ts
│       │       ├── hello_world.ts
│       │       └── ... (other tools)
│       └── shared/
│           ├── types.ts
│           └── ipc.ts
└── snapshots/
```

### Step 4: Test the Server Manually

Before configuring Claude Code, verify the server starts:

```bash
bun run packages/supervisor/primary/index.ts
```

You should see output like:
```
[Primary] MCP server connected, starting secondary in background...
[Secondary] Server running on port 3001
[Secondary] Loaded 36 tools
[Primary] Secondary ready, tools available
```

Press `Ctrl+C` to stop.

---

## Configuration

### Claude Code Setup

1. Open your Claude Code configuration file:

```bash
# Location
~/.claude.json
```

2. Add the barrhawk-beta server under `mcpServers`:

```json
{
  "mcpServers": {
    "barrhawk-beta": {
      "type": "stdio",
      "command": "/path/to/bun",
      "args": [
        "run",
        "/path/to/barrhawk-beta/packages/supervisor/primary/index.ts"
      ],
      "env": {}
    }
  }
}
```

3. Replace paths with your actual paths:

```bash
# Find your Bun path
which bun
# Example output: /home/user/.bun/bin/bun

# Use absolute path to the project
# Example: /home/user/projects/barrhawk-beta
```

4. Full example with real paths:

```json
{
  "mcpServers": {
    "barrhawk-beta": {
      "type": "stdio",
      "command": "/home/user/.bun/bin/bun",
      "args": [
        "run",
        "/home/user/projects/barrhawk-beta/packages/supervisor/primary/index.ts"
      ],
      "env": {}
    }
  }
}
```

### Connecting to Claude Code

After saving the configuration:

1. Restart Claude Code completely, OR
2. Run `/mcp` in Claude Code to reconnect to MCP servers

Verify connection by asking Claude to use `worker_status`.

---

## Architecture

### Overview

BarrHawk Beta uses a two-server architecture for reliability and hot-reloading:

```
┌─────────────────────────────────────────────────────────────┐
│                   Claude Code (MCP Client)                   │
│                                                              │
│  Connects via stdio, sends tool calls, receives results      │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ MCP Protocol (stdio)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    PRIMARY SERVER                            │
│                    (The Immortal One)                        │
│                                                              │
│  Responsibilities:                                           │
│  • Handle MCP protocol communication with Claude Code        │
│  • Spawn and manage the secondary server process             │
│  • Monitor secondary health (every 1 second)                 │
│  • Auto-restart secondary on crash                           │
│  • Manage snapshots for rollback capability                  │
│  • Detect tool changes and notify client                     │
│                                                              │
│  Key Rule: NEVER modifies its own code                       │
│                                                              │
│  Entry: packages/supervisor/primary/index.ts                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP IPC (localhost:3001)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   SECONDARY SERVER                           │
│                    (The Mutable One)                         │
│                                                              │
│  Responsibilities:                                           │
│  • Host all dynamic tools                                    │
│  • Execute tool calls from primary                           │
│  • Watch filesystem for tool changes                         │
│  • Hot-reload modified tools automatically                   │
│  • Security scan all tool code before loading                │
│                                                              │
│  Runtime: bun --hot (enables live reloading)                 │
│                                                              │
│  Entry: packages/supervisor/secondary/index.ts               │
└─────────────────────────────────────────────────────────────┘
```

### Why Two Servers?

1. **Reliability**: If a bad tool crashes the secondary, the primary remains alive and can restart it automatically.

2. **Hot-Reload**: The secondary runs with `bun --hot`, allowing tools to be modified without restarting the entire MCP connection.

3. **Rollback**: The primary can snapshot the secondary's tool state and rollback if something breaks.

4. **Security Isolation**: Tool code runs in the secondary, isolated from the MCP protocol handler.

### Communication Flow

1. Claude Code sends a tool call via MCP (stdio)
2. Primary receives the call
3. If it's a management tool (worker_*, plan_read, dynamic_tool_delete), primary handles it directly
4. If it's a dynamic tool, primary forwards it to secondary via HTTP POST to `localhost:3001/call`
5. Secondary executes the tool and returns the result
6. Primary forwards the result back to Claude Code

---

## How It Works

### Startup Sequence

1. Claude Code launches primary via the configured command
2. Primary immediately connects to MCP (stdio transport)
3. Primary spawns secondary as a subprocess: `bun --hot index.ts`
4. Primary waits for secondary to become healthy (up to 10 seconds)
5. Secondary loads all tools from `packages/supervisor/secondary/tools/`
6. Secondary starts HTTP server on port 3001
7. Primary begins health monitoring (every 1 second)
8. Primary begins tool change detection (every 1 second)

### Hot-Reload Mechanism

1. Secondary watches `packages/supervisor/secondary/tools/` for file changes
2. When a `.ts` file is modified, the watcher triggers
3. Bun's `--hot` flag automatically reloads the module
4. The tool loader re-imports the modified tool
5. Primary detects the tool definition hash changed
6. Primary sends `notifications/tools/list_changed` to Claude Code
7. Claude Code refreshes its tool list

### Snapshot System

Snapshots save the entire `tools/` directory state:

```
snapshots/
├── initial_1706012345678/
│   ├── metadata.json
│   └── tools/
│       ├── dynamic_tool_create.ts
│       └── ...
└── my_snapshot_1706012345679/
    ├── metadata.json
    └── tools/
        └── ...
```

**Creating a snapshot:**
```
worker_snapshot with name: "before_experiment"
```

**Rolling back:**
```
worker_rollback with snapshot: "before_experiment_1706012345679"
```

If no snapshot ID is provided, rollback uses the most recent snapshot.

### Auto-Recovery

If the secondary crashes:

1. Primary detects the crash via process exit event
2. If restart count < 5: Primary restarts secondary
3. If restart count >= 5: Primary rolls back to last snapshot, then restarts
4. Restart count resets after successful rollback

---

## Creating Tools

### Method 1: Via MCP Tool (Runtime)

Use `dynamic_tool_create` to create tools without touching the filesystem:

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| name | string | Yes | Tool name (lowercase, alphanumeric, underscores) |
| description | string | Yes | What the tool does |
| schema | object | Yes | JSON Schema for input validation |
| code | string | Yes | Handler code (has access to `args` object) |
| permissions | array | No | Declared permissions: browser, network, filesystem, ai |

**Example:**

```json
{
  "name": "reverse_string",
  "description": "Reverse a string",
  "schema": {
    "type": "object",
    "properties": {
      "text": {
        "type": "string",
        "description": "Text to reverse"
      }
    },
    "required": ["text"]
  },
  "code": "const text = args.text as string;\nreturn { reversed: text.split('').reverse().join('') };"
}
```

The tool is written to `packages/supervisor/secondary/tools/reverse_string.ts` and hot-reloaded.

### Method 2: Via Filesystem (Development)

Create a TypeScript file directly in `packages/supervisor/secondary/tools/`:

**File: `packages/supervisor/secondary/tools/reverse_string.ts`**

```typescript
import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'reverse_string',
  description: 'Reverse a string',
  schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to reverse'
      }
    },
    required: ['text']
  },
  async handler(args: Record<string, unknown>) {
    const text = args.text as string;
    return { reversed: text.split('').reverse().join('') };
  },
};
```

**Key requirements:**

1. Export must be named `tool`
2. Must match the `DynamicTool` interface
3. Handler must be async (or return a Promise)
4. File name should match tool name (convention, not required)

The file watcher detects the new file and loads it automatically.

### Method 3: Deleting Tools

Use `dynamic_tool_delete`:

```json
{
  "name": "reverse_string"
}
```

Protected tools that cannot be deleted:
- `dynamic_tool_create`
- `hello_world`

---

## Management Tools

These tools are handled by the primary server and manage the secondary:

### worker_status

Get current server health and statistics.

**Input:** None

**Output:**
```json
{
  "pid": 12345,
  "status": "running",
  "startedAt": "2026-01-23T14:00:00.000Z",
  "restartCount": 0,
  "healthy": true,
  "health": {
    "status": "healthy",
    "uptime": 3600000,
    "toolCount": 36,
    "memoryUsage": {
      "heapUsed": 1553784,
      "heapTotal": 1936384
    }
  }
}
```

### worker_restart

Restart the secondary server. Useful after manual file changes or to clear state.

**Input:** None

**Output:** "Secondary server restarted successfully"

### worker_snapshot

Create a named snapshot of current tool state.

**Input:**
```json
{
  "name": "before_refactor"
}
```

**Output:** "Snapshot created: before_refactor_1706012345678"

### worker_rollback

Restore tools from a previous snapshot.

**Input:**
```json
{
  "snapshot": "before_refactor_1706012345678"
}
```

Or omit `snapshot` to use the most recent.

**Output:** "Rolled back to snapshot: before_refactor_1706012345678"

### worker_snapshots

List all available snapshots.

**Input:** None

**Output:**
```
before_refactor_1706012345678 (36 tools, 2026-01-23T14:00:00.000Z)
initial_1706012300000 (3 tools, 2026-01-23T12:00:00.000Z)
```

### plan_read

Read a markdown file (read-only, for documentation access).

**Input:**
```json
{
  "path": "/path/to/file.md"
}
```

**Security:** Only `.md` files allowed, no path traversal (`..`).

### dynamic_tool_delete

Delete a dynamic tool by name.

**Input:**
```json
{
  "name": "my_tool"
}
```

**Output:** "Tool 'my_tool' deleted successfully"

---

## Available Tools

**36 tools** organized by category:

### Assertions (6 tools)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `assert_equals` | Deep equality comparison | `actual`, `expected`, `strict` |
| `assert_contains` | String contains substring | `text`, `substring`, `caseSensitive` |
| `assert_truthy` | Value is truthy | `value` |
| `assert_type` | Value type check | `value`, `expectedType` |
| `assert_range` | Number within range | `value`, `min`, `max` |
| `assert_json_schema` | JSON Schema validation | `data`, `schema` |

### Data Generation (3 tools)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `data_generate` | Generate test data | `type` (name, email, uuid, etc.), `count` |
| `data_edge_cases` | Security/boundary test values | `category` (sql_injection, xss, etc.) |
| `data_from_schema` | Generate data from JSON Schema | `schema`, `count` |

### Test Analysis (4 tools)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `test_flaky_detect` | Find flaky tests | `testHistory`, `flakinessThreshold` |
| `test_prioritize` | Rank tests by risk | `testHistory`, `weights` |
| `test_deduplicate` | Find duplicate tests | `tests`, `similarityThreshold` |
| `test_coverage_gaps` | Analyze coverage gaps | `tests`, `categories` |

### Reporting (3 tools)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `report_summary` | Pass/fail summary | `results`, `format` |
| `report_failures` | Detailed failure report | `results`, `includeScreenshots` |
| `report_timing` | Performance timing | `results`, `showSlowest` |

### Performance (1 tool)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `performance_regression` | Detect regressions | `baseline`, `current`, `thresholds` |

### String/Text (4 tools)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `string_diff` | Line-by-line diff | `expected`, `actual`, `context` |
| `regex_test` | Test regex patterns | `pattern`, `text`, `flags` |
| `template_render` | Render `{{var}}` templates | `template`, `variables` |
| `hash_text` | Generate hashes | `text`, `algorithm` (md5, sha256, etc.) |

### Data Transformation (4 tools)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `base64_encode` | Encode/decode base64 | `text`, `action` |
| `json_format` | Format/minify/validate JSON | `json`, `action` |
| `object_diff` | Compare objects | `expected`, `actual`, `deep` |
| `array_operations` | Array utilities | `operation`, `array`, `array2` |

### Utility (8 tools)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `timestamp_now` | Current timestamp | `format` (iso, unix, human, all) |
| `url_parse` | Parse URL components | `url` |
| `math_stats` | Statistical calculations | `data`, `percentiles` |
| `env_info` | Runtime environment info | None |
| `http_status_info` | HTTP status code lookup | `code` |
| `date_utils` | Date manipulation | `operation`, `date`, `amount`, `unit` |
| `wait_ms` | Async delay | `ms` (max 30000) |
| `random_choice` | Random selection | `items`, `count`, `unique` |

---

## API Reference

The secondary server exposes an HTTP API on port 3001:

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "uptime": 3600000,
  "toolCount": 36,
  "lastError": null,
  "memoryUsage": {
    "heapUsed": 1553784,
    "heapTotal": 1936384
  }
}
```

### GET /tools

List all loaded tools.

**Response:**
```json
[
  {
    "name": "hello_world",
    "description": "A simple greeting tool",
    "inputSchema": { ... }
  },
  ...
]
```

### POST /call

Execute a tool.

**Request:**
```json
{
  "tool": "hello_world",
  "args": {
    "name": "World"
  }
}
```

**Response (success):**
```json
{
  "content": [{
    "type": "text",
    "text": "{ \"greeting\": \"Hello, World!\" }"
  }]
}
```

**Response (error):**
```json
{
  "content": [{
    "type": "text",
    "text": "Tool: hello_world\nError: Something went wrong\n\nStack trace:\n..."
  }],
  "isError": true
}
```

### POST /reload

Force reload all tools.

**Response:**
```json
{
  "success": true,
  "loaded": ["hello_world", "json_validator", ...]
}
```

### DELETE /tools/:name

Delete a tool by name.

**Response:**
```json
{
  "success": true
}
```

### POST /shutdown

Gracefully shutdown the secondary.

**Response:**
```json
{
  "success": true
}
```

---

## Security

### Blocked Code Patterns

The tool loader scans all code before loading and blocks these patterns:

| Pattern | Reason |
|---------|--------|
| `process.exit` | Prevents killing the server |
| `require()` | Use ES imports instead |
| `import()` | No dynamic imports |
| `eval()` | No arbitrary code execution |
| `new Function()` | No dynamic function creation |
| `__proto__` | No prototype pollution |
| `constructor[` | No constructor access |
| `child_process` | No subprocess spawning |
| `Bun.spawn` | No Bun subprocess spawning |
| `Bun.spawnSync` | No Bun sync subprocess spawning |

### Path Security

- `plan_read` only allows `.md` files
- Path traversal (`..`) is blocked
- Tools can only be created in the designated tools directory

### Isolation

- Tool code runs in the secondary server, isolated from MCP protocol
- A crashing tool cannot kill the MCP connection
- Primary can rollback and restart secondary if needed

---

## Troubleshooting

### Server Won't Start

**Check Bun is installed:**
```bash
which bun
bun --version
```

**Check for syntax errors:**
```bash
bun check packages/supervisor/primary/index.ts
bun check packages/supervisor/secondary/index.ts
```

**Run manually and check output:**
```bash
bun run packages/supervisor/primary/index.ts 2>&1
```

### Secondary Won't Start

**Check secondary logs:**
```bash
bun run packages/supervisor/primary/index.ts 2>&1 | grep -i secondary
```

**Check if port 3001 is in use:**
```bash
lsof -i :3001
```

**Kill existing process if needed:**
```bash
kill $(lsof -t -i :3001)
```

### Tool Not Loading

1. **Check tool count:**
   Use `worker_status` and verify `toolCount`

2. **Check file syntax:**
   ```bash
   bun check packages/supervisor/secondary/tools/my_tool.ts
   ```

3. **Check for security violations:**
   Look for blocked patterns in your code

4. **Check export format:**
   Must export `const tool: DynamicTool = { ... }`

5. **Force reload:**
   Use `worker_restart`

### MCP Connection Issues

1. **Verify config path:**
   ```bash
   cat ~/.claude.json | grep barrhawk
   ```

2. **Check Bun path is absolute:**
   ```bash
   which bun
   # Use this exact path in config
   ```

3. **Check Claude Code logs:**
   ```bash
   ls ~/.claude/logs/
   cat ~/.claude/logs/mcp*.log
   ```

4. **Restart Claude Code completely**

### Tool Changes Not Detected

1. **Check if notifications are working:**
   Look for `[Primary] Tools changed` in logs

2. **Manually refresh:**
   Run `/mcp` in Claude Code

3. **Restart secondary:**
   Use `worker_restart`

### High Memory Usage

1. **Check current usage:**
   Use `worker_status` and check `memoryUsage`

2. **Restart secondary:**
   Use `worker_restart` to clear memory

3. **Check for memory leaks in custom tools**

---

## File Reference

| File | Purpose |
|------|---------|
| `packages/supervisor/primary/index.ts` | Main entry point, MCP handler |
| `packages/supervisor/primary/health-monitor.ts` | Secondary health checking |
| `packages/supervisor/primary/snapshot-manager.ts` | Snapshot/rollback logic |
| `packages/supervisor/secondary/index.ts` | HTTP server for IPC |
| `packages/supervisor/secondary/tool-loader.ts` | Dynamic tool loading with security |
| `packages/supervisor/secondary/tools/*.ts` | Individual tool implementations |
| `packages/supervisor/shared/types.ts` | TypeScript interfaces |
| `packages/supervisor/shared/ipc.ts` | IPC utilities |
| `snapshots/` | Auto-managed snapshot storage |
