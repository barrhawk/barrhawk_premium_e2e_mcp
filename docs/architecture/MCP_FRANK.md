# barrhawk-frank

Frankenstein MCP Server - Dynamic tool creation and hot reloading for Claude Code.

## What is Frank?

Frank is the experimental arm of the BarrHawk tripartite architecture. When Igor (the stable worker) fails at a task, Doctor asks Frank to create a new tool on the fly. That tool can be used immediately in the same session, and if it proves useful, saved permanently.

## Features

- **Dynamic Tool Creation**: Create new tools at runtime from JavaScript/TypeScript code
- **Hot Reloading**: Update tool code without restarting - changes apply immediately
- **Auto-Promotion**: Tools automatically promoted from experimental → stable after 5 successful invocations
- **Persistence**: Save successful tools to disk for use in future sessions
- **Stats Tracking**: Track invocations, success rates, and errors for each tool

## Installation

```bash
cd barrhawk-frank
npm install
npm run build
```

## Claude Code Configuration

Add to your `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "barrhawk-frank": {
      "command": "node",
      "args": ["/path/to/barrhawk-frank/dist/index.js"],
      "env": {
        "FRANK_TOOLS_DIR": "/home/youruser/.frank-tools"
      }
    }
  }
}
```

## Available Tools

### Tool Management

| Tool | Description |
|------|-------------|
| `frank_create_tool` | Create a new dynamic tool from code |
| `frank_invoke_tool` | Invoke a dynamic tool by name |
| `frank_update_tool` | Hot reload a tool with new code |
| `frank_delete_tool` | Delete a tool |
| `frank_list_tools` | List all tools |
| `frank_get_tool` | Get details about a tool including its code |
| `frank_save_tool` | Save a tool permanently |
| `frank_stats` | Get system statistics |
| `frank_logs` | Get recent operation logs |
| `frank_save_candidates` | Get tools ready to be saved |

## Creating Tools

When you create a tool, your code becomes the body of an async function:

```javascript
async function toolName(params, ctx) {
  const { log, fetch, sleep, exec } = ctx;
  // YOUR CODE HERE - must return a value
}
```

### Available in ctx:

- `log(...args)` - Log messages
- `fetch` - Standard fetch API
- `sleep(ms)` - Wait for milliseconds
- `exec(cmd)` - Execute shell command, returns `{ stdout, stderr, exitCode }`

### Example: HTTP Fetcher

```javascript
// Create a tool to fetch URLs
frank_create_tool({
  name: "fetch_url",
  description: "Fetch a URL and return the response",
  code: `
    const response = await fetch(params.url);
    const text = await response.text();
    return {
      status: response.status,
      contentType: response.headers.get('content-type'),
      body: text.slice(0, 1000)
    };
  `,
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL to fetch" }
    },
    required: ["url"]
  }
});

// Use it
frank_invoke_tool({ tool: "fetch_url", params: { url: "https://example.com" } });
```

### Example: Shell Command Runner

```javascript
frank_create_tool({
  name: "run_command",
  description: "Run a shell command",
  code: `
    const { stdout, stderr, exitCode } = await exec(params.command);
    return { stdout, stderr, exitCode };
  `,
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to run" }
    },
    required: ["command"]
  }
});
```

### Example: File Checker

```javascript
frank_create_tool({
  name: "check_file_exists",
  description: "Check if a file exists and get its info",
  code: `
    const { stdout, exitCode } = await exec(\`stat "\${params.path}" 2>/dev/null\`);
    return {
      exists: exitCode === 0,
      info: exitCode === 0 ? stdout : null
    };
  `,
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path to check" }
    },
    required: ["path"]
  }
});
```

## Tool Lifecycle

1. **Experimental**: New tools start as experimental
2. **Stable**: After 5 successful invocations with no failures, auto-promoted
3. **Saved**: Manually saved with `frank_save_tool`, persisted across sessions

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FRANK_TOOLS_DIR` | `~/.frank-tools` | Directory for saved tools |

## Architecture

Frank is part of the BarrHawk tripartite architecture:

```
Bridge (supervisor)
  └── Doctor (orchestrator)
        ├── Igor (stable worker) - uses proven tools
        └── Frank (experimental) - creates new tools
```

When Igor fails, Doctor asks Frank to create a tool for the specific situation.
Once Frank's tool proves successful, it can be "igorified" - added to Igor's stable toolkit.
