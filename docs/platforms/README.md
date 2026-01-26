# Platform Integration Guides

BarrHawk supports all major AI coding platforms via MCP (Model Context Protocol).

## Supported Platforms

| Platform | Config Format | Config Location | Guide |
|----------|--------------|-----------------|-------|
| **Claude CLI** | JSON | `~/.claude.json` | [CLAUDE_CLI.md](CLAUDE_CLI.md) |
| **Gemini CLI** | JSON | `~/.gemini/settings.json` | [GEMINI_CLI.md](GEMINI_CLI.md) |
| **Codex CLI** | TOML | `~/.codex/config.toml` | [CODEX_CLI.md](CODEX_CLI.md) |
| **Windsurf** | JSON | `~/.codeium/windsurf/mcp_config.json` | [WINDSURF.md](WINDSURF.md) |
| **Cursor** | JSON | `~/.cursor/mcp.json` | [CURSOR.md](CURSOR.md) |
| **Antigravity** | JSON | `~/.antigravity/mcp_config.json` | [ANTIGRAVITY.md](ANTIGRAVITY.md) |

## Quick Setup

Use the config generator script:

```bash
cd barrhawk_premium_e2e_mcp
./scripts/generate-mcp-configs.sh
```

This creates configuration files for all platforms automatically.

## Platform Recommendations

### For Stability
**Gemini CLI** or **Antigravity** - Google's platforms have fewer hanging issues than Claude CLI.

### For Free Usage
**Antigravity** - Generous free tier with thousands of Gemini requests/day.

### For Teams
**Cursor** or **Windsurf** - Good project-level config sharing.

### For Multi-Agent
**Antigravity** - Native Manager Surface for parallel agents.

### For OpenAI Users
**Codex CLI** - Native OpenAI integration.

## Configuration Quick Reference

### Minimal JSON Config (Claude, Gemini, Windsurf, Cursor, Antigravity)

```json
{
  "mcpServers": {
    "barrhawk-frank": {
      "command": "bun",
      "args": ["run", "/path/to/tripartite/mcp-frank.ts"]
    }
  }
}
```

### Minimal TOML Config (Codex)

```toml
[mcp_servers.barrhawk-frank]
command = "bun"
args = ["run", "/path/to/tripartite/mcp-frank.ts"]
```

## AI Backend Configuration

Set `AI_BACKEND` to match your platform for optimal Lightning Strike behavior:

| Platform | AI_BACKEND | API Key Env Var |
|----------|------------|-----------------|
| Claude CLI | `claude` | `ANTHROPIC_API_KEY` |
| Gemini CLI | `gemini` | `GEMINI_API_KEY` |
| Codex CLI | `openai` | `OPENAI_API_KEY` |
| Windsurf | `gemini` or `claude` | Varies |
| Cursor | `claude` or `openai` | Varies |
| Antigravity | `gemini` | `GEMINI_API_KEY` |

## Common Issues

See [TROUBLESHOOTING.md](../TROUBLESHOOTING.md) for solutions to:
- MCP server not connecting
- Tools not appearing
- Timeout errors
- Configuration syntax errors
