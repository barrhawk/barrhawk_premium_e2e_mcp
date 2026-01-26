# BarrHawk Premium E2E

> **NOTICE** | Updated: 2026-01-26
>
> **Claude Code CLI Stability Issues**: We are experiencing intermittent hanging and freezing issues with Claude Code CLI during extended testing sessions. These are [known upstream issues](https://github.com/anthropics/claude-code/issues/13240) affecting long-running automated workflows.
>
> **Gemini Branch in Development**: A `gemini-native` branch is under active development to provide an alternative runtime using Google's Gemini API for improved reliability in continuous testing scenarios. This will offer a fallback when Claude experiences stability issues.
>
> For production use, we recommend monitoring session length and using the tripartite architecture's built-in health checks and auto-restart capabilities.

---

Self-healing MCP server with tripartite architecture, dynamic tool creation, and intelligent failure recovery.

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

### Option 1: Full Tripartite Stack (Recommended)

```bash
bun install
cd tripartite && ./start.sh
```

Verify all components:
```bash
curl http://localhost:7000/health  # Bridge
curl http://localhost:7001/health  # Doctor
curl http://localhost:7002/health  # Igor
curl http://localhost:7003/health  # Frankenstein
```

### Option 2: MCP-Frank Server (Claude CLI Integration)

Add to your MCP config (`~/.claude.json` or IDE settings):

```json
{
  "mcpServers": {
    "barrhawk-frank": {
      "command": "bun",
      "args": ["run", "/path/to/barrhawk-premium-e2e/tripartite/mcp-frank.ts"],
      "env": {}
    }
  }
}
```

### Option 3: Beta Two-Tier (Legacy)

```bash
bun run beta
```

## Key Features

### Failure→Create Flow
When tests fail repeatedly at the same point, Doctor automatically requests Frankenstein to generate a specialized tool to handle that scenario.

### Lightning Strike
Igor starts in "dumb" mode (fast pattern matching). After consecutive failures, it escalates to Claude-powered reasoning, then returns to dumb mode after success.

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
| `frank_lightning_strike` | Manual Claude escalation |

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
| [docs/BETA_PRE_RELEASE.md](docs/BETA_PRE_RELEASE.md) | Current release details |
| [docs/FRANKENSTACK_GUIDE.md](docs/FRANKENSTACK_GUIDE.md) | Architecture deep-dive |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | Complete API documentation |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues and solutions |
| [tripartite/README.md](tripartite/README.md) | Tripartite component guide |

## Scripts

```bash
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
| `BRIDGE_PORT` | 7000 | Bridge HTTP port |
| `DOCTOR_PORT` | 7001 | Doctor HTTP port |
| `IGOR_PORT` | 7002 | Igor HTTP port |
| `FRANK_PORT` | 7003 | Frankenstein HTTP port |
| `ANTHROPIC_API_KEY` | - | Required for Lightning Strike Claude mode |
| `GEMINI_API_KEY` | - | For Gemini branch (coming soon) |

## Status

| Component | Version | Status |
|-----------|---------|--------|
| Bridge | v11 | Stable |
| Doctor | v16 | Stable |
| Igor | v15 | Stable |
| Frankenstein | v8 | Stable |
| Gemini Branch | - | In Development |

## License

[Elastic License 2.0](LICENSE)
