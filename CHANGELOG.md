# Changelog

All notable changes to BarrHawk E2E will be documented in this file.

## [0.3.0] - 2026-01-26

### Added

- **Multi-Platform Support** - Run BarrHawk on any AI coding platform:
  - Claude CLI (`~/.claude.json`)
  - Gemini CLI (`~/.gemini/settings.json`)
  - Codex CLI (`~/.codex/config.toml`)
  - Windsurf (`~/.codeium/windsurf/mcp_config.json`)
  - Cursor (`~/.cursor/mcp.json`)
  - Antigravity (`~/.antigravity/mcp_config.json`)

- **AI Backend Abstraction** - Pluggable AI providers for Lightning Strike:
  - Claude (Anthropic)
  - Gemini (Google)
  - OpenAI (GPT)
  - Ollama (local)
  - Auto-detection from environment variables

- **Core Packages**:
  - `ai-tools` - AI-powered test analysis, accessibility audits, failure analysis, test generation
  - `browser` - Browser state management for Playwright integration
  - `events` - Event emitter, persistence, and transport layer
  - `free-tools` - Assertions, data generation, reporting, security scanning
  - `observability` - Metrics dashboard, CLI viewer, test integration
  - `self-heal` - Self-healing selector strategies (ID, CSS path, ARIA, text, data-testid)
  - `testing` - Test utilities and model context verification
  - `types` - Shared TypeScript type definitions

- **Config Generator** - `scripts/generate-mcp-configs.sh` generates configs for all 6 platforms

- **Platform Documentation** - Detailed setup guides for each platform in `docs/platforms/`

### Changed

- README updated with multi-platform table and package documentation
- AI backend selection via `AI_BACKEND` environment variable

---

## [0.2.0] - 2026-01-26

### Added

- **Tripartite Architecture** - Complete four-component system:
  - **Bridge** (port 7000) - Message bus, rate limiting, circuit breakers, connection management
  - **Doctor** (port 7001) - Orchestrator/planner with failure pattern tracking, swarm coordination
  - **Igor** (port 7002) - Worker/executor with Lightning Strike mode (dumb → Claude escalation)
  - **Frankenstein** (port 7003) - Dynamic tool creator with hot-reload, browser automation

- **MCP-Frank Server** - Dedicated MCP server for Frankenstein integration with Claude CLI
  - Swarm orchestration via `frank_swarm_execute`
  - Swarm analysis and planning (`frank_swarm_analyze`, `frank_swarm_plan`)
  - Real-time progress reporting (`frank_swarm_report_progress`)
  - Dynamic tool creation at runtime

- **Failure→Create Flow** - Automatic tool generation from failure patterns:
  - Tracks recurring failures by action/error/selector
  - Auto-generates tools when threshold reached (configurable)
  - Supports patterns: selector not found, timeout, popup, dropdown, iframe, captcha, date picker, file upload

- **Lightning Strike** - Adaptive intelligence escalation:
  - Starts in "dumb" mode for speed
  - Escalates to Claude-powered mode on repeated failures
  - Configurable threshold and auto-reset

- **Dashboard-min** - Lightweight real-time dashboard:
  - TSX-based server with live component status
  - Observability data integration
  - Tripartite health monitoring

- **Shared Infrastructure**:
  - Circuit breakers with failure isolation
  - Rate limiter with token bucket algorithm
  - Connection manager with health scoring
  - Dead letter queue for failed messages
  - Experience system for learning from failures
  - Tool registry for dynamic tool management

### Changed

- Tool count expanded to 119+ tools across categories
- Improved self-healing selector strategies
- Enhanced screenshot management with directory support

### Technical

- All components communicate via Bridge message bus
- HTTP health endpoints on all components
- Graceful degradation when tool creation fails

## [0.1.0] - 2026-01-21

### Added

- Initial release
- 11 browser automation tools:
  - `browser_launch` - Launch browser session
  - `browser_navigate` - Navigate to URL
  - `browser_click` - Click elements (by selector, text, or coordinates)
  - `browser_type` - Type into input fields
  - `browser_screenshot` - Capture screenshots
  - `browser_get_text` - Extract text content
  - `browser_wait` - Wait for elements
  - `browser_scroll` - Scroll page or element
  - `browser_press_key` - Keyboard input
  - `browser_close` - Close browser
  - `browser_get_elements` - Query multiple elements
- Self-healing selector system with 5 strategies:
  - data-testid
  - id
  - aria-label
  - text content
  - ARIA role
- Configuration via JSON file or environment variables
- Headless and headed browser modes
- Full page and element screenshots
