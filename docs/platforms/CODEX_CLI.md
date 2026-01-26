# BarrHawk on OpenAI Codex CLI

> Last Updated: 2026-01-26

## Overview

Codex CLI is OpenAI's command-line coding assistant. It uses TOML configuration (unlike other platforms) and provides native MCP support.

## Installation

### 1. Install Codex CLI

```bash
npm install -g @openai/codex-cli
# or
pip install openai-codex
```

### 2. Clone BarrHawk

```bash
git clone https://github.com/barrhawk/barrhawk_premium_e2e_mcp.git
cd barrhawk_premium_e2e_mcp
bun install
```

### 3. Configure MCP

Edit `~/.codex/config.toml`:
```toml
[mcp_servers.barrhawk-frank]
command = "bun"
args = ["run", "/absolute/path/to/tripartite/mcp-frank.ts"]
startup_timeout_sec = 15
tool_timeout_sec = 120
enabled = true
```

**Or use CLI:**
```bash
codex mcp add barrhawk-frank
# Follow prompts
```

### 4. Set Environment

```bash
export AI_BACKEND=openai
export OPENAI_API_KEY=sk-...
```

### 5. Start Tripartite Stack

```bash
cd barrhawk_premium_e2e_mcp/tripartite
./start.sh
```

### 6. Verify Installation

```bash
codex mcp list
# Should show barrhawk-frank
```

## Configuration Options

### Full TOML Example

```toml
[mcp_servers.barrhawk-frank]
command = "bun"
args = ["run", "/path/to/tripartite/mcp-frank.ts"]
startup_timeout_sec = 15
tool_timeout_sec = 120
enabled = true

# Optional: Environment variables
[mcp_servers.barrhawk-frank.env]
AI_BACKEND = "openai"
OPENAI_API_KEY = "sk-..."

# Optional: HTTP headers for remote servers
[mcp_servers.barrhawk-frank.http_headers]
Authorization = "Bearer token"
```

### Remote HTTP Server

```toml
[mcp_servers.barrhawk-remote]
url = "https://your-server.com/mcp"
bearer_token_env_var = "BARRHAWK_TOKEN"
tool_timeout_sec = 60
```

### Disable Without Removing

```toml
[mcp_servers.barrhawk-frank]
enabled = false
# Rest of config...
```

## CLI Management

```bash
# Add server
codex mcp add barrhawk-frank

# List servers
codex mcp list

# Remove server
codex mcp remove barrhawk-frank

# Test server
codex mcp test barrhawk-frank
```

## Available Tools

All BarrHawk tools are available with `frank_` prefix:

| Tool | Description |
|------|-------------|
| `frank_execute` | Natural language automation |
| `frank_screenshot` | Capture browser |
| `frank_browser_launch` | Start browser |
| `frank_browser_navigate` | Go to URL |
| `frank_browser_click` | Click element |
| `frank_browser_type` | Type text |
| `frank_swarm_execute` | Parallel testing |

## Lightning Strike Configuration

For OpenAI-powered Lightning Strike:

```bash
export AI_BACKEND=openai
export OPENAI_API_KEY=sk-...
```

This ensures Igor uses GPT models when escalating from dumb mode.

## Timeouts

Codex has configurable timeouts:

| Setting | Default | Description |
|---------|---------|-------------|
| `startup_timeout_sec` | 10 | Server startup timeout |
| `tool_timeout_sec` | 60 | Individual tool execution timeout |

For browser automation, increase tool timeout:
```toml
tool_timeout_sec = 120
```

## Debugging

View MCP logs:
```bash
codex --verbose
# or
export CODEX_DEBUG=1
codex
```

## Running Codex as MCP Server

Codex can itself run as an MCP server:
```bash
codex serve --mcp
```

This allows chaining: Claude/Gemini → Codex MCP → BarrHawk MCP

## Best Practices

1. **Use TOML syntax carefully** - TOML is stricter than JSON
2. **Set appropriate timeouts** - Browser ops need longer timeouts
3. **Use `enabled = false`** - To temporarily disable without removing config
4. **Test with `codex mcp test`** - Verify server connectivity

## Example Session

```bash
$ codex

> Use barrhawk to automate testing example.com login

[MCP: barrhawk-frank] Connecting...
[MCP: barrhawk-frank] frank_browser_launch
[MCP: barrhawk-frank] frank_browser_navigate: https://example.com/login
[MCP: barrhawk-frank] frank_execute: "Fill login form and submit"

Test completed:
✓ Browser launched
✓ Navigated to login page
✓ Form submitted successfully
```

## Troubleshooting

### "Command not found: bun"

Ensure bun is in your PATH:
```bash
export PATH="$HOME/.bun/bin:$PATH"
```

### Tool Timeout

Increase timeout in config:
```toml
tool_timeout_sec = 180
```

### Server Won't Start

Check startup timeout:
```toml
startup_timeout_sec = 30
```

## Resources

- [Codex CLI Docs](https://developers.openai.com/codex/cli/)
- [Codex MCP Reference](https://developers.openai.com/codex/mcp/)
- [Codex Config Reference](https://developers.openai.com/codex/config-reference/)
- [BarrHawk API Reference](../API_REFERENCE.md)
