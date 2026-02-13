# Changelog

All notable changes to BarrHawk E2E will be documented in this file.

## [0.5.0] - 2026-02-11

### Added

- **Unified CLI** - Single `bun run barrhawk` command starts the entire stack
  - `--hub` flag for test orchestration mode (ports 7010-7012)
  - `--minimal` flag for lightweight Bridge + Igor only

- **Integrated Dashboard** - Dashboard now embedded in Bridge at `/dashboard`
  - Real-time component status
  - Message flow visualization
  - Hub integration view

- **Test Orchestration Hub** - Multi-Igor coordination system
  - Project/Target/TestRun management
  - Barrier synchronization for parallel tests
  - Database watcher Igor variant

- **Experience System Fully Wired** - B→A escalation complete
  - Selector success/failure tracking in Igor
  - Experience-based timeout recommendations in Doctor
  - Site pattern recognition

- **Tool Injection** - New tools broadcast to running Igors in real-time
  - Frankenstein → Bridge → all active Igors
  - Hot-reload tool bags during execution

- **Lightning Strike Feedback** - Igor thoughts flow to Doctor
  - Claude reasoning captured and stored
  - Error patterns learned from stuck states

- **Tool Persistence** - Igorified tools saved to disk
  - Auto-load on Frankenstein startup
  - Stats preserved across restarts

### Changed

- **Package.json** - Simplified scripts, removed old build targets
- **Project structure** - Removed 62k+ lines of stale code:
  - Deleted `src/` (old monolithic MCP)
  - Deleted `server.ts`, `system-tools.ts`
  - Deleted `scripts/legacy/`
  - Deleted `packages/supervisor/`, `packages/dashboard-min/`
  - Deleted duplicate observability dashboards

### Fixed

- Bridge HTTP handler now async for proper request handling
- bun:sqlite compatibility (replaced better-sqlite3)

---

## [0.4.0] - 2026-02-01

### Added

- **120+ Tools Total** - A+B+C+D implementation with comprehensive SDLC coverage:
  - Browser automation (36 tools)
  - Database operations - PostgreSQL, SQLite, Redis (18 tools)
  - GitHub integration (18 tools)
  - Docker & Compose management (18 tools)
  - Filesystem operations (19 tools)
  - MCP orchestration (10 tools)

- **Playwright MCP Parity** - 22 new browser tools matching Microsoft Playwright MCP:
  - `browser_snapshot`, `browser_evaluate`, `browser_console_messages`
  - `browser_network_requests`, `browser_drag`, `browser_hover`
  - `browser_select_option`, `browser_tabs`, `browser_pdf_save`
  - `browser_tracing_start/stop`, and more

- **Video Recording for Demos** - Capture browser sessions as video:
  - `recordVideo` option in `frank_browser_launch`
  - Headless mode for clean 2K recordings
  - Video saved on browser close

- **FakeBarrHawk Test Simulator** - Mock SaaS for testing:
  - Storage panel simulator
  - Full viewport CSS support
  - Test environment for BarrHawk features

- **Squad Mode (Multi-Context)** - v0.2.0-alpha capability for parallel test execution

- **Frankenstack Dashboards** - New dashboard variants:
  - `dashboard-max` - Full-featured React dashboard
  - `dashboard-min` - Minimal war room view
  - Real-time tripartite architecture visualization

- **New Packages**:
  - `packages/api` - API layer
  - `packages/db` - Database abstraction with Prisma
  - `packages/golden` - Golden test fixtures and scoring
  - `packages/live-view` - Live testing WebSocket service
  - `packages/premium` - Flaky detector, session replay, Slack notifications, visual diff
  - `packages/ui` - Shared UI components

### Changed

- **MCP-Frank Error Handling** - Improved error messages for AI consumption
- **Tripartite Architecture Specs** - Updated Bridge, Doctor, Igor, Frankenstein specs
- **Sidebar Extension** - Dashboard updates with screenshots and documentation

### Fixed

- `frank_execute` flow with plan.execute handler in Doctor
- FakeBarrHawk CSS now fills full viewport
- Video recording headless mode for clean demos

---

## [0.3.1] - 2026-01-28

### Added

- **Dashboard Test Reports** - War Room dashboard now displays completed test results:
  - Test Results sidebar section with PASS/FAIL badges
  - Real-time stats from Bridge `/reports` endpoint
  - Metrics bar shows Executed/Passed/Failed/Success%
  - New `/api/reports` endpoint for external consumers
  - Scrollable results list, most recent first, with timestamps and step counts

- **Doctor plan.execute Handler** - Fixed `frank_execute` flow:
  - Doctor now properly handles `plan.execute` messages from MCP-Frank
  - Plans execute end-to-end through Doctor → Igor → Frankenstein
  - Reports stored in Bridge and displayed in dashboard

### Changed

- **Dashboard Visual Overhaul** - Professional dark theme redesign:
  - Refined color palette with better contrast
  - Clean section headers with count badges
  - Monospace font for metrics, badges, timestamps
  - Slim scrollbars, hover states, improved typography
  - Igor → Frank pipeline visualization with progress bar

- **Frankenstein System Tools** - Extended OS-level automation:
  - Enhanced screenshot, keyboard, mouse, window management
  - Better error handling and timeout management

- **MCP-Frank Server** - Updated to latest tool definitions:
  - All frank_* tools with correct signatures
  - Swarm execution improvements

### Fixed

- Doctor properly routes `plan.execute` to Igor for execution
- Dashboard now runs `server.ts` (war room) instead of `server.tsx` (legacy)

---

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
