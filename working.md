# BarrHawk Beta - Working Session Log

> Session Date: 2026-01-23

## Overview

This document captures all work done on the barrhawk-beta MCP server during this session.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Claude Code (MCP Client)                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PRIMARY SERVER (Immortal)                     │
│  - Never modifies its own code                                  │
│  - Manages secondary lifecycle                                   │
│  - Handles snapshots/rollback                                    │
│  - Sends notifications/tools/list_changed on tool changes       │
│  - Entry: packages/supervisor/primary/index.ts                  │
└─────────────────────────────────────────────────────────────────┘
                              │ IPC (HTTP :3001)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   SECONDARY SERVER (Mutable)                     │
│  - Runs with `bun --hot` for live reloading                     │
│  - Hosts dynamic tools in /tools/*.ts                           │
│  - Can be restarted/rolled back by primary                      │
│  - Security scans all tool code before loading                  │
│  - Entry: packages/supervisor/secondary/index.ts                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tools Ported from barrhawk-e2e

Ported **33 tools** from barrhawk-e2e to barrhawk-beta, organized by category:

### Assertion Tools (6)
| Tool | Description |
|------|-------------|
| `assert_equals` | Compare two values with deep equality |
| `assert_contains` | Check string contains substring |
| `assert_truthy` | Check value is truthy |
| `assert_type` | Validate value type |
| `assert_range` | Check number within range |
| `assert_json_schema` | Validate JSON against schema structure |

### Data Generation Tools (3)
| Tool | Description |
|------|-------------|
| `data_generate` | Generate realistic test data (names, emails, etc.) |
| `data_edge_cases` | Generate security/boundary test cases |
| `data_from_schema` | Generate data from JSON Schema |

### Test Analysis Tools (4)
| Tool | Description |
|------|-------------|
| `test_flaky_detect` | Identify flaky tests from history |
| `test_prioritize` | Rank tests by failure risk |
| `test_deduplicate` | Find similar/duplicate tests |
| `test_coverage_gaps` | Analyze coverage gaps |

### Reporting Tools (3)
| Tool | Description |
|------|-------------|
| `report_summary` | Generate pass/fail summary |
| `report_failures` | Detailed failure report |
| `report_timing` | Performance timing analysis |

### Performance Tools (1)
| Tool | Description |
|------|-------------|
| `performance_regression` | Detect perf regressions |

### String/Text Tools (4)
| Tool | Description |
|------|-------------|
| `string_diff` | Line-by-line string comparison |
| `regex_test` | Test regex and extract matches |
| `template_render` | Render {{variable}} templates |
| `hash_text` | Generate MD5/SHA hashes |

### Data Transformation Tools (4)
| Tool | Description |
|------|-------------|
| `base64_encode` | Encode/decode base64 |
| `json_format` | Format/minify/validate JSON |
| `object_diff` | Compare objects, show changes |
| `array_operations` | Unique, flatten, chunk, etc. |

### Utility Tools (8)
| Tool | Description |
|------|-------------|
| `timestamp_now` | Current time in multiple formats |
| `url_parse` | Parse URL into components |
| `math_stats` | Statistical calculations |
| `env_info` | Runtime environment info |
| `http_status_info` | HTTP status code reference |
| `date_utils` | Date parsing, formatting, math |
| `wait_ms` | Async delay for timing |
| `random_choice` | Random selection from array |

---

## Fixes Applied

### Fix 1: Tool Change Detection (Hash-Based)

**Problem:** Original implementation only detected tool count changes. Modifying an existing tool wouldn't trigger a client refresh.

**Solution:** Changed from count-based to hash-based detection. Now hashes full tool definitions (name + description + schema).

**File:** `packages/supervisor/primary/index.ts`

```typescript
// Hash tool definitions to detect any changes (not just count)
const hashTools = (tools: ToolDefinition[]) => {
  const data = tools.map(t => `${t.name}:${t.description}:${JSON.stringify(t.inputSchema)}`).sort().join('|');
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(16);
};
```

### Fix 2: Added `dynamic_tool_delete` MCP Tool

**Problem:** Tools could be created via MCP but not deleted. The HTTP endpoint existed but wasn't exposed.

**Solution:** Added `dynamic_tool_delete` as a primary tool that forwards to secondary's DELETE endpoint. Protected core tools from deletion.

**File:** `packages/supervisor/primary/index.ts`

```typescript
case 'dynamic_tool_delete': {
  const toolName = (args as { name: string }).name;

  // Protected tools that cannot be deleted
  const protected_tools = ['dynamic_tool_create', 'hello_world'];
  if (protected_tools.includes(toolName)) {
    return {
      content: [{ type: 'text', text: `Error: Cannot delete protected tool '${toolName}'` }],
      isError: true,
    };
  }

  // Forward to secondary...
}
```

### Fix 3: Improved Error Propagation

**Problem:** Errors from tools were opaque - just the message, no stack trace.

**Solution:** Both primary and secondary now include full stack traces in error responses.

**File:** `packages/supervisor/secondary/index.ts`

```typescript
} catch (err) {
  const error = err as Error;
  lastError = error.message;

  // Include full stack trace for debugging
  const errorDetails = [
    `Tool: ${toolName}`,
    `Error: ${error.message}`,
    error.stack ? `\nStack trace:\n${error.stack}` : '',
  ].filter(Boolean).join('\n');

  return Response.json({
    content: [{ type: 'text', text: errorDetails }],
    isError: true,
  });
}
```

**File:** `packages/supervisor/primary/index.ts`

```typescript
} catch (err) {
  const error = err as Error;
  // Include stack trace for better debugging
  const errorMsg = error.stack || error.message;
  return {
    content: [{
      type: 'text',
      text: `Error calling tool ${name}:\n${errorMsg}`,
    }],
    isError: true,
  };
}
```

---

## MCP Notification System

Added automatic tool list change notifications to primary server.

When tools are added, modified, or deleted:
1. Primary polls secondary every 1 second
2. Hashes all tool definitions
3. If hash changes, sends `notifications/tools/list_changed`
4. MCP clients that support this notification will auto-refresh tool list

```typescript
// Poll for tool changes and notify client
setInterval(async () => {
  try {
    const tools = await supervisor.getTools();
    const currentHash = hashTools(tools);
    if (currentHash !== lastToolHash) {
      console.error(`[Primary] Tools changed (hash ${lastToolHash} -> ${currentHash}), notifying client`);
      lastToolHash = currentHash;

      // Send MCP notification to trigger client tool list refresh
      await server.notification({
        method: 'notifications/tools/list_changed',
      });
    }
  } catch {
    // Secondary might be restarting, ignore
  }
}, 1000);
```

---

## Security Model

The tool loader blocks these patterns in dynamic tool code:
- `process.exit` - No killing the server
- `require()` - Use ES imports instead
- `eval()` - No code injection
- `new Function()` - No dynamic code execution
- `__proto__` - No prototype pollution
- `child_process` - No subprocess spawning
- `Bun.spawn` - No Bun subprocess spawning

**Tested:** Attempted to create `retry_until` tool with `new Function()` - correctly blocked.

---

## Total Tool Count

**36 tools** total:
- 3 original (dynamic_tool_create, hello_world, json_validator)
- 33 ported from barrhawk-e2e

Plus 7 primary-managed tools:
- worker_status
- worker_restart
- worker_snapshot
- worker_rollback
- worker_snapshots
- plan_read
- dynamic_tool_delete (new)

---

## Files Modified

1. `packages/supervisor/primary/index.ts`
   - Added `lastToolHash` tracking variable
   - Added `hashTools()` function
   - Added tool change polling with notification
   - Added `dynamic_tool_delete` tool definition and handler
   - Improved error propagation with stack traces

2. `packages/supervisor/secondary/index.ts`
   - Improved error handling in `/call` endpoint to include stack traces

3. `packages/supervisor/secondary/tools/*.ts`
   - Created 33 new tool files (see list above)

4. `INSTALL_JOURNEY.md`
   - Created with full installation documentation

5. `working.md`
   - This file

---

## Quick Reference

```bash
# Check server status
curl http://localhost:3001/health

# List all tools
curl http://localhost:3001/tools

# Call a tool
curl -X POST http://localhost:3001/call \
  -H "Content-Type: application/json" \
  -d '{"tool": "data_generate", "args": {"type": "email", "count": 3}}'

# Delete a tool
curl -X DELETE http://localhost:3001/tools/my_tool
```

---

## Next Steps (Suggestions)

1. **Tripartite Architecture** - Add a third "gateway" layer for true zero-downtime tool updates
2. **Tool Versioning** - Track tool versions in metadata
3. **Tool Categories** - Group tools by category in MCP listing
4. **Permissions System** - Enforce declared permissions (browser, network, filesystem, ai)
5. **Tool Testing** - Auto-run tests when tools are created/modified
