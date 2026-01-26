# BarrHawk Premium E2E

> **NOTICE** | Updated: 2026-01-26
>
> **Claude Code CLI Stability Issues**: We are experiencing intermittent hanging and freezing issues with Claude Code CLI during extended testing sessions. These are [known upstream issues](https://github.com/anthropics/claude-code/issues/13240) affecting long-running automated workflows.
>
> **Multi-Platform Support Now Available**: BarrHawk now supports **all major AI platforms** with a unified AI backend abstraction. Switch between Claude, Gemini, OpenAI, or local Ollama with a single environment variable.
>
> For production stability, we recommend **Gemini CLI** or **Google Antigravity** which have fewer hanging issues than Claude CLI.

---

Self-healing MCP server with tripartite architecture, dynamic tool creation, and intelligent failure recovery.

## Supported Platforms

| Platform | Config Location | Status | Guide |
|----------|----------------|--------|-------|
| **Claude CLI** | `~/.claude.json` | Stable (hanging issues) | [docs/platforms/CLAUDE_CLI.md](docs/platforms/CLAUDE_CLI.md) |
| **Gemini CLI** | `~/.gemini/settings.json` | Stable | [docs/platforms/GEMINI_CLI.md](docs/platforms/GEMINI_CLI.md) |
| **Codex CLI** | `~/.codex/config.toml` | Stable | [docs/platforms/CODEX_CLI.md](docs/platforms/CODEX_CLI.md) |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` | Stable (100 tool limit) | [docs/platforms/WINDSURF.md](docs/platforms/WINDSURF.md) |
| **Cursor** | `~/.cursor/mcp.json` | Stable | [docs/platforms/CURSOR.md](docs/platforms/CURSOR.md) |
| **Antigravity** | `~/.antigravity/mcp_config.json` | Stable (recommended) | [docs/platforms/ANTIGRAVITY.md](docs/platforms/ANTIGRAVITY.md) |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          BRIDGE (7000)                          │
│         Message Bus | Rate Limiter | Circuit Breakers           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────────┐
│    DOCTOR     │  │     IGOR      │  │   FRANKENSTEIN    │
│    (7001)     │  │    (7002)     │  │      (7003)       │
│               │  │               │  │                   │
│  Orchestrator │  │    Worker     │  │  Dynamic Tools    │
│  Planner      │  │  Lightning    │  │  Browser Control  │
│  Failure      │  │  Strike       │  │  Hot Reload       │
│  Tracking     │  │  Execution    │  │  Tool Export      │
└───────────────┘  └───────────────┘  └───────────────────┘
```

## Quick Start

### 1. Install

```bash
git clone https://github.com/barrhawk/barrhawk_premium_e2e_mcp.git
cd barrhawk_premium_e2e_mcp
bun install
```

### 2. Configure All Platforms (Automatic)

```bash
./scripts/generate-mcp-configs.sh
```

This creates MCP configurations for all 6 supported platforms.

### 3. Start Tripartite Stack

```bash
cd tripartite && ./start.sh
```

### 4. Set AI Backend

```bash
# Choose your backend (auto-detects from API keys if not set)
export AI_BACKEND=gemini   # or: claude, openai, ollama

# Set the corresponding API key
export GEMINI_API_KEY=your-key
# or: ANTHROPIC_API_KEY, OPENAI_API_KEY
```

### 5. Verify

```bash
curl http://localhost:7000/health  # Bridge
curl http://localhost:7001/health  # Doctor
curl http://localhost:7002/health  # Igor
curl http://localhost:7003/health  # Frankenstein
```

## AI Backend Abstraction

BarrHawk's Lightning Strike feature uses a pluggable AI backend system:

```
tripartite/shared/ai-backend/
├── index.ts      # Factory with auto-detection
├── types.ts      # Unified interface
├── claude.ts     # Anthropic Claude
├── gemini.ts     # Google Gemini
├── openai.ts     # OpenAI GPT
└── ollama.ts     # Local Ollama
```

### Backend Selection

| AI_BACKEND | API Key Required | Best For |
|------------|-----------------|----------|
| `claude` | `ANTHROPIC_API_KEY` | Claude CLI users |
| `gemini` | `GEMINI_API_KEY` | Stability, free tier |
| `openai` | `OPENAI_API_KEY` | Codex CLI users |
| `ollama` | None (local) | Offline, privacy |

Auto-detection priority: `AI_BACKEND` env → first available API key → ollama

## Key Features

### Failure→Create Flow
When tests fail repeatedly at the same point, Doctor automatically requests Frankenstein to generate a specialized tool to handle that scenario.

### Lightning Strike
Igor starts in "dumb" mode (fast pattern matching). After consecutive failures, it escalates to AI-powered reasoning (using your configured backend), then returns to dumb mode after success.

### Swarm Mode
Parallel testing with multiple Igor agents:
```
frank_swarm_execute with intent: "Test login, cart, checkout, profile"
```

## MCP Tools

### Frank Integration Tools
| Tool | Description |
|------|-------------|
| `frank_execute` | Natural language browser automation |
| `frank_screenshot` | Capture current browser state |
| `frank_browser_*` | Direct browser control (launch, navigate, click, type) |
| `frank_swarm_execute` | Parallel multi-agent testing |
| `frank_swarm_analyze` | Analyze task for optimal routing |
| `frank_tools_create` | Create tools at runtime |
| `frank_lightning_strike` | Manual AI escalation |

### Beta Tools (43 total)
- **Assertions**: `assert_equals`, `assert_contains`, `assert_truthy`, `assert_type`, `assert_range`, `assert_json_schema`
- **Data Generation**: `data_generate`, `data_edge_cases`, `data_from_schema`
- **Test Analysis**: `test_flaky_detect`, `test_prioritize`, `test_deduplicate`, `test_coverage_gaps`
- **Reporting**: `report_summary`, `report_failures`, `report_timing`
- **Utilities**: `timestamp_now`, `date_utils`, `wait_ms`, `random_choice`, `math_stats`
- **Meta**: `dynamic_tool_create`, `worker_status`, `worker_restart`, `worker_snapshot`

## Documentation

| Document | Description |
|----------|-------------|
| [INSTALL.md](INSTALL.md) | Installation and setup guide |
| [CHANGELOG.md](CHANGELOG.md) | Version history and changes |
| [docs/platforms/](docs/platforms/) | **Platform-specific setup guides** |
| [docs/BETA_PRE_RELEASE.md](docs/BETA_PRE_RELEASE.md) | Current release details |
| [docs/FRANKENSTACK_GUIDE.md](docs/FRANKENSTACK_GUIDE.md) | Architecture deep-dive |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | Complete API documentation |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues and solutions |
| [tripartite/README.md](tripartite/README.md) | Tripartite component guide |

## Scripts

```bash
# Setup
./scripts/generate-mcp-configs.sh  # Generate configs for all platforms

# Tripartite (recommended)
bun run tripartite           # Start full stack
bun run tripartite:bridge    # Start Bridge only
bun run tripartite:doctor    # Start Doctor only
bun run tripartite:igor      # Start Igor only
bun run tripartite:frank     # Start Frankenstein only
bun run mcp:frank            # Start MCP-Frank server

# Beta (legacy two-tier)
bun run beta                 # Start Primary
bun run beta:secondary       # Start Secondary
bun run beta:test            # Run test suite
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_BACKEND` | auto | AI provider: `claude`, `gemini`, `openai`, `ollama` |
| `ANTHROPIC_API_KEY` | - | For Claude backend |
| `GEMINI_API_KEY` | - | For Gemini backend |
| `OPENAI_API_KEY` | - | For OpenAI backend |
| `OLLAMA_URL` | localhost:11434 | For Ollama backend |
| `BRIDGE_PORT` | 7000 | Bridge HTTP port |
| `DOCTOR_PORT` | 7001 | Doctor HTTP port |
| `IGOR_PORT` | 7002 | Igor HTTP port |
| `FRANK_PORT` | 7003 | Frankenstein HTTP port |

## Status

| Component | Version | Status |
|-----------|---------|--------|
| Bridge | v11 | Stable |
| Doctor | v16 | Stable |
| Igor | v15 | Stable |
| Frankenstein | v8 | Stable |
| AI Backend (Claude) | v1 | Stable |
| AI Backend (Gemini) | v1 | Stable |
| AI Backend (OpenAI) | v1 | Stable |
| AI Backend (Ollama) | v1 | Stable |

## Platform Recommendations

| Use Case | Recommended Platform |
|----------|---------------------|
| **Stability** | Gemini CLI, Antigravity |
| **Free tier** | Antigravity (thousands of requests/day) |
| **Team sharing** | Cursor, Windsurf |
| **Multi-agent** | Antigravity (Manager Surface) |
| **Offline** | Any platform + Ollama backend |

## License

[Elastic License 2.0](LICENSE)
