/**
 * Tool Registry - Central catalog of all available tools
 *
 * Doctor uses this to select relevant tools for Igor based on task intent.
 * Keeps Igor's context window light by only providing needed tools.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;
  tags: string[];  // For fuzzy matching
  inputSchema: object;
  weight: number;  // Priority within category (higher = more commonly needed)
}

export type ToolCategory =
  | 'browser_core'      // launch, close, navigate
  | 'browser_interact'  // click, type, scroll, press_key
  | 'browser_read'      // screenshot, get_text, get_elements
  | 'browser_wait'      // wait, network_wait
  | 'backend_http'      // request, health_check
  | 'backend_test'      // run_tests, load_test
  | 'backend_session'   // create_session, set_variable
  | 'backend_realtime'  // ws_connect, ws_send
  | 'backend_schema'    // graphql_query, grpc_call
  | 'backend_queue'     // queue_publish, queue_peek
  | 'backend_mock'      // mock_server, mock_route
  | 'mobile'            // mobile_launch, mobile_tap
  | 'cli'               // cli_run
  | 'psych_ward'        // psych_ward_prompt
  | 'ai_critic'         // critic_review
  | 'ai_genesis'        // genesis_fix
  | 'code_intelligence' // detective_analyze, bisect
  | 'assertions'        // assert_equals, assert_contains, assert_visible
  | 'ai_analysis'       // smart_assert, analyze_failure, suggest_fix
  | 'ai_generation'     // test_from_description, generate_tests_from_url
  | 'accessibility'     // audit, check_basic, fix
  | 'video'             // analyze, wes_start, wes_capture
  | 'data_generation'   // generate, edge_cases, from_schema
  | 'selectors'         // suggest, validate, alternatives
  | 'performance'       // analyze, regression, budget_check
  | 'security'          // scan
  | 'storage'           // clear, get, set
  | 'network'           // mock, unmock, wait
  | 'console'           // start_capture, stop_capture, get_messages
  | 'reporting'         // summary, failures, timing
  | 'system'            // screenshot, mouse, keyboard, window
  | 'mcp_testing';      // start, stop, invoke, validate

export interface ToolSelection {
  tools: ToolDefinition[];
  reasoning: string;
  categories: ToolCategory[];
}

// =============================================================================
// Tool Registry
// =============================================================================

export const TOOL_REGISTRY: ToolDefinition[] = [
  // ─────────────────────────────────────────────────────────────────────────────
  // BROWSER CORE
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'browser_launch',
    description: 'Launch a new browser session',
    category: 'browser_core',
    tags: ['start', 'open', 'begin', 'browser', 'chrome', 'init'],
    weight: 100,
    inputSchema: {
      type: 'object',
      properties: {
        headless: { type: 'boolean', default: false },
        url: { type: 'string' },
      },
    },
  },
  {
    name: 'browser_navigate',
    description: 'Navigate to a URL',
    category: 'browser_core',
    tags: ['go', 'url', 'visit', 'open', 'load', 'page'],
    weight: 95,
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
  },
  {
    name: 'browser_close',
    description: 'Close the browser session',
    category: 'browser_core',
    tags: ['end', 'quit', 'exit', 'close', 'stop'],
    weight: 50,
    inputSchema: { type: 'object', properties: {} },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // BROWSER INTERACT
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'browser_click',
    description: 'Click on an element',
    category: 'browser_interact',
    tags: ['click', 'press', 'tap', 'button', 'link', 'select'],
    weight: 100,
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        text: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
      },
    },
  },
  {
    name: 'browser_type',
    description: 'Type text into an input field',
    category: 'browser_interact',
    tags: ['type', 'input', 'enter', 'fill', 'text', 'form', 'login', 'password', 'email'],
    weight: 95,
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        text: { type: 'string' },
        clear: { type: 'boolean', default: true },
        pressEnter: { type: 'boolean', default: false },
      },
      required: ['selector', 'text'],
    },
  },
  {
    name: 'browser_scroll',
    description: 'Scroll the page',
    category: 'browser_interact',
    tags: ['scroll', 'up', 'down', 'page'],
    weight: 70,
    inputSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
        amount: { type: 'number', default: 500 },
      },
      required: ['direction'],
    },
  },
  {
    name: 'browser_press_key',
    description: 'Press a keyboard key',
    category: 'browser_interact',
    tags: ['key', 'enter', 'tab', 'escape', 'keyboard', 'shortcut'],
    weight: 60,
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // BROWSER READ
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'browser_screenshot',
    description: 'Take a screenshot of the page',
    category: 'browser_read',
    tags: ['screenshot', 'capture', 'image', 'see', 'view', 'look'],
    weight: 100,
    inputSchema: {
      type: 'object',
      properties: {
        fullPage: { type: 'boolean', default: false },
        selector: { type: 'string' },
      },
    },
  },
  {
    name: 'browser_get_text',
    description: 'Get text content from the page',
    category: 'browser_read',
    tags: ['text', 'read', 'content', 'get', 'extract'],
    weight: 90,
    inputSchema: {
      type: 'object',
      properties: { selector: { type: 'string' } },
    },
  },
  {
    name: 'browser_get_elements',
    description: 'Get elements matching a selector',
    category: 'browser_read',
    tags: ['elements', 'find', 'query', 'list', 'dom'],
    weight: 80,
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        limit: { type: 'number', default: 20 },
      },
      required: ['selector'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // BROWSER WAIT
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'browser_wait',
    description: 'Wait for an element or condition',
    category: 'browser_wait',
    tags: ['wait', 'until', 'visible', 'appear', 'ready'],
    weight: 85,
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        state: { type: 'string', enum: ['visible', 'hidden', 'attached', 'detached'] },
        timeout: { type: 'number', default: 30000 },
      },
    },
  },
  {
    name: 'network_wait',
    description: 'Wait for network to be idle',
    category: 'browser_wait',
    tags: ['network', 'idle', 'load', 'ajax', 'fetch'],
    weight: 70,
    inputSchema: {
      type: 'object',
      properties: {
        state: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle'] },
        timeout: { type: 'number', default: 30000 },
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // BACKEND HTTP
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'api_request',
    description: 'Make a robust HTTP request (GET, POST, etc.) with support for Auth, Headers, and Timeouts. Use this for direct API testing.',
    category: 'backend_http',
    tags: ['http', 'api', 'request', 'get', 'post', 'put', 'delete', 'fetch', 'axios', 'backend'],
    weight: 100,
    inputSchema: {
      type: 'object',
      properties: {
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] },
        url: { type: 'string' },
        headers: { type: 'object', description: 'Key-value pairs of headers' },
        params: { type: 'object', description: 'Query parameters' },
        body: { type: 'object', description: 'JSON body payload' },
        auth: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['bearer', 'basic'] },
            token: { type: 'string' },
            username: { type: 'string' },
            password: { type: 'string' },
          },
        },
        timeout: { type: 'number', default: 10000 },
        validateStatus: { type: 'boolean', default: true },
      },
      required: ['method', 'url'],
    },
  },
  {
    name: 'api_assert',
    description: 'Assert properties of an API response (status, headers, body, timing). Supports JSONPath for body assertions.',
    category: 'backend_http',
    tags: ['api', 'assert', 'check', 'verify', 'status', 'json', 'body', 'header'],
    weight: 95,
    inputSchema: {
      type: 'object',
      properties: {
        response: { type: 'object', description: 'The response object from api_request' },
        assertions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['status', 'header', 'body', 'time'] },
              key: { type: 'string', description: 'Header name or JSONPath expression (e.g., "$.users[0].id")' },
              operator: { type: 'string', enum: ['equals', 'contains', 'exists', 'lt', 'gt'] },
              value: { description: 'Expected value' },
            },
            required: ['type', 'operator'],
          },
        },
      },
      required: ['response', 'assertions'],
    },
  },
  {
    name: 'backend_health_check',
    description: 'Check if an endpoint is healthy',
    category: 'backend_http',
    tags: ['health', 'ping', 'alive', 'status', 'check'],
    weight: 80,
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        expectedStatus: { type: 'number', default: 200 },
      },
      required: ['url'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // SCRIBE (Documentation)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'scribe_generate_tutorial',
    description: 'Generate a Markdown tutorial from a test execution trace.',
    category: 'reporting',
    tags: ['docs', 'tutorial', 'markdown', 'write', 'generate', 'guide'],
    weight: 90,
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        title: { type: 'string' },
        outputFile: { type: 'string' },
      },
      required: ['planId', 'title'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // TIME LORD (Database)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'db_snapshot',
    description: 'Snapshot a database state (Docker container or Dump).',
    category: 'backend_session',
    tags: ['db', 'database', 'snapshot', 'save', 'backup', 'state'],
    weight: 85,
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Container ID or Connection String' },
        name: { type: 'string' },
        type: { type: 'string', enum: ['docker', 'postgres'], default: 'docker' },
      },
      required: ['target', 'name'],
    },
  },
  {
    name: 'db_restore',
    description: 'Restore a database from a snapshot.',
    category: 'backend_session',
    tags: ['db', 'database', 'restore', 'load', 'reset', 'state'],
    weight: 85,
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string' },
        name: { type: 'string' },
        type: { type: 'string', enum: ['docker', 'postgres'], default: 'docker' },
      },
      required: ['target', 'name'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CHAOS (Fuzzing)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'chaos_fuzz',
    description: 'Inject chaos (random clicks/inputs) into the page.',
    category: 'security',
    tags: ['fuzz', 'chaos', 'random', 'stress', 'monkey', 'click'],
    weight: 70,
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        duration: { type: 'number', default: 60000 },
        seed: { type: 'string' },
      },
      required: ['url'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // BLACK BOX (Session)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'session_pack',
    description: 'Pack a test session into a .hawk file (Video + Logs + HAR).',
    category: 'reporting',
    tags: ['pack', 'zip', 'export', 'session', 'hawk', 'artifact'],
    weight: 80,
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        outputDir: { type: 'string' },
      },
      required: ['planId'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CODE INTELLIGENCE (Detective)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'detective_analyze_stack',
    description: 'Analyze a stack trace to find the culprit file, line, and git commit.',
    category: 'code_intelligence',
    tags: ['debug', 'stack', 'trace', 'blame', 'git', 'error', 'analyze'],
    weight: 95,
    inputSchema: {
      type: 'object',
      properties: {
        error: { type: 'string', description: 'The error message or stack trace' },
      },
      required: ['error'],
    },
  },
  {
    name: 'detective_run_bisect',
    description: 'Run automated git bisect to find which commit broke a test.',
    category: 'code_intelligence',
    tags: ['git', 'bisect', 'find', 'commit', 'broken', 'regression'],
    weight: 80,
    inputSchema: {
      type: 'object',
      properties: {
        testCommand: { type: 'string', description: 'Shell command to run the test (exit 0=pass, 1=fail)' },
        goodCommit: { type: 'string', description: 'Hash of a known good commit' },
        badCommit: { type: 'string', default: 'HEAD' },
      },
      required: ['testCommand', 'goodCommit'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // THE PSYCH WARD (Personas)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'psych_ward_prompt',
    description: 'Get the system prompt for a specific user persona (boomer, zoomer, hacker, drunk).',
    category: 'psych_ward',
    tags: ['persona', 'roleplay', 'simulate', 'user', 'psych', 'behavior'],
    weight: 85,
    inputSchema: {
      type: 'object',
      properties: {
        persona: { type: 'string', enum: ['boomer', 'zoomer', 'hacker', 'drunk'] },
      },
      required: ['persona'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // THE ART CRITIC (Visual Design)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'critic_review',
    description: 'AI Visual Design Review of a screenshot. Returns score, issues, and praise.',
    category: 'ai_critic',
    tags: ['design', 'ui', 'ux', 'review', 'critique', 'visual', 'style'],
    weight: 90,
    inputSchema: {
      type: 'object',
      properties: {
        screenshotBase64: { type: 'string' },
        context: { type: 'string', description: 'What are we looking at?' },
      },
      required: ['screenshotBase64'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // PROJECT GENESIS (Self-Healing Code)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'genesis_fix',
    description: 'Attempt to fix a source file to pass a failing test command.',
    category: 'ai_genesis',
    tags: ['fix', 'code', 'repair', 'heal', 'tdd', 'auto', 'genesis'],
    weight: 100,
    inputSchema: {
      type: 'object',
      properties: {
        testCommand: { type: 'string' },
        targetFile: { type: 'string' },
        maxAttempts: { type: 'number', default: 3 },
      },
      required: ['testCommand', 'targetFile'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // MOBILE (Maestro)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'mobile_launch_app',
    description: 'Launch a mobile app (iOS/Android) via Maestro.',
    category: 'mobile',
    tags: ['mobile', 'app', 'launch', 'ios', 'android', 'start'],
    weight: 90,
    inputSchema: {
      type: 'object',
      properties: {
        appId: { type: 'string', description: 'Package ID (com.example.app)' },
      },
      required: ['appId'],
    },
  },
  {
    name: 'mobile_tap_text',
    description: 'Tap on text in a mobile app.',
    category: 'mobile',
    tags: ['mobile', 'tap', 'click', 'touch', 'text'],
    weight: 85,
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
      required: ['text'],
    },
  },
  {
    name: 'mobile_input_text',
    description: 'Type text into a mobile app.',
    category: 'mobile',
    tags: ['mobile', 'type', 'input', 'write', 'keyboard'],
    weight: 85,
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
      required: ['text'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CLI TESTING
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'cli_run',
    description: 'Run a CLI command and capture output.',
    category: 'cli',
    tags: ['cli', 'command', 'terminal', 'exec', 'run', 'shell'],
    weight: 90,
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        args: { type: 'array', items: { type: 'string' } },
        expectExitCode: { type: 'number', default: 0 },
        timeout: { type: 'number', default: 10000 },
      },
      required: ['command'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // BACKEND REAL-TIME (WebSockets)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'ws_connect',
    description: 'Connect to a WebSocket server',
    category: 'backend_realtime',
    tags: ['ws', 'websocket', 'connect', 'realtime', 'socket'],
    weight: 90,
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'ws:// or wss:// URL' },
        headers: { type: 'object' },
        timeout: { type: 'number', default: 5000 },
      },
      required: ['url'],
    },
  },
  {
    name: 'ws_send',
    description: 'Send a message to a connected WebSocket',
    category: 'backend_realtime',
    tags: ['ws', 'send', 'message', 'emit', 'socket'],
    weight: 85,
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: { type: 'string' },
        message: { description: 'String or JSON object to send' },
      },
      required: ['connectionId', 'message'],
    },
  },
  {
    name: 'ws_wait_for_message',
    description: 'Wait for a specific message on a WebSocket',
    category: 'backend_realtime',
    tags: ['ws', 'wait', 'listen', 'receive', 'socket'],
    weight: 85,
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: { type: 'string' },
        pattern: { description: 'String substring or JSON object to match' },
        timeout: { type: 'number', default: 5000 },
      },
      required: ['connectionId', 'pattern'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // BACKEND SCHEMA (GraphQL)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'graphql_query',
    description: 'Execute a GraphQL query or mutation',
    category: 'backend_schema',
    tags: ['graphql', 'gql', 'query', 'mutation', 'schema'],
    weight: 95,
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        query: { type: 'string' },
        variables: { type: 'object' },
        headers: { type: 'object' },
        auth: { type: 'string', description: 'Bearer token' },
      },
      required: ['url', 'query'],
    },
  },
  {
    name: 'graphql_introspect',
    description: 'Introspect a GraphQL schema to find available types',
    category: 'backend_schema',
    tags: ['graphql', 'schema', 'types', 'introspect', 'discover'],
    weight: 70,
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        auth: { type: 'string' },
      },
      required: ['url'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // BACKEND MOCKING (Spire)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'mock_server_start',
    description: 'Start a programmable HTTP mock server. Returns the port.',
    category: 'backend_mock',
    tags: ['mock', 'server', 'start', 'http', 'api'],
    weight: 95,
    inputSchema: {
      type: 'object',
      properties: {
        port: { type: 'number', description: 'Specific port or 0 for random' },
      },
    },
  },
  {
    name: 'mock_add_route',
    description: 'Add a route response to the mock server.',
    category: 'backend_mock',
    tags: ['mock', 'route', 'add', 'response', 'stub'],
    weight: 90,
    inputSchema: {
      type: 'object',
      properties: {
        port: { type: 'number' },
        method: { type: 'string', default: 'GET' },
        path: { type: 'string', description: 'URL path or regex:pattern' },
        response: {
          type: 'object',
          properties: {
            status: { type: 'number', default: 200 },
            body: { type: 'object' },
            headers: { type: 'object' },
            delay: { type: 'number', description: 'Latency in ms' },
          },
        },
      },
      required: ['port', 'path'],
    },
  },
  {
    name: 'mock_verify',
    description: 'Verify requests made to the mock server.',
    category: 'backend_mock',
    tags: ['mock', 'verify', 'check', 'spy', 'calls'],
    weight: 85,
    inputSchema: {
      type: 'object',
      properties: {
        port: { type: 'number' },
        routeId: { type: 'string', description: 'Optional: Filter by specific route ID' },
      },
      required: ['port'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // BACKEND LOAD TESTING (Cannon)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'backend_load_test',
    description: 'Run a load/stress test against an endpoint.',
    category: 'backend_test',
    tags: ['load', 'stress', 'performance', 'rps', 'concurrency'],
    weight: 85,
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        method: { type: 'string', default: 'GET' },
        duration: { type: 'string', default: '10s' },
        users: { type: 'number', default: 10 },
        rps: { type: 'number', description: 'Target RPS (0 for unlimited)' },
      },
      required: ['url'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // MCP AUDIT
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'mcp_audit_server',
    description: 'Run a compliance audit on an MCP server (Schema check, error codes, etc).',
    category: 'mcp_testing',
    tags: ['mcp', 'audit', 'lint', 'check', 'compliance'],
    weight: 85,
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: { type: 'string' },
      },
      required: ['connectionId'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // BACKEND QUEUE
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'queue_publish',
    description: 'Publish a message to a queue/topic (Kafka/AMQP/Memory)',
    category: 'backend_queue',
    tags: ['queue', 'kafka', 'rabbit', 'publish', 'send', 'event'],
    weight: 80,
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['memory', 'kafka', 'amqp'], default: 'memory' },
        topic: { type: 'string' },
        message: { description: 'Payload' },
        connectionString: { type: 'string', description: 'Required for kafka/amqp' },
      },
      required: ['topic', 'message'],
    },
  },
  {
    name: 'queue_peek',
    description: 'Peek at messages on a queue/topic',
    category: 'backend_queue',
    tags: ['queue', 'kafka', 'read', 'listen', 'check', 'event'],
    weight: 80,
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['memory', 'kafka', 'amqp'], default: 'memory' },
        topic: { type: 'string' },
        count: { type: 'number', default: 1 },
      },
      required: ['topic'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ASSERTIONS
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'assert_equals',
    description: 'Assert two values are equal',
    category: 'assertions',
    tags: ['assert', 'equal', 'check', 'verify', 'compare'],
    weight: 100,
    inputSchema: {
      type: 'object',
      properties: {
        actual: {},
        expected: {},
        message: { type: 'string' },
      },
      required: ['actual', 'expected'],
    },
  },
  {
    name: 'assert_contains',
    description: 'Assert text contains substring',
    category: 'assertions',
    tags: ['assert', 'contains', 'includes', 'has', 'text'],
    weight: 90,
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        substring: { type: 'string' },
      },
      required: ['text', 'substring'],
    },
  },
  {
    name: 'assert_visible',
    description: 'Assert element is visible',
    category: 'assertions',
    tags: ['assert', 'visible', 'displayed', 'shown', 'see'],
    weight: 85,
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        timeout: { type: 'number', default: 5000 },
      },
      required: ['selector'],
    },
  },
  {
    name: 'assert_url',
    description: 'Assert current URL',
    category: 'assertions',
    tags: ['assert', 'url', 'page', 'location', 'redirect'],
    weight: 80,
    inputSchema: {
      type: 'object',
      properties: {
        expected: { type: 'string' },
        matchType: { type: 'string', enum: ['exact', 'contains', 'startsWith', 'regex'] },
      },
      required: ['expected'],
    },
  },
  {
    name: 'assert_title',
    description: 'Assert page title',
    category: 'assertions',
    tags: ['assert', 'title', 'page', 'header'],
    weight: 70,
    inputSchema: {
      type: 'object',
      properties: {
        expected: { type: 'string' },
        matchType: { type: 'string', enum: ['exact', 'contains'] },
      },
      required: ['expected'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // AI ANALYSIS
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'smart_assert',
    description: 'AI-powered assertion using natural language',
    category: 'ai_analysis',
    tags: ['ai', 'smart', 'assert', 'natural', 'language', 'check'],
    weight: 90,
    inputSchema: {
      type: 'object',
      properties: {
        actual: {},
        expected: { type: 'string' },
        context: { type: 'string' },
      },
      required: ['actual', 'expected'],
    },
  },
  {
    name: 'analyze_failure',
    description: 'AI root cause analysis for failures',
    category: 'ai_analysis',
    tags: ['ai', 'analyze', 'failure', 'error', 'debug', 'why'],
    weight: 85,
    inputSchema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        selector: { type: 'string' },
        htmlSnapshot: { type: 'string' },
      },
      required: ['error'],
    },
  },
  {
    name: 'suggest_fix',
    description: 'AI-powered fix suggestions',
    category: 'ai_analysis',
    tags: ['ai', 'fix', 'suggest', 'repair', 'solve'],
    weight: 80,
    inputSchema: {
      type: 'object',
      properties: {
        errorMessage: { type: 'string' },
        testCode: { type: 'string' },
      },
      required: ['errorMessage'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ACCESSIBILITY
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'accessibility_audit',
    description: 'Run WCAG accessibility audit',
    category: 'accessibility',
    tags: ['a11y', 'accessibility', 'wcag', 'audit', 'disability', 'screen reader'],
    weight: 100,
    inputSchema: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['A', 'AA', 'AAA'], default: 'AA' },
        selector: { type: 'string' },
      },
    },
  },
  {
    name: 'a11y_check_basic',
    description: 'Basic accessibility checks',
    category: 'accessibility',
    tags: ['a11y', 'accessibility', 'basic', 'quick'],
    weight: 80,
    inputSchema: {
      type: 'object',
      properties: {
        rules: { type: 'array', items: { type: 'string' } },
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // DATA GENERATION
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'data_generate',
    description: 'Generate test data (names, emails, etc.)',
    category: 'data_generation',
    tags: ['data', 'generate', 'fake', 'mock', 'test', 'random'],
    weight: 90,
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['name', 'email', 'phone', 'address', 'uuid'] },
        count: { type: 'number', default: 1 },
      },
      required: ['type'],
    },
  },
  {
    name: 'data_edge_cases',
    description: 'Generate edge case test values',
    category: 'data_generation',
    tags: ['edge', 'case', 'boundary', 'sql', 'xss', 'injection'],
    weight: 80,
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['sql_injection', 'xss', 'boundary', 'unicode', 'all'] },
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // SELECTORS
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'selector_suggest',
    description: 'Suggest selectors for an element',
    category: 'selectors',
    tags: ['selector', 'find', 'suggest', 'locate', 'element'],
    weight: 90,
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string' },
        near: { type: 'string' },
      },
    },
  },
  {
    name: 'selector_validate',
    description: 'Validate if a selector works',
    category: 'selectors',
    tags: ['selector', 'validate', 'check', 'test'],
    weight: 80,
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        expectUnique: { type: 'boolean', default: true },
      },
      required: ['selector'],
    },
  },
  {
    name: 'selector_alternatives',
    description: 'Find alternative selectors',
    category: 'selectors',
    tags: ['selector', 'alternative', 'backup', 'heal'],
    weight: 70,
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        maxAlternatives: { type: 'number', default: 5 },
      },
      required: ['selector'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // PERFORMANCE
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'performance_analyze',
    description: 'Analyze page performance metrics',
    category: 'performance',
    tags: ['performance', 'speed', 'metrics', 'lcp', 'fcp', 'cls'],
    weight: 90,
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        waitForLoad: { type: 'boolean', default: true },
      },
    },
  },
  {
    name: 'performance_budget_check',
    description: 'Check against performance budgets',
    category: 'performance',
    tags: ['performance', 'budget', 'threshold', 'limit'],
    weight: 80,
    inputSchema: {
      type: 'object',
      properties: {
        budget: { type: 'object' },
        url: { type: 'string' },
      },
      required: ['budget'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // SECURITY
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'security_scan',
    description: 'Run OWASP security checks',
    category: 'security',
    tags: ['security', 'owasp', 'scan', 'vulnerability', 'xss', 'injection'],
    weight: 100,
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        categories: { type: 'array', items: { type: 'string' } },
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // STORAGE
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'storage_clear',
    description: 'Clear browser storage',
    category: 'storage',
    tags: ['storage', 'clear', 'cookies', 'local', 'session'],
    weight: 80,
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['cookies', 'localStorage', 'sessionStorage', 'all'] },
      },
      required: ['type'],
    },
  },
  {
    name: 'storage_get',
    description: 'Get values from storage',
    category: 'storage',
    tags: ['storage', 'get', 'read', 'cookies'],
    weight: 70,
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['cookies', 'localStorage', 'sessionStorage'] },
        key: { type: 'string' },
      },
      required: ['type'],
    },
  },
  {
    name: 'storage_set',
    description: 'Set values in storage',
    category: 'storage',
    tags: ['storage', 'set', 'write', 'cookies'],
    weight: 70,
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['cookies', 'localStorage', 'sessionStorage'] },
        key: { type: 'string' },
        value: { type: 'string' },
      },
      required: ['type', 'key', 'value'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // NETWORK
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'network_mock',
    description: 'Mock network requests',
    category: 'network',
    tags: ['network', 'mock', 'stub', 'fake', 'intercept'],
    weight: 80,
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        response: { type: 'object' },
      },
      required: ['url', 'response'],
    },
  },
  {
    name: 'network_unmock',
    description: 'Remove network mocks',
    category: 'network',
    tags: ['network', 'unmock', 'remove', 'clear'],
    weight: 60,
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // REPORTING
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'report_summary',
    description: 'Generate test summary report',
    category: 'reporting',
    tags: ['report', 'summary', 'results', 'stats'],
    weight: 90,
    inputSchema: {
      type: 'object',
      properties: {
        results: { type: 'object' },
        format: { type: 'string', enum: ['text', 'markdown', 'json'] },
      },
      required: ['results'],
    },
  },
  {
    name: 'report_failures',
    description: 'Generate failure report',
    category: 'reporting',
    tags: ['report', 'failures', 'errors', 'failed'],
    weight: 85,
    inputSchema: {
      type: 'object',
      properties: {
        results: { type: 'object' },
        format: { type: 'string', enum: ['text', 'markdown', 'json'] },
      },
      required: ['results'],
    },
  },
  // ─────────────────────────────────────────────────────────────────────────────
  // MCP TESTING (META-VERIFICATION)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'mcp_connect',
    description: 'Connect to an external MCP server (Stdio or SSE). Returns a Connection ID.',
    category: 'mcp_testing',
    tags: ['mcp', 'connect', 'server', 'agent', 'attach'],
    weight: 100,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Unique ID for this connection' },
        type: { type: 'string', enum: ['stdio', 'sse'] },
        command: { type: 'string', description: 'Command to run (for stdio)' },
        args: { type: 'array', items: { type: 'string' }, description: 'Arguments (for stdio)' },
        url: { type: 'string', description: 'URL (for sse)' },
        env: { type: 'object', description: 'Environment variables' },
      },
      required: ['id', 'type'],
    },
  },
  {
    name: 'mcp_list_tools',
    description: 'List available tools on a connected MCP server.',
    category: 'mcp_testing',
    tags: ['mcp', 'list', 'tools', 'capabilities', 'discovery'],
    weight: 90,
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: { type: 'string' },
      },
      required: ['connectionId'],
    },
  },
  {
    name: 'mcp_call_tool',
    description: 'Call a tool on a connected MCP server.',
    category: 'mcp_testing',
    tags: ['mcp', 'call', 'invoke', 'execute', 'run'],
    weight: 95,
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: { type: 'string' },
        toolName: { type: 'string' },
        arguments: { type: 'object' },
      },
      required: ['connectionId', 'toolName'],
    },
  },
  {
    name: 'mcp_read_resource',
    description: 'Read a resource from a connected MCP server.',
    category: 'mcp_testing',
    tags: ['mcp', 'read', 'resource', 'file', 'data'],
    weight: 80,
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: { type: 'string' },
        uri: { type: 'string' },
      },
      required: ['connectionId', 'uri'],
    },
  },
];

// =============================================================================
// Category Metadata

export const CATEGORY_INFO: Record<ToolCategory, {
  name: string;
  description: string;
  keywords: string[];
}> = {
  browser_core: {
    name: 'Browser Core',
    description: 'Basic browser lifecycle (launch, navigate, close)',
    keywords: ['browser', 'start', 'open', 'url', 'page', 'site', 'website'],
  },
  browser_interact: {
    name: 'Browser Interaction',
    description: 'User interactions (click, type, scroll)',
    keywords: ['click', 'type', 'input', 'form', 'button', 'scroll', 'key'],
  },
  browser_read: {
    name: 'Browser Reading',
    description: 'Reading page content (screenshot, text, elements)',
    keywords: ['screenshot', 'text', 'read', 'get', 'see', 'view', 'content'],
  },
  browser_wait: {
    name: 'Browser Waiting',
    description: 'Waiting for conditions',
    keywords: ['wait', 'until', 'ready', 'load', 'visible'],
  },
  backend_http: {
    name: 'Backend HTTP',
    description: 'HTTP requests and health checks',
    keywords: ['api', 'http', 'request', 'backend', 'server', 'endpoint'],
  },
  backend_test: {
    name: 'Backend Testing',
    description: 'API testing and load testing',
    keywords: ['test', 'api', 'load', 'stress', 'performance'],
  },
  backend_session: {
    name: 'Backend Sessions',
    description: 'Session and variable management',
    keywords: ['session', 'variable', 'state', 'auth'],
  },
  backend_realtime: {
    name: 'Real-Time',
    description: 'WebSocket and persistent connections',
    keywords: ['websocket', 'socket', 'realtime', 'live', 'stream'],
  },
  backend_schema: {
    name: 'Schema APIs',
    description: 'GraphQL and gRPC endpoints',
    keywords: ['graphql', 'gql', 'schema', 'type', 'grpc'],
  },
  backend_queue: {
    name: 'Message Queues',
    description: 'Event-driven verification (Kafka/RabbitMQ)',
    keywords: ['queue', 'kafka', 'rabbit', 'event', 'message', 'broker'],
  },
  backend_mock: {
    name: 'Mocking Spire',
    description: 'Instant HTTP/API mock servers',
    keywords: ['mock', 'fake', 'stub', 'simulate', 'server', 'api'],
  },
  mobile: {
    name: 'Mobile',
    description: 'iOS/Android automation via Maestro',
    keywords: ['mobile', 'app', 'ios', 'android', 'phone', 'tablet'],
  },
  cli: {
    name: 'CLI',
    description: 'Command line tool verification',
    keywords: ['cli', 'terminal', 'shell', 'command', 'bash'],
  },
  psych_ward: {
    name: 'The Psych Ward',
    description: 'Persona-based user simulation',
    keywords: ['persona', 'user', 'simulate', 'behavior', 'role'],
  },
  ai_critic: {
    name: 'The Art Critic',
    description: 'AI visual design and UX review',
    keywords: ['design', 'ui', 'ux', 'visual', 'review'],
  },
  ai_genesis: {
    name: 'Project Genesis',
    description: 'Self-healing code generation loops',
    keywords: ['fix', 'repair', 'code', 'generate', 'tdd'],
  },
  code_intelligence: {
    name: 'Code Intelligence',
    description: 'Source code analysis and git forensics',
    keywords: ['git', 'blame', 'code', 'source', 'stack', 'debug', 'bisect'],
  },
  assertions: {
    name: 'Assertions',
    description: 'Test assertions and verifications',
    keywords: ['assert', 'check', 'verify', 'expect', 'should', 'must'],
  },
  ai_analysis: {
    name: 'AI Analysis',
    description: 'AI-powered analysis and suggestions',
    keywords: ['ai', 'smart', 'analyze', 'suggest', 'intelligent'],
  },
  ai_generation: {
    name: 'AI Generation',
    description: 'AI-powered test generation',
    keywords: ['generate', 'create', 'ai', 'auto'],
  },
  accessibility: {
    name: 'Accessibility',
    description: 'WCAG accessibility testing',
    keywords: ['a11y', 'accessibility', 'wcag', 'screen reader', 'disability'],
  },
  video: {
    name: 'Video',
    description: 'Video recording and analysis',
    keywords: ['video', 'record', 'film', 'capture'],
  },
  data_generation: {
    name: 'Data Generation',
    description: 'Test data generation',
    keywords: ['data', 'generate', 'fake', 'mock', 'random'],
  },
  selectors: {
    name: 'Selectors',
    description: 'Selector management and healing',
    keywords: ['selector', 'element', 'find', 'locate', 'heal'],
  },
  performance: {
    name: 'Performance',
    description: 'Performance testing and analysis',
    keywords: ['performance', 'speed', 'fast', 'slow', 'metrics'],
  },
  security: {
    name: 'Security',
    description: 'Security scanning',
    keywords: ['security', 'owasp', 'vulnerability', 'hack', 'injection'],
  },
  storage: {
    name: 'Storage',
    description: 'Browser storage management',
    keywords: ['storage', 'cookies', 'local', 'session', 'cache'],
  },
  network: {
    name: 'Network',
    description: 'Network mocking and monitoring',
    keywords: ['network', 'mock', 'intercept', 'request'],
  },
  console: {
    name: 'Console',
    description: 'Browser console capture',
    keywords: ['console', 'log', 'error', 'debug'],
  },
  reporting: {
    name: 'Reporting',
    description: 'Test reporting',
    keywords: ['report', 'summary', 'results', 'output'],
  },
  system: {
    name: 'System',
    description: 'OS-level automation',
    keywords: ['system', 'desktop', 'os', 'native', 'window'],
  },
  mcp_testing: {
    name: 'MCP Testing',
    description: 'Testing MCP servers',
    keywords: ['mcp', 'server', 'test', 'protocol'],
  },
};

// =============================================================================
// Tool Selection Functions
// =============================================================================

/**
 * Select tools based on intent analysis
 */
