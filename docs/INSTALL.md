# BarrHawk E2E MCP - Installation Guide

## Quick Install (Claude Code CLI)

### 1. Clone & Build

```bash
git clone https://github.com/barrhawk/barrhawk-e2e-mcp.git
cd barrhawk-e2e-mcp
npm install
npm run build
```

### 2. Add to Claude Code Config

Edit your Claude Code MCP config:

```bash
# Linux/Mac
nano ~/.config/claude/claude_desktop_config.json

# Or find it via Claude Code
claude config
```

Add BarrHawk to the `mcpServers` section:

```json
{
  "mcpServers": {
    "barrhawk-e2e": {
      "command": "node",
      "args": ["/full/path/to/barrhawk-e2e-mcp/dist/index.js"],
      "env": {}
    }
  }
}
```

**Important:** Use the FULL absolute path to `dist/index.js`

### 3. Restart Claude Code

```bash
# Kill any running Claude Code instances
pkill -f "claude"

# Restart
claude
```

### 4. Verify Installation

In Claude Code, run:
```
/mcp
```

You should see `barrhawk-e2e` listed with 119 tools.

---

## Tool Categories (119 Total)

| Category | Tools | Prefix |
|----------|-------|--------|
| Browser Automation | 36 | `browser_*`, `worker_*` |
| Database (PostgreSQL) | 6 | `db_pg_*` |
| Database (SQLite) | 4 | `db_sqlite_*` |
| Database (Redis) | 8 | `db_redis_*` |
| GitHub | 18 | `gh_*` |
| Docker | 18 | `docker_*`, `compose_*` |
| Filesystem | 19 | `fs_*` |
| MCP Orchestration | 10 | `mcp_*` |

---

## Optional: External Services

### PostgreSQL (for `db_pg_*` tools)

```bash
# Docker
docker run -d --name postgres \
  -e POSTGRES_PASSWORD=secret \
  -p 5432:5432 \
  postgres:16

# Then in Claude:
# db_pg_connect with host: localhost, password: secret
```

### Redis (for `db_redis_*` tools)

```bash
docker run -d --name redis -p 6379:6379 redis:7

# Then in Claude:
# db_redis_connect with host: localhost
```

### GitHub (for `gh_*` tools)

1. Create a Personal Access Token at https://github.com/settings/tokens
2. Use `gh_connect` with your token

```
gh_connect with token: ghp_xxxxxxxxxxxx
```

### Docker (for `docker_*` tools)

Docker daemon must be running:

```bash
# Check if running
docker ps

# Start if needed (systemd)
sudo systemctl start docker
```

---

## Configuration File

BarrHawk looks for `barrhawk.config.json` in the working directory:

```json
{
  "browser": {
    "headless": false,
    "defaultTimeout": 30000,
    "viewport": {
      "width": 1280,
      "height": 720
    }
  },
  "screenshots": {
    "directory": "./screenshots",
    "maxDimension": 1500
  },
  "selfHealing": {
    "enabled": true,
    "minConfidence": 0.7
  }
}
```

---

## Troubleshooting

### "Tool not found"

Make sure the path in `claude_desktop_config.json` is absolute:
```json
// ✗ Wrong
"args": ["./dist/index.js"]

// ✓ Correct
"args": ["/home/user/barrhawk-e2e-mcp/dist/index.js"]
```

### "Cannot find module"

Rebuild:
```bash
npm run clean
npm install
npm run build
```

### Browser doesn't launch

Install Playwright browsers:
```bash
npx playwright install chromium
```

### Permission denied (Linux)

```bash
# For Chrome sandbox
sudo sysctl -w kernel.unprivileged_userns_clone=1

# Or run headless
# Set headless: true in config
```

---

## Example Usage

Once installed, try these in Claude Code:

```
# Launch browser and navigate
browser_launch
browser_navigate to https://example.com
browser_screenshot

# Database operations
db_sqlite_open path: ./test.db
db_sqlite_query query: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)"
db_sqlite_query query: "INSERT INTO users (name) VALUES ('Alice')"
db_sqlite_query query: "SELECT * FROM users"

# Filesystem
fs_list path: /home
fs_search path: . pattern: "*.json"

# Docker (if running)
docker_ps
docker_images
```

---

## Version

**v0.4.0-abcd** - Full SDLC MCP with 119 tools

- Browser: Playwright parity + Squad Mode
- Database: PostgreSQL, SQLite, Redis
- GitHub: Full API
- Docker: Containers + Compose
- Filesystem: Advanced operations
- Orchestration: MCP hub routing
