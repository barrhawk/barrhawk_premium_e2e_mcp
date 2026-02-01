#!/usr/bin/env node
/**
 * BarrHawk E2E - Full SDLC MCP for Claude Code
 *
 * A+B+C+D: Browser + Database + GitHub + Docker + Filesystem + Orchestration
 *
 * Entry point for the MCP server.
 */

// ------------------------------------------------------------------
// PROTOCOL SAFETY: Redirect console.log to stderr
// ------------------------------------------------------------------
const originalLog = console.log;
console.log = (...args) => console.error(...args);
// ------------------------------------------------------------------

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { loadConfig, Config } from './config.js';
import { BrowserManager } from './browser/launcher.js';

// Browser Tool handlers
import { handleLaunch } from './tools/launch.js';
import { handleNavigate } from './tools/navigate.js';
import { handleClick } from './tools/click.js';
import { handleType } from './tools/type.js';
import { handleScreenshot } from './tools/screenshot.js';
import { handleGetText } from './tools/getText.js';
import { handleWait } from './tools/wait.js';
import { handleScroll } from './tools/scroll.js';
import { handlePressKey } from './tools/pressKey.js';
import { handleClose } from './tools/close.js';
import { handleGetElements } from './tools/getElements.js';

// Playwright Parity Tools
import {
  handleSnapshot,
  handleEvaluate,
  handleConsoleMessages,
  handleNetworkRequests,
  handleHover,
  handleDrag,
  handleSelectOption,
  handleFileUpload,
  handleDialog,
  handleFillForm,
  handleNavigateBack,
  handleNavigateForward,
  handleResize,
  handleTabs,
  handlePdfSave,
  handleMouseMove,
  handleMouseClickXY,
  handleMouseDragXY,
  handleMouseWheel,
  handleStartTracing,
  handleStopTracing,
  handleReload,
} from './tools/playwrightParity.js';

// Database Tools
import {
  handlePgConnect,
  handlePgQuery,
  handlePgSchema,
  handlePgSeed,
  handlePgTransaction,
  handlePgDisconnect,
  handleSqliteOpen,
  handleSqliteQuery,
  handleSqliteSchema,
  handleSqliteClose,
  handleRedisConnect,
  handleRedisGet,
  handleRedisSet,
  handleRedisDel,
  handleRedisKeys,
  handleRedisFlush,
  handleRedisHash,
  handleRedisDisconnect,
} from './tools/database.js';

// GitHub Tools
import {
  handleGhConnect,
  handleGhDisconnect,
  handleGhRepoInfo,
  handleGhFileRead,
  handleGhFileWrite,
  handleGhBranchList,
  handleGhBranchCreate,
  handleGhPrList,
  handleGhPrCreate,
  handleGhPrMerge,
  handleGhPrReview,
  handleGhIssueList,
  handleGhIssueCreate,
  handleGhIssueComment,
  handleGhWorkflowList,
  handleGhWorkflowRun,
  handleGhWorkflowRuns,
  handleGhDiff,
} from './tools/github.js';

// Docker Tools
import {
  handleDockerPs,
  handleDockerRun,
  handleDockerStop,
  handleDockerRm,
  handleDockerLogs,
  handleDockerExec,
  handleDockerBuild,
  handleDockerImages,
  handleDockerPull,
  handleDockerInspect,
  handleComposeUp,
  handleComposeDown,
  handleComposePs,
  handleComposeLogs,
  handleComposeExec,
  handleDockerNetworks,
  handleDockerVolumes,
  handleDockerCleanup,
} from './tools/docker.js';

// Filesystem Tools
import {
  handleFsReadFile,
  handleFsWriteFile,
  handleFsListDir,
  handleFsExists,
  handleFsMkdir,
  handleFsRemove,
  handleFsCopy,
  handleFsMove,
  handleFsWatch,
  handleFsDiff,
  handleFsSearch,
  handleFsHash,
  handleFsZip,
  handleFsUnzip,
  handleFsChmod,
  handleFsChown,
  handleFsTemplate,
  handleFsBackup,
  handleFsRestore,
} from './tools/filesystem.js';

// MCP Orchestration Tools
import {
  handleMcpDiscover,
  handleMcpRegister,
  handleMcpUnregister,
  handleMcpList,
  handleMcpRoute,
  handleMcpAggregate,
  handleMcpHealth,
  handleMcpFailover,
  handleMcpLoadBalance,
  handleMcpCatalog,
} from './tools/orchestration.js';

const VERSION = '0.4.0-abcd';

