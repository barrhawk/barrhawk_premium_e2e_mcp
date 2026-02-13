# BarrHawk E2E - Installation Guide

## Prerequisites

- **Bun** (required): `curl -fsSL https://bun.sh/install | bash`
- **Linux** (recommended): Optimized for X11/Wayland. Mac/Windows experimental.
- **Playwright browsers**: Installed automatically on first run

## Quick Install

```bash
# Clone
git clone git@github.com:barrhawk/barrhawk_premium_e2e_mcp.git
cd barrhawk_premium_e2e_mcp

# Install dependencies
bun install

# Start the stack
bun run barrhawk
```

## Stack Modes

```bash
bun run barrhawk           # Full stack (Bridge, Doctor, Igor, Frank)
bun run barrhawk --minimal # Lightweight (Bridge + Igor only)
bun run barrhawk --hub     # Full stack + Test Orchestration Hub
```

## Verify Installation

```bash
# Check all components are healthy
curl http://localhost:7000/health

# Submit a test plan
curl -X POST http://localhost:7001/plan \
  -H "Content-Type: application/json" \
  -d '{"intent":"take a screenshot","url":"https://example.com"}'
```

## MCP Configuration

### Claude Code

Run the config generator:
```bash
./scripts/generate-mcp-configs.sh
```

Or manually add to `~/.config/claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "barrhawk-frank": {
      "command": "bun",
      "args": ["run", "/path/to/barrhawk_premium_e2e_mcp/tripartite/mcp-frank.ts"]
    }
  }
}
```

### Cursor / Windsurf

Add to your MCP settings:
```json
{
  "barrhawk": {
    "command": "bun",
    "args": ["run", "/path/to/barrhawk_premium_e2e_mcp/tripartite/mcp-frank.ts"]
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BRIDGE_URL` | `ws://localhost:7000` | Bridge WebSocket URL |
| `EXPERIENCE_DIR` | `/home/raptor/federal/barrhawk_e2e_premium_mcp/experiencegained` | Experience data storage |
| `ANTHROPIC_API_KEY` | - | Required for Lightning Strike mode |
| `LIGHTNING_ENABLED` | `true` | Enable Igor → Claude escalation |

## Ports

| Port | Component | Description |
|------|-----------|-------------|
| 7000 | Bridge | Message bus, dashboard |
| 7001 | Doctor | Plan generation |
| 7002 | Igor | Plan execution |
| 7003 | Frankenstein | Browser control |
| 7010 | Hub | Test orchestration (--hub mode) |
| 7011 | Coordinator | Multi-Igor sync (--hub mode) |
| 7012 | Igor-DB | Database watcher (--hub mode) |

## Troubleshooting

### Stack won't start
```bash
# Kill any existing processes
pkill -f "bun.*tripartite"

# Check if ports are in use
lsof -i :7000-7003
```

### Playwright not found
```bash
bunx playwright install chromium
```

### Experience not saving
Check `EXPERIENCE_DIR` exists and is writable:
```bash
mkdir -p $EXPERIENCE_DIR
```
