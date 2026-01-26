# BarrHawk on Google Antigravity IDE

> Last Updated: 2026-01-26

## Overview

Google Antigravity is Google's AI-first IDE built on VS Code with deep Gemini integration. It features a massive MCP marketplace, multi-agent orchestration, and generous free tier limits.

**Key Advantages:**
- Free tier with thousands of Gemini requests/day
- 1,500+ MCP servers in marketplace
- Native multi-agent support ("Manager Surface")
- Pre-configured popular integrations (Notion, G Suite, etc.)

## Installation

### 1. Install Antigravity

Download from [antigravity-ide.com](https://antigravity-ide.com) or:
```bash
# Via Google Cloud SDK
gcloud components install antigravity

# Or standalone installer
curl -fsSL https://antigravity.dev/install.sh | bash
```

### 2. Clone BarrHawk

```bash
git clone https://github.com/barrhawk/barrhawk_premium_e2e_mcp.git
cd barrhawk_premium_e2e_mcp
bun install
```

### 3. Configure MCP

**Option A: Via MCP Hub (Recommended)**

1. Open Command Palette (`Cmd+Shift+P`)
2. Search "MCP: Add Server"
3. Select "Custom Server"
4. Enter configuration details

**Option B: Edit config directly**

Edit `~/.antigravity/mcp_config.json`:
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

1. Open MCP Hub (sidebar icon)
2. Verify barrhawk-frank shows connected
3. Tools should appear in agent palette

## Why Antigravity for BarrHawk?

### Multi-Agent Native

Antigravity's "Manager Surface" aligns perfectly with BarrHawk's swarm mode:

```
Antigravity Manager Surface
    ├── Agent 1 → BarrHawk Igor (login tests)
    ├── Agent 2 → BarrHawk Igor (cart tests)
    └── Agent 3 → BarrHawk Igor (checkout tests)
```

Use `frank_swarm_execute` to leverage this:
```
Test the full e-commerce flow with parallel agents:
- Login flow
- Product search
- Cart operations
- Checkout process
```

### Free Tier Benefits

| Feature | Antigravity Free | Others |
|---------|-----------------|--------|
| Gemini requests | Thousands/day | Limited |
| MCP servers | Unlimited | Varies |
| Multi-agent | Yes | No |
| Cost | $0 | $20-100/mo |

## Configuration Options

### Basic Configuration

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

### With Gemini Backend

```json
{
  "mcpServers": {
    "barrhawk-frank": {
      "command": "bun",
      "args": ["run", "/path/to/mcp-frank.ts"],
      "env": {
        "AI_BACKEND": "gemini",
        "GEMINI_API_KEY": "${GEMINI_API_KEY}"
      }
    }
  }
}
```

### Remote Server

```json
{
  "mcpServers": {
    "barrhawk-remote": {
      "url": "https://your-server.com/mcp",
      "headers": {
        "Authorization": "Bearer ${BARRHAWK_TOKEN}"
      }
    }
  }
}
```

## Manager Surface Integration

Antigravity's Manager Surface lets you spawn multiple agents. Combine with BarrHawk:

### Example: Parallel E2E Testing

1. Open Manager Surface (`Cmd+Shift+M`)
2. Create agents:
   - "Login Tester" → Prompt: "Use barrhawk to test login flows"
   - "Cart Tester" → Prompt: "Use barrhawk to test cart operations"
   - "Checkout Tester" → Prompt: "Use barrhawk to test checkout"
3. Run all agents simultaneously
4. View consolidated results

### Example: Cross-Browser Testing

1. Create multiple agents
2. Each targets different browser config
3. Run in parallel via Manager Surface

## Available Tools

All BarrHawk tools optimized for Gemini:

| Tool | Description | Works with Multi-Agent |
|------|-------------|----------------------|
| `frank_execute` | NL automation | Yes |
| `frank_swarm_execute` | Parallel testing | Native fit |
| `frank_swarm_analyze` | Route analysis | Yes |
| `frank_browser_*` | Browser control | Per-agent |
| `frank_screenshot` | Captures | Yes |
| `frank_tools_create` | Dynamic tools | Shared |

## Pre-Configured Integrations

Antigravity comes with these MCP servers pre-installed:
- Google Drive
- Google Docs
- Google Sheets
- Notion
- Context7
- Playwright
- Docker
- Supabase

BarrHawk complements these for E2E testing workflows.

## Example Workflow

```
In Antigravity:

> Open Manager Surface and create a testing swarm:

Agent 1 (Auth Specialist):
"Use barrhawk to thoroughly test authentication:
- Login with valid creds
- Login with invalid creds
- Password reset flow
- Session timeout
- Remember me functionality"

Agent 2 (Commerce Specialist):
"Use barrhawk to test the shopping experience:
- Product search
- Filtering and sorting
- Add to cart
- Quantity updates
- Remove from cart"

Agent 3 (Checkout Specialist):
"Use barrhawk to test checkout:
- Guest checkout
- Registered checkout
- Payment methods
- Shipping options
- Order confirmation"

[Run All Agents]

Results:
✓ Auth: 12/12 tests passed
✓ Commerce: 8/8 tests passed
✓ Checkout: 6/6 tests passed

Total: 26/26 E2E scenarios validated
```

## Troubleshooting

### MCP Not Loading

1. Check Antigravity version (needs latest)
2. Verify config location: `~/.antigravity/mcp_config.json`
3. Restart Antigravity

### Gemini Rate Limits

Even with generous limits, you might hit them during heavy testing:
1. Use swarm mode to parallelize
2. Add delays between rapid operations
3. Check rate limit status in Antigravity console

### Tools Not in Palette

1. Open MCP Hub
2. Click refresh
3. Ensure server shows "Connected"

## Best Practices

1. **Use Gemini backend** - Native integration, no extra API costs
2. **Leverage Manager Surface** - For parallel testing
3. **Combine with pre-installed MCPs** - Playwright + BarrHawk for comprehensive testing
4. **Use free tier** - More cost-effective than other platforms
5. **Set AI_BACKEND=gemini** - Ensures Lightning Strike uses Gemini

## Resources

- [Antigravity Documentation](https://developers.google.com/antigravity)
- [Manager Surface Guide](https://antigravity-ide.com/docs/manager-surface)
- [MCP Marketplace](https://antigravity.codes)
- [BarrHawk API Reference](../API_REFERENCE.md)