// Tool definitions
const TOOLS: Tool[] = [
  // ==========================================================================
  // PILLAR A: BROWSER AUTOMATION (36 tools)
  // ==========================================================================

  // --- SQUAD MANAGEMENT ---
  {
    name: 'worker_launch',
    description: 'Launch a new isolated browser worker (Igor). Use for multi-tab/multi-user workflows.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Custom worker ID' },
        url: { type: 'string', description: 'Initial URL' },
        headless: { type: 'boolean' },
      },
    },
  },
  {
    name: 'worker_switch',
    description: 'Switch active focus to a specific worker.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'worker_list',
    description: 'List all active workers and status.',
    inputSchema: { type: 'object', properties: {} },
  },

  // --- BROWSER CORE ---
  {
    name: 'browser_launch',
    description: 'Launch browser session.',
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
    description: 'Navigate to URL.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
  },
  {
    name: 'browser_click',
    description: 'Click element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        text: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        button: { type: 'string', enum: ['left', 'right', 'middle'] },
        selfHeal: { type: 'boolean', default: true },
      },
    },
  },
  {
    name: 'browser_type',
    description: 'Type text into element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        text: { type: 'string' },
        clear: { type: 'boolean', default: true },
        pressEnter: { type: 'boolean', default: false },
        selfHeal: { type: 'boolean', default: true },
      },
      required: ['selector', 'text'],
    },
  },
  {
    name: 'browser_screenshot',
    description: 'Take screenshot.',
    inputSchema: {
      type: 'object',
      properties: {
        fullPage: { type: 'boolean', default: false },
        selector: { type: 'string' },
        savePath: { type: 'string' },
      },
    },
  },
  {
    name: 'browser_get_text',
    description: 'Get text content.',
    inputSchema: {
      type: 'object',
      properties: { selector: { type: 'string' } },
    },
  },
  {
    name: 'browser_wait',
    description: 'Wait for condition.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        state: { type: 'string', enum: ['visible', 'hidden', 'attached', 'detached'], default: 'visible' },
        timeout: { type: 'number', default: 30000 },
      },
    },
  },
  {
    name: 'browser_scroll',
    description: 'Scroll page.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
        amount: { type: 'number', default: 500 },
        selector: { type: 'string' },
      },
      required: ['direction'],
    },
  },
  {
    name: 'browser_press_key',
    description: 'Press keyboard key.',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
    },
  },
  {
    name: 'browser_close',
    description: 'Close browser.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'browser_get_elements',
    description: 'Get elements list.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        limit: { type: 'number', default: 20 },
      },
      required: ['selector'],
    },
  },

  // --- PLAYWRIGHT PARITY ---
  {
    name: 'browser_snapshot',
    description: 'Get accessibility tree snapshot.',
    inputSchema: {
      type: 'object',
      properties: {
        root: { type: 'string' },
        includeHidden: { type: 'boolean', default: false },
      },
    },
  },
  {
    name: 'browser_evaluate',
    description: 'Execute JavaScript in page context.',
    inputSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string' },
        arg: {},
      },
      required: ['expression'],
    },
  },
  {
    name: 'browser_console_messages',
    description: 'Get console messages.',
    inputSchema: {
      type: 'object',
      properties: {
        clear: { type: 'boolean', default: false },
        filter: { type: 'string' },
      },
    },
  },
  {
    name: 'browser_network_requests',
    description: 'Capture network requests.',
    inputSchema: {
      type: 'object',
      properties: {
        start: { type: 'boolean' },
        stop: { type: 'boolean' },
        clear: { type: 'boolean' },
        filter: { type: 'string' },
      },
    },
  },
  {
    name: 'browser_hover',
    description: 'Hover over element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        position: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_drag',
    description: 'Drag element to target.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string' },
        target: { type: 'string' },
        sourcePosition: { type: 'object' },
        targetPosition: { type: 'object' },
      },
      required: ['source', 'target'],
    },
  },
  {
    name: 'browser_select_option',
    description: 'Select dropdown option.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        value: { type: 'string' },
        label: { type: 'string' },
        index: { type: 'number' },
        values: { type: 'array', items: { type: 'string' } },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_file_upload',
    description: 'Upload files.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        files: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
      },
      required: ['selector', 'files'],
    },
  },
  {
    name: 'browser_handle_dialog',
    description: 'Handle browser dialogs.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['accept', 'dismiss', 'listen'] },
        promptText: { type: 'string' },
        autoRespond: { type: 'boolean', default: true },
      },
      required: ['action'],
    },
  },
  {
    name: 'browser_fill_form',
    description: 'Fill multiple form fields.',
    inputSchema: {
      type: 'object',
      properties: {
        fields: { type: 'array', items: { type: 'object' } },
        submit: { type: 'string' },
      },
      required: ['fields'],
    },
  },
  {
    name: 'browser_navigate_back',
    description: 'Navigate back.',
    inputSchema: {
      type: 'object',
      properties: { waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle'] } },
    },
  },
  {
    name: 'browser_navigate_forward',
    description: 'Navigate forward.',
    inputSchema: {
      type: 'object',
      properties: { waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle'] } },
    },
  },
  {
    name: 'browser_reload',
    description: 'Reload page.',
    inputSchema: {
      type: 'object',
      properties: { waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle'] } },
    },
  },
  {
    name: 'browser_resize',
    description: 'Resize viewport.',
    inputSchema: {
      type: 'object',
      properties: { width: { type: 'number' }, height: { type: 'number' } },
      required: ['width', 'height'],
    },
  },
  {
    name: 'browser_tabs',
    description: 'Manage tabs.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'new', 'close', 'switch'] },
        url: { type: 'string' },
        index: { type: 'number' },
      },
      required: ['action'],
    },
  },
  {
    name: 'browser_pdf_save',
    description: 'Save page as PDF.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        format: { type: 'string', enum: ['Letter', 'Legal', 'A4'], default: 'A4' },
        landscape: { type: 'boolean', default: false },
        printBackground: { type: 'boolean', default: true },
      },
      required: ['path'],
    },
  },
  {
    name: 'browser_mouse_move',
    description: 'Move mouse to coordinates.',
    inputSchema: {
      type: 'object',
      properties: { x: { type: 'number' }, y: { type: 'number' }, steps: { type: 'number', default: 1 } },
      required: ['x', 'y'],
    },
  },
  {
    name: 'browser_mouse_click',
    description: 'Click at coordinates.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        button: { type: 'string', enum: ['left', 'right', 'middle'], default: 'left' },
        clickCount: { type: 'number', default: 1 },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'browser_mouse_drag',
    description: 'Drag between coordinates.',
    inputSchema: {
      type: 'object',
      properties: {
        fromX: { type: 'number' },
        fromY: { type: 'number' },
        toX: { type: 'number' },
        toY: { type: 'number' },
        steps: { type: 'number', default: 10 },
      },
      required: ['fromX', 'fromY', 'toX', 'toY'],
    },
  },
  {
    name: 'browser_mouse_wheel',
    description: 'Scroll with mouse wheel.',
    inputSchema: {
      type: 'object',
      properties: { deltaX: { type: 'number', default: 0 }, deltaY: { type: 'number', default: 0 } },
    },
  },
  {
    name: 'browser_start_tracing',
    description: 'Start Playwright trace.',
    inputSchema: {
      type: 'object',
      properties: {
        screenshots: { type: 'boolean', default: true },
        snapshots: { type: 'boolean', default: true },
        sources: { type: 'boolean', default: false },
      },
    },
  },
  {
    name: 'browser_stop_tracing',
    description: 'Stop tracing and save.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },

  // ==========================================================================
  // PILLAR B: DATABASE TOOLS (18 tools)
  // ==========================================================================

  // --- POSTGRESQL ---
  {
    name: 'db_pg_connect',
    description: 'Connect to PostgreSQL database.',
    inputSchema: {
      type: 'object',
      properties: {
        connectionString: { type: 'string' },
        host: { type: 'string' },
        port: { type: 'number', default: 5432 },
        database: { type: 'string' },
        user: { type: 'string' },
        password: { type: 'string' },
        alias: { type: 'string', default: 'default' },
      },
    },
  },
  {
    name: 'db_pg_query',
    description: 'Execute PostgreSQL query.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        params: { type: 'array' },
        alias: { type: 'string', default: 'default' },
      },
      required: ['query'],
    },
  },
  {
    name: 'db_pg_schema',
    description: 'Get PostgreSQL schema info.',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string' },
        alias: { type: 'string', default: 'default' },
      },
    },
  },
  {
    name: 'db_pg_seed',
    description: 'Seed PostgreSQL table with data.',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string' },
        data: { type: 'array', items: { type: 'object' } },
        truncateFirst: { type: 'boolean', default: false },
        alias: { type: 'string', default: 'default' },
      },
      required: ['table', 'data'],
    },
  },
  {
    name: 'db_pg_transaction',
    description: 'Execute PostgreSQL transaction.',
    inputSchema: {
      type: 'object',
      properties: {
        queries: { type: 'array', items: { type: 'object' } },
        alias: { type: 'string', default: 'default' },
      },
      required: ['queries'],
    },
  },
  {
    name: 'db_pg_disconnect',
    description: 'Disconnect from PostgreSQL.',
    inputSchema: {
      type: 'object',
      properties: { alias: { type: 'string', default: 'default' } },
    },
  },

  // --- SQLITE ---
  {
    name: 'db_sqlite_open',
    description: 'Open SQLite database.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        alias: { type: 'string', default: 'default' },
        readonly: { type: 'boolean', default: false },
      },
      required: ['path'],
    },
  },
  {
    name: 'db_sqlite_query',
    description: 'Execute SQLite query.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        params: { type: 'array' },
        alias: { type: 'string', default: 'default' },
      },
      required: ['query'],
    },
  },
  {
    name: 'db_sqlite_schema',
    description: 'Get SQLite schema info.',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string' },
        alias: { type: 'string', default: 'default' },
      },
    },
  },
  {
    name: 'db_sqlite_close',
    description: 'Close SQLite connection.',
    inputSchema: {
      type: 'object',
      properties: { alias: { type: 'string', default: 'default' } },
    },
  },

  // --- REDIS ---
  {
    name: 'db_redis_connect',
    description: 'Connect to Redis.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        host: { type: 'string' },
        port: { type: 'number', default: 6379 },
        password: { type: 'string' },
        alias: { type: 'string', default: 'default' },
      },
    },
  },
  {
    name: 'db_redis_get',
    description: 'Get Redis key value.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        alias: { type: 'string', default: 'default' },
      },
      required: ['key'],
    },
  },
  {
    name: 'db_redis_set',
    description: 'Set Redis key value.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        value: { type: 'string' },
        ttl: { type: 'number' },
        alias: { type: 'string', default: 'default' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'db_redis_del',
    description: 'Delete Redis keys.',
    inputSchema: {
      type: 'object',
      properties: {
        keys: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
        alias: { type: 'string', default: 'default' },
      },
      required: ['keys'],
    },
  },
  {
    name: 'db_redis_keys',
    description: 'List Redis keys.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', default: '*' },
        alias: { type: 'string', default: 'default' },
      },
    },
  },
  {
    name: 'db_redis_flush',
    description: 'Flush Redis database.',
    inputSchema: {
      type: 'object',
      properties: {
        alias: { type: 'string', default: 'default' },
        confirm: { type: 'boolean' },
      },
      required: ['confirm'],
    },
  },
  {
    name: 'db_redis_hash',
    description: 'Redis hash operations.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get', 'set', 'getall', 'del'] },
        key: { type: 'string' },
        field: { type: 'string' },
        value: { type: 'string' },
        fields: { type: 'object' },
        alias: { type: 'string', default: 'default' },
      },
      required: ['action', 'key'],
    },
  },
  {
    name: 'db_redis_disconnect',
    description: 'Disconnect from Redis.',
    inputSchema: {
      type: 'object',
      properties: { alias: { type: 'string', default: 'default' } },
    },
  },

  // ==========================================================================
  // PILLAR B: GITHUB TOOLS (18 tools)
  // ==========================================================================
  {
    name: 'gh_connect',
    description: 'Connect to GitHub with token.',
    inputSchema: {
      type: 'object',
      properties: {
        token: { type: 'string' },
        alias: { type: 'string', default: 'default' },
      },
      required: ['token'],
    },
  },
  {
    name: 'gh_disconnect',
    description: 'Disconnect from GitHub.',
    inputSchema: {
      type: 'object',
      properties: { alias: { type: 'string', default: 'default' } },
    },
  },
  {
    name: 'gh_repo_info',
    description: 'Get repository info.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        alias: { type: 'string', default: 'default' },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'gh_file_read',
    description: 'Read file from repo.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        path: { type: 'string' },
        ref: { type: 'string' },
        alias: { type: 'string', default: 'default' },
      },
      required: ['owner', 'repo', 'path'],
    },
  },
  {
    name: 'gh_file_write',
    description: 'Create/update file in repo.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        path: { type: 'string' },
        content: { type: 'string' },
        message: { type: 'string' },
        branch: { type: 'string' },
        alias: { type: 'string', default: 'default' },
      },
      required: ['owner', 'repo', 'path', 'content', 'message'],
    },
  },
  {
    name: 'gh_branch_list',
    description: 'List branches.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        alias: { type: 'string', default: 'default' },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'gh_branch_create',
    description: 'Create branch.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        branch: { type: 'string' },
        from: { type: 'string' },
        alias: { type: 'string', default: 'default' },
      },
      required: ['owner', 'repo', 'branch'],
    },
  },
  {
    name: 'gh_pr_list',
    description: 'List pull requests.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        state: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' },
        alias: { type: 'string', default: 'default' },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'gh_pr_create',
    description: 'Create pull request.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        head: { type: 'string' },
        base: { type: 'string' },
        alias: { type: 'string', default: 'default' },
      },
      required: ['owner', 'repo', 'title', 'head', 'base'],
    },
  },
  {
    name: 'gh_pr_merge',
    description: 'Merge pull request.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        pullNumber: { type: 'number' },
        mergeMethod: { type: 'string', enum: ['merge', 'squash', 'rebase'], default: 'merge' },
        alias: { type: 'string', default: 'default' },
      },
      required: ['owner', 'repo', 'pullNumber'],
    },
  },
  {
    name: 'gh_pr_review',
    description: 'Add PR review.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        pullNumber: { type: 'number' },
        event: { type: 'string', enum: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'] },
        body: { type: 'string' },
        alias: { type: 'string', default: 'default' },
      },
      required: ['owner', 'repo', 'pullNumber', 'event'],
    },
  },
  {
    name: 'gh_issue_list',
    description: 'List issues.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        state: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' },
        labels: { type: 'array', items: { type: 'string' } },
        alias: { type: 'string', default: 'default' },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'gh_issue_create',
    description: 'Create issue.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        labels: { type: 'array', items: { type: 'string' } },
        alias: { type: 'string', default: 'default' },
      },
      required: ['owner', 'repo', 'title'],
    },
  },
  {
    name: 'gh_issue_comment',
    description: 'Add issue comment.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        issueNumber: { type: 'number' },
        body: { type: 'string' },
        alias: { type: 'string', default: 'default' },
      },
      required: ['owner', 'repo', 'issueNumber', 'body'],
    },
  },
  {
    name: 'gh_workflow_list',
    description: 'List GitHub Actions workflows.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        alias: { type: 'string', default: 'default' },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'gh_workflow_run',
    description: 'Trigger workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        workflowId: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        ref: { type: 'string' },
        inputs: { type: 'object' },
        alias: { type: 'string', default: 'default' },
      },
      required: ['owner', 'repo', 'workflowId', 'ref'],
    },
  },
  {
    name: 'gh_workflow_runs',
    description: 'Get workflow runs.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        workflowId: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        status: { type: 'string' },
        alias: { type: 'string', default: 'default' },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'gh_diff',
    description: 'Compare refs.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        base: { type: 'string' },
        head: { type: 'string' },
        alias: { type: 'string', default: 'default' },
      },
      required: ['owner', 'repo', 'base', 'head'],
    },
  },

  // ==========================================================================
  // PILLAR B: DOCKER TOOLS (18 tools)
  // ==========================================================================
  {
    name: 'docker_ps',
    description: 'List Docker containers.',
    inputSchema: {
      type: 'object',
      properties: {
        all: { type: 'boolean', default: false },
        filter: { type: 'string' },
      },
    },
  },
  {
    name: 'docker_run',
    description: 'Run Docker container.',
    inputSchema: {
      type: 'object',
      properties: {
        image: { type: 'string' },
        name: { type: 'string' },
        ports: { type: 'array', items: { type: 'string' } },
        env: { type: 'object' },
        volumes: { type: 'array', items: { type: 'string' } },
        detach: { type: 'boolean', default: true },
        rm: { type: 'boolean', default: false },
        command: { type: 'string' },
      },
      required: ['image'],
    },
  },
  {
    name: 'docker_stop',
    description: 'Stop Docker container.',
    inputSchema: {
      type: 'object',
      properties: {
        container: { type: 'string' },
        timeout: { type: 'number' },
      },
      required: ['container'],
    },
  },
  {
    name: 'docker_rm',
    description: 'Remove Docker container.',
    inputSchema: {
      type: 'object',
      properties: {
        container: { type: 'string' },
        force: { type: 'boolean', default: false },
        volumes: { type: 'boolean', default: false },
      },
      required: ['container'],
    },
  },
  {
    name: 'docker_logs',
    description: 'Get container logs.',
    inputSchema: {
      type: 'object',
      properties: {
        container: { type: 'string' },
        tail: { type: 'number' },
        since: { type: 'string' },
      },
      required: ['container'],
    },
  },
  {
    name: 'docker_exec',
    description: 'Execute command in container.',
    inputSchema: {
      type: 'object',
      properties: {
        container: { type: 'string' },
        command: { type: 'string' },
        user: { type: 'string' },
        workdir: { type: 'string' },
      },
      required: ['container', 'command'],
    },
  },
  {
    name: 'docker_build',
    description: 'Build Docker image.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        tag: { type: 'string' },
        dockerfile: { type: 'string' },
        buildArgs: { type: 'object' },
        noCache: { type: 'boolean', default: false },
      },
      required: ['path'],
    },
  },
  {
    name: 'docker_images',
    description: 'List Docker images.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string' },
        all: { type: 'boolean', default: false },
      },
    },
  },
  {
    name: 'docker_pull',
    description: 'Pull Docker image.',
    inputSchema: {
      type: 'object',
      properties: { image: { type: 'string' } },
      required: ['image'],
    },
  },
  {
    name: 'docker_inspect',
    description: 'Inspect container/image.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string' },
        format: { type: 'string' },
      },
      required: ['target'],
    },
  },
  {
    name: 'compose_up',
    description: 'Docker Compose up.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string' },
        project: { type: 'string' },
        services: { type: 'array', items: { type: 'string' } },
        detach: { type: 'boolean', default: true },
        build: { type: 'boolean', default: false },
        recreate: { type: 'boolean', default: false },
      },
    },
  },
  {
    name: 'compose_down',
    description: 'Docker Compose down.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string' },
        project: { type: 'string' },
        volumes: { type: 'boolean', default: false },
        removeOrphans: { type: 'boolean', default: false },
        timeout: { type: 'number' },
      },
    },
  },
  {
    name: 'compose_ps',
    description: 'Docker Compose ps.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string' },
        project: { type: 'string' },
        services: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'compose_logs',
    description: 'Docker Compose logs.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string' },
        project: { type: 'string' },
        services: { type: 'array', items: { type: 'string' } },
        tail: { type: 'number' },
        since: { type: 'string' },
      },
    },
  },
  {
    name: 'compose_exec',
    description: 'Docker Compose exec.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string' },
        project: { type: 'string' },
        service: { type: 'string' },
        command: { type: 'string' },
        user: { type: 'string' },
        workdir: { type: 'string' },
      },
      required: ['service', 'command'],
    },
  },
  {
    name: 'docker_networks',
    description: 'Manage Docker networks.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'create', 'remove', 'inspect'] },
        name: { type: 'string' },
        driver: { type: 'string' },
      },
      required: ['action'],
    },
  },
  {
    name: 'docker_volumes',
    description: 'Manage Docker volumes.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'create', 'remove', 'inspect', 'prune'] },
        name: { type: 'string' },
      },
      required: ['action'],
    },
  },
  {
    name: 'docker_cleanup',
    description: 'Cleanup Docker resources.',
    inputSchema: {
      type: 'object',
      properties: {
        containers: { type: 'boolean' },
        images: { type: 'boolean' },
        volumes: { type: 'boolean' },
        networks: { type: 'boolean' },
        all: { type: 'boolean' },
      },
    },
  },

  // ==========================================================================
  // PILLAR B: FILESYSTEM TOOLS (19 tools)
  // ==========================================================================
  {
    name: 'fs_read',
    description: 'Read file contents.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        encoding: { type: 'string', default: 'utf-8' },
      },
      required: ['path'],
    },
  },
  {
    name: 'fs_write',
    description: 'Write file contents.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
        encoding: { type: 'string', default: 'utf-8' },
        createDirs: { type: 'boolean', default: true },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'fs_list',
    description: 'List directory contents.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        recursive: { type: 'boolean', default: false },
        pattern: { type: 'string' },
      },
      required: ['path'],
    },
  },
  {
    name: 'fs_exists',
    description: 'Check if path exists.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'fs_mkdir',
    description: 'Create directory.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        recursive: { type: 'boolean', default: true },
      },
      required: ['path'],
    },
  },
  {
    name: 'fs_remove',
    description: 'Remove file/directory.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        recursive: { type: 'boolean', default: false },
        force: { type: 'boolean', default: false },
      },
      required: ['path'],
    },
  },
  {
    name: 'fs_copy',
    description: 'Copy file/directory.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string' },
        destination: { type: 'string' },
        recursive: { type: 'boolean', default: true },
      },
      required: ['source', 'destination'],
    },
  },
  {
    name: 'fs_move',
    description: 'Move/rename file.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string' },
        destination: { type: 'string' },
      },
      required: ['source', 'destination'],
    },
  },
  {
    name: 'fs_watch',
    description: 'Watch directory for changes.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['start', 'stop', 'events'] },
        path: { type: 'string' },
        id: { type: 'string' },
      },
      required: ['action'],
    },
  },
  {
    name: 'fs_diff',
    description: 'Compare two files.',
    inputSchema: {
      type: 'object',
      properties: {
        file1: { type: 'string' },
        file2: { type: 'string' },
        context: { type: 'number', default: 3 },
      },
      required: ['file1', 'file2'],
    },
  },
  {
    name: 'fs_search',
    description: 'Search for files.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        pattern: { type: 'string' },
        type: { type: 'string', enum: ['file', 'directory', 'all'] },
        maxDepth: { type: 'number', default: 10 },
      },
      required: ['path', 'pattern'],
    },
  },
  {
    name: 'fs_hash',
    description: 'Calculate file hash.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        algorithm: { type: 'string', enum: ['md5', 'sha1', 'sha256', 'sha512'], default: 'sha256' },
      },
      required: ['path'],
    },
  },
  {
    name: 'fs_zip',
    description: 'Create zip archive.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string' },
        destination: { type: 'string' },
        level: { type: 'number', default: 9 },
      },
      required: ['source', 'destination'],
    },
  },
  {
    name: 'fs_unzip',
    description: 'Extract zip archive.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string' },
        destination: { type: 'string' },
      },
      required: ['source', 'destination'],
    },
  },
  {
    name: 'fs_chmod',
    description: 'Change file permissions.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        mode: { oneOf: [{ type: 'string' }, { type: 'number' }] },
      },
      required: ['path', 'mode'],
    },
  },
  {
    name: 'fs_chown',
    description: 'Change file ownership.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        uid: { type: 'number' },
        gid: { type: 'number' },
      },
      required: ['path', 'uid', 'gid'],
    },
  },
  {
    name: 'fs_template',
    description: 'Generate file from template.',
    inputSchema: {
      type: 'object',
      properties: {
        template: { type: 'string' },
        variables: { type: 'object' },
        output: { type: 'string' },
      },
      required: ['template', 'variables', 'output'],
    },
  },
  {
    name: 'fs_backup',
    description: 'Create backup.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string' },
        destination: { type: 'string' },
        compress: { type: 'boolean', default: false },
      },
      required: ['source'],
    },
  },
  {
    name: 'fs_restore',
    description: 'Restore from backup.',
    inputSchema: {
      type: 'object',
      properties: {
        backup: { type: 'string' },
        destination: { type: 'string' },
        overwrite: { type: 'boolean', default: false },
      },
      required: ['backup', 'destination'],
    },
  },

  // ==========================================================================
  // PILLAR C: MCP ORCHESTRATION TOOLS (10 tools)
  // ==========================================================================
  {
    name: 'mcp_discover',
    description: 'Discover available MCPs from config files.',
    inputSchema: {
      type: 'object',
      properties: {
        searchPaths: { type: 'array', items: { type: 'string' } },
        configFile: { type: 'string' },
      },
    },
  },
  {
    name: 'mcp_register',
    description: 'Register MCP with the hub.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        command: { type: 'string' },
        args: { type: 'array', items: { type: 'string' } },
        env: { type: 'object' },
        metadata: { type: 'object' },
        autoStart: { type: 'boolean', default: true },
      },
      required: ['name', 'command'],
    },
  },
  {
    name: 'mcp_unregister',
    description: 'Unregister MCP from hub.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'mcp_list',
    description: 'List registered MCPs.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'mcp_route',
    description: 'Route request to best MCP.',
    inputSchema: {
      type: 'object',
      properties: {
        intent: { type: 'string' },
        tool: { type: 'string' },
        preferredMcp: { type: 'string' },
      },
    },
  },
  {
    name: 'mcp_aggregate',
    description: 'Execute tool across multiple MCPs.',
    inputSchema: {
      type: 'object',
      properties: {
        tool: { type: 'string' },
        args: { type: 'object' },
        mcpIds: { type: 'array', items: { type: 'string' } },
        mode: { type: 'string', enum: ['first', 'all', 'fastest'], default: 'first' },
      },
      required: ['tool', 'args'],
    },
  },
  {
    name: 'mcp_health',
    description: 'Check MCP health status.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
    },
  },
  {
    name: 'mcp_failover',
    description: 'Execute with automatic failover.',
    inputSchema: {
      type: 'object',
      properties: {
        tool: { type: 'string' },
        args: { type: 'object' },
        maxRetries: { type: 'number', default: 3 },
      },
      required: ['tool', 'args'],
    },
  },
  {
    name: 'mcp_loadbalance',
    description: 'Execute with load balancing.',
    inputSchema: {
      type: 'object',
      properties: {
        tool: { type: 'string' },
        args: { type: 'object' },
        strategy: { type: 'string', enum: ['round-robin', 'least-loaded', 'random'], default: 'round-robin' },
      },
      required: ['tool', 'args'],
    },
  },
  {
    name: 'mcp_catalog',
    description: 'Get tool catalog from all MCPs.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        search: { type: 'string' },
      },
    },
  },
];

