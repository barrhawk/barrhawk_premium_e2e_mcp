# BarrHawk on Cursor IDE

> Last Updated: 2026-01-26

## Overview

Cursor is an AI-first code editor with native MCP support. It provides both UI and file-based configuration for MCP servers.

## Installation

### 1. Install Cursor

Download from [cursor.com](https://cursor.com) or update existing installation.

### 2. Clone BarrHawk

```bash
git clone https://github.com/barrhawk/barrhawk_premium_e2e_mcp.git
cd barrhawk_premium_e2e_mcp
bun install
```

### 3. Configure MCP

**Option A: Via UI**

1. Press `Cmd+Shift+P` / `Ctrl+Shift+P`
2. Search "MCP" → Select "View: Open MCP Settings"
3. Click "Tools & Integrations"
4. Click "Add Custom MCP"
5. Cursor opens `mcp.json` for editing

**Option B: Edit config directly**

**Global config** (`~/.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "barrhawk-frank": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/tripartite/mcp-frank.ts"]
    }
  }
}
```

**Project config** (`.cursor/mcp.json` in project root):
```json
{
  "mcpServers": {
    "barrhawk-frank": {
      "command": "bun",
      "args": ["run", "./tripartite/mcp-frank.ts"]
    }
  }
}
```

### 4. Start Tripartite Stack

```bash
cd barrhawk_premium_e2e_mcp/tripartite
./start.sh
```

### 5. Restart Cursor

Restart the editor to load MCP configuration.

### 6. Verify Installation

1. Open Command Palette (`Cmd+Shift+P`)
2. Run "View: Open MCP Settings"
3. Verify barrhawk-frank shows as connected

## Configuration Options

### Basic STDIO Server

```json
{
  "mcpServers": {
    "barrhawk-frank": {
      "command": "bun",
      "args": ["run", "/path/to/mcp-frank.ts"]
    }
  }
}
```

### With Environment Variables

```json
{
  "mcpServers": {
    "barrhawk-frank": {
      "command": "bun",
      "args": ["run", "/path/to/mcp-frank.ts"],
      "env": {
        "AI_BACKEND": "claude",
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}"
      }
    }
  }
}
```

### Remote HTTP Server

```json
{
  "mcpServers": {
    "barrhawk-remote": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://your-server.com/mcp",
        "--header",
        "Authorization: Bearer ${BARRHAWK_TOKEN}"
      ],
      "env": {
        "BARRHAWK_TOKEN": "your-token"
      }
    }
  }
}
```

## Using MCP in Cursor

### Agent Mode (Required)

MCP tools only work in **Agent mode**:

1. Open AI pane (sidebar or `Cmd+L`)
2. Select "Agent" from dropdown (not "Chat" or "Edit")
3. MCP tools are now available

### Yolo Mode

Auto-approve tool usage without prompts:

1. Settings → AI → Enable "Yolo Mode"
2. Tools run without confirmation

**Warning:** Only enable for trusted servers.

### Tool Approval

Without Yolo mode, Cursor prompts for each tool use:
- Click "Allow" for single use
- Click "Always Allow" for session
- Click "Deny" to block

## Available Tools

| Tool | Description |
|------|-------------|
| `frank_execute` | Natural language automation |
| `frank_screenshot` | Browser screenshots |
| `frank_browser_launch` | Start browser |
| `frank_browser_navigate` | Navigate to URL |
| `frank_browser_click` | Click elements |
| `frank_browser_type` | Type into inputs |
| `frank_swarm_execute` | Parallel testing |
| `frank_tools_create` | Create dynamic tools |

## Example Usage

In Cursor's Agent mode:

```
Use barrhawk to test the checkout flow:
1. Go to https://shop.example.com
2. Add item to cart
3. Proceed to checkout
4. Fill in test payment details
5. Verify order confirmation
```

Cursor will orchestrate the `frank_*` tools automatically.

## Project vs Global Config

| Location | Scope | Use Case |
|----------|-------|----------|
| `~/.cursor/mcp.json` | All projects | Personal tools |
| `.cursor/mcp.json` | Single project | Team shared config |

Project config is committed to git and shared with team.

## Troubleshooting

### Tools Not Appearing

1. Verify Agent mode is selected
2. Check MCP Settings for connection status
3. Restart Cursor

### "Command not found"

Ensure bun is in PATH:
```bash
# Add to ~/.zshrc or ~/.bashrc
export PATH="$HOME/.bun/bin:$PATH"
```

### Permission Denied

Check file permissions:
```bash
chmod +x /path/to/mcp-frank.ts
```

### Config Not Loading

1. Validate JSON syntax:
   ```bash
   cat ~/.cursor/mcp.json | jq .
   ```

2. Check for trailing commas (invalid in JSON)

3. Use absolute paths

## Best Practices

1. **Use Agent mode** - MCP requires Agent mode
2. **Project configs for teams** - Share via `.cursor/mcp.json`
3. **Global configs for personal** - Use `~/.cursor/mcp.json`
4. **Consider Yolo mode** - For trusted servers only
5. **Use absolute paths** - More reliable than relative

## Resources

- [Cursor MCP Docs](https://cursor.com/docs/context/mcp)
- [Cursor CLI MCP](https://cursor.com/docs/cli/mcp)
- [Building MCP Servers](https://cursor.com/docs/cookbook/building-mcp-server)
- [BarrHawk API Reference](../API_REFERENCE.md)
