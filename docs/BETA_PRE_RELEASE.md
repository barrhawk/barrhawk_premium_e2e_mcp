# Beta: Primary/Secondary Architecture

## Overview

A two-tier supervisor system for the MCP server.

```
┌─────────────────────────────────────────────────────┐
│                    PRIMARY                          │
│  - MCP Server (stdio transport)                     │
│  - Spawns & monitors Secondary                      │
│  - Health checks, auto-restart, rollback            │
│  - Tool change notifications                        │
│  - NEVER crashes (delegates all risky work)         │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP IPC (port 3001)
                       ▼
┌─────────────────────────────────────────────────────┐
│                   SECONDARY                         │
│  - Runs with `bun --hot` (live reload)              │
│  - Hosts 36 dynamic tools                           │
│  - Security scanning on tool code                   │
│  - Can be restarted/rolled back by Primary          │
└─────────────────────────────────────────────────────┘
```

## Implementation

### Primary (`packages/supervisor/primary/`)

| File | Purpose |
|------|---------|
| `index.ts` | MCP server, subprocess management, tool routing, change notifications |
| `health-monitor.ts` | Polling health checks, failure detection |
| `snapshot-manager.ts` | Create/restore/cleanup snapshots |

### Secondary (`packages/supervisor/secondary/`)

| File | Purpose |
|------|---------|
| `index.ts` | HTTP server for IPC, tool execution, file watching |
| `tool-loader.ts` | Hot-reload, security scan, dynamic tool creation |
| `tools/*.ts` | 36 dynamic tool implementations |

### Shared (`packages/supervisor/shared/`)

| File | Purpose |
|------|---------|
| `types.ts` | Type definitions |
| `ipc.ts` | HTTP client, event emitter |

## Features

- **MCP Protocol**: Connects to Claude Code, Cursor, Windsurf
- **Auto-Restart**: Up to 5 attempts before rollback
- **Snapshot/Rollback**: Directory-based with 10-retention policy
- **Hot-Reload**: File watcher triggers automatic tool reload
- **Tool Change Notifications**: Hash-based detection, notifies MCP clients
- **Security Scanning**: Blocks `eval`, `child_process`, `__proto__`, etc.
- **Dynamic Tool Creation**: Create/delete tools at runtime via MCP

## Usage

```bash
# Run as MCP server
bun run packages/supervisor/primary/index.ts

# Test Secondary standalone
curl http://localhost:3001/health
curl http://localhost:3001/tools
```

## Known Limitations

1. No rate limiting (future Bridge layer)
2. No circuit breaker intelligence
3. No metrics/observability beyond health checks
4. Single Secondary (no Igor/Frankenstein split yet)
5. MCP stdio only (no HTTP transport)

## Migration Path

This beta validates the supervisor pattern. Next steps:

1. **Bridge Integration** - Rust/Go microkernel for crash immunity
2. **Igor/Frankenstein Split** - Stable vs experimental tool runtimes
3. **Observability** - Structured logging, metrics aggregation

See [FRANKENSTACK_GUIDE.md](FRANKENSTACK_GUIDE.md) for the full roadmap.
