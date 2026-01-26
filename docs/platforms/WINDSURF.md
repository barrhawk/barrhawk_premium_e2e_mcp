# BarrHawk on Windsurf IDE

> Last Updated: 2026-01-26

## Overview

Windsurf is an AI-powered IDE with native MCP support through Cascade. It provides a visual interface for MCP configuration and an MCP marketplace.

## Installation

### 1. Install Windsurf

Download from [windsurf.com](https://windsurf.com) or:
```bash
# macOS
brew install --cask windsurf

# Linux
snap install windsurf
```

### 2. Clone BarrHawk

```bash
git clone https://github.com/barrhawk/barrhawk_premium_e2e_mcp.git
cd barrhawk_premium_e2e_mcp
bun install
```

### 3. Configure MCP

**Option A: Via UI (Recommended)**

1. Open Windsurf Settings (bottom right gear icon)
2. Or press `Cmd+Shift+P` / `Ctrl+Shift+P` → "Open Windsurf Settings"
3. Navigate to Cascade → MCP Servers
4. Click "Add Custom MCP"
5. Enter configuration

**Option B: Edit config directly**

Edit `~/.codeium/windsurf/mcp_config.json`:
```json
{
  "mcpServers": {
    "barrhawk-frank": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/tripartite/mcp-frank.ts"],
      "env": {
        "AI_BACKEND": "gemini"
      }
    }
  }
}
```

### 4. Start Tripartite Stack

```bash
cd barrhawk_premium_e2e_mcp/tripartite
./start.sh
```

### 5. Restart Windsurf

Restart the IDE to load the new MCP configuration.

### 6. Verify Installation

1. Open Cascade panel (right sidebar)
2. Click MCP icon (top right of Cascade)
3. Verify barrhawk-frank is listed and connected

## Configuration Options

### Basic Configuration

```json
{
  "mcpServers": {
    "barrhawk-frank": {
      "command": "bun",
      "args": ["run", "/path/to/mcp-frank.ts"],
      "env": {}
    }
  }
}
```

### Remote HTTP Server

```json
{
  "mcpServers": {
    "barrhawk-remote": {
      "serverUrl": "https://your-server.com/mcp",
      "headers": {
        "Authorization": "Bearer ${BARRHAWK_TOKEN}"
      }
    }
  }
}
```

### With OAuth

```json
{
  "mcpServers": {
    "barrhawk-oauth": {
      "serverUrl": "https://your-server.com/mcp",
      "oauth": {
        "clientId": "your-client-id",
        "authUrl": "https://auth.example.com/oauth",
        "scopes": ["read", "write"]
      }
    }
  }
}
```

## Important: Tool Limit

**Windsurf has a 100 tool limit** across all MCP servers.

BarrHawk Frank provides ~25 tools. If you hit the limit:
1. Disable unused MCP servers
2. Or use BarrHawk Beta (fewer tools) instead of Frank

## Available Tools

In Cascade's Agent mode, you'll have access to:

| Tool | Description |
|------|-------------|
| `frank_execute` | Natural language automation |
| `frank_screenshot` | Capture browser |
| `frank_browser_*` | Browser control |
| `frank_swarm_*` | Swarm orchestration |
| `frank_tools_*` | Dynamic tools |

## Using BarrHawk in Windsurf

### Enable Agent Mode

1. Open Cascade panel
2. Select "Agent" mode (not "Chat")
3. MCP tools are only available in Agent mode

### Example Prompt

```
Use barrhawk to:
1. Launch a browser
2. Navigate to https://example.com
3. Take a screenshot
4. Test the login form with test@example.com
```

Cascade will automatically use the appropriate `frank_*` tools.

## MCP Marketplace

Windsurf has a built-in MCP marketplace:

1. Click MCPs icon in Cascade panel
2. Browse available servers
3. One-click install

Note: BarrHawk is not yet in the marketplace. Use manual configuration above.

## Troubleshooting

### MCP Server Not Connecting

1. Check config syntax:
   ```bash
   cat ~/.codeium/windsurf/mcp_config.json | jq .
   ```

2. Install required packages:
   ```bash
   npm install -g mcp-remote
   ```

3. Restart Windsurf completely

### Tools Not Appearing

1. Verify Agent mode is selected (not Chat)
2. Check tool limit (100 max)
3. Click refresh in MCP panel

### "npx not found"

Ensure Node.js is installed and in PATH:
```bash
which npx
# If not found:
brew install node
# or
nvm install --lts
```

## Best Practices

1. **Use Agent mode** - MCP tools only work in Agent mode
2. **Monitor tool count** - Stay under 100 total tools
3. **Use absolute paths** - Relative paths may fail
4. **Restart after config changes** - Windsurf caches MCP configs

## Resources

- [Windsurf Docs](https://docs.windsurf.com)
- [Cascade MCP Integration](https://docs.windsurf.com/windsurf/cascade/mcp)
- [Windsurf MCP Tutorial](https://windsurf.com/university/tutorials/configuring-first-mcp-server)
- [BarrHawk API Reference](../API_REFERENCE.md)
