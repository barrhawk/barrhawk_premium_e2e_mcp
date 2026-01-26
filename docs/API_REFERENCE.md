# BarrHawk API Reference

> Last Updated: 2026-01-26

Complete API documentation for all BarrHawk components and MCP tools.

## Table of Contents

1. [HTTP Endpoints](#http-endpoints)
2. [MCP Tools - Frank Integration](#mcp-tools---frank-integration)
3. [MCP Tools - Beta](#mcp-tools---beta)
4. [Message Types](#message-types)
5. [Configuration](#configuration)

---

## HTTP Endpoints

### Bridge (Port 7000)

#### GET /health
Returns Bridge health status and metrics.

**Response:**
```json
{
  "status": "healthy",
  "version": "2026-01-21-v11",
  "uptime": 7082814,
  "pid": 164454,
  "connectedComponents": {
    "doctor": true,
    "igor": true,
    "frankenstein": true
  },
  "messageCount": 232,
  "queueDepth": 0,
  "errorRate": 0
}
```

#### GET /components
Returns connected component status.

#### GET /metrics
Returns detailed message metrics.

#### GET /dlq
Returns dead letter queue contents.

---

### Doctor (Port 7001)

#### GET /health
Returns Doctor health and plan statistics.

**Response:**
```json
{
  "status": "healthy",
  "version": "2026-01-25-v16",
  "planLimits": {
    "active": 0,
    "max": 100
  },
  "experience": {
    "totalPlans": 2,
    "successRate": "50.0%"
  }
}
```

#### GET /igors
Returns Igor pool status.

#### GET /plans
Returns active execution plans.

#### GET /frank
Returns Failure→Create flow status including failure patterns and pending tool requests.

**Response:**
```json
{
  "config": {
    "enabled": true,
    "failureThreshold": 2
  },
  "metrics": {
    "requests": 5,
    "successes": 4,
    "failures": 1
  },
  "failurePatterns": [
    {
      "key": "click:element not found:#submit",
      "occurrences": 2,
      "status": "tool_requested"
    }
  ]
}
```

#### POST /plan
Submit a test intent for execution.

**Request:**
```json
{
  "intent": "Test the login flow with valid credentials",
  "url": "https://example.com/login"
}
```

---

### Igor (Port 7002)

#### GET /health
Returns Igor health and execution status.

#### GET /lightning
Returns Lightning Strike mode status.

**Response:**
```json
{
  "mode": "dumb",
  "enabled": true,
  "hasApiKey": false,
  "consecutiveFailures": 0,
  "totalStrikes": 0,
  "autoThreshold": 3
}
```

#### POST /execute
Execute a plan directly.

---

### Frankenstein (Port 7003)

#### GET /health
Returns Frankenstein health and resource status.

**Response:**
```json
{
  "status": "healthy",
  "version": "2026-01-21-v8",
  "resources": {
    "activeBrowsers": 1,
    "maxBrowsers": 3
  },
  "dynamicTools": {
    "total": 7,
    "experimental": 7,
    "stable": 0
  },
  "browserActive": true
}
```

#### GET /tools
Returns list of registered dynamic tools.

---

## MCP Tools - Frank Integration

### frank_execute

Execute a natural language automation task.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `task` | string | Yes | Natural language description of the task |
| `url` | string | No | Starting URL for the task |
| `timeout` | number | No | Timeout in milliseconds (default: 60000) |

**Example:**
```json
{
  "task": "Log into the site with username test@example.com and password secret123",
  "url": "https://example.com/login"
}
```

---

### frank_screenshot

Capture a screenshot of the current browser state.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `fullPage` | boolean | No | Capture full scrollable page (default: false) |

**Returns:** Base64-encoded image data

---

### frank_browser_launch

Launch a new browser instance.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `headless` | boolean | No | Run in headless mode (default: false) |
| `url` | string | No | URL to navigate to after launch |

---

### frank_browser_navigate

Navigate to a URL.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `url` | string | Yes | URL to navigate to |

---

### frank_browser_click

Click on an element.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `selector` | string | No | CSS selector to click |
| `text` | string | No | Click element containing this text |

*Note: Provide either `selector` or `text`, not both.*

---

### frank_browser_type

Type text into an input field.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `selector` | string | Yes | CSS selector of input element |
| `text` | string | Yes | Text to type |
| `clear` | boolean | No | Clear existing text first (default: true) |

---

### frank_browser_close

Close the browser instance.

---

### frank_swarm_analyze

Analyze if a task needs swarm mode.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `intent` | string | Yes | The task to analyze |

**Returns:** Recommended routes and tool bags for parallel execution.

---

### frank_swarm_plan

Create a swarm execution plan.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `intent` | string | Yes | Master intent for the swarm |
| `maxIgors` | number | No | Maximum parallel Igors (default: 4) |
| `toolBagSize` | number | No | Max tools per Igor (default: 15) |

---

### frank_swarm_execute

Execute a task using swarm mode with parallel Igors.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `intent` | string | Yes | What to test |
| `maxIgors` | number | No | Maximum parallel Igors (default: 4) |
| `model` | string | No | Model for subagents: haiku, sonnet, opus (default: haiku) |

**Example:**
```json
{
  "intent": "Test full e-commerce: login, cart, checkout, profile",
  "maxIgors": 4,
  "model": "haiku"
}
```

---

### frank_swarm_status

Get status of running swarm execution.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `swarmId` | string | No | Swarm ID to check (shows all if omitted) |

---

### frank_swarm_report_progress

Report progress from an Igor agent to the dashboard.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `swarmId` | string | Yes | The swarm ID |
| `routeId` | string | Yes | The route ID being executed |
| `action` | string | Yes | Description of the action |
| `status` | string | Yes | started, completed, or failed |
| `tool` | string | No | Tool name being used |
| `details` | string | No | Additional details |

---

### frank_swarm_complete_route

Mark a route as completed or failed.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `swarmId` | string | Yes | The swarm ID |
| `routeId` | string | Yes | The route ID |
| `success` | boolean | Yes | Whether the route succeeded |
| `summary` | string | No | Summary of accomplishments or failure reason |
| `error` | string | No | Error message if failed |

---

### frank_lightning_strike

Manually trigger Lightning Strike to escalate Igor to Claude mode.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `reason` | string | Yes | Reason for manual strike |

---

### frank_lightning_status

Get Lightning Strike status (dumb vs claude mode).

---

### frank_tools_list

List all dynamic tools created by Frankenstein.

---

### frank_tools_create

Create a new dynamic tool in Frankenstein.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Tool name |
| `description` | string | Yes | What the tool does |
| `code` | string | Yes | JavaScript code for the tool |

---

## MCP Tools - Beta

### Assertion Tools

#### assert_equals
Assert two values are equal.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `actual` | any | Yes | Actual value |
| `expected` | any | Yes | Expected value |
| `strict` | boolean | No | Use strict equality (default: true) |
| `message` | string | No | Custom error message |

#### assert_contains
Assert a string contains a substring.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `text` | string | Yes | Text to search in |
| `substring` | string | Yes | Substring to find |
| `caseSensitive` | boolean | No | Case sensitive (default: false) |

#### assert_truthy
Assert a value is truthy.

#### assert_type
Assert a value is of a specific type.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `value` | any | Yes | Value to check |
| `expectedType` | string | Yes | Expected type: string, number, boolean, object, array, null, undefined |

#### assert_range
Assert a number is within a range.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `value` | number | Yes | Number to check |
| `min` | number | Yes | Minimum value (inclusive) |
| `max` | number | Yes | Maximum value (inclusive) |

#### assert_json_schema
Assert JSON data matches a JSON Schema.

---

### Data Generation Tools

#### data_generate
Generate realistic test data.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `type` | string | Yes | Type: name, email, phone, uuid, date, boolean, number, url, etc. |
| `count` | number | No | Number to generate (default: 1) |

#### data_edge_cases
Generate edge case values for testing.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `category` | string | No | Category: sql_injection, xss, path_traversal, boundary, unicode, empty, all |
| `limit` | number | No | Max cases per category (default: 10) |

#### data_from_schema
Generate test data from a JSON Schema.

---

### Test Analysis Tools

#### test_flaky_detect
Detect flaky tests from run history.

#### test_prioritize
Score and rank tests by priority.

#### test_deduplicate
Find potentially redundant tests.

#### test_coverage_gaps
Analyze tests for coverage gaps.

---

### Reporting Tools

#### report_summary
Generate a test summary report.

#### report_failures
Generate a detailed failure report.

#### report_timing
Generate a timing analysis report.

---

### Worker Management Tools

#### worker_status
Get secondary worker server status.

#### worker_restart
Restart the secondary worker.

#### worker_snapshot
Create a snapshot for rollback.

#### worker_rollback
Rollback to a previous snapshot.

#### worker_snapshots
List all available snapshots.

---

## Message Types

### Doctor → Igor

| Type | Description |
|------|-------------|
| `plan.submit` | Submit a plan for execution |
| `plan.cancel` | Cancel a running plan |

### Igor → Doctor

| Type | Description |
|------|-------------|
| `plan.accepted` | Plan was accepted |
| `step.started` | Step execution started |
| `step.completed` | Step completed successfully |
| `step.failed` | Step failed (triggers failure tracking) |
| `plan.completed` | Plan finished |

### Doctor → Frankenstein

| Type | Description |
|------|-------------|
| `tool.create` | Request new tool creation |

### Frankenstein → Doctor

| Type | Description |
|------|-------------|
| `tool.created` | Tool created successfully |
| `tool.error` | Tool creation failed |

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BRIDGE_PORT` | 7000 | Bridge HTTP port |
| `DOCTOR_PORT` | 7001 | Doctor HTTP port |
| `IGOR_PORT` | 7002 | Igor HTTP port |
| `FRANK_PORT` | 7003 | Frankenstein HTTP port |
| `FRANK_TOOL_CREATION_ENABLED` | true | Enable auto tool creation |
| `FAILURE_THRESHOLD_FOR_TOOL` | 2 | Failures before tool request |
| `LIGHTNING_AUTO_THRESHOLD` | 3 | Failures before Claude escalation |
| `ANTHROPIC_API_KEY` | - | Required for Lightning Strike |
| `SCREENSHOTS_DIR` | /tmp/tripartite-screenshots | Screenshot storage |

### Rate Limiting

Bridge rate limiting configuration:
- **Tokens per second**: 100
- **Burst capacity**: 200
- **Per-component buckets**: Yes

### Circuit Breaker

Per-component circuit breaker settings:
- **Failure threshold**: 5 consecutive failures
- **Reset timeout**: 30 seconds
- **Half-open requests**: 1
