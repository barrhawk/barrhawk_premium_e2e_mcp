#!/bin/bash
# BarrHawk MCP Config Generator
# Generates configuration files for all supported AI platforms
#
# Usage: ./generate-mcp-configs.sh [path-to-mcp-frank.ts]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}BarrHawk MCP Config Generator${NC}"
echo "=============================="
echo ""

# Determine BarrHawk path
if [ -n "$1" ]; then
    BARRHAWK_PATH="$1"
elif [ -f "$(pwd)/tripartite/mcp-frank.ts" ]; then
    BARRHAWK_PATH="$(pwd)/tripartite/mcp-frank.ts"
elif [ -f "$(dirname "$0")/../tripartite/mcp-frank.ts" ]; then
    BARRHAWK_PATH="$(cd "$(dirname "$0")/.." && pwd)/tripartite/mcp-frank.ts"
else
    echo -e "${RED}Error: Could not find mcp-frank.ts${NC}"
    echo "Usage: $0 [path-to-mcp-frank.ts]"
    exit 1
fi

echo -e "Using BarrHawk path: ${YELLOW}$BARRHAWK_PATH${NC}"
echo ""

# Verify file exists
if [ ! -f "$BARRHAWK_PATH" ]; then
    echo -e "${RED}Error: File not found: $BARRHAWK_PATH${NC}"
    exit 1
fi

# Function to create config with backup
create_config() {
    local path="$1"
    local content="$2"
    local name="$3"

    # Create directory if needed
    mkdir -p "$(dirname "$path")"

    # Backup existing config
    if [ -f "$path" ]; then
        cp "$path" "${path}.backup.$(date +%Y%m%d%H%M%S)"
        echo -e "  ${YELLOW}Backed up existing config${NC}"
    fi

    # Write new config
    echo "$content" > "$path"
    echo -e "  ${GREEN}Created: $path${NC}"
}

# ====================
# Claude CLI
# ====================
echo -e "\n${GREEN}[1/6] Claude CLI${NC}"
CLAUDE_CONFIG='{
  "mcpServers": {
    "barrhawk-frank": {
      "command": "bun",
      "args": ["run", "'"$BARRHAWK_PATH"'"],
      "env": {}
    },
    "barrhawk-beta": {
      "command": "bun",
      "args": ["run", "'"$(dirname "$BARRHAWK_PATH")/../packages/supervisor/primary/index.ts"'"],
      "env": {}
    }
  }
}'

# Check for existing claude config and merge if needed
if [ -f ~/.claude.json ]; then
    echo -e "  ${YELLOW}Existing config found - please manually merge:${NC}"
    echo "$CLAUDE_CONFIG"
else
    create_config ~/.claude.json "$CLAUDE_CONFIG" "Claude CLI"
fi

# ====================
# Gemini CLI
# ====================
echo -e "\n${GREEN}[2/6] Gemini CLI${NC}"
GEMINI_CONFIG='{
  "mcpServers": {
    "barrhawk-frank": {
      "command": "bun",
      "args": ["run", "'"$BARRHAWK_PATH"'"]
    }
  }
}'

if [ -f ~/.gemini/settings.json ]; then
    echo -e "  ${YELLOW}Existing config found - please manually merge:${NC}"
    echo "$GEMINI_CONFIG"
else
    create_config ~/.gemini/settings.json "$GEMINI_CONFIG" "Gemini CLI"
fi

# ====================
# OpenAI Codex CLI
# ====================
echo -e "\n${GREEN}[3/6] OpenAI Codex CLI${NC}"
CODEX_CONFIG='[mcp_servers.barrhawk-frank]
command = "bun"
args = ["run", "'"$BARRHAWK_PATH"'"]
startup_timeout_sec = 15
tool_timeout_sec = 120
enabled = true
'

if [ -f ~/.codex/config.toml ]; then
    echo -e "  ${YELLOW}Existing config found - append this to ~/.codex/config.toml:${NC}"
    echo "$CODEX_CONFIG"
else
    create_config ~/.codex/config.toml "$CODEX_CONFIG" "Codex CLI"
fi

# ====================
# Windsurf IDE
# ====================
echo -e "\n${GREEN}[4/6] Windsurf IDE${NC}"
WINDSURF_CONFIG='{
  "mcpServers": {
    "barrhawk-frank": {
      "command": "bun",
      "args": ["run", "'"$BARRHAWK_PATH"'"],
      "env": {}
    }
  }
}'

if [ -f ~/.codeium/windsurf/mcp_config.json ]; then
    echo -e "  ${YELLOW}Existing config found - please manually merge:${NC}"
    echo "$WINDSURF_CONFIG"
else
    create_config ~/.codeium/windsurf/mcp_config.json "$WINDSURF_CONFIG" "Windsurf"
fi

# ====================
# Cursor IDE
# ====================
echo -e "\n${GREEN}[5/6] Cursor IDE${NC}"
CURSOR_CONFIG='{
  "mcpServers": {
    "barrhawk-frank": {
      "command": "bun",
      "args": ["run", "'"$BARRHAWK_PATH"'"]
    }
  }
}'

if [ -f ~/.cursor/mcp.json ]; then
    echo -e "  ${YELLOW}Existing config found - please manually merge:${NC}"
    echo "$CURSOR_CONFIG"
else
    create_config ~/.cursor/mcp.json "$CURSOR_CONFIG" "Cursor"
fi

# ====================
# Antigravity IDE
# ====================
echo -e "\n${GREEN}[6/6] Google Antigravity IDE${NC}"
ANTIGRAVITY_CONFIG='{
  "mcpServers": {
    "barrhawk-frank": {
      "command": "bun",
      "args": ["run", "'"$BARRHAWK_PATH"'"]
    }
  }
}'

# Antigravity uses similar config to Windsurf (same team)
if [ -f ~/.antigravity/mcp_config.json ]; then
    echo -e "  ${YELLOW}Existing config found - please manually merge:${NC}"
    echo "$ANTIGRAVITY_CONFIG"
else
    create_config ~/.antigravity/mcp_config.json "$ANTIGRAVITY_CONFIG" "Antigravity"
fi

# ====================
# Summary
# ====================
echo ""
echo -e "${GREEN}=============================="
echo "Configuration Complete!"
echo "==============================${NC}"
echo ""
echo "Next steps:"
echo "  1. Restart your AI tool/IDE"
echo "  2. Verify BarrHawk tools are available"
echo "  3. Start the tripartite stack: cd tripartite && ./start.sh"
echo ""
echo "Config locations:"
echo "  Claude CLI:    ~/.claude.json"
echo "  Gemini CLI:    ~/.gemini/settings.json"
echo "  Codex CLI:     ~/.codex/config.toml"
echo "  Windsurf:      ~/.codeium/windsurf/mcp_config.json"
echo "  Cursor:        ~/.cursor/mcp.json"
echo "  Antigravity:   ~/.antigravity/mcp_config.json"
echo ""
echo -e "${YELLOW}Note: If you have existing configs, manually merge the BarrHawk entries.${NC}"
