# BarrHawk on Claude Code CLI

> Last Updated: 2026-01-26

## Overview

Claude Code is Anthropic's official CLI for Claude. It provides native MCP support for connecting to external tools like BarrHawk.

## Installation

### 1. Clone BarrHawk

```bash
git clone https://github.com/barrhawk/barrhawk_premium_e2e_mcp.git
cd barrhawk_premium_e2e_mcp
bun install
```

### 2. Configure MCP

**Option A: Using CLI (Recommended)**
```bash
claude mcp add barrhawk-frank --scope user
# When prompted, enter:
# Command: bun
# Args: run /path/to/barrhawk_premium_e2e_mcp/tripartite/mcp-frank.ts
```

**Option B: Edit config directly**

Edit `~/.claude.json`:
```json
{
  "mcpServers": {
    "barrhawk-frank": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/tripartite/mcp-frank.ts"],
      "env": {}
    }
  }
}
```

### 3. Start Tripartite Stack

```bash
cd barrhawk_premium_e2e_mcp/tripartite
./start.sh
```

### 4. Restart Claude Code

```bash
pkill -f claude
claude
```

### 5. Verify Installation

```bash
# In Claude Code
/mcp
# Should show barrhawk-frank with frank_* tools
```

## Configuration Options

### Scopes

| Scope | Location | Use Case |
|-------|----------|----------|
| `user` | `~/.claude.json` | Available in all projects |
| `project` | `.mcp.json` | Shared with team |
| `local` | `.mcp.json` | Your project only |

### Environment Variables

Add to the `env` section:
```json
{
  "env": {
    "AI_BACKEND": "claude",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

### Token Limits

Claude Code has a default 25K token limit per tool output. Increase if needed:
```bash
export MAX_MCP_OUTPUT_TOKENS=50000
```

## Available Tools

Once connected, you'll have access to:

- `frank_execute` - Natural language browser automation
- `frank_screenshot` - Capture browser state
- `frank_browser_*` - Direct browser control
- `frank_swarm_execute` - Parallel multi-agent testing
- `frank_tools_create` - Create dynamic tools

## Known Issues

### CLI Hanging

Claude Code CLI may hang during long sessions. Workarounds:

1. **Force kill and resume:**
   ```bash
   pkill -9 -f claude
   claude /resume
   ```

2. **Use shorter sessions** - Break tasks into smaller chunks

3. **Monitor health:**
   ```bash
   curl http://localhost:7000/health
   ```

See [TROUBLESHOOTING.md](../TROUBLESHOOTING.md) for more solutions.

## Best Practices

1. **Use absolute paths** in config - relative paths may fail
2. **Start tripartite first** - MCP server needs backend running
3. **Check health endpoints** - Verify all components are up
4. **Set AI_BACKEND=claude** - Ensures Lightning Strike uses Claude API

## Example Session

```
> Launch a browser and go to example.com

Using frank_browser_launch...
Using frank_browser_navigate...
Browser navigated to https://example.com

> Take a screenshot

Using frank_screenshot...
Screenshot saved to /tmp/tripartite-screenshots/screenshot-1706234567.png

> Test the login flow with user test@example.com

Using frank_execute...
Executing: "Test the login flow with user test@example.com"
...
```

## Resources

- [Claude Code Docs](https://code.claude.com/docs)
- [Claude MCP Documentation](https://code.claude.com/docs/en/mcp)
- [BarrHawk API Reference](../API_REFERENCE.md)
