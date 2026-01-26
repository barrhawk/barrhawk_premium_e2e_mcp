# Tripartite Architecture

The BarrHawk tripartite architecture consists of four interconnected components for intelligent E2E testing.

```
Bridge (7000) ─────────────────────────────────
    │         Message Bus / Supervisor
    │
    ├── Doctor (7001) ──────────────────────────
    │       Orchestrator / Planner
    │       - Interprets test intent
    │       - Generates execution plans
    │       - Tracks failure patterns
    │       - Requests tool creation
    │
    ├── Igor (7002) ────────────────────────────
    │       Worker / Executor
    │       - Executes plans from Doctor
    │       - Uses stable toolkit
    │       - Lightning Strike mode (dumb → claude)
    │       - Reports step results
    │
    └── Frankenstein (7003) ────────────────────
            Dynamic Tool Creator
            - Browser automation (Playwright)
            - Dynamic tool creation
            - Hot reloading
            - Tool export (igorification)
```

## Quick Start

```bash
./start.sh
```

This starts all components. Check health:
```bash
curl http://localhost:7000/health  # Bridge
curl http://localhost:7001/health  # Doctor
curl http://localhost:7002/health  # Igor
curl http://localhost:7003/health  # Frankenstein
```

## Failure→Create Flow

When Igor fails repeatedly at a task, Doctor automatically requests Frankenstein to create a new tool.

### How It Works

1. **Failure Tracking**: Doctor tracks failure patterns by action/error/selector
2. **Threshold Detection**: When same failure occurs N times (default: 2), Doctor analyzes it
3. **Tool Generation**: If error matches a tool-worthy pattern, Doctor generates tool spec
4. **Frank Request**: Doctor sends `tool.create` to Frankenstein via Bridge
5. **Tool Creation**: Frankenstein compiles and registers the new tool
6. **Confirmation**: Frankenstein responds with `tool.created`

### Monitoring

Check the failure→create flow status:

```bash
curl http://localhost:7001/frank | jq .
```

Response includes:
- **config**: Feature settings (enabled, failureThreshold)
- **metrics**: Requests, successes, failures, latency
- **failurePatterns**: Tracked patterns and their status
- **pendingRequests**: In-flight tool creation requests

### Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `FRANK_TOOL_CREATION_ENABLED` | `true` | Enable/disable automatic tool creation |
| `FAILURE_THRESHOLD_FOR_TOOL` | `2` | Failures before requesting a tool |

### Tool-Worthy Error Patterns

The following error patterns trigger tool creation:

| Pattern | Tool Type | Description |
|---------|-----------|-------------|
| `element not found`, `selector not found` | `smart_selector` | Tries multiple selector strategies |
| `timeout`, `timed out` | `wait_helper` | Enhanced waiting with polling |
| `popup`, `modal`, `dialog` | `popup_handler` | Dismisses blocking overlays |
| `dropdown`, `select` | `dropdown_handler` | Handles various dropdown implementations |
| `iframe`, `frame`, `shadow` | `frame_handler` | Navigates frames and shadow DOM |
| `captcha`, `recaptcha` | `captcha_handler` | Handles challenge screens |
| `date`, `calendar`, `picker` | `date_picker` | Date picker automation |
| `upload`, `file input` | `file_upload` | File upload handling |

### Example Flow

```
1. Igor tries: click #submit-btn
2. Igor fails: "element not found: #submit-btn"
3. Doctor tracks: {action: "click", error: "element not found", occurrences: 1}

4. Igor tries again (different plan): click #submit-btn
5. Igor fails: "element not found: #submit-btn"
6. Doctor tracks: {occurrences: 2} - THRESHOLD REACHED

7. Doctor analyzes: matches "smart_selector" pattern
8. Doctor → Frankenstein: tool.create {name: "auto_smart_selector_abc123", ...}
9. Frankenstein compiles tool
10. Frankenstein → Doctor: tool.created {name: "auto_smart_selector_abc123"}

11. Tool is now available for future use
```

## HTTP Endpoints

### Bridge (7000)
- `GET /health` - Health status
- `GET /components` - Connected components
- `GET /metrics` - Message metrics

### Doctor (7001)
- `GET /health` - Health status
- `GET /igors` - Igor pool status
- `GET /plans` - Active plans
- `GET /branches` - Branching plans
- `GET /frank` - Failure→Create flow status
- `POST /plan` - Submit test intent

### Igor (7002)
- `GET /health` - Health status
- `GET /lightning` - Lightning Strike status
- `POST /execute` - Execute a plan

### Frankenstein (7003)
- `GET /health` - Health status
- `GET /tools` - Dynamic tools list

## Message Types

### Doctor → Igor
- `plan.submit` - Send plan for execution
- `plan.cancel` - Cancel running plan

### Igor → Doctor
- `plan.accepted` - Plan accepted
- `step.started` - Step execution started
- `step.completed` - Step completed
- `step.failed` - Step failed (triggers failure tracking)
- `plan.completed` - Plan finished

### Doctor → Frankenstein
- `tool.create` - Request new tool creation

### Frankenstein → Doctor
- `tool.created` - Tool created successfully
- `tool.error` - Tool creation failed

## Testing

Run the failure→create flow tests:

```bash
bun test tests/failure-create-flow.test.ts
```

## Architecture Decisions

1. **Message Bus**: All communication goes through Bridge for observability and debugging
2. **Separation of Concerns**: Doctor plans, Igor executes, Frankenstein creates tools
3. **Automatic Learning**: Failure patterns automatically trigger tool creation
4. **Graceful Degradation**: If tool creation fails, pattern is reset for retry later