async function main() {
  const config = loadConfig();
  const browserManager = new BrowserManager(config);

  const server = new Server(
    { name: 'barrhawk-e2e', version: VERSION },
    { capabilities: { tools: {} } }
  );

  console.error(`BarrHawk E2E v${VERSION} starting...`);
  console.error(`Total tools: ${TOOLS.length}`);

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      let result: unknown;

      switch (name) {
        // --- SQUAD MANAGEMENT ---
        case 'worker_launch':
          result = await browserManager.launchWorker(args as any);
          break;
        case 'worker_switch':
          result = browserManager.switchWorker((args as any).id);
          break;
        case 'worker_list':
          result = browserManager.listWorkers();
          break;

        // --- BROWSER CORE ---
        case 'browser_launch':
          result = await handleLaunch(browserManager, args, config);
          break;
        case 'browser_navigate':
          result = await handleNavigate(browserManager, args);
          break;
        case 'browser_click':
          result = await handleClick(browserManager, args);
          break;
        case 'browser_type':
          result = await handleType(browserManager, args);
          break;
        case 'browser_screenshot':
          result = await handleScreenshot(browserManager, args, config);
          break;
        case 'browser_get_text':
          result = await handleGetText(browserManager, args);
          break;
        case 'browser_wait':
          result = await handleWait(browserManager, args);
          break;
        case 'browser_scroll':
          result = await handleScroll(browserManager, args);
          break;
        case 'browser_press_key':
          result = await handlePressKey(browserManager, args);
          break;
        case 'browser_close':
          result = await handleClose(browserManager);
          break;
        case 'browser_get_elements':
          result = await handleGetElements(browserManager, args);
          break;

        // --- PLAYWRIGHT PARITY ---
        case 'browser_snapshot':
          result = await handleSnapshot(browserManager, args as any);
          break;
        case 'browser_evaluate':
          result = await handleEvaluate(browserManager, args as any);
          break;
        case 'browser_console_messages':
          result = await handleConsoleMessages(browserManager, args as any);
          break;
        case 'browser_network_requests':
          result = await handleNetworkRequests(browserManager, args as any);
          break;
        case 'browser_hover':
          result = await handleHover(browserManager, args as any);
          break;
        case 'browser_drag':
          result = await handleDrag(browserManager, args as any);
          break;
        case 'browser_select_option':
          result = await handleSelectOption(browserManager, args as any);
          break;
        case 'browser_file_upload':
          result = await handleFileUpload(browserManager, args as any);
          break;
        case 'browser_handle_dialog':
          result = await handleDialog(browserManager, args as any);
          break;
        case 'browser_fill_form':
          result = await handleFillForm(browserManager, args as any);
          break;
        case 'browser_navigate_back':
          result = await handleNavigateBack(browserManager, args as any);
          break;
        case 'browser_navigate_forward':
          result = await handleNavigateForward(browserManager, args as any);
          break;
        case 'browser_reload':
          result = await handleReload(browserManager, args as any);
          break;
        case 'browser_resize':
          result = await handleResize(browserManager, args as any);
          break;
        case 'browser_tabs':
          result = await handleTabs(browserManager, args as any);
          break;
        case 'browser_pdf_save':
          result = await handlePdfSave(browserManager, args as any);
          break;
        case 'browser_mouse_move':
          result = await handleMouseMove(browserManager, args as any);
          break;
        case 'browser_mouse_click':
          result = await handleMouseClickXY(browserManager, args as any);
          break;
        case 'browser_mouse_drag':
          result = await handleMouseDragXY(browserManager, args as any);
          break;
        case 'browser_mouse_wheel':
          result = await handleMouseWheel(browserManager, args as any);
          break;
        case 'browser_start_tracing':
          result = await handleStartTracing(browserManager, args as any);
          break;
        case 'browser_stop_tracing':
          result = await handleStopTracing(browserManager, args as any);
          break;

        // --- DATABASE: POSTGRESQL ---
        case 'db_pg_connect':
          result = await handlePgConnect(args as any);
          break;
        case 'db_pg_query':
          result = await handlePgQuery(args as any);
          break;
        case 'db_pg_schema':
          result = await handlePgSchema(args as any);
          break;
        case 'db_pg_seed':
          result = await handlePgSeed(args as any);
          break;
        case 'db_pg_transaction':
          result = await handlePgTransaction(args as any);
          break;
        case 'db_pg_disconnect':
          result = await handlePgDisconnect(args as any);
          break;

        // --- DATABASE: SQLITE ---
        case 'db_sqlite_open':
          result = await handleSqliteOpen(args as any);
          break;
        case 'db_sqlite_query':
          result = await handleSqliteQuery(args as any);
          break;
        case 'db_sqlite_schema':
          result = await handleSqliteSchema(args as any);
          break;
        case 'db_sqlite_close':
          result = await handleSqliteClose(args as any);
          break;

        // --- DATABASE: REDIS ---
        case 'db_redis_connect':
          result = await handleRedisConnect(args as any);
          break;
        case 'db_redis_get':
          result = await handleRedisGet(args as any);
          break;
        case 'db_redis_set':
          result = await handleRedisSet(args as any);
          break;
        case 'db_redis_del':
          result = await handleRedisDel(args as any);
          break;
        case 'db_redis_keys':
          result = await handleRedisKeys(args as any);
          break;
        case 'db_redis_flush':
          result = await handleRedisFlush(args as any);
          break;
        case 'db_redis_hash':
          result = await handleRedisHash(args as any);
          break;
        case 'db_redis_disconnect':
          result = await handleRedisDisconnect(args as any);
          break;

        // --- GITHUB ---
        case 'gh_connect':
          result = await handleGhConnect(args as any);
          break;
        case 'gh_disconnect':
          result = await handleGhDisconnect(args as any);
          break;
        case 'gh_repo_info':
          result = await handleGhRepoInfo(args as any);
          break;
        case 'gh_file_read':
          result = await handleGhFileRead(args as any);
          break;
        case 'gh_file_write':
          result = await handleGhFileWrite(args as any);
          break;
        case 'gh_branch_list':
          result = await handleGhBranchList(args as any);
          break;
        case 'gh_branch_create':
          result = await handleGhBranchCreate(args as any);
          break;
        case 'gh_pr_list':
          result = await handleGhPrList(args as any);
          break;
        case 'gh_pr_create':
          result = await handleGhPrCreate(args as any);
          break;
        case 'gh_pr_merge':
          result = await handleGhPrMerge(args as any);
          break;
        case 'gh_pr_review':
          result = await handleGhPrReview(args as any);
          break;
        case 'gh_issue_list':
          result = await handleGhIssueList(args as any);
          break;
        case 'gh_issue_create':
          result = await handleGhIssueCreate(args as any);
          break;
        case 'gh_issue_comment':
          result = await handleGhIssueComment(args as any);
          break;
        case 'gh_workflow_list':
          result = await handleGhWorkflowList(args as any);
          break;
        case 'gh_workflow_run':
          result = await handleGhWorkflowRun(args as any);
          break;
        case 'gh_workflow_runs':
          result = await handleGhWorkflowRuns(args as any);
          break;
        case 'gh_diff':
          result = await handleGhDiff(args as any);
          break;

        // --- DOCKER CORE ---
        case 'docker_ps':
          result = await handleDockerPs(args as any);
          break;
        case 'docker_run':
          result = await handleDockerRun(args as any);
          break;
        case 'docker_stop':
          result = await handleDockerStop(args as any);
          break;
        case 'docker_rm':
          result = await handleDockerRm(args as any);
          break;
        case 'docker_logs':
          result = await handleDockerLogs(args as any);
          break;
        case 'docker_exec':
          result = await handleDockerExec(args as any);
          break;
        case 'docker_build':
          result = await handleDockerBuild(args as any);
          break;
        case 'docker_images':
          result = await handleDockerImages(args as any);
          break;
        case 'docker_pull':
          result = await handleDockerPull(args as any);
          break;
        case 'docker_inspect':
          result = await handleDockerInspect(args as any);
          break;

        // --- DOCKER COMPOSE ---
        case 'compose_up':
          result = await handleComposeUp(args as any);
          break;
        case 'compose_down':
          result = await handleComposeDown(args as any);
          break;
        case 'compose_ps':
          result = await handleComposePs(args as any);
          break;
        case 'compose_logs':
          result = await handleComposeLogs(args as any);
          break;
        case 'compose_exec':
          result = await handleComposeExec(args as any);
          break;
        case 'docker_networks':
          result = await handleDockerNetworks(args as any);
          break;
        case 'docker_volumes':
          result = await handleDockerVolumes(args as any);
          break;
        case 'docker_cleanup':
          result = await handleDockerCleanup(args as any);
          break;

        // --- FILESYSTEM ---
        case 'fs_read':
          result = await handleFsReadFile(args as any);
          break;
        case 'fs_write':
          result = await handleFsWriteFile(args as any);
          break;
        case 'fs_list':
          result = await handleFsListDir(args as any);
          break;
        case 'fs_exists':
          result = await handleFsExists(args as any);
          break;
        case 'fs_mkdir':
          result = await handleFsMkdir(args as any);
          break;
        case 'fs_remove':
          result = await handleFsRemove(args as any);
          break;
        case 'fs_copy':
          result = await handleFsCopy(args as any);
          break;
        case 'fs_move':
          result = await handleFsMove(args as any);
          break;
        case 'fs_watch':
          result = await handleFsWatch(args as any);
          break;
        case 'fs_diff':
          result = await handleFsDiff(args as any);
          break;
        case 'fs_search':
          result = await handleFsSearch(args as any);
          break;
        case 'fs_hash':
          result = await handleFsHash(args as any);
          break;
        case 'fs_zip':
          result = await handleFsZip(args as any);
          break;
        case 'fs_unzip':
          result = await handleFsUnzip(args as any);
          break;
        case 'fs_chmod':
          result = await handleFsChmod(args as any);
          break;
        case 'fs_chown':
          result = await handleFsChown(args as any);
          break;
        case 'fs_template':
          result = await handleFsTemplate(args as any);
          break;
        case 'fs_backup':
          result = await handleFsBackup(args as any);
          break;
        case 'fs_restore':
          result = await handleFsRestore(args as any);
          break;

        // --- MCP ORCHESTRATION ---
        case 'mcp_discover':
          result = await handleMcpDiscover(args as any);
          break;
        case 'mcp_register':
          result = await handleMcpRegister(args as any);
          break;
        case 'mcp_unregister':
          result = await handleMcpUnregister(args as any);
          break;
        case 'mcp_list':
          result = await handleMcpList(args as any);
          break;
        case 'mcp_route':
          result = await handleMcpRoute(args as any);
          break;
        case 'mcp_aggregate':
          result = await handleMcpAggregate(args as any);
          break;
        case 'mcp_health':
          result = await handleMcpHealth(args as any);
          break;
        case 'mcp_failover':
          result = await handleMcpFailover(args as any);
          break;
        case 'mcp_loadbalance':
          result = await handleMcpLoadBalance(args as any);
          break;
        case 'mcp_catalog':
          result = await handleMcpCatalog(args as any);
          break;

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      // Return result in MCP format
      if (typeof result === 'object' && result !== null && 'image' in result) {
        const { image, ...rest } = result as { image: string; [key: string]: unknown };
        return {
          content: [
            { type: 'image', data: image, mimeType: 'image/png' },
            { type: 'text', text: JSON.stringify(rest, null, 2) },
          ],
        };
      }

      return {
        content: [
          { type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Tool ${name} error:`, message);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }],
        isError: true,
      };
    }
  });

  const shutdown = async () => {
    console.error('Shutting down BarrHawk...');
    await browserManager.closeAll();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`BarrHawk E2E v${VERSION} ready - ${TOOLS.length} tools loaded`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
