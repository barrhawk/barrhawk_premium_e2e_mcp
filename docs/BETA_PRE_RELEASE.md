# Pre-Release Beta: Primary/Secondary Architecture

## What This Is

A working two-tier supervisor system that can be shipped as a beta while the full **Frankenstack** (Bridge/Doctor/Igor/Frankenstein) is completed.

```
┌─────────────────────────────────────────────────────┐
│                    PRIMARY                          │
│  - MCP Server (stdio transport)                     │
│  - Spawns & monitors Secondary                      │
│  - Health checks, auto-restart, rollback            │
│  - Snapshot management                              │
│  - NEVER crashes (delegates all risky work)         │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP IPC
                       ▼
┌─────────────────────────────────────────────────────┐
│                   SECONDARY                         │
│  - Runs with `bun --hot` (live reload)              │
│  - Hosts dynamic tools                              │
│  - Security scanning on tool code                   │
│  - Can be restarted/rolled back by Primary          │
└─────────────────────────────────────────────────────┘
```

## Current Status: WORKING

All tests passing as of 2026-01-23:

```
✓ Health Check              PASS
✓ Tool Listing              PASS
✓ Tool Execution            PASS
✓ Dynamic Tool Creation     PASS
```

## What's Implemented

### Primary (`packages/supervisor/primary/`)
| File | Lines | Function |
|------|-------|----------|
| `index.ts` | 541 | MCP server, subprocess management, tool routing |
| `health-monitor.ts` | 159 | Polling health checks, failure detection, crash events |
| `snapshot-manager.ts` | 260 | Create/restore/cleanup snapshots, retention policy |

### Secondary (`packages/supervisor/secondary/`)
| File | Lines | Function |
|------|-------|----------|
| `index.ts` | 195 | HTTP server for IPC, tool execution, file watching |
| `tool-loader.ts` | 342 | Hot-reload, security scan, dynamic tool creation |

### Shared (`packages/supervisor/shared/`)
| File | Lines | Function |
|------|-------|----------|
| `types.ts` | 508 | Full type definitions for entire architecture |
| `ipc.ts` | 384 | HTTP client, event emitter, fallback chain, task queue |

### Tools (`packages/supervisor/secondary/tools/`)
- `hello_world.ts` - Demo greeting tool
- `json_validator.ts` - JSON Schema validation
- `dynamic_tool_create.ts` - Meta-tool for runtime tool creation

## Features Working

- **MCP Protocol**: Connects to Claude CLI, Cursor, Windsurf, etc.
- **Auto-Restart**: Up to 5 restart attempts before rollback
- **Snapshot/Rollback**: Directory-based snapshots with 10-retention policy
- **Hot-Reload**: File watcher triggers automatic tool reload
- **Security Scanning**: Blocks dangerous patterns:
  - `process.exit`, `eval()`, `new Function()`
  - `require()`, `child_process`, `__proto__`
  - Infinite loops (`while(true)`, `for(;;)`)
- **Dynamic Tool Creation**: Create new tools at runtime via MCP call
- **Health Monitoring**: 1-second intervals, 3 failures = crash trigger

## How To Use

### Run Beta Test Suite
```bash
cd packages/supervisor
bun run beta:test
```

### Run with MCP Client (Claude CLI, Cursor)
Add to your MCP config:
```json
{
  "mcpServers": {
    "barrhawk-beta": {
      "command": "bun",
      "args": ["run", "beta"],
      "cwd": "/absolute/path/to/packages/supervisor"
    }
  }
}
```

### Run Secondary Standalone (for dev)
```bash
bun run beta:secondary
# Then hit http://localhost:3001/health
```

## Known Limitations (Beta)

1. **No rate limiting** - Full version has Bridge handling this
2. **No circuit breaker** - Crashes just restart, no backoff intelligence
3. **No metrics** - No observability beyond health checks
4. **No Igor/Frank split** - All tools treated the same (no stable vs experimental)
5. **MCP stdio only** - No HTTP transport for Primary (would need wrapper)

## Commands Reference

```bash
# Full three-tier (not ready yet)
bun run start          # Launch Doctor/Igor/Frankenstein

# Beta two-tier (ready now)
bun run beta           # Launch Primary (MCP server)
bun run beta:secondary # Launch Secondary standalone
bun run beta:test      # Run test suite
```

---

*This beta gives users self-healing, hot-reload, and dynamic tools while we finish the full Frankenstack architecture.*
