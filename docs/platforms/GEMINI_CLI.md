# BarrHawk on Gemini CLI

> Last Updated: 2026-01-26

## Overview

Gemini CLI is Google's official command-line interface for Gemini. It provides native MCP support with excellent stability and generous free tier limits.

## Installation

### 1. Install Gemini CLI

```bash
npm install -g @anthropic-ai/gemini-cli
# or
brew install gemini-cli
```

### 2. Clone BarrHawk

```bash
git clone https://github.com/barrhawk/barrhawk_premium_e2e_mcp.git
cd barrhawk_premium_e2e_mcp
bun install
```

### 3. Configure MCP

Edit `~/.gemini/settings.json`:
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

For project-specific config, create `.gemini/settings.json` in your project root.

### 4. Set Environment

```bash
export AI_BACKEND=gemini
export GEMINI_API_KEY=your-api-key
```

### 5. Start Tripartite Stack

```bash
cd barrhawk_premium_e2e_mcp/tripartite
./start.sh
```

### 6. Verify Installation

```bash
gemini --debug
# Check for barrhawk-frank in loaded MCP servers
```

## Configuration Options

### Remote HTTP Server

For remote deployment:
```json
{
  "mcpServers": {
    "barrhawk-remote": {
      "httpUrl": "https://your-server.com/mcp",
      "headers": {
        "Authorization": "Bearer ${BARRHAWK_TOKEN}"
      }
    }
  }
}
```

### Trust Mode

Skip confirmation dialogs (use carefully):
```json
{
  "mcpServers": {
    "barrhawk-frank": {
      "command": "bun",
      "args": ["run", "/path/to/mcp-frank.ts"],
      "trust": true
    }
  }
}
```

### OAuth Support

For authenticated servers:
```json
{
  "mcpServers": {
    "barrhawk-oauth": {
      "httpUrl": "https://your-server.com/mcp",
      "oauth": {
        "clientId": "your-client-id",
        "scopes": ["read", "write"]
      }
    }
  }
}
```

## Available Tools

All `frank_*` tools are available:

- `frank_execute` - Natural language automation
- `frank_screenshot` - Browser screenshots
- `frank_browser_*` - Browser control
- `frank_swarm_execute` - Parallel testing
- `frank_tools_create` - Dynamic tool creation

## Lightning Strike Configuration

When using Gemini CLI, configure Lightning Strike to use Gemini:

```bash
export AI_BACKEND=gemini
export GEMINI_API_KEY=your-api-key
```

This ensures Igor's AI escalation uses Gemini instead of Claude.

## Debugging

Enable debug mode:
```bash
gemini --debug
# Or press F12 in interactive mode
```

View MCP server logs:
```bash
tail -f ~/.gemini/logs/mcp-barrhawk-frank.log
```

## Best Practices

1. **Use Gemini for stability** - More reliable than Claude CLI for long sessions
2. **Set AI_BACKEND=gemini** - Ensures consistent backend usage
3. **Use trust mode sparingly** - Only for servers you control
4. **Check free tier limits** - Thousands of requests/day on free tier

## Example Session

```
> gemini

Welcome to Gemini CLI!

> Use barrhawk to test the login page at example.com

[barrhawk-frank] Launching browser...
[barrhawk-frank] Navigating to https://example.com/login
[barrhawk-frank] Testing login flow...

Login test completed successfully:
- Page loaded in 1.2s
- Form fields detected: username, password
- Submit button found
- Login successful with test credentials
```

## Troubleshooting

### MCP Server Not Loading

1. Check config syntax:
   ```bash
   cat ~/.gemini/settings.json | jq .
   ```

2. Verify bun is in PATH:
   ```bash
   which bun
   ```

3. Test server directly:
   ```bash
   bun run tripartite/mcp-frank.ts
   ```

### Timeout Errors

Increase timeout in settings:
```json
{
  "mcpServers": {
    "barrhawk-frank": {
      "command": "bun",
      "args": ["run", "/path/to/mcp-frank.ts"],
      "timeout": 120000
    }
  }
}
```

## Resources

- [Gemini CLI Docs](https://geminicli.com/docs)
- [Gemini CLI MCP Guide](https://geminicli.com/docs/tools/mcp-server/)
- [BarrHawk API Reference](../API_REFERENCE.md)