export function selectToolsForIntent(intent: string, maxTools: number = 15): ToolSelection {
  const intentLower = intent.toLowerCase();
  const scores: Map<string, number> = new Map();
  const matchedCategories: Set<ToolCategory> = new Set();

  // Score each tool based on keyword matches
  for (const tool of TOOL_REGISTRY) {
    let score = 0;

    // Check tool tags
    for (const tag of tool.tags) {
      if (intentLower.includes(tag)) {
        score += 10;
      }
    }

    // Check tool name
    const nameParts = tool.name.split('_');
    for (const part of nameParts) {
      if (intentLower.includes(part)) {
        score += 5;
      }
    }

    // Check category keywords
    const categoryInfo = CATEGORY_INFO[tool.category];
    for (const keyword of categoryInfo.keywords) {
      if (intentLower.includes(keyword)) {
        score += 3;
        matchedCategories.add(tool.category);
      }
    }

    // Add base weight
    score += tool.weight / 10;

    if (score > 0) {
      scores.set(tool.name, score);
    }
  }

  // Always include core browser tools for web tasks
  const webKeywords = ['website', 'page', 'site', 'login', 'click', 'navigate', 'browser', 'open', 'go to'];
  if (webKeywords.some(k => intentLower.includes(k))) {
    matchedCategories.add('browser_core');
    matchedCategories.add('browser_interact');
    matchedCategories.add('browser_read');
  }

  // Always include assertion tools for test/verify tasks
  const testKeywords = ['test', 'verify', 'check', 'assert', 'should', 'expect', 'must'];
  if (testKeywords.some(k => intentLower.includes(k))) {
    matchedCategories.add('assertions');
  }

  // Get tools from matched categories, sorted by score
  const selectedTools: ToolDefinition[] = [];

  // First, add high-scoring tools
  const sortedByScore = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTools);

  for (const [toolName] of sortedByScore) {
    const tool = TOOL_REGISTRY.find(t => t.name === toolName);
    if (tool) {
      selectedTools.push(tool);
    }
  }

  // Fill remaining slots with essential tools from matched categories
  const essentialTools = TOOL_REGISTRY
    .filter(t => matchedCategories.has(t.category) && !selectedTools.find(s => s.name === t.name))
    .sort((a, b) => b.weight - a.weight);

  for (const tool of essentialTools) {
    if (selectedTools.length >= maxTools) break;
    selectedTools.push(tool);
  }

  // Generate reasoning
  const categoryNames = [...matchedCategories].map(c => CATEGORY_INFO[c].name);
  const reasoning = `Selected ${selectedTools.length} tools for intent "${intent.substring(0, 50)}...". ` +
    `Detected categories: ${categoryNames.join(', ')}. ` +
    `Top tools by relevance: ${selectedTools.slice(0, 5).map(t => t.name).join(', ')}.`;

  return {
    tools: selectedTools,
    reasoning,
    categories: [...matchedCategories],
  };
}

/**
 * Get tools by category
 */
export function getToolsByCategory(category: ToolCategory): ToolDefinition[] {
  return TOOL_REGISTRY.filter(t => t.category === category);
}

/**
 * Get all tools (for fallback)
 */
export function getAllTools(): ToolDefinition[] {
  return TOOL_REGISTRY;
}

/**
 * Search tools by keyword
 */
export function searchTools(keyword: string): ToolDefinition[] {
  const lower = keyword.toLowerCase();
  return TOOL_REGISTRY.filter(tool =>
    tool.name.includes(lower) ||
    tool.description.toLowerCase().includes(lower) ||
    tool.tags.some(t => t.includes(lower))
  );
}
