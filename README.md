# BarrHawk Premium E2E (Beta)

Self-healing MCP server with dynamic tool creation and hot-reload.

## Quick Start

```bash
# Install dependencies
bun install

# Run tests to verify setup
bun test

# Start as MCP server (for Claude CLI, Cursor, etc.)
bun run beta
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    PRIMARY                          │
│  - MCP Server (stdio transport)                     │
│  - Spawns & monitors Secondary                      │
│  - Health checks, auto-restart, rollback            │
│  - Snapshot management                              │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP IPC (port 3001)
                       ▼
┌─────────────────────────────────────────────────────┐
│                   SECONDARY                         │
│  - Runs with hot-reload                             │
│  - Hosts dynamic tools                              │
│  - Security scanning on tool code                   │
└─────────────────────────────────────────────────────┘
```

## MCP Configuration

Add to your MCP client config (Claude CLI, Cursor, Windsurf):

```json
{
  "mcpServers": {
    "barrhawk": {
      "command": "bun",
      "args": ["run", "beta"],
      "cwd": "/path/to/barrhawk-premium-e2e"
    }
  }
}
```

## Available Tools

### Primary Tools (always available)
- `worker_status` - Get Secondary server status
- `worker_restart` - Restart Secondary server
- `worker_snapshot` - Create a snapshot for rollback
- `worker_rollback` - Rollback to a previous snapshot
- `worker_snapshots` - List available snapshots
- `plan_read` - Read markdown files

### Secondary Tools (dynamic)
- `hello_world` - Demo greeting tool
- `json_validator` - Validate JSON against schema
- `dynamic_tool_create` - Create new tools at runtime

## Features

- **Self-Healing**: Auto-restart on crash (up to 5 attempts)
- **Rollback**: Snapshot system for safe recovery
- **Hot-Reload**: Tools update without restart
- **Security**: Code scanning blocks dangerous patterns
- **Dynamic Tools**: Create new tools via MCP at runtime

## Development

```bash
# Run Secondary standalone
bun run beta:secondary

# Run HTTP API tests
bun run beta:test

# Run MCP protocol tests
bun run mcp:test
```

## Documentation

- [Beta Pre-Release Guide](docs/BETA_PRE_RELEASE.md)
- [Frankenstack Architecture](docs/FRANKENSTACK_GUIDE.md)
- [Robo Guidelight](docs/robo-guidelight.md)

## License

[Elastic License 2.0](LICENSE)
