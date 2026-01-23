# BarrHawk Premium E2E

Self-healing MCP server with dynamic tool creation and hot-reload.

## Quick Start

```bash
bun install
bun run packages/supervisor/primary/index.ts
```

## MCP Configuration

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "barrhawk-beta": {
      "type": "stdio",
      "command": "bun",
      "args": ["run", "/path/to/barrhawk-premium-e2e/packages/supervisor/primary/index.ts"],
      "env": {}
    }
  }
}
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    PRIMARY                          │
│  - MCP Server (stdio)                               │
│  - Health monitoring, auto-restart, rollback        │
│  - Tool change notifications                        │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP IPC (port 3001)
                       ▼
┌─────────────────────────────────────────────────────┐
│                   SECONDARY                         │
│  - Hot-reload (bun --hot)                           │
│  - 36 dynamic tools                                 │
│  - Security scanning                                │
└─────────────────────────────────────────────────────┘
```

## Tools

**7 management tools** (Primary):
- `worker_status`, `worker_restart`, `worker_snapshot`, `worker_rollback`, `worker_snapshots`
- `plan_read`, `dynamic_tool_delete`

**36 dynamic tools** (Secondary):
- Assertions: `assert_equals`, `assert_contains`, `assert_truthy`, `assert_type`, `assert_range`, `assert_json_schema`
- Data: `data_generate`, `data_edge_cases`, `data_from_schema`
- Test Analysis: `test_flaky_detect`, `test_prioritize`, `test_deduplicate`, `test_coverage_gaps`
- Reporting: `report_summary`, `report_failures`, `report_timing`
- String: `string_diff`, `regex_test`, `template_render`, `hash_text`
- Transform: `base64_encode`, `json_format`, `object_diff`, `array_operations`
- Utility: `timestamp_now`, `url_parse`, `math_stats`, `env_info`, `http_status_info`, `date_utils`, `wait_ms`, `random_choice`
- Meta: `dynamic_tool_create`, `hello_world`, `json_validator`
- Performance: `performance_regression`

## Documentation

- **[INSTALL_JOURNEY.md](INSTALL_JOURNEY.md)** - Full installation and usage guide
- [docs/BETA_PRE_RELEASE.md](docs/BETA_PRE_RELEASE.md) - Beta architecture details
- [docs/FRANKENSTACK_GUIDE.md](docs/FRANKENSTACK_GUIDE.md) - Future roadmap
- [docs/robo-guidelight.md](docs/robo-guidelight.md) - Project philosophy

## License

[Elastic License 2.0](LICENSE)
