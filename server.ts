#!/usr/bin/env node
/**
 * MCP Playwright Server
 *
 * Exposes Playwright browser control as MCP tools, allowing Claude to:
 * - Launch and control a browser
 * - Take screenshots and see the page
 * - Click, type, scroll, and navigate
 * - Interact with web apps like a real user
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import OpenAI from 'openai';
import sharp from 'sharp';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// Import MCP tester module
import {
    mcpStart,
    mcpStop,
    mcpListTools,
    mcpInvoke,
    mcpValidateSchema,
    mcpStressTest,
    mcpGenerateTests,
    mcpRunTests,
    mcpListInstances,
    mcpGetInstance,
} from './mcp-tester.js';

// Import Backend tester module
import {
    backendCreateSession,
    backendListSessions,
    backendDeleteSession,
    backendRequest,
    backendAssert,
    backendLoadTest,
    backendRunTestSuite,
    backendHealthCheck,
    backendSetVariable,
    backendGetVariable,
    backendExtractVariable,
    HttpRequest,
    ApiTestCase,
} from './backend-tester.js';

// Import Video tester module
import {
    analyzeVideo,
    uploadVideoForAnalysis,
    startWesAndersonSession,
    captureWesAndersonFrame,
    generateWesAndersonFilm,
    generateTitleCard,
    listWesPalettes,
    listWesSessions,
    quickFilm,
} from './video-tester.js';

// Import Event system
import {
    BarrHawkEventEmitter,
    InMemoryEventTransport,
    detectTestOrigin,
    type TestOrigin,
} from './packages/events/index.js';

// Import Self-Healing system
import {
    getSelfHealingManager,
    healSelector,
    captureElement,
    type SelfHealConfig,
    type HealingResult,
    type HealingStats,
} from './packages/self-heal/index.js';

// Import Observability system
import {
    getObservabilityStore,
    type TestRunRecord,
    type RunSummary,
} from './packages/observability/index.js';

// Import Golden Girl system
import {
    runGoldenTests,
    formatRunResults,
    compare,
    formatCompareResult,
    addGoldenCase,
    formatAddResult,
    listGolden,
    formatListResult,
    generateReport,
    startFixtureServer,
    type RunOptions,
    type CompareOptions,
    type AddOptions,
    type ListOptions,
    type GoldenExpected,
    type MatchMode,
} from './packages/golden/src/index.js';

// Import AI Tools
import {
    smartAssert,
    analyzeFailure,
    formatAnalysisResult,
    accessibilityAudit,
    formatAuditResult,
    testFromDescription,
    formatTestAsCode,
    formatTestAsMCPCalls,
    generateTestsFromUrl,
    generateTestsFromFlow,
    formatTestSuite,
    explainTest,
    formatTestExplanation,
    suggestFix,
    formatFixSuggestions,
    compareRuns,
    formatCompareResults,
    generateAccessibilityFix,
    formatAccessibilityFix,
    generateAccessibilityReport,
    getReportFilename,
    type SmartAssertOptions,
    type FailureContext,
    type A11yAuditOptions,
    type A11yAuditResult,
    type A11yIssue,
    type TestFromDescriptionOptions,
    type GenerateTestsOptions,
    type GenerateFromFlowOptions,
    type GeneratedTest,
    type TestExplainOptions,
    type SuggestFixOptions,
    type CompareRunsOptions,
    type TestRunData,
    type AccessibilityFixOptions,
    type AccessibilityReportOptions,
} from './packages/ai-tools/src/index.js';

// Import Free Tier Tools
import {
    freeToolDefinitions,
    handleFreeToolCall,
    freeToolNames,
} from './free-tier-tools.js';

// Import test recorder for capturing browser actions
import {
    recordAction,
    getRecordingStatus,
} from './packages/free-tools/src/test-recorder.js';

// Import System Tools (OS-level automation for extension testing)
import {
    systemToolDefinitions,
    handleSystemToolCall,
} from './system-tools.js';

// Import Scribe Protocol Tools
import {
    scribeToolDefinitions,
    handleScribeToolCall,
} from './scribe-tools.js';

// Import Filesystem Tools (The Hands)
import {
    filesystemToolDefinitions,
    handleFilesystemToolCall,
} from './filesystem-tools.js';

// Global event emitter instance
let eventEmitter: BarrHawkEventEmitter | null = null;
let eventTransport: InMemoryEventTransport | null = null;
let currentRunId: string | null = null;
let stepCounter = 0;
let observabilityInitialized = false;

// Initialize event emitter with observability bridge
async function initializeEventSystem(): Promise<BarrHawkEventEmitter> {
    if (!eventEmitter) {
        // Use in-memory transport for local testing
        eventTransport = new InMemoryEventTransport();
        eventEmitter = new BarrHawkEventEmitter(eventTransport);

        // Detect origin from MCP client info (if available)
        const origin = detectTestOrigin({
            clientInfo: { name: 'mcp-client', version: '1.0.0' },
        });
        eventEmitter.setSource({
            type: 'mcp',
            origin: origin.origin,
            clientInfo: { name: 'barrhawk-e2e', version: '1.0.0' },
        });

        // Bridge events to observability store for persistence
        if (!observabilityInitialized) {
            observabilityInitialized = true;
            const store = await getObservabilityStore();
            await store.initialize();

            // Subscribe to ALL events and forward to observability store
            eventTransport.subscribe('events:*:*', async (event) => {
                try {
                    await store.processEvent(event);
                } catch (err) {
                    console.error('[Observability] Failed to persist event:', err);
                }
            });

            console.log('[BarrHawk] Event system initialized with observability bridge');
        }
    }
    return eventEmitter;
}

// Synchronous getter for when we know emitter is already initialized
function getEventEmitter(): BarrHawkEventEmitter {
    if (!eventEmitter) {
        // Fallback: create without observability (shouldn't happen in normal flow)
        eventTransport = new InMemoryEventTransport();
        eventEmitter = new BarrHawkEventEmitter(eventTransport);
        const origin = detectTestOrigin({
            clientInfo: { name: 'mcp-client', version: '1.0.0' },
        });
        eventEmitter.setSource({
            type: 'mcp',
            origin: origin.origin,
            clientInfo: { name: 'barrhawk-e2e', version: '1.0.0' },
        });
    }
    return eventEmitter;
}

// Generate a unique run ID
function generateRunId(): string {
    return `run_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// Lazy-load OpenAI client (only when audio tools are used)
let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
    if (!openai) {
        openai = new OpenAI();
    }
    return openai;
}

// Audio output directory
const AUDIO_DIR = path.join(process.cwd(), 'test-audio');

// Global browser state
let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

// Helper to record browser actions if recording is active
function tryRecordAction(action: Parameters<typeof recordAction>[0]): void {
    const status = getRecordingStatus();
    if (status.isRecording) {
        try {
            recordAction(action);
        } catch {
            // Silently ignore if recording fails
        }
    }
}

// Tool definitions
const tools: Tool[] = [
    {
        name: 'browser_launch',
        description:
            'Launch a new browser session. Call this first before using other browser tools. Returns success status.',
        inputSchema: {
            type: 'object',
            properties: {
                headless: {
                    type: 'boolean',
                    description: 'Run browser in headless mode (default: false for visibility)',
                    default: false,
                },
                url: {
                    type: 'string',
                    description: 'Optional URL to navigate to after launch',
                },
                extensionPath: {
                    type: 'string',
                    description: 'Optional path to a Chrome extension to load',
                },
            },
        },
    },
    {
        name: 'browser_screenshot',
        description:
            'Take a screenshot of the current page. Returns base64 encoded PNG image that Claude can see and analyze. Can save full-resolution to disk while returning a resized version to avoid token waste.',
        inputSchema: {
            type: 'object',
            properties: {
                fullPage: {
                    type: 'boolean',
                    description: 'Capture full scrollable page (default: false, viewport only)',
                    default: false,
                },
                selector: {
                    type: 'string',
                    description: 'Optional CSS selector to screenshot specific element',
                },
                savePath: {
                    type: 'string',
                    description: 'Directory to save full-resolution screenshot (e.g., "/home/user/screenshots"). If provided, saves original and returns resized version.',
                },
                maxDimension: {
                    type: 'number',
                    description: 'Max dimension (width or height) for the AI-returned image in pixels (default: 1500). Only applies when savePath is set.',
                    default: 1500,
                },
                filename: {
                    type: 'string',
                    description: 'Optional custom filename (without extension). Defaults to timestamp-based name.',
                },
            },
        },
    },
    {
        name: 'browser_navigate',
        description: 'Navigate to a URL. Returns the final URL after any redirects.',
        inputSchema: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'The URL to navigate to',
                },
            },
            required: ['url'],
        },
    },
    {
        name: 'browser_click',
        description:
            'Click on an element. Can use CSS selector, text content, or coordinates.',
        inputSchema: {
            type: 'object',
            properties: {
                selector: {
                    type: 'string',
                    description: 'CSS selector of element to click (e.g., "button.submit", "#login")',
                },
                text: {
                    type: 'string',
                    description: 'Click element containing this text (alternative to selector)',
                },
                x: {
                    type: 'number',
                    description: 'X coordinate for click (use with y for coordinate-based click)',
                },
                y: {
                    type: 'number',
                    description: 'Y coordinate for click (use with x for coordinate-based click)',
                },
                button: {
                    type: 'string',
                    enum: ['left', 'right', 'middle'],
                    description: 'Mouse button to use (default: left)',
                    default: 'left',
                },
                self_heal: {
                    type: 'boolean',
                    description: 'Enable self-healing if selector fails (default: true)',
                    default: true,
                },
            },
        },
    },
    {
        name: 'browser_type',
        description:
            'Type text into an input field. First focuses the element, then types.',
        inputSchema: {
            type: 'object',
            properties: {
                selector: {
                    type: 'string',
                    description: 'CSS selector of input element',
                },
                text: {
                    type: 'string',
                    description: 'Text to type',
                },
                clear: {
                    type: 'boolean',
                    description: 'Clear existing text before typing (default: true)',
                    default: true,
                },
                pressEnter: {
                    type: 'boolean',
                    description: 'Press Enter after typing (default: false)',
                    default: false,
                },
                self_heal: {
                    type: 'boolean',
                    description: 'Enable self-healing if selector fails (default: true)',
                    default: true,
                },
            },
            required: ['selector', 'text'],
        },
    },
    {
        name: 'browser_scroll',
        description: 'Scroll the page or a specific element.',
        inputSchema: {
            type: 'object',
            properties: {
                direction: {
                    type: 'string',
                    enum: ['up', 'down', 'left', 'right'],
                    description: 'Direction to scroll',
                },
                amount: {
                    type: 'number',
                    description: 'Pixels to scroll (default: 500)',
                    default: 500,
                },
                selector: {
                    type: 'string',
                    description: 'Optional CSS selector of scrollable element',
                },
            },
            required: ['direction'],
        },
    },
    {
        name: 'browser_get_text',
        description:
            'Get text content from the page or a specific element. Useful for reading what is displayed.',
        inputSchema: {
            type: 'object',
            properties: {
                selector: {
                    type: 'string',
                    description:
                        'CSS selector to get text from (default: body for full page text)',
                },
            },
        },
    },
    {
        name: 'browser_get_elements',
        description:
            'Get a list of elements matching a selector with their text and attributes. Useful for finding interactive elements.',
        inputSchema: {
            type: 'object',
            properties: {
                selector: {
                    type: 'string',
                    description: 'CSS selector to find elements',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of elements to return (default: 20)',
                    default: 20,
                },
            },
            required: ['selector'],
        },
    },
    {
        name: 'browser_wait',
        description:
            'Wait for a condition: element to appear, disappear, or specific timeout.',
        inputSchema: {
            type: 'object',
            properties: {
                selector: {
                    type: 'string',
                    description: 'CSS selector to wait for',
                },
                state: {
                    type: 'string',
                    enum: ['visible', 'hidden', 'attached', 'detached'],
                    description: 'State to wait for (default: visible)',
                    default: 'visible',
                },
                timeout: {
                    type: 'number',
                    description: 'Maximum time to wait in ms (default: 30000)',
                    default: 30000,
                },
            },
        },
    },
    {
        name: 'browser_press_key',
        description: 'Press a keyboard key or key combination.',
        inputSchema: {
            type: 'object',
            properties: {
                key: {
                    type: 'string',
                    description:
                        'Key to press (e.g., "Enter", "Tab", "Escape", "ArrowDown", "Control+a")',
                },
            },
            required: ['key'],
        },
    },
    {
        name: 'browser_close',
        description: 'Close the browser session and clean up.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    // Audio testing tools
    {
        name: 'audio_generate_speech',
        description:
            'Generate speech audio from text using OpenAI TTS. Creates an audio file that can be played to test the voice AI.',
        inputSchema: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'Text to convert to speech',
                },
                voice: {
                    type: 'string',
                    enum: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
                    description: 'Voice to use (default: alloy)',
                    default: 'alloy',
                },
                speed: {
                    type: 'number',
                    description: 'Speech speed 0.25-4.0 (default: 1.0)',
                    default: 1.0,
                },
                filename: {
                    type: 'string',
                    description: 'Output filename without extension (default: auto-generated)',
                },
            },
            required: ['text'],
        },
    },
    {
        name: 'audio_degrade_quality',
        description:
            'Degrade audio quality to simulate poor conditions like bad microphone, background noise, or low bandwidth. Uses ffmpeg.',
        inputSchema: {
            type: 'object',
            properties: {
                inputFile: {
                    type: 'string',
                    description: 'Path to input audio file',
                },
                degradationType: {
                    type: 'string',
                    enum: ['lowpass', 'noise', 'bitcrush', 'telephone', 'muffled', 'choppy'],
                    description:
                        'Type of degradation: lowpass (low quality), noise (background noise), bitcrush (digital artifacts), telephone (phone quality), muffled (like speaking through fabric), choppy (packet loss simulation)',
                },
                intensity: {
                    type: 'string',
                    enum: ['light', 'medium', 'heavy'],
                    description: 'How much degradation to apply (default: medium)',
                    default: 'medium',
                },
                outputFilename: {
                    type: 'string',
                    description: 'Output filename without extension (default: auto-generated)',
                },
            },
            required: ['inputFile', 'degradationType'],
        },
    },
    {
        name: 'audio_play_in_browser',
        description:
            'Play an audio file in the browser. Useful for testing how the voice AI responds to audio input.',
        inputSchema: {
            type: 'object',
            properties: {
                audioFile: {
                    type: 'string',
                    description: 'Path to audio file to play',
                },
                waitForEnd: {
                    type: 'boolean',
                    description: 'Wait for audio to finish playing (default: true)',
                    default: true,
                },
            },
            required: ['audioFile'],
        },
    },
    {
        name: 'audio_list_files',
        description: 'List all generated audio files in the test-audio directory.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    // MCP Testing tools
    {
        name: 'mcp_start',
        description:
            'Start an MCP server process for testing. Returns an ID to reference the instance in subsequent calls.',
        inputSchema: {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description: 'Command to run (e.g., "npx", "node", "python")',
                },
                args: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Arguments to pass to the command (e.g., ["tsx", "server.ts"])',
                },
                cwd: {
                    type: 'string',
                    description: 'Working directory for the process',
                },
                env: {
                    type: 'object',
                    description: 'Additional environment variables to set',
                },
                timeout: {
                    type: 'number',
                    description: 'Startup timeout in milliseconds (default: 10000)',
                    default: 10000,
                },
            },
            required: ['command'],
        },
    },
    {
        name: 'mcp_stop',
        description: 'Stop a running MCP server instance.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'The MCP instance ID returned by mcp_start',
                },
            },
            required: ['id'],
        },
    },
    {
        name: 'mcp_list_tools',
        description: 'List all tools registered by an MCP server.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'The MCP instance ID',
                },
            },
            required: ['id'],
        },
    },
    {
        name: 'mcp_invoke',
        description: 'Invoke a tool on an MCP server and get the result.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'The MCP instance ID',
                },
                tool: {
                    type: 'string',
                    description: 'Name of the tool to invoke',
                },
                args: {
                    type: 'object',
                    description: 'Arguments to pass to the tool',
                },
            },
            required: ['id', 'tool'],
        },
    },
    {
        name: 'mcp_validate_schema',
        description: 'Validate tool schemas against the MCP specification. Returns validation errors if any.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'The MCP instance ID (will fetch and validate its tools)',
                },
            },
            required: ['id'],
        },
    },
    {
        name: 'mcp_stress_test',
        description: 'Run a stress test by invoking a tool multiple times. Tests stability and performance.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'The MCP instance ID',
                },
                tool: {
                    type: 'string',
                    description: 'Name of the tool to stress test',
                },
                args: {
                    type: 'object',
                    description: 'Arguments to pass to the tool',
                },
                iterations: {
                    type: 'number',
                    description: 'Number of times to invoke the tool (default: 10)',
                    default: 10,
                },
                concurrency: {
                    type: 'number',
                    description: 'Number of concurrent requests (default: 1)',
                    default: 1,
                },
                delayMs: {
                    type: 'number',
                    description: 'Delay between batches in milliseconds (default: 0)',
                    default: 0,
                },
            },
            required: ['id', 'tool'],
        },
    },
    {
        name: 'mcp_generate_tests',
        description: 'Auto-generate a test suite for an MCP server based on its tool definitions.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'The MCP instance ID',
                },
                format: {
                    type: 'string',
                    enum: ['json', 'yaml', 'typescript'],
                    description: 'Output format for the test suite (default: yaml)',
                    default: 'yaml',
                },
                includeEdgeCases: {
                    type: 'boolean',
                    description: 'Include edge case tests like empty input, invalid types (default: true)',
                    default: true,
                },
            },
            required: ['id'],
        },
    },
    {
        name: 'mcp_run_tests',
        description: 'Run a full test suite against an MCP server, testing all tools with sample inputs.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'The MCP instance ID',
                },
            },
            required: ['id'],
        },
    },
    {
        name: 'mcp_list_instances',
        description: 'List all running MCP server instances with their status and uptime.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'mcp_get_instance',
        description: 'Get detailed information about an MCP instance including recent stdout/stderr.',
        inputSchema: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'The MCP instance ID',
                },
            },
            required: ['id'],
        },
    },
    // Backend Testing tools
    {
        name: 'backend_create_session',
        description:
            'Create a new backend testing session. Sessions persist headers, cookies, and auth across requests.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Name for this session (e.g., "production-api", "staging")',
                },
                baseUrl: {
                    type: 'string',
                    description: 'Base URL for all requests (e.g., "https://api.example.com")',
                },
                defaultHeaders: {
                    type: 'object',
                    description: 'Headers to include in all requests',
                },
                authType: {
                    type: 'string',
                    enum: ['none', 'basic', 'bearer', 'api-key'],
                    description: 'Authentication type',
                },
                authUsername: {
                    type: 'string',
                    description: 'Username for basic auth',
                },
                authPassword: {
                    type: 'string',
                    description: 'Password for basic auth',
                },
                authToken: {
                    type: 'string',
                    description: 'Token for bearer auth',
                },
                authApiKey: {
                    type: 'string',
                    description: 'API key value',
                },
                authApiKeyHeader: {
                    type: 'string',
                    description: 'Header name for API key (default: X-API-Key)',
                },
            },
            required: ['name'],
        },
    },
    {
        name: 'backend_list_sessions',
        description: 'List all active backend testing sessions.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'backend_delete_session',
        description: 'Delete a backend testing session.',
        inputSchema: {
            type: 'object',
            properties: {
                sessionId: {
                    type: 'string',
                    description: 'The session ID to delete',
                },
            },
            required: ['sessionId'],
        },
    },
    {
        name: 'backend_request',
        description:
            'Execute an HTTP request. Can use a session for persistent headers/auth, or make standalone requests.',
        inputSchema: {
            type: 'object',
            properties: {
                sessionId: {
                    type: 'string',
                    description: 'Optional session ID to use for this request',
                },
                method: {
                    type: 'string',
                    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
                    description: 'HTTP method',
                },
                url: {
                    type: 'string',
                    description: 'URL to request (can be relative if session has baseUrl)',
                },
                headers: {
                    type: 'object',
                    description: 'Additional headers for this request',
                },
                body: {
                    type: 'object',
                    description: 'Request body (will be JSON-encoded)',
                },
                timeout: {
                    type: 'number',
                    description: 'Request timeout in milliseconds (default: 30000)',
                },
                followRedirects: {
                    type: 'boolean',
                    description: 'Follow redirects (default: true)',
                },
            },
            required: ['method', 'url'],
        },
    },
    {
        name: 'backend_health_check',
        description: 'Check if an endpoint is healthy. Supports retries and custom expected status.',
        inputSchema: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'URL to check',
                },
                expectedStatus: {
                    type: 'number',
                    description: 'Expected HTTP status code (default: 200)',
                },
                timeout: {
                    type: 'number',
                    description: 'Request timeout in milliseconds (default: 5000)',
                },
                retries: {
                    type: 'number',
                    description: 'Number of retry attempts (default: 0)',
                },
                retryDelay: {
                    type: 'number',
                    description: 'Delay between retries in milliseconds (default: 1000)',
                },
            },
            required: ['url'],
        },
    },
    {
        name: 'backend_load_test',
        description:
            'Run a load test against an endpoint. Sends multiple concurrent requests and reports performance metrics.',
        inputSchema: {
            type: 'object',
            properties: {
                sessionId: {
                    type: 'string',
                    description: 'Optional session ID for auth/headers',
                },
                method: {
                    type: 'string',
                    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                    description: 'HTTP method',
                },
                url: {
                    type: 'string',
                    description: 'URL to test',
                },
                body: {
                    type: 'object',
                    description: 'Request body',
                },
                totalRequests: {
                    type: 'number',
                    description: 'Total number of requests to send (default: 100)',
                },
                concurrency: {
                    type: 'number',
                    description: 'Number of concurrent requests (default: 10)',
                },
                rampUpSeconds: {
                    type: 'number',
                    description: 'Time to ramp up to full concurrency (default: 0)',
                },
                thinkTimeMs: {
                    type: 'number',
                    description: 'Delay between request batches (default: 0)',
                },
            },
            required: ['method', 'url'],
        },
    },
    {
        name: 'backend_run_tests',
        description: 'Run a suite of API tests with assertions. Each test can validate status, headers, body, and timing.',
        inputSchema: {
            type: 'object',
            properties: {
                sessionId: {
                    type: 'string',
                    description: 'Optional session ID',
                },
                tests: {
                    type: 'array',
                    description: 'Array of test cases',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', description: 'Test name' },
                            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
                            url: { type: 'string' },
                            body: { type: 'object' },
                            assertions: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        type: { type: 'string', enum: ['status', 'header', 'body', 'jsonPath', 'duration'] },
                                        path: { type: 'string', description: 'JSON path or header name' },
                                        operator: { type: 'string', enum: ['equals', 'contains', 'matches', 'exists', 'lessThan', 'greaterThan'] },
                                        expected: { description: 'Expected value' },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            required: ['tests'],
        },
    },
    {
        name: 'backend_set_variable',
        description: 'Set a variable in a session for use in subsequent requests.',
        inputSchema: {
            type: 'object',
            properties: {
                sessionId: {
                    type: 'string',
                    description: 'The session ID',
                },
                name: {
                    type: 'string',
                    description: 'Variable name',
                },
                value: {
                    type: 'string',
                    description: 'Variable value (will be JSON parsed if object/array)',
                },
            },
            required: ['sessionId', 'name', 'value'],
        },
    },
    {
        name: 'backend_get_variable',
        description: 'Get a variable from a session.',
        inputSchema: {
            type: 'object',
            properties: {
                sessionId: {
                    type: 'string',
                    description: 'The session ID',
                },
                name: {
                    type: 'string',
                    description: 'Variable name',
                },
            },
            required: ['sessionId', 'name'],
        },
    },
    // Video Testing & Wes Anderson Mode tools
    {
        name: 'video_analyze',
        description:
            'Analyze a video recording of a software test using Gemini AI. Compares against a test protocol and identifies issues.',
        inputSchema: {
            type: 'object',
            properties: {
                videoPath: {
                    type: 'string',
                    description: 'Path to video file (mp4, webm, mov)',
                },
                videoUrl: {
                    type: 'string',
                    description: 'URL to video (alternative to videoPath)',
                },
                testProtocol: {
                    type: 'string',
                    description: 'The test protocol/steps to validate against',
                },
                analysisType: {
                    type: 'string',
                    enum: ['full', 'summary', 'issues_only'],
                    description: 'Type of analysis (default: full)',
                },
            },
            required: ['testProtocol'],
        },
    },
    {
        name: 'video_upload',
        description: 'Upload a video to Gemini for analysis. Returns a file URI for use with video_analyze.',
        inputSchema: {
            type: 'object',
            properties: {
                videoPath: {
                    type: 'string',
                    description: 'Path to video file to upload',
                },
                displayName: {
                    type: 'string',
                    description: 'Display name for the uploaded file',
                },
            },
            required: ['videoPath'],
        },
    },
    {
        name: 'video_wes_start',
        description:
            'Start a Wes Anderson filming session. Captures E2E test screenshots and creates a cinematic film for client demos.',
        inputSchema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    description: 'Title of the film',
                },
                palette: {
                    type: 'string',
                    enum: ['grandBudapest', 'moonriseKingdom', 'royalTenenbaums', 'lifeAquatic', 'fantasticMrFox'],
                    description: 'Wes Anderson color palette to use (default: grandBudapest)',
                },
            },
            required: ['title'],
        },
    },
    {
        name: 'video_wes_capture',
        description: 'Capture a frame for the Wes Anderson film. Use browser_screenshot first, then pass the base64 data here.',
        inputSchema: {
            type: 'object',
            properties: {
                sessionId: {
                    type: 'string',
                    description: 'The Wes Anderson session ID',
                },
                screenshotBase64: {
                    type: 'string',
                    description: 'Base64 encoded screenshot image',
                },
                title: {
                    type: 'string',
                    description: 'Optional title card text for this frame',
                },
                subtitle: {
                    type: 'string',
                    description: 'Optional subtitle for this frame',
                },
            },
            required: ['sessionId', 'screenshotBase64'],
        },
    },
    {
        name: 'video_wes_generate',
        description: 'Generate the final Wes Anderson film from captured frames.',
        inputSchema: {
            type: 'object',
            properties: {
                sessionId: {
                    type: 'string',
                    description: 'The Wes Anderson session ID',
                },
                fps: {
                    type: 'number',
                    description: 'Frames per second (default: 2 for deliberate pacing)',
                },
                addTitles: {
                    type: 'boolean',
                    description: 'Add title overlays to frames (default: true)',
                },
                outputName: {
                    type: 'string',
                    description: 'Output filename (without extension)',
                },
            },
            required: ['sessionId'],
        },
    },
    {
        name: 'video_wes_title_card',
        description: 'Generate a standalone Wes Anderson style title card image.',
        inputSchema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    description: 'Main title text',
                },
                subtitle: {
                    type: 'string',
                    description: 'Subtitle text',
                },
                palette: {
                    type: 'string',
                    enum: ['grandBudapest', 'moonriseKingdom', 'royalTenenbaums', 'lifeAquatic', 'fantasticMrFox'],
                    description: 'Color palette to use',
                },
                outputPath: {
                    type: 'string',
                    description: 'Custom output path for the image',
                },
            },
            required: ['title'],
        },
    },
    {
        name: 'video_wes_palettes',
        description: 'List all available Wes Anderson color palettes.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'video_wes_sessions',
        description: 'List all active Wes Anderson filming sessions.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'video_quick_film',
        description: 'Quick film generation from an array of screenshot file paths. Creates a Wes Anderson style film in one call.',
        inputSchema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    description: 'Title of the film',
                },
                screenshots: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of screenshot file paths',
                },
                palette: {
                    type: 'string',
                    enum: ['grandBudapest', 'moonriseKingdom', 'royalTenenbaums', 'lifeAquatic', 'fantasticMrFox'],
                    description: 'Color palette to use',
                },
                fps: {
                    type: 'number',
                    description: 'Frames per second',
                },
            },
            required: ['title', 'screenshots'],
        },
    },
    // ─────────────────────────────────────────────────────────────────────────────
    // Self-Healing Tools
    // ─────────────────────────────────────────────────────────────────────────────
    {
        name: 'self_heal_enable',
        description: 'Enable or disable self-healing selectors globally. When enabled, failed selectors will attempt auto-recovery.',
        inputSchema: {
            type: 'object',
            properties: {
                enabled: {
                    type: 'boolean',
                    description: 'Enable (true) or disable (false) self-healing',
                },
            },
            required: ['enabled'],
        },
    },
    {
        name: 'self_heal_config',
        description: 'Configure self-healing behavior including strategies, thresholds, and persistence.',
        inputSchema: {
            type: 'object',
            properties: {
                strategies: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['id', 'data-testid', 'aria-label', 'text', 'css-path'],
                    },
                    description: 'Strategies to try in order (default: all)',
                },
                minConfidence: {
                    type: 'number',
                    description: 'Minimum confidence score to accept (0-1, default: 0.7)',
                },
                timeoutMs: {
                    type: 'number',
                    description: 'Maximum time to spend healing in ms (default: 5000)',
                },
                persistHealings: {
                    type: 'boolean',
                    description: 'Save successful healings for reuse (default: true)',
                },
            },
        },
    },
    {
        name: 'self_heal_report',
        description: 'Get self-healing statistics including success rates, strategies used, and recent healings.',
        inputSchema: {
            type: 'object',
            properties: {
                format: {
                    type: 'string',
                    enum: ['summary', 'detailed', 'json'],
                    description: 'Output format (default: summary)',
                    default: 'summary',
                },
            },
        },
    },
    // ─────────────────────────────────────────────────────────────────────────────
    // Dashboard & Observability Tools
    // ─────────────────────────────────────────────────────────────────────────────
    {
        name: 'dashboard_url',
        description: 'Get the URL for the local observability dashboard.',
        inputSchema: {
            type: 'object',
            properties: {
                port: {
                    type: 'number',
                    description: 'Dashboard port (default: 3333)',
                    default: 3333,
                },
            },
        },
    },
    {
        name: 'dashboard_open',
        description: 'Open the local observability dashboard in the default browser.',
        inputSchema: {
            type: 'object',
            properties: {
                port: {
                    type: 'number',
                    description: 'Dashboard port (default: 3333)',
                    default: 3333,
                },
                runId: {
                    type: 'string',
                    description: 'Optional run ID to open directly',
                },
            },
        },
    },
    {
        name: 'obs_runs',
        description: 'List recent test runs with their status and summary.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Maximum runs to return (default: 20)',
                    default: 20,
                },
                status: {
                    type: 'string',
                    enum: ['running', 'passed', 'failed', 'cancelled'],
                    description: 'Filter by status',
                },
                since: {
                    type: 'string',
                    description: 'Filter runs since date (ISO format)',
                },
            },
        },
    },
    {
        name: 'obs_run_details',
        description: 'Get detailed information about a specific test run including logs, screenshots, and network requests.',
        inputSchema: {
            type: 'object',
            properties: {
                runId: {
                    type: 'string',
                    description: 'The run ID to get details for',
                },
                include: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['logs', 'screenshots', 'network', 'summary'],
                    },
                    description: 'What to include (default: all)',
                },
                logLimit: {
                    type: 'number',
                    description: 'Max logs to return (default: 100)',
                    default: 100,
                },
            },
            required: ['runId'],
        },
    },
    {
        name: 'obs_live_url',
        description: 'Get the WebSocket URL for live test observation.',
        inputSchema: {
            type: 'object',
            properties: {
                port: {
                    type: 'number',
                    description: 'Live view port (default: 3334)',
                    default: 3334,
                },
            },
        },
    },
    {
        name: 'obs_export',
        description: 'Export test run data in JSON or CSV format.',
        inputSchema: {
            type: 'object',
            properties: {
                runId: {
                    type: 'string',
                    description: 'Run ID to export (or "all" for all runs)',
                },
                format: {
                    type: 'string',
                    enum: ['json', 'csv'],
                    description: 'Export format (default: json)',
                    default: 'json',
                },
                include: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['runs', 'logs', 'screenshots', 'network'],
                    },
                    description: 'What to include (default: runs)',
                },
                outputPath: {
                    type: 'string',
                    description: 'Output file path (default: auto-generated)',
                },
            },
            required: ['runId'],
        },
    },
    {
        name: 'obs_flaky',
        description: 'Analyze test runs for flaky patterns - tests that sometimes pass and sometimes fail.',
        inputSchema: {
            type: 'object',
            properties: {
                days: {
                    type: 'number',
                    description: 'Analyze runs from the last N days (default: 7)',
                    default: 7,
                },
                minRuns: {
                    type: 'number',
                    description: 'Minimum runs to consider for analysis (default: 3)',
                    default: 3,
                },
            },
        },
    },
    {
        name: 'obs_trends',
        description: 'Get test health trends over time - pass rates, failure patterns, and performance.',
        inputSchema: {
            type: 'object',
            properties: {
                days: {
                    type: 'number',
                    description: 'Analyze trends for the last N days (default: 30)',
                    default: 30,
                },
                groupBy: {
                    type: 'string',
                    enum: ['day', 'week', 'origin'],
                    description: 'Group results by time period or origin (default: day)',
                    default: 'day',
                },
            },
        },
    },
    // =========================================================================
    // GOLDEN GIRL TOOLS - AI/ML Quality Validation
    // =========================================================================
    {
        name: 'golden_run',
        description: 'Run golden test cases against AI tools to validate output quality. Golden tests compare AI outputs against known-correct expected outputs.',
        inputSchema: {
            type: 'object',
            properties: {
                suite: {
                    type: 'string',
                    enum: ['all', 'nl-authoring', 'ai-generation', 'rca', 'healing', 'a11y'],
                    description: 'Which golden test suite to run',
                    default: 'all',
                },
                tool: {
                    type: 'string',
                    description: 'Specific tool to test (optional)',
                },
                threshold: {
                    type: 'number',
                    description: 'Minimum score to pass (0-1, default: 0.8)',
                    default: 0.8,
                },
                verbose: {
                    type: 'boolean',
                    description: 'Show detailed comparison for each case',
                    default: false,
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Filter by tags',
                },
            },
        },
    },
    {
        name: 'golden_compare',
        description: 'Compare an actual output against a golden expected output. Use for ad-hoc validation.',
        inputSchema: {
            type: 'object',
            properties: {
                actual: {
                    type: 'object',
                    description: 'Actual output from AI tool',
                },
                expected: {
                    type: 'object',
                    description: 'Expected golden output (mustContain, mustNotContain, steps, or assertions)',
                },
                matchMode: {
                    type: 'string',
                    enum: ['exact', 'semantic', 'contains', 'structure'],
                    description: 'How to compare (default: semantic)',
                    default: 'semantic',
                },
                threshold: {
                    type: 'number',
                    description: 'Minimum score to pass (0-1)',
                    default: 0.8,
                },
            },
            required: ['actual', 'expected'],
        },
    },
    {
        name: 'golden_add',
        description: 'Add a new golden test case to a suite.',
        inputSchema: {
            type: 'object',
            properties: {
                suite: {
                    type: 'string',
                    enum: ['nl-authoring', 'ai-generation', 'rca', 'healing', 'a11y'],
                    description: 'Suite to add to',
                },
                name: {
                    type: 'string',
                    description: 'Test case name',
                },
                description: {
                    type: 'string',
                    description: 'Test case description',
                },
                input: {
                    type: 'object',
                    description: 'Input to the AI tool',
                    properties: {
                        tool: { type: 'string' },
                        args: { type: 'object' },
                    },
                    required: ['tool', 'args'],
                },
                expected: {
                    type: 'object',
                    description: 'Expected output',
                },
                matchMode: {
                    type: 'string',
                    enum: ['exact', 'semantic', 'contains', 'structure'],
                    default: 'semantic',
                },
                threshold: {
                    type: 'number',
                    default: 0.8,
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                },
            },
            required: ['suite', 'name', 'input', 'expected'],
        },
    },
    {
        name: 'golden_list',
        description: 'List available golden test suites and cases.',
        inputSchema: {
            type: 'object',
            properties: {
                suite: {
                    type: 'string',
                    description: 'Filter by suite (optional)',
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Filter by tags',
                },
            },
        },
    },
    {
        name: 'golden_report',
        description: 'Generate a quality report from golden test results.',
        inputSchema: {
            type: 'object',
            properties: {
                runId: {
                    type: 'string',
                    description: 'Golden run ID to report on',
                },
                format: {
                    type: 'string',
                    enum: ['summary', 'detailed', 'html', 'json'],
                    description: 'Report format',
                    default: 'summary',
                },
            },
            required: ['runId'],
        },
    },
    {
        name: 'golden_fixtures',
        description: 'Start the Golden Girl fixtures server for controlled testing.',
        inputSchema: {
            type: 'object',
            properties: {
                port: {
                    type: 'number',
                    description: 'Port to run fixtures server on',
                    default: 4444,
                },
            },
        },
    },
    // =========================================================================
    // AI TOOLS - Phase 2 AI-Powered Testing
    // =========================================================================
    {
        name: 'smart_assert',
        description: 'AI-powered assertion using natural language. Evaluates if actual values match expected descriptions.',
        inputSchema: {
            type: 'object',
            properties: {
                actual: {
                    description: 'The actual value to check (any type)',
                },
                expected: {
                    type: 'string',
                    description: 'Natural language description of what is expected (e.g., "should contain error message", "should be a non-empty array")',
                },
                context: {
                    type: 'string',
                    description: 'Additional context for the assertion (optional)',
                },
                strict: {
                    type: 'boolean',
                    description: 'Require high confidence match (95% vs 70%)',
                    default: false,
                },
            },
            required: ['actual', 'expected'],
        },
    },
    {
        name: 'analyze_failure',
        description: 'AI root cause analysis for test failures. Analyzes error context and suggests fixes.',
        inputSchema: {
            type: 'object',
            properties: {
                error: {
                    type: 'string',
                    description: 'The error message',
                },
                selector: {
                    type: 'string',
                    description: 'The selector that failed (if applicable)',
                },
                action: {
                    type: 'string',
                    description: 'The action being performed when failure occurred',
                },
                expectedBehavior: {
                    type: 'string',
                    description: 'What was expected to happen',
                },
                actualBehavior: {
                    type: 'string',
                    description: 'What actually happened',
                },
                htmlSnapshot: {
                    type: 'string',
                    description: 'HTML content around the failure point',
                },
                networkErrors: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Network errors that occurred',
                },
                consoleErrors: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Console errors that occurred',
                },
            },
            required: ['error'],
        },
    },
    {
        name: 'accessibility_audit',
        description: 'Run an accessibility audit on the current page. Returns WCAG violations and suggestions.',
        inputSchema: {
            type: 'object',
            properties: {
                rules: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['alt-text', 'aria-labels', 'color-contrast', 'form-labels', 'heading-order', 'link-text', 'keyboard-access', 'focus-visible', 'role-attributes', 'lang-attribute'],
                    },
                    description: 'Specific rules to check (default: all)',
                },
                level: {
                    type: 'string',
                    enum: ['A', 'AA', 'AAA'],
                    description: 'WCAG conformance level',
                    default: 'AA',
                },
                includeWarnings: {
                    type: 'boolean',
                    description: 'Include warnings in results',
                    default: true,
                },
                selector: {
                    type: 'string',
                    description: 'Scope audit to specific element',
                },
            },
        },
    },
    {
        name: 'test_from_description',
        description: 'Generate executable test steps from a natural language description. Convert human-readable test scenarios into MCP tool calls.',
        inputSchema: {
            type: 'object',
            properties: {
                description: {
                    type: 'string',
                    description: 'Natural language description of the test (e.g., "Login with email test@example.com and password secret123, then verify the dashboard loads")',
                },
                baseUrl: {
                    type: 'string',
                    description: 'Base URL for the application being tested',
                },
                format: {
                    type: 'string',
                    enum: ['mcp', 'playwright', 'cypress'],
                    description: 'Output format for generated test',
                    default: 'mcp',
                },
            },
            required: ['description'],
        },
    },
    {
        name: 'generate_tests_from_url',
        description: 'Analyze a page and auto-generate test cases based on interactive elements found. Uses page structure to suggest comprehensive tests.',
        inputSchema: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'URL of the page to analyze',
                },
                html: {
                    type: 'string',
                    description: 'HTML content to analyze (alternative to URL)',
                },
                focus: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['forms', 'navigation', 'authentication', 'search', 'accessibility'],
                    },
                    description: 'Areas to focus test generation on',
                },
                maxTests: {
                    type: 'number',
                    description: 'Maximum number of tests to generate',
                    default: 10,
                },
            },
        },
    },
    {
        name: 'generate_tests_from_flow',
        description: 'Generate tests from a user flow description. Creates comprehensive tests including happy path, error handling, and edge cases.',
        inputSchema: {
            type: 'object',
            properties: {
                flowDescription: {
                    type: 'string',
                    description: 'Description of the user flow (e.g., "User registration flow with email verification")',
                },
                includeEdgeCases: {
                    type: 'boolean',
                    description: 'Generate edge case tests',
                    default: true,
                },
                includeErrorHandling: {
                    type: 'boolean',
                    description: 'Generate error handling tests',
                    default: true,
                },
            },
            required: ['flowDescription'],
        },
    },
    {
        name: 'test_explain',
        description: 'Explain what a test does in natural language. Analyzes test code and provides human-readable summary of steps, assertions, and purpose.',
        inputSchema: {
            type: 'object',
            properties: {
                testCode: {
                    type: 'string',
                    description: 'The test code to explain',
                },
                testName: {
                    type: 'string',
                    description: 'Name of the test (optional)',
                },
                format: {
                    type: 'string',
                    enum: ['brief', 'detailed', 'technical'],
                    description: 'Level of detail in explanation',
                    default: 'detailed',
                },
                includeAssertions: {
                    type: 'boolean',
                    description: 'Include assertion details',
                    default: true,
                },
                includeCoverage: {
                    type: 'boolean',
                    description: 'Include coverage analysis',
                    default: true,
                },
            },
            required: ['testCode'],
        },
    },
    {
        name: 'suggest_fix',
        description: 'AI-powered fix suggestions for test failures. Analyzes errors and provides actionable code fixes.',
        inputSchema: {
            type: 'object',
            properties: {
                errorMessage: {
                    type: 'string',
                    description: 'The error message from the test failure',
                },
                testCode: {
                    type: 'string',
                    description: 'The test code that failed',
                },
                stackTrace: {
                    type: 'string',
                    description: 'Stack trace from the error',
                },
                screenshot: {
                    type: 'string',
                    description: 'Base64 screenshot at failure point',
                },
                html: {
                    type: 'string',
                    description: 'HTML content at failure point',
                },
                previousAttempts: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Previous fix attempts that failed',
                },
            },
            required: ['errorMessage'],
        },
    },
    {
        name: 'compare_runs',
        description: 'Compare passing and failing test runs to identify differences. Helps diagnose intermittent failures and regressions.',
        inputSchema: {
            type: 'object',
            properties: {
                passingRun: {
                    type: 'object',
                    description: 'Data from the passing test run',
                },
                failingRun: {
                    type: 'object',
                    description: 'Data from the failing test run',
                },
                focusAreas: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['timing', 'network', 'steps', 'environment', 'console'],
                    },
                    description: 'Specific areas to focus comparison on',
                },
            },
            required: ['passingRun', 'failingRun'],
        },
    },
    {
        name: 'accessibility_fix',
        description: 'Generate specific code fixes for accessibility issues. Provides corrected HTML/CSS/ARIA for identified problems.',
        inputSchema: {
            type: 'object',
            properties: {
                issue: {
                    type: 'object',
                    description: 'The accessibility issue to fix (from accessibility_audit)',
                },
                elementHtml: {
                    type: 'string',
                    description: 'HTML of the element with the issue',
                },
                context: {
                    type: 'string',
                    description: 'Additional context about the element',
                },
                framework: {
                    type: 'string',
                    enum: ['html', 'react', 'vue', 'angular', 'svelte'],
                    description: 'Frontend framework for code output',
                    default: 'html',
                },
            },
            required: ['issue'],
        },
    },
    {
        name: 'accessibility_report',
        description: 'Generate a comprehensive accessibility report in HTML or Markdown format. Includes executive summary, detailed findings, and remediation guidance.',
        inputSchema: {
            type: 'object',
            properties: {
                auditResult: {
                    type: 'object',
                    description: 'Result from accessibility_audit tool',
                },
                pageTitle: {
                    type: 'string',
                    description: 'Title of the page being audited',
                },
                pageUrl: {
                    type: 'string',
                    description: 'URL of the page being audited',
                },
                reportTitle: {
                    type: 'string',
                    description: 'Title for the report',
                    default: 'WCAG Accessibility Audit Report',
                },
                includeFixes: {
                    type: 'boolean',
                    description: 'Include fix suggestions in report',
                    default: true,
                },
                format: {
                    type: 'string',
                    enum: ['html', 'markdown', 'json'],
                    description: 'Output format for the report',
                    default: 'html',
                },
                branding: {
                    type: 'object',
                    description: 'Custom branding (logo, companyName, primaryColor)',
                },
            },
            required: ['auditResult'],
        },
    },
    // Free Tier Tools (spread from free-tier-tools.ts)
    ...freeToolDefinitions,
    // System Tools (OS-level automation for extension testing)
    ...systemToolDefinitions,
    // Scribe Protocol Tools
    ...scribeToolDefinitions,
    // Filesystem Tools
    ...filesystemToolDefinitions,
];

// Tool implementations
async function handleToolCall(
    name: string,
    args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> }> {
    // Check if this is a free tier tool
    if (freeToolNames.has(name)) {
        const result = await handleFreeToolCall(name, args, page);
        if (result) {
            return result;
        }
    }

    // Check if this is a Scribe tool
    if (name.startsWith('scribe_')) {
        const result = await handleScribeToolCall(name, args);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    }

    // Check if this is a Filesystem tool
    if (name.startsWith('fs_')) {
        const result = await handleFilesystemToolCall(name, args);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    }

    // Check if this is a system tool (OS-level automation)
    if (name.startsWith('system_')) {
        const result = await handleSystemToolCall(name, args);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(result, null, 2),
                },
                // If screenshot with base64, also return as image
                ...(result.base64 && result.success
                    ? [
                          {
                              type: 'image' as const,
                              data: result.base64,
                              mimeType: 'image/png',
                          },
                      ]
                    : []),
            ],
        };
    }

    switch (name) {
        case 'browser_launch': {
            if (browser) {
                await browser.close();
                browser = null;
            }
            if (context) {
                await context.close();
                context = null;
            }

            const headless = (args.headless as boolean) ?? false;
            const extensionPath = args.extensionPath as string;

            // Start a new test run with observability bridge
            currentRunId = generateRunId();
            stepCounter = 0;

            // Initialize event system with observability persistence
            const emitter = await initializeEventSystem();
            emitter.setRunContext({
                runId: currentRunId,
                projectId: 'local',
            });

            // Emit test run started event (will be persisted to observability store)
            await emitter.emitTestRunStarted(
                currentRunId,
                'local',
                'human_api',
                { trigger: 'mcp', headless: headless }
            );

            if (extensionPath) {
                const userDataDir = path.join(process.cwd(), 'user-data');
                context = await chromium.launchPersistentContext(userDataDir, {
                    headless: false,
                    args: [
                        `--disable-extensions-except=${extensionPath}`,
                        `--load-extension=${extensionPath}`,
                    ],
                });
                page = context.pages()[0] || await context.newPage();
            } else {
                browser = await chromium.launch({
                    headless: headless,
                    slowMo: 100,
                });
                context = await browser.newContext({
                    viewport: { width: 1280, height: 800 },
                });
                page = await context.newPage();
            }

            // Set up console capture for live view
            page.on('console', async (msg) => {
                try {
                    const args = await Promise.all(
                        msg.args().map(async (arg) => {
                            try {
                                return await arg.jsonValue();
                            } catch {
                                return arg.toString();
                            }
                        })
                    );
                    await emitter.emitConsoleCaptured(
                        msg.type() as 'log' | 'info' | 'warn' | 'error' | 'debug',
                        msg.text(),
                        args,
                        msg.location() ? {
                            url: msg.location().url,
                            lineNumber: msg.location().lineNumber,
                            columnNumber: msg.location().columnNumber,
                        } : undefined
                    );
                } catch {
                    // Ignore console capture errors
                }
            });

            page.on('pageerror', async (error) => {
                await emitter.emitConsoleCaptured(
                    'error',
                    error.message,
                    [error.stack]
                );
            });

            page.on('requestfailed', async (request) => {
                await emitter.emitConsoleCaptured(
                    'error',
                    `Request failed: ${request.url()}`,
                    [request.failure()?.errorText]
                );
            });

            // Network request/response capture for full observability
            page.on('request', async (request) => {
                try {
                    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
                    await emitter.emitApiRequestSent(
                        requestId,
                        request.method(),
                        request.url(),
                        undefined,
                        Object.fromEntries(Object.entries(request.headers()).slice(0, 10)),
                        request.postData()?.length
                    );
                } catch {
                    // Ignore network capture errors
                }
            });

            page.on('response', async (response) => {
                try {
                    const request = response.request();
                    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
                    const timing = request.timing();
                    await emitter.emitApiResponseReceived(
                        requestId,
                        response.status(),
                        response.statusText(),
                        timing.responseEnd > 0 ? Math.round(timing.responseEnd) : 0,
                        (await response.body().catch(() => Buffer.alloc(0))).length,
                        undefined,
                        Object.fromEntries(Object.entries(response.headers()).slice(0, 10))
                    );
                } catch {
                    // Ignore network capture errors
                }
            });

            // Emit browser launched event
            await emitter.emitBrowserLaunched(
                headless,
                { width: 1280, height: 800 },
                extensionPath
            );

            if (args.url) {
                await page.goto(args.url as string, { waitUntil: 'domcontentloaded' });
                await emitter.emitBrowserNavigated(args.url as string, await page.title());
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Browser launched successfully.${args.url ? ` Navigated to: ${args.url}` : ''}${extensionPath ? ` with extension: ${extensionPath}` : ''}\nViewport: 1280x800\nRun ID: ${currentRunId}\nObservability: ${observabilityInitialized ? 'enabled' : 'disabled'}`,
                    },
                ],
            };
        }

        case 'browser_screenshot': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: 'Error: No browser session. Call browser_launch first.' }],
                };
            }

            // Capture screenshot
            let screenshot: Buffer;
            if (args.selector) {
                const element = page.locator(args.selector as string);
                screenshot = await element.screenshot();
            } else {
                screenshot = await page.screenshot({
                    fullPage: (args.fullPage as boolean) ?? false,
                });
            }

            const savePath = args.savePath as string | undefined;
            const maxDimension = (args.maxDimension as number) || 1500;
            const customFilename = args.filename as string | undefined;

            // If savePath is provided, save full-res and return resized version
            if (savePath) {
                // Ensure directory exists
                if (!existsSync(savePath)) {
                    await mkdir(savePath, { recursive: true });
                }

                // Generate filename
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = customFilename || `screenshot-${timestamp}`;
                const fullPath = path.join(savePath, `${filename}.png`);

                // Save full-resolution screenshot
                await writeFile(fullPath, screenshot);

                // Get image dimensions
                const metadata = await sharp(screenshot).metadata();
                const width = metadata.width || 1280;
                const height = metadata.height || 800;

                // Resize for AI consumption (maintain aspect ratio, fit within maxDimension)
                let resizedBuffer: Buffer;
                if (width > maxDimension || height > maxDimension) {
                    resizedBuffer = await sharp(screenshot)
                        .resize(maxDimension, maxDimension, { fit: 'inside', withoutEnlargement: true })
                        .png({ quality: 85 })
                        .toBuffer();
                } else {
                    // No resize needed, just optimize
                    resizedBuffer = await sharp(screenshot)
                        .png({ quality: 85 })
                        .toBuffer();
                }

                const resizedBase64 = resizedBuffer.toString('base64');
                const resizedMeta = await sharp(resizedBuffer).metadata();

                // Emit screenshot captured event
                const emitter = getEventEmitter();
                const screenshotId = `ss_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
                await emitter.emitScreenshotCaptured(
                    screenshotId,
                    fullPath,
                    width,
                    height,
                    args.fullPage ? 'full_page' : (args.selector ? 'element' : 'viewport'),
                    screenshot.length
                );

                return {
                    content: [
                        {
                            type: 'image',
                            data: resizedBase64,
                            mimeType: 'image/png',
                        },
                        {
                            type: 'text',
                            text: `Screenshot captured. Current URL: ${page.url()}\n` +
                                  `Full-res saved: ${fullPath} (${width}x${height})\n` +
                                  `AI version: ${resizedMeta.width}x${resizedMeta.height} (resized for efficiency)`,
                        },
                    ],
                };
            }

            // Default behavior: return screenshot as-is (for backward compatibility)
            const base64 = screenshot.toString('base64');

            // Emit screenshot captured event (in-memory only)
            const emitter = getEventEmitter();
            const metadata = await sharp(screenshot).metadata();
            const screenshotId = `ss_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            await emitter.emitScreenshotCaptured(
                screenshotId,
                `memory://${screenshotId}`,
                metadata.width || 1280,
                metadata.height || 800,
                args.fullPage ? 'full_page' : (args.selector ? 'element' : 'viewport'),
                screenshot.length
            );

            tryRecordAction({
                type: 'screenshot',
                description: `Take screenshot${args.fullPage ? ' (full page)' : ''}${args.selector ? ` of ${args.selector}` : ''}`,
            });

            return {
                content: [
                    {
                        type: 'image',
                        data: base64,
                        mimeType: 'image/png',
                    },
                    {
                        type: 'text',
                        text: `Screenshot captured. Current URL: ${page.url()}`,
                    },
                ],
            };
        }

        case 'browser_navigate': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: 'Error: No browser session. Call browser_launch first.' }],
                };
            }

            const startTime = Date.now();
            await page.goto(args.url as string, { waitUntil: 'domcontentloaded' });
            const loadTime = Date.now() - startTime;

            // Record action for test recording
            tryRecordAction({
                type: 'navigate',
                url: args.url as string,
                description: `Navigate to ${args.url}`,
            });

            // Emit navigation event
            const emitter = getEventEmitter();
            await emitter.emitBrowserNavigated(
                args.url as string,
                await page.title(),
                loadTime
            );

            return {
                content: [{ type: 'text', text: `Navigated to: ${page.url()} (${loadTime}ms)` }],
            };
        }

        case 'browser_click': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: 'Error: No browser session. Call browser_launch first.' }],
                };
            }

            const emitter = getEventEmitter();
            const selfHealEnabled = args.self_heal !== false;

            try {
                if (args.x !== undefined && args.y !== undefined) {
                    await page.mouse.click(args.x as number, args.y as number, {
                        button: (args.button as 'left' | 'right' | 'middle') ?? 'left',
                    });
                    tryRecordAction({
                        type: 'click',
                        description: `Click at coordinates (${args.x}, ${args.y})`,
                    });
                    await emitter.emitBrowserClick(true, {
                        coordinates: { x: args.x as number, y: args.y as number },
                    });
                    return {
                        content: [{ type: 'text', text: `Clicked at coordinates (${args.x}, ${args.y})` }],
                    };
                } else if (args.text) {
                    await page.getByText(args.text as string, { exact: false }).first().click();
                    tryRecordAction({
                        type: 'click',
                        selector: `text="${args.text}"`,
                        description: `Click element with text: "${args.text}"`,
                    });
                    await emitter.emitBrowserClick(true, {
                        text: args.text as string,
                    });
                    return {
                        content: [{ type: 'text', text: `Clicked element with text: "${args.text}"` }],
                    };
                } else if (args.selector) {
                    const selector = args.selector as string;

                    // Try original selector first with short timeout to fail fast for healing
                    try {
                        await page.locator(selector).first().click({ timeout: 3000 });
                        tryRecordAction({
                            type: 'click',
                            selector,
                            description: `Click element: ${selector}`,
                        });
                        await emitter.emitBrowserClick(true, { selector });
                        return {
                            content: [{ type: 'text', text: `Clicked element: ${selector}` }],
                        };
                    } catch (clickError) {
                        // Attempt self-healing if enabled
                        if (selfHealEnabled) {
                            const manager = getSelfHealingManager();
                            if (manager.isEnabled()) {
                                const healResult = await manager.heal(
                                    { originalSelector: selector, url: page.url() },
                                    page
                                );

                                if (healResult.healed && healResult.newSelector) {
                                    // Click with healed selector
                                    await page.locator(healResult.newSelector).first().click();
                                    tryRecordAction({
                                        type: 'click',
                                        selector: healResult.newSelector,
                                        description: `Click element (healed from ${selector}): ${healResult.newSelector}`,
                                    });
                                    await emitter.emitBrowserClick(true, {
                                        selector: healResult.newSelector,
                                    });
                                    return {
                                        content: [{
                                            type: 'text',
                                            text: `Clicked element (healed): ${healResult.newSelector}\n` +
                                                  `Original: ${selector}\n` +
                                                  `Strategy: ${healResult.strategy} (${(healResult.confidence * 100).toFixed(0)}% confidence)`,
                                        }],
                                    };
                                }
                            }
                        }
                        // Re-throw if healing failed or disabled
                        throw clickError;
                    }
                } else {
                    return {
                        content: [{ type: 'text', text: 'Error: Provide selector, text, or coordinates (x,y)' }],
                    };
                }
            } catch (error) {
                await emitter.emitBrowserClick(false, {
                    selector: args.selector as string,
                    text: args.text as string,
                });
                return {
                    content: [{ type: 'text', text: `Click failed: ${(error as Error).message}` }],
                };
            }
        }

        case 'browser_type': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: 'Error: No browser session. Call browser_launch first.' }],
                };
            }

            const selector = args.selector as string;
            const text = args.text as string;
            const selfHealEnabled = args.self_heal !== false;

            const performType = async (sel: string): Promise<void> => {
                const locator = page!.locator(sel);
                if (args.clear !== false) {
                    await locator.clear();
                }
                await locator.fill(text);
                if (args.pressEnter) {
                    await locator.press('Enter');
                }
            };

            const emitter = getEventEmitter();

            try {
                // Try original selector first
                try {
                    await performType(selector);
                    tryRecordAction({
                        type: 'type',
                        selector,
                        value: text,
                        description: `Type "${text}" into ${selector}`,
                    });
                    await emitter.emitBrowserType(true, selector, text, {
                        cleared: args.clear !== false,
                        pressedEnter: !!args.pressEnter,
                    });
                    return {
                        content: [{
                            type: 'text',
                            text: `Typed "${text}" into ${selector}${args.pressEnter ? ' and pressed Enter' : ''}`,
                        }],
                    };
                } catch (typeError) {
                    // Attempt self-healing if enabled
                    if (selfHealEnabled) {
                        const manager = getSelfHealingManager();
                        if (manager.isEnabled()) {
                            const healResult = await manager.heal(
                                { originalSelector: selector, url: page.url() },
                                page
                            );

                            if (healResult.healed && healResult.newSelector) {
                                await performType(healResult.newSelector);
                                tryRecordAction({
                                    type: 'type',
                                    selector: healResult.newSelector,
                                    value: text,
                                    description: `Type "${text}" into (healed from ${selector}): ${healResult.newSelector}`,
                                });
                                await emitter.emitBrowserType(true, healResult.newSelector, text, {
                                    cleared: args.clear !== false,
                                    pressedEnter: !!args.pressEnter,
                                });
                                return {
                                    content: [{
                                        type: 'text',
                                        text: `Typed "${text}" into (healed): ${healResult.newSelector}\n` +
                                              `Original: ${selector}\n` +
                                              `Strategy: ${healResult.strategy} (${(healResult.confidence * 100).toFixed(0)}% confidence)` +
                                              (args.pressEnter ? '\nPressed Enter' : ''),
                                    }],
                                };
                            }
                        }
                    }
                    throw typeError;
                }
            } catch (error) {
                await emitter.emitBrowserType(false, selector, text);
                return {
                    content: [{ type: 'text', text: `Type failed: ${(error as Error).message}` }],
                };
            }
        }

        case 'browser_scroll': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: 'Error: No browser session. Call browser_launch first.' }],
                };
            }

            const amount = (args.amount as number) ?? 500;
            let deltaX = 0;
            let deltaY = 0;

            switch (args.direction) {
                case 'up':
                    deltaY = -amount;
                    break;
                case 'down':
                    deltaY = amount;
                    break;
                case 'left':
                    deltaX = -amount;
                    break;
                case 'right':
                    deltaX = amount;
                    break;
            }

            if (args.selector) {
                await page.locator(args.selector as string).evaluate(
                    (el, { dx, dy }) => el.scrollBy(dx, dy),
                    { dx: deltaX, dy: deltaY }
                );
            } else {
                await page.mouse.wheel(deltaX, deltaY);
            }

            tryRecordAction({
                type: 'scroll',
                direction: args.direction as 'up' | 'down' | 'left' | 'right',
                amount,
                selector: args.selector as string | undefined,
                description: `Scroll ${args.direction} by ${amount}px`,
            });

            return {
                content: [{ type: 'text', text: `Scrolled ${args.direction} by ${amount}px` }],
            };
        }

        case 'browser_get_text': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: 'Error: No browser session. Call browser_launch first.' }],
                };
            }

            const selector = (args.selector as string) || 'body';
            const text = await page.locator(selector).innerText();

            // Truncate if too long
            const truncated = text.length > 5000 ? text.slice(0, 5000) + '\n... [truncated]' : text;

            return {
                content: [{ type: 'text', text: truncated }],
            };
        }

        case 'browser_get_elements': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: 'Error: No browser session. Call browser_launch first.' }],
                };
            }

            const limit = (args.limit as number) ?? 20;
            const elements = await page.locator(args.selector as string).all();

            const results = await Promise.all(
                elements.slice(0, limit).map(async (el, i) => {
                    const text = await el.innerText().catch(() => '');
                    const tag = await el.evaluate((e) => e.tagName.toLowerCase());
                    const id = await el.getAttribute('id');
                    const className = await el.getAttribute('class');
                    const href = await el.getAttribute('href');
                    const type = await el.getAttribute('type');

                    return {
                        index: i,
                        tag,
                        text: text.slice(0, 100),
                        id: id || undefined,
                        class: className || undefined,
                        href: href || undefined,
                        type: type || undefined,
                    };
                })
            );

            return {
                content: [
                    {
                        type: 'text',
                        text: `Found ${elements.length} elements (showing first ${Math.min(limit, elements.length)}):\n${JSON.stringify(results, null, 2)}`,
                    },
                ],
            };
        }

        case 'browser_wait': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: 'Error: No browser session. Call browser_launch first.' }],
                };
            }

            if (args.selector) {
                const state = (args.state as 'visible' | 'hidden' | 'attached' | 'detached') ?? 'visible';
                const timeout = (args.timeout as number) ?? 30000;

                try {
                    await page.locator(args.selector as string).waitFor({ state, timeout });
                    tryRecordAction({
                        type: 'wait',
                        selector: args.selector as string,
                        description: `Wait for ${args.selector} to be ${state}`,
                    });
                    return {
                        content: [{ type: 'text', text: `Element ${args.selector} is now ${state}` }],
                    };
                } catch (error) {
                    return {
                        content: [{ type: 'text', text: `Wait timed out for ${args.selector} to be ${state}` }],
                    };
                }
            } else {
                const timeout = (args.timeout as number) ?? 1000;
                await page.waitForTimeout(timeout);
                tryRecordAction({
                    type: 'wait',
                    value: String(timeout),
                    description: `Wait ${timeout}ms`,
                });
                return {
                    content: [{ type: 'text', text: `Waited ${timeout}ms` }],
                };
            }
        }

        case 'browser_press_key': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: 'Error: No browser session. Call browser_launch first.' }],
                };
            }

            await page.keyboard.press(args.key as string);
            tryRecordAction({
                type: 'press',
                key: args.key as string,
                description: `Press key: ${args.key}`,
            });
            return {
                content: [{ type: 'text', text: `Pressed key: ${args.key}` }],
            };
        }

        case 'browser_close': {
            // Emit test completed event
            if (currentRunId) {
                const emitter = getEventEmitter();
                await emitter.emitTestRunCompleted('passed', {
                    total: stepCounter,
                    passed: stepCounter,
                    failed: 0,
                    skipped: 0,
                    duration: Date.now() - parseInt(currentRunId.split('_')[1]),
                });
                currentRunId = null;
                stepCounter = 0;
            }

            if (browser) {
                await browser.close();
                browser = null;
                context = null;
                page = null;
            }
            return {
                content: [{ type: 'text', text: 'Browser closed. Test run completed.' }],
            };
        }

        // Audio tool implementations
        case 'audio_generate_speech': {
            try {
                // Ensure audio directory exists
                if (!existsSync(AUDIO_DIR)) {
                    await mkdir(AUDIO_DIR, { recursive: true });
                }

                const text = args.text as string;
                const voice = (args.voice as string) || 'alloy';
                const speed = (args.speed as number) || 1.0;
                const filename = (args.filename as string) || `speech-${Date.now()}`;
                const outputPath = path.join(AUDIO_DIR, `${filename}.mp3`);

                const mp3 = await getOpenAI().audio.speech.create({
                    model: 'tts-1',
                    voice: voice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
                    input: text,
                    speed,
                });

                const buffer = Buffer.from(await mp3.arrayBuffer());
                await writeFile(outputPath, buffer);

                return {
                    content: [
                        {
                            type: 'text',
                            text: `Generated speech audio:\n- File: ${outputPath}\n- Text: "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"\n- Voice: ${voice}\n- Speed: ${speed}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Audio generation failed: ${(error as Error).message}` }],
                };
            }
        }

        case 'audio_degrade_quality': {
            try {
                const { spawn } = await import('child_process');
                const inputFile = args.inputFile as string;
                const degradationType = args.degradationType as string;
                const intensity = (args.intensity as string) || 'medium';
                const outputFilename = (args.outputFilename as string) || `degraded-${degradationType}-${intensity}-${Date.now()}`;
                const outputPath = path.join(AUDIO_DIR, `${outputFilename}.mp3`);

                // Build ffmpeg filter based on degradation type and intensity
                let filter: string;
                const intensityMap = { light: 0.3, medium: 0.6, heavy: 0.9 };
                const level = intensityMap[intensity as keyof typeof intensityMap] || 0.6;

                switch (degradationType) {
                    case 'lowpass':
                        // Low-pass filter - simulates low-quality audio
                        filter = `lowpass=f=${4000 - level * 3000}`;
                        break;
                    case 'noise':
                        // Add noise using audio noise
                        filter = `highpass=f=200,lowpass=f=3000,volume=${1 - level * 0.3}`;
                        break;
                    case 'bitcrush':
                        // Bit crushing - digital artifacts
                        filter = `aresample=${Math.floor(44100 - level * 36000)}:resampler=soxr,aresample=44100`;
                        break;
                    case 'telephone':
                        // Classic telephone quality (300-3400Hz bandpass)
                        filter = `highpass=f=300,lowpass=f=3400,volume=0.8`;
                        break;
                    case 'muffled':
                        // Muffled sound - heavy low pass
                        filter = `lowpass=f=${2000 - level * 1500},volume=${1 - level * 0.2}`;
                        break;
                    case 'choppy':
                        // Simulate packet loss with tremolo
                        filter = `tremolo=f=${5 + level * 10}:d=${0.3 + level * 0.4}`;
                        break;
                    default:
                        filter = 'anull';
                }

                return new Promise((resolve) => {
                    const ffmpeg = spawn('ffmpeg', [
                        '-i', inputFile,
                        '-af', filter,
                        '-y',
                        outputPath,
                    ]);

                    let stderr = '';
                    ffmpeg.stderr.on('data', (data) => {
                        stderr += data.toString();
                    });

                    ffmpeg.on('close', (code) => {
                        if (code === 0) {
                            resolve({
                                content: [
                                    {
                                        type: 'text',
                                        text: `Degraded audio created:\n- Output: ${outputPath}\n- Type: ${degradationType}\n- Intensity: ${intensity}\n- Filter: ${filter}`,
                                    },
                                ],
                            });
                        } else {
                            resolve({
                                content: [{ type: 'text', text: `ffmpeg failed (code ${code}): ${stderr.slice(-500)}` }],
                            });
                        }
                    });

                    ffmpeg.on('error', (err) => {
                        resolve({
                            content: [{ type: 'text', text: `ffmpeg error: ${err.message}. Make sure ffmpeg is installed.` }],
                        });
                    });
                });
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Audio degradation failed: ${(error as Error).message}` }],
                };
            }
        }

        case 'audio_play_in_browser': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: 'Error: No browser session. Call browser_launch first.' }],
                };
            }

            try {
                const audioFile = args.audioFile as string;
                const waitForEnd = args.waitForEnd !== false;

                // Read audio file and convert to base64
                const audioBuffer = await readFile(audioFile);
                const base64Audio = audioBuffer.toString('base64');
                const mimeType = audioFile.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';

                // Inject and play audio in browser
                const duration = await page.evaluate(
                    async ({ base64, mime, wait }) => {
                        return new Promise<number>((resolve) => {
                            const audio = new Audio(`data:${mime};base64,${base64}`);
                            audio.onloadedmetadata = () => {
                                const dur = audio.duration;
                                audio.play();
                                if (wait) {
                                    audio.onended = () => resolve(dur);
                                } else {
                                    resolve(dur);
                                }
                            };
                            audio.onerror = () => resolve(-1);
                        });
                    },
                    { base64: base64Audio, mime: mimeType, wait: waitForEnd }
                );

                if (duration === -1) {
                    return {
                        content: [{ type: 'text', text: `Failed to play audio file: ${audioFile}` }],
                    };
                }

                return {
                    content: [
                        {
                            type: 'text',
                            text: `Playing audio in browser:\n- File: ${audioFile}\n- Duration: ${duration.toFixed(1)}s\n- Waited for end: ${waitForEnd}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Audio playback failed: ${(error as Error).message}` }],
                };
            }
        }

        case 'audio_list_files': {
            try {
                const { readdir, stat } = await import('fs/promises');

                if (!existsSync(AUDIO_DIR)) {
                    return {
                        content: [{ type: 'text', text: `No audio directory yet. Generate some audio first.` }],
                    };
                }

                const files = await readdir(AUDIO_DIR);
                const audioFiles = files.filter((f) => f.endsWith('.mp3') || f.endsWith('.wav'));

                if (audioFiles.length === 0) {
                    return {
                        content: [{ type: 'text', text: 'No audio files found in test-audio directory.' }],
                    };
                }

                const fileInfo = await Promise.all(
                    audioFiles.map(async (f) => {
                        const filePath = path.join(AUDIO_DIR, f);
                        const stats = await stat(filePath);
                        return {
                            name: f,
                            path: filePath,
                            size: `${(stats.size / 1024).toFixed(1)} KB`,
                            created: stats.mtime.toISOString(),
                        };
                    })
                );

                return {
                    content: [
                        {
                            type: 'text',
                            text: `Audio files in ${AUDIO_DIR}:\n${JSON.stringify(fileInfo, null, 2)}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Failed to list files: ${(error as Error).message}` }],
                };
            }
        }

        // MCP Testing tool implementations
        case 'mcp_start': {
            try {
                const command = args.command as string;
                const cmdArgs = (args.args as string[]) || [];
                const result = await mcpStart(command, cmdArgs, {
                    cwd: args.cwd as string,
                    env: args.env as Record<string, string>,
                    timeout: args.timeout as number,
                });

                return {
                    content: [
                        {
                            type: 'text',
                            text: result.error
                                ? `Failed to start MCP: ${result.error}\nInstance ID: ${result.id}`
                                : `MCP server started successfully.\nInstance ID: ${result.id}\nStatus: ${result.status}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `MCP start failed: ${(error as Error).message}` }],
                };
            }
        }

        case 'mcp_stop': {
            try {
                const result = await mcpStop(args.id as string);
                return {
                    content: [
                        {
                            type: 'text',
                            text: result.success
                                ? `MCP instance ${args.id} stopped successfully.`
                                : `Failed to stop MCP: ${result.error}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `MCP stop failed: ${(error as Error).message}` }],
                };
            }
        }

        case 'mcp_list_tools': {
            try {
                const result = await mcpListTools(args.id as string);
                if (!result.success) {
                    return {
                        content: [{ type: 'text', text: `Failed to list tools: ${result.error}` }],
                    };
                }

                const tools = result.tools || [];
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Found ${tools.length} tools:\n${JSON.stringify(tools, null, 2)}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `MCP list tools failed: ${(error as Error).message}` }],
                };
            }
        }

        case 'mcp_invoke': {
            try {
                const result = await mcpInvoke(
                    args.id as string,
                    args.tool as string,
                    (args.args as Record<string, unknown>) || {}
                );

                return {
                    content: [
                        {
                            type: 'text',
                            text: result.success
                                ? `Tool invocation successful (${result.duration}ms):\n${JSON.stringify(result.result, null, 2)}`
                                : `Tool invocation failed (${result.duration}ms): ${result.error}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `MCP invoke failed: ${(error as Error).message}` }],
                };
            }
        }

        case 'mcp_validate_schema': {
            try {
                // First get the tools from the MCP
                const toolsResult = await mcpListTools(args.id as string);
                if (!toolsResult.success || !toolsResult.tools) {
                    return {
                        content: [{ type: 'text', text: `Failed to get tools: ${toolsResult.error}` }],
                    };
                }

                const validation = mcpValidateSchema(toolsResult.tools);
                return {
                    content: [
                        {
                            type: 'text',
                            text: validation.valid
                                ? `Schema validation passed! All ${toolsResult.tools.length} tools have valid schemas.`
                                : `Schema validation failed with ${validation.errors.length} errors:\n${JSON.stringify(validation.errors, null, 2)}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Schema validation failed: ${(error as Error).message}` }],
                };
            }
        }

        case 'mcp_stress_test': {
            try {
                const result = await mcpStressTest(
                    args.id as string,
                    args.tool as string,
                    (args.args as Record<string, unknown>) || {},
                    {
                        iterations: args.iterations as number,
                        concurrency: args.concurrency as number,
                        delayMs: args.delayMs as number,
                    }
                );

                return {
                    content: [
                        {
                            type: 'text',
                            text: `Stress test ${result.success ? 'PASSED' : 'FAILED'}:
- Total iterations: ${result.results.total}
- Succeeded: ${result.results.succeeded}
- Failed: ${result.results.failed}
- Avg duration: ${result.results.avgDuration.toFixed(1)}ms
- Min duration: ${result.results.minDuration}ms
- Max duration: ${result.results.maxDuration}ms
${result.results.errors.length > 0 ? `- Errors:\n  ${result.results.errors.join('\n  ')}` : ''}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Stress test failed: ${(error as Error).message}` }],
                };
            }
        }

        case 'mcp_generate_tests': {
            try {
                const result = await mcpGenerateTests(args.id as string, {
                    outputFormat: args.format as 'json' | 'yaml' | 'typescript',
                    includeEdgeCases: args.includeEdgeCases as boolean,
                });

                if (!result.success) {
                    return {
                        content: [{ type: 'text', text: `Test generation failed: ${result.error}` }],
                    };
                }

                return {
                    content: [
                        {
                            type: 'text',
                            text: `Generated test suite:\n\n${result.testSuite}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Test generation failed: ${(error as Error).message}` }],
                };
            }
        }

        case 'mcp_run_tests': {
            try {
                const result = await mcpRunTests(args.id as string);

                if ('error' in result) {
                    return {
                        content: [{ type: 'text', text: `Test run failed: ${result.error}` }],
                    };
                }

                const suite = result;
                let output = `Test Suite Results for ${suite.serverInfo.name} v${suite.serverInfo.version}\n`;
                output += `${'='.repeat(60)}\n\n`;
                output += `Summary: ${suite.summary.passed}/${suite.summary.total} passed (${suite.summary.duration}ms)\n\n`;
                output += `Results:\n`;

                for (const test of suite.results) {
                    const status = test.success ? '✓' : '✗';
                    output += `${status} ${test.tool} (${test.duration}ms)\n`;
                    if (test.error) {
                        output += `  Error: ${test.error}\n`;
                    }
                }

                return {
                    content: [{ type: 'text', text: output }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Test run failed: ${(error as Error).message}` }],
                };
            }
        }

        case 'mcp_list_instances': {
            try {
                const instances = mcpListInstances();

                if (instances.length === 0) {
                    return {
                        content: [{ type: 'text', text: 'No MCP instances currently running.' }],
                    };
                }

                let output = `Running MCP instances (${instances.length}):\n\n`;
                for (const inst of instances) {
                    output += `ID: ${inst.id}\n`;
                    output += `  Command: ${inst.command}\n`;
                    output += `  Status: ${inst.status}\n`;
                    output += `  Uptime: ${Math.floor(inst.uptime / 1000)}s\n`;
                    if (inst.serverInfo) {
                        output += `  Server: ${inst.serverInfo.name} v${inst.serverInfo.version}\n`;
                    }
                    if (inst.toolCount !== undefined) {
                        output += `  Tools: ${inst.toolCount}\n`;
                    }
                    output += '\n';
                }

                return {
                    content: [{ type: 'text', text: output }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `List instances failed: ${(error as Error).message}` }],
                };
            }
        }

        case 'mcp_get_instance': {
            try {
                const result = mcpGetInstance(args.id as string);

                if (!result.found || !result.instance) {
                    return {
                        content: [{ type: 'text', text: `MCP instance not found: ${args.id}` }],
                    };
                }

                const inst = result.instance;
                let output = `MCP Instance Details\n${'='.repeat(40)}\n\n`;
                output += `ID: ${inst.id}\n`;
                output += `Command: ${inst.command} ${inst.args.join(' ')}\n`;
                output += `Status: ${inst.status}\n`;
                output += `Started: ${inst.startTime.toISOString()}\n`;

                if (inst.serverInfo) {
                    output += `\nServer Info:\n`;
                    output += `  Name: ${inst.serverInfo.name}\n`;
                    output += `  Version: ${inst.serverInfo.version}\n`;
                }

                if (inst.tools && inst.tools.length > 0) {
                    output += `\nTools (${inst.tools.length}):\n`;
                    for (const tool of inst.tools) {
                        output += `  - ${tool.name}: ${tool.description.slice(0, 60)}...\n`;
                    }
                }

                if (inst.recentStderr.length > 0) {
                    output += `\nRecent stderr:\n`;
                    output += inst.recentStderr.slice(-5).map((l) => `  ${l}`).join('\n');
                }

                return {
                    content: [{ type: 'text', text: output }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Get instance failed: ${(error as Error).message}` }],
                };
            }
        }

        // Backend Testing tool implementations
        case 'backend_create_session': {
            try {
                const auth = args.authType
                    ? {
                          type: args.authType as 'none' | 'basic' | 'bearer' | 'api-key',
                          username: args.authUsername as string,
                          password: args.authPassword as string,
                          token: args.authToken as string,
                          apiKey: args.authApiKey as string,
                          apiKeyHeader: args.authApiKeyHeader as string,
                      }
                    : undefined;

                const result = backendCreateSession(args.name as string, {
                    baseUrl: args.baseUrl as string,
                    defaultHeaders: args.defaultHeaders as Record<string, string>,
                    auth,
                });

                return {
                    content: [
                        {
                            type: 'text',
                            text: `Session created successfully.\nID: ${result.id}\nName: ${result.session.name}${result.session.baseUrl ? `\nBase URL: ${result.session.baseUrl}` : ''}${result.session.authType !== 'none' ? `\nAuth: ${result.session.authType}` : ''}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Create session failed: ${(error as Error).message}` }],
                };
            }
        }

        case 'backend_list_sessions': {
            try {
                const sessions = backendListSessions();

                if (sessions.length === 0) {
                    return {
                        content: [{ type: 'text', text: 'No active backend sessions.' }],
                    };
                }

                let output = `Active sessions (${sessions.length}):\n\n`;
                for (const session of sessions) {
                    output += `ID: ${session.id}\n`;
                    output += `  Name: ${session.name}\n`;
                    if (session.baseUrl) output += `  Base URL: ${session.baseUrl}\n`;
                    if (session.authType) output += `  Auth: ${session.authType}\n`;
                    output += `  Requests: ${session.requestCount}\n\n`;
                }

                return {
                    content: [{ type: 'text', text: output }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `List sessions failed: ${(error as Error).message}` }],
                };
            }
        }

        case 'backend_delete_session': {
            try {
                const result = backendDeleteSession(args.sessionId as string);
                return {
                    content: [
                        {
                            type: 'text',
                            text: result.success
                                ? `Session ${args.sessionId} deleted.`
                                : `Failed: ${result.error}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Delete session failed: ${(error as Error).message}` }],
                };
            }
        }

        case 'backend_request': {
            try {
                const request: HttpRequest = {
                    method: args.method as HttpRequest['method'],
                    url: args.url as string,
                    headers: args.headers as Record<string, string>,
                    body: args.body,
                    timeout: args.timeout as number,
                    followRedirects: args.followRedirects as boolean,
                };

                const result = await backendRequest(args.sessionId as string | null, request);

                if (!result.success || !result.response) {
                    return {
                        content: [{ type: 'text', text: `Request failed: ${result.error}` }],
                    };
                }

                const r = result.response;
                let output = `${r.status} ${r.statusText} (${r.duration}ms, ${r.size} bytes)\n\n`;
                output += `Headers:\n${JSON.stringify(r.headers, null, 2)}\n\n`;
                output += `Body:\n${typeof r.body === 'string' ? r.body : JSON.stringify(r.body, null, 2)}`;

                // Truncate if too long
                if (output.length > 8000) {
                    output = output.slice(0, 8000) + '\n... [truncated]';
                }

                return {
                    content: [{ type: 'text', text: output }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Request failed: ${(error as Error).message}` }],
                };
            }
        }

        case 'backend_health_check': {
            try {
                const result = await backendHealthCheck(args.url as string, {
                    expectedStatus: args.expectedStatus as number,
                    timeout: args.timeout as number,
                    retries: args.retries as number,
                    retryDelay: args.retryDelay as number,
                });

                const icon = result.healthy ? '✓' : '✗';
                return {
                    content: [
                        {
                            type: 'text',
                            text: `${icon} Health Check: ${result.healthy ? 'HEALTHY' : 'UNHEALTHY'}\n- URL: ${args.url}\n- Status: ${result.status || 'N/A'}\n- Duration: ${result.duration}ms\n- Attempts: ${result.attempts}${result.error ? `\n- Error: ${result.error}` : ''}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Health check failed: ${(error as Error).message}` }],
                };
            }
        }

        case 'backend_load_test': {
            try {
                const request: HttpRequest = {
                    method: args.method as HttpRequest['method'],
                    url: args.url as string,
                    body: args.body,
                };

                const result = await backendLoadTest(args.sessionId as string | null, request, {
                    totalRequests: args.totalRequests as number,
                    concurrency: args.concurrency as number,
                    rampUpSeconds: args.rampUpSeconds as number,
                    thinkTimeMs: args.thinkTimeMs as number,
                });

                let output = `Load Test Results\n${'='.repeat(40)}\n\n`;
                output += `Requests: ${result.successfulRequests}/${result.totalRequests} successful\n`;
                output += `Error Rate: ${(result.errorRate * 100).toFixed(1)}%\n`;
                output += `Total Duration: ${result.totalDuration}ms\n`;
                output += `Requests/sec: ${result.requestsPerSecond.toFixed(1)}\n\n`;
                output += `Response Times:\n`;
                output += `  Avg: ${result.avgResponseTime.toFixed(1)}ms\n`;
                output += `  Min: ${result.minResponseTime}ms\n`;
                output += `  Max: ${result.maxResponseTime}ms\n`;
                output += `  P50: ${result.p50ResponseTime}ms\n`;
                output += `  P95: ${result.p95ResponseTime}ms\n`;
                output += `  P99: ${result.p99ResponseTime}ms\n\n`;
                output += `Status Codes: ${JSON.stringify(result.statusCodes)}\n`;

                if (result.errors.length > 0) {
                    output += `\nErrors:\n  ${result.errors.join('\n  ')}`;
                }

                return {
                    content: [{ type: 'text', text: output }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Load test failed: ${(error as Error).message}` }],
                };
            }
        }

        case 'backend_run_tests': {
            try {
                const tests = (args.tests as Array<{
                    name: string;
                    method: string;
                    url: string;
                    body?: unknown;
                    assertions?: Array<{
                        type: string;
                        path?: string;
                        operator: string;
                        expected?: unknown;
                    }>;
                }>).map(t => ({
                    name: t.name,
                    request: {
                        method: t.method as HttpRequest['method'],
                        url: t.url,
                        body: t.body,
                    },
                    assertions: (t.assertions || []).map(a => ({
                        type: a.type as ApiTestCase['assertions'][0]['type'],
                        path: a.path,
                        operator: a.operator as ApiTestCase['assertions'][0]['operator'],
                        expected: a.expected,
                    })),
                }));

                const result = await backendRunTestSuite(args.sessionId as string | null, tests);

                let output = `Test Suite Results\n${'='.repeat(40)}\n\n`;
                output += `Summary: ${result.summary.passed}/${result.summary.total} passed (${result.summary.duration}ms)\n\n`;

                for (const test of result.results) {
                    const icon = test.passed ? '✓' : '✗';
                    output += `${icon} ${test.name} (${test.duration}ms)\n`;

                    if (test.error) {
                        output += `    Error: ${test.error}\n`;
                    }

                    for (const assertion of test.assertions) {
                        const aIcon = assertion.passed ? '  ✓' : '  ✗';
                        output += `  ${aIcon} ${assertion.type}`;
                        if (!assertion.passed && assertion.error) {
                            output += `: ${assertion.error}`;
                        } else if (!assertion.passed) {
                            output += `: expected ${JSON.stringify(assertion.expected)}, got ${JSON.stringify(assertion.actual)}`;
                        }
                        output += '\n';
                    }
                }

                return {
                    content: [{ type: 'text', text: output }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Test run failed: ${(error as Error).message}` }],
                };
            }
        }

        case 'backend_set_variable': {
            try {
                const result = backendSetVariable(
                    args.sessionId as string,
                    args.name as string,
                    args.value
                );

                return {
                    content: [
                        {
                            type: 'text',
                            text: result.success
                                ? `Variable "${args.name}" set successfully.`
                                : `Failed: ${result.error}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Set variable failed: ${(error as Error).message}` }],
                };
            }
        }

        case 'backend_get_variable': {
            try {
                const result = backendGetVariable(args.sessionId as string, args.name as string);

                return {
                    content: [
                        {
                            type: 'text',
                            text: result.success
                                ? `${args.name} = ${JSON.stringify(result.value, null, 2)}`
                                : `Failed: ${result.error}`,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Get variable failed: ${(error as Error).message}` }],
                };
            }
        }

        // Video Testing & Wes Anderson Mode handlers
        case 'video_analyze': {
            try {
                const result = await analyzeVideo({
                    videoPath: args.videoPath as string | undefined,
                    videoUrl: args.videoUrl as string | undefined,
                    testProtocol: args.testProtocol as string,
                    analysisType: args.analysisType as 'full' | 'summary' | 'issues_only' | undefined,
                });

                if (!result.success) {
                    return {
                        content: [{ type: 'text', text: `Video analysis failed: ${result.error}` }],
                    };
                }

                const analysis = result.analysis!;
                const output = [
                    `## Video Analysis Results`,
                    ``,
                    `**Summary:** ${analysis.summary}`,
                    ``,
                    `**Protocol Compliance:** ${analysis.protocolCompliance}%`,
                    ``,
                    `### Issues Found (${analysis.issues.length})`,
                    ...analysis.issues.map(i => `- [${i.severity.toUpperCase()}] ${i.timestamp}: ${i.description}`),
                    ``,
                    `### Test Steps`,
                    ...analysis.testSteps.map(s => `- ${s.status === 'pass' ? '✓' : s.status === 'fail' ? '✗' : '?'} ${s.step} (${s.timestamp})`),
                    ``,
                    `### Recommendations`,
                    ...analysis.recommendations.map(r => `- ${r}`),
                ].join('\n');

                return {
                    content: [{ type: 'text', text: output }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Video analysis error: ${(error as Error).message}` }],
                };
            }
        }

        case 'video_upload': {
            try {
                const result = await uploadVideoForAnalysis({
                    videoPath: args.videoPath as string,
                    displayName: args.displayName as string | undefined,
                });

                return {
                    content: [{
                        type: 'text',
                        text: result.success
                            ? `Video uploaded successfully!\nFile URI: ${result.fileUri}\nFile Name: ${result.fileName}`
                            : `Upload failed: ${result.error}`,
                    }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Video upload error: ${(error as Error).message}` }],
                };
            }
        }

        case 'video_wes_start': {
            try {
                const result = await startWesAndersonSession({
                    title: args.title as string,
                    palette: args.palette as any,
                });

                return {
                    content: [{
                        type: 'text',
                        text: `🎬 ${result.message}\n\nSession ID: ${result.sessionId}\n\nNow capture frames with video_wes_capture, then generate the film with video_wes_generate.`,
                    }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Session start error: ${(error as Error).message}` }],
                };
            }
        }

        case 'video_wes_capture': {
            try {
                const result = await captureWesAndersonFrame({
                    sessionId: args.sessionId as string,
                    screenshotBase64: args.screenshotBase64 as string,
                    title: args.title as string | undefined,
                    subtitle: args.subtitle as string | undefined,
                });

                return {
                    content: [{
                        type: 'text',
                        text: result.success
                            ? `🎞️ ${result.message}`
                            : `Capture failed: ${result.message}`,
                    }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Frame capture error: ${(error as Error).message}` }],
                };
            }
        }

        case 'video_wes_generate': {
            try {
                const result = await generateWesAndersonFilm({
                    sessionId: args.sessionId as string,
                    fps: args.fps as number | undefined,
                    addTitles: args.addTitles as boolean | undefined,
                    outputName: args.outputName as string | undefined,
                });

                return {
                    content: [{
                        type: 'text',
                        text: result.success
                            ? `🎬 Film generated!\n\nPath: ${result.videoPath}\nFrames: ${result.frameCount}\nDuration: ${result.duration}s`
                            : `Film generation failed: ${result.error}`,
                    }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Film generation error: ${(error as Error).message}` }],
                };
            }
        }

        case 'video_wes_title_card': {
            try {
                const result = await generateTitleCard({
                    title: args.title as string,
                    subtitle: args.subtitle as string | undefined,
                    palette: args.palette as any,
                    outputPath: args.outputPath as string | undefined,
                });

                return {
                    content: [{
                        type: 'text',
                        text: result.success
                            ? `🎬 Title card generated: ${result.imagePath}`
                            : `Title card generation failed: ${result.error}`,
                    }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Title card error: ${(error as Error).message}` }],
                };
            }
        }

        case 'video_wes_palettes': {
            const result = listWesPalettes();
            const output = result.palettes.map(p =>
                `**${p.name}**: ${p.description}\n  Colors: ${p.colors.join(', ')}`
            ).join('\n\n');

            return {
                content: [{ type: 'text', text: `# Wes Anderson Palettes\n\n${output}` }],
            };
        }

        case 'video_wes_sessions': {
            const result = listWesSessions();
            if (result.sessions.length === 0) {
                return {
                    content: [{ type: 'text', text: 'No active Wes Anderson sessions.' }],
                };
            }

            const output = result.sessions.map(s =>
                `- **${s.title}** (${s.id})\n  Palette: ${s.palette}, Frames: ${s.frameCount}, Duration: ${Math.round(s.duration / 1000)}s`
            ).join('\n');

            return {
                content: [{ type: 'text', text: `# Active Sessions\n\n${output}` }],
            };
        }

        case 'video_quick_film': {
            try {
                const result = await quickFilm({
                    title: args.title as string,
                    screenshots: args.screenshots as string[],
                    palette: args.palette as any,
                    fps: args.fps as number | undefined,
                });

                return {
                    content: [{
                        type: 'text',
                        text: result.success
                            ? `🎬 Quick film generated!\n\nPath: ${result.videoPath}`
                            : `Quick film failed: ${result.error}`,
                    }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Quick film error: ${(error as Error).message}` }],
                };
            }
        }

        // ─────────────────────────────────────────────────────────────────────────────
        // Self-Healing Tools
        // ─────────────────────────────────────────────────────────────────────────────

        case 'self_heal_enable': {
            const manager = getSelfHealingManager();
            const enabled = args.enabled as boolean;
            manager.setEnabled(enabled);

            return {
                content: [{
                    type: 'text',
                    text: `Self-healing ${enabled ? 'enabled' : 'disabled'}`,
                }],
            };
        }

        case 'self_heal_config': {
            const manager = getSelfHealingManager();
            const config: Partial<SelfHealConfig> = {};

            if (args.strategies !== undefined) {
                config.strategies = args.strategies as any;
            }
            if (args.minConfidence !== undefined) {
                config.minConfidence = args.minConfidence as number;
            }
            if (args.timeoutMs !== undefined) {
                config.timeoutMs = args.timeoutMs as number;
            }
            if (args.persistHealings !== undefined) {
                config.persistHealings = args.persistHealings as boolean;
            }

            manager.configure(config);
            const current = manager.getConfig();

            return {
                content: [{
                    type: 'text',
                    text: `Self-healing configured:\n` +
                          `- Enabled: ${current.enabled}\n` +
                          `- Strategies: ${current.strategies.join(', ')}\n` +
                          `- Min Confidence: ${(current.minConfidence * 100).toFixed(0)}%\n` +
                          `- Timeout: ${current.timeoutMs}ms\n` +
                          `- Persist Healings: ${current.persistHealings}`,
                }],
            };
        }

        case 'self_heal_report': {
            const manager = getSelfHealingManager();
            const stats = await manager.getStats();
            const format = (args.format as string) || 'summary';

            if (format === 'json') {
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(stats, null, 2),
                    }],
                };
            }

            // Summary format
            let output = `# Self-Healing Report\n\n`;
            output += `## Overview\n`;
            output += `- Total Attempts: ${stats.totalAttempts}\n`;
            output += `- Successes: ${stats.successCount}\n`;
            output += `- Failures: ${stats.failureCount}\n`;
            output += `- Success Rate: ${stats.successRate.toFixed(1)}%\n`;
            output += `- Avg Confidence: ${(stats.avgConfidence * 100).toFixed(0)}%\n`;

            if (format === 'detailed') {
                output += `\n## By Strategy\n`;
                for (const [strategy, data] of Object.entries(stats.byStrategy)) {
                    if (data.attempts > 0) {
                        output += `\n### ${strategy}\n`;
                        output += `- Attempts: ${data.attempts}\n`;
                        output += `- Successes: ${data.successes}\n`;
                        output += `- Avg Confidence: ${(data.avgConfidence * 100).toFixed(0)}%\n`;
                    }
                }

                if (stats.recentHealings.length > 0) {
                    output += `\n## Recent Healings\n`;
                    for (const h of stats.recentHealings) {
                        output += `- ${h.originalSelector} -> ${h.healedSelector} (${h.strategy}, ${(h.confidence * 100).toFixed(0)}%)\n`;
                    }
                }
            }

            return {
                content: [{ type: 'text', text: output }],
            };
        }

        // ─────────────────────────────────────────────────────────────────────────────
        // Dashboard & Observability Tools
        // ─────────────────────────────────────────────────────────────────────────────

        case 'dashboard_url': {
            const port = (args.port as number) || 3333;
            const url = `http://localhost:${port}`;
            return {
                content: [{
                    type: 'text',
                    text: `Dashboard URL: ${url}\n\nTo start the dashboard server, run:\n  npx tsx packages/observability/local-dashboard.ts --port=${port}`,
                }],
            };
        }

        case 'dashboard_open': {
            const port = (args.port as number) || 3333;
            const runId = args.runId as string | undefined;
            let url = `http://localhost:${port}`;
            if (runId) {
                url += `/run/${runId}`;
            }

            // Open in default browser based on platform
            const { exec } = await import('child_process');
            const platform = process.platform;
            const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';

            return new Promise((resolve) => {
                exec(`${cmd} "${url}"`, (error) => {
                    if (error) {
                        resolve({
                            content: [{
                                type: 'text',
                                text: `Failed to open browser: ${error.message}\n\nManual URL: ${url}`,
                            }],
                        });
                    } else {
                        resolve({
                            content: [{
                                type: 'text',
                                text: `Opened dashboard in browser: ${url}`,
                            }],
                        });
                    }
                });
            });
        }

        case 'obs_runs': {
            const store = await getObservabilityStore();
            await store.initialize();

            const limit = (args.limit as number) || 20;
            const status = args.status as string | undefined;
            const sinceStr = args.since as string | undefined;
            const since = sinceStr ? new Date(sinceStr) : undefined;

            const runs = await store.getRuns({ limit, status, since });

            if (runs.length === 0) {
                return {
                    content: [{ type: 'text', text: 'No test runs found.' }],
                };
            }

            let output = `# Test Runs (${runs.length})\n\n`;
            output += `| Run ID | Status | Started | Duration | Tests |\n`;
            output += `|--------|--------|---------|----------|-------|\n`;

            for (const run of runs) {
                const started = new Date(run.startedAt).toLocaleString();
                const duration = run.duration ? `${(run.duration / 1000).toFixed(1)}s` : '-';
                const tests = run.summary
                    ? `${run.summary.passed}/${run.summary.total} passed`
                    : '-';
                const statusIcon = run.status === 'passed' ? '✅' : run.status === 'failed' ? '❌' : run.status === 'running' ? '🔄' : '⏹️';

                output += `| ${run.runId.slice(0, 12)}... | ${statusIcon} ${run.status} | ${started} | ${duration} | ${tests} |\n`;
            }

            return {
                content: [{ type: 'text', text: output }],
            };
        }

        case 'obs_run_details': {
            const store = await getObservabilityStore();
            await store.initialize();

            const runId = args.runId as string;
            const include = (args.include as string[]) || ['summary', 'logs', 'screenshots', 'network'];
            const logLimit = (args.logLimit as number) || 100;

            const run = await store.getRun(runId);
            if (!run) {
                return {
                    content: [{ type: 'text', text: `Run not found: ${runId}` }],
                };
            }

            let output = `# Test Run: ${runId}\n\n`;
            output += `- **Status:** ${run.status}\n`;
            output += `- **Started:** ${new Date(run.startedAt).toLocaleString()}\n`;
            if (run.completedAt) {
                output += `- **Completed:** ${new Date(run.completedAt).toLocaleString()}\n`;
            }
            if (run.duration) {
                output += `- **Duration:** ${(run.duration / 1000).toFixed(2)}s\n`;
            }
            output += `- **Origin:** ${run.origin}\n`;

            if (include.includes('summary') && run.summary) {
                output += `\n## Summary\n`;
                output += `- Total: ${run.summary.total}\n`;
                output += `- Passed: ${run.summary.passed}\n`;
                output += `- Failed: ${run.summary.failed}\n`;
                output += `- Skipped: ${run.summary.skipped}\n`;
            }

            if (include.includes('logs')) {
                const logs = await store.getLogs(runId, { limit: logLimit });
                output += `\n## Logs (${logs.length})\n`;
                if (logs.length > 0) {
                    for (const log of logs.slice(0, 20)) {
                        const level = log.level ? `[${log.level.toUpperCase()}]` : '';
                        output += `- ${level} ${log.message.slice(0, 100)}\n`;
                    }
                    if (logs.length > 20) {
                        output += `... and ${logs.length - 20} more\n`;
                    }
                } else {
                    output += `No logs recorded.\n`;
                }
            }

            if (include.includes('screenshots')) {
                const screenshots = await store.getScreenshots(runId);
                output += `\n## Screenshots (${screenshots.length})\n`;
                if (screenshots.length > 0) {
                    for (const ss of screenshots.slice(0, 10)) {
                        output += `- ${ss.type}: ${ss.width}x${ss.height} (${(ss.sizeBytes / 1024).toFixed(1)}KB)\n`;
                    }
                }
            }

            if (include.includes('network')) {
                const network = await store.getNetworkRequests(runId, {});
                output += `\n## Network Requests (${network.length})\n`;
                if (network.length > 0) {
                    for (const req of network.slice(0, 10)) {
                        const status = req.status ? `${req.status}` : 'pending';
                        output += `- ${req.method} ${req.url.slice(0, 60)} [${status}]\n`;
                    }
                    if (network.length > 10) {
                        output += `... and ${network.length - 10} more\n`;
                    }
                }
            }

            return {
                content: [{ type: 'text', text: output }],
            };
        }

        case 'obs_live_url': {
            const port = (args.port as number) || 3334;
            const wsUrl = `ws://localhost:${port}`;
            const httpUrl = `http://localhost:${port}`;

            return {
                content: [{
                    type: 'text',
                    text: `Live View URLs:\n` +
                          `- WebSocket: ${wsUrl}\n` +
                          `- HTTP: ${httpUrl}\n\n` +
                          `To start the live view server, run:\n` +
                          `  npx tsx packages/live-view/server.ts --port=${port}`,
                }],
            };
        }

        case 'obs_export': {
            const store = await getObservabilityStore();
            await store.initialize();

            const runId = args.runId as string;
            const format = (args.format as string) || 'json';
            const include = (args.include as string[]) || ['runs'];
            const outputPath = args.outputPath as string | undefined;

            const exportData: Record<string, unknown> = {};

            if (runId === 'all') {
                if (include.includes('runs')) {
                    exportData.runs = await store.getRuns({ limit: 1000 });
                }
            } else {
                const run = await store.getRun(runId);
                if (!run) {
                    return {
                        content: [{ type: 'text', text: `Run not found: ${runId}` }],
                    };
                }

                if (include.includes('runs')) {
                    exportData.run = run;
                }
                if (include.includes('logs')) {
                    exportData.logs = await store.getLogs(runId, { limit: 10000 });
                }
                if (include.includes('screenshots')) {
                    exportData.screenshots = await store.getScreenshots(runId);
                }
                if (include.includes('network')) {
                    exportData.network = await store.getNetworkRequests(runId, {});
                }
            }

            let output: string;
            let filename: string;

            if (format === 'csv') {
                // Simple CSV for runs
                if (exportData.runs) {
                    const runs = exportData.runs as TestRunRecord[];
                    const headers = ['runId', 'status', 'startedAt', 'completedAt', 'duration', 'origin'];
                    const rows = runs.map(r => [
                        r.runId,
                        r.status,
                        r.startedAt.toString(),
                        r.completedAt?.toString() || '',
                        r.duration?.toString() || '',
                        r.origin,
                    ]);
                    output = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
                } else if (exportData.run) {
                    const r = exportData.run as TestRunRecord;
                    output = `runId,status,startedAt,completedAt,duration,origin\n${r.runId},${r.status},${r.startedAt},${r.completedAt || ''},${r.duration || ''},${r.origin}`;
                } else {
                    output = 'No data to export';
                }
                filename = outputPath || `barrhawk-export-${runId}-${Date.now()}.csv`;
            } else {
                output = JSON.stringify(exportData, null, 2);
                filename = outputPath || `barrhawk-export-${runId}-${Date.now()}.json`;
            }

            // Write to file
            await writeFile(filename, output);

            return {
                content: [{
                    type: 'text',
                    text: `Exported to: ${filename}\n` +
                          `Format: ${format}\n` +
                          `Size: ${(output.length / 1024).toFixed(1)}KB`,
                }],
            };
        }

        case 'obs_flaky': {
            const store = await getObservabilityStore();
            await store.initialize();

            const days = (args.days as number) || 7;
            const minRuns = (args.minRuns as number) || 3;
            const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

            const runs = await store.getRuns({ since, limit: 1000 });

            if (runs.length < minRuns) {
                return {
                    content: [{
                        type: 'text',
                        text: `Not enough runs for analysis. Found ${runs.length} runs in the last ${days} days (minimum: ${minRuns}).`,
                    }],
                };
            }

            // Group by origin and analyze
            const byOrigin = new Map<string, TestRunRecord[]>();
            for (const run of runs) {
                const key = run.origin || 'unknown';
                if (!byOrigin.has(key)) {
                    byOrigin.set(key, []);
                }
                byOrigin.get(key)!.push(run);
            }

            let output = `# Flaky Test Analysis\n\n`;
            output += `**Period:** Last ${days} days\n`;
            output += `**Total Runs:** ${runs.length}\n\n`;

            const flakyOrigins: Array<{ origin: string; passRate: number; runs: number }> = [];

            for (const [origin, originRuns] of byOrigin) {
                if (originRuns.length < minRuns) continue;

                const passed = originRuns.filter(r => r.status === 'passed').length;
                const failed = originRuns.filter(r => r.status === 'failed').length;
                const passRate = passed / (passed + failed);

                // Consider flaky if pass rate is between 20% and 80%
                if (passRate > 0.2 && passRate < 0.8) {
                    flakyOrigins.push({ origin, passRate, runs: originRuns.length });
                }
            }

            if (flakyOrigins.length === 0) {
                output += `No flaky patterns detected.\n`;
            } else {
                output += `## Flaky Origins (${flakyOrigins.length})\n\n`;
                output += `| Origin | Pass Rate | Runs |\n`;
                output += `|--------|-----------|------|\n`;

                flakyOrigins.sort((a, b) => a.passRate - b.passRate);
                for (const f of flakyOrigins) {
                    output += `| ${f.origin} | ${(f.passRate * 100).toFixed(0)}% | ${f.runs} |\n`;
                }
            }

            // Overall stats
            const totalPassed = runs.filter((r: TestRunRecord) => r.status === 'passed').length;
            const totalFailed = runs.filter((r: TestRunRecord) => r.status === 'failed').length;
            output += `\n## Overall Stats\n`;
            output += `- Passed: ${totalPassed} (${((totalPassed / runs.length) * 100).toFixed(0)}%)\n`;
            output += `- Failed: ${totalFailed} (${((totalFailed / runs.length) * 100).toFixed(0)}%)\n`;

            return {
                content: [{ type: 'text', text: output }],
            };
        }

        case 'obs_trends': {
            const store = await getObservabilityStore();
            await store.initialize();

            const days = (args.days as number) || 30;
            const groupBy = (args.groupBy as string) || 'day';
            const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

            const runs = await store.getRuns({ since, limit: 10000 });

            if (runs.length === 0) {
                return {
                    content: [{
                        type: 'text',
                        text: `No runs found in the last ${days} days.`,
                    }],
                };
            }

            let output = `# Test Health Trends\n\n`;
            output += `**Period:** Last ${days} days\n`;
            output += `**Total Runs:** ${runs.length}\n\n`;

            if (groupBy === 'origin') {
                // Group by origin
                const byOrigin = new Map<string, { passed: number; failed: number; total: number }>();

                for (const run of runs) {
                    const key = run.origin || 'unknown';
                    if (!byOrigin.has(key)) {
                        byOrigin.set(key, { passed: 0, failed: 0, total: 0 });
                    }
                    const stats = byOrigin.get(key)!;
                    stats.total++;
                    if (run.status === 'passed') stats.passed++;
                    if (run.status === 'failed') stats.failed++;
                }

                output += `## By Origin\n\n`;
                output += `| Origin | Runs | Passed | Failed | Pass Rate |\n`;
                output += `|--------|------|--------|--------|----------|\n`;

                for (const [origin, stats] of byOrigin) {
                    const passRate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(0) : '0';
                    output += `| ${origin} | ${stats.total} | ${stats.passed} | ${stats.failed} | ${passRate}% |\n`;
                }
            } else {
                // Group by day or week
                const byPeriod = new Map<string, { passed: number; failed: number; total: number; avgDuration: number }>();

                for (const run of runs) {
                    const date = new Date(run.startedAt);
                    let key: string;

                    if (groupBy === 'week') {
                        const weekStart = new Date(date);
                        weekStart.setDate(date.getDate() - date.getDay());
                        key = weekStart.toISOString().split('T')[0];
                    } else {
                        key = date.toISOString().split('T')[0];
                    }

                    if (!byPeriod.has(key)) {
                        byPeriod.set(key, { passed: 0, failed: 0, total: 0, avgDuration: 0 });
                    }
                    const stats = byPeriod.get(key)!;
                    stats.total++;
                    if (run.status === 'passed') stats.passed++;
                    if (run.status === 'failed') stats.failed++;
                    if (run.duration) {
                        stats.avgDuration = (stats.avgDuration * (stats.total - 1) + run.duration) / stats.total;
                    }
                }

                output += `## By ${groupBy === 'week' ? 'Week' : 'Day'}\n\n`;
                output += `| Date | Runs | Passed | Failed | Pass Rate | Avg Duration |\n`;
                output += `|------|------|--------|--------|-----------|-------------|\n`;

                const sortedPeriods = Array.from(byPeriod.entries()).sort((a, b) => a[0].localeCompare(b[0]));
                for (const [period, stats] of sortedPeriods) {
                    const passRate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(0) : '0';
                    const avgDur = stats.avgDuration > 0 ? `${(stats.avgDuration / 1000).toFixed(1)}s` : '-';
                    output += `| ${period} | ${stats.total} | ${stats.passed} | ${stats.failed} | ${passRate}% | ${avgDur} |\n`;
                }
            }

            // Overall trend
            const totalPassed = runs.filter((r: TestRunRecord) => r.status === 'passed').length;
            const overallPassRate = ((totalPassed / runs.length) * 100).toFixed(1);
            output += `\n**Overall Pass Rate:** ${overallPassRate}%\n`;

            return {
                content: [{ type: 'text', text: output }],
            };
        }

        // =====================================================================
        // GOLDEN GIRL HANDLERS
        // =====================================================================

        case 'golden_run': {
            const options: RunOptions = {
                suite: args.suite === 'all' ? undefined : args.suite as string,
                tool: args.tool as string | undefined,
                threshold: (args.threshold as number) || 0.8,
                verbose: (args.verbose as boolean) || false,
                tags: args.tags as string[] | undefined,
            };

            // Run golden tests without a tool executor for now
            // In production, this would hook into the MCP tool system
            const result = await runGoldenTests(options);
            const output = formatRunResults(result, options.verbose);

            return {
                content: [{
                    type: 'text',
                    text: output + `\n\nRun ID: ${result.runId}\nUse golden_report to get detailed results.`,
                }],
            };
        }

        case 'golden_compare': {
            const actual = args.actual as unknown;
            const expected = args.expected as GoldenExpected;
            const matchMode = (args.matchMode as MatchMode) || 'semantic';
            const threshold = (args.threshold as number) || 0.8;

            const result = compare(actual, expected, { matchMode, threshold });
            const output = formatCompareResult(result, threshold);

            return {
                content: [{ type: 'text', text: output }],
            };
        }

        case 'golden_add': {
            try {
                const options: AddOptions = {
                    suite: args.suite as string,
                    name: args.name as string,
                    description: args.description as string | undefined,
                    input: args.input as { tool: string; args: Record<string, unknown> },
                    expected: args.expected as GoldenExpected,
                    matchMode: (args.matchMode as MatchMode) || 'semantic',
                    threshold: (args.threshold as number) || 0.8,
                    tags: args.tags as string[] | undefined,
                };

                const testCase = addGoldenCase(options);
                const output = formatAddResult(testCase);

                return {
                    content: [{ type: 'text', text: output }],
                };
            } catch (error) {
                return {
                    content: [{
                        type: 'text',
                        text: `Error adding golden test: ${error instanceof Error ? error.message : String(error)}`,
                    }],
                };
            }
        }

        case 'golden_list': {
            const options: ListOptions = {
                suite: args.suite as string | undefined,
                tags: args.tags as string[] | undefined,
            };

            const result = listGolden(options);
            const output = formatListResult(result);

            return {
                content: [{ type: 'text', text: output }],
            };
        }

        case 'golden_report': {
            const runId = args.runId as string;
            const format = (args.format as 'summary' | 'detailed' | 'html' | 'json') || 'summary';

            const output = generateReport({ runId, format });

            if (format === 'html') {
                // Save HTML report to file
                const filename = `golden-report-${runId.slice(0, 8)}.html`;
                await writeFile(filename, output);
                return {
                    content: [{
                        type: 'text',
                        text: `HTML report saved to: ${filename}`,
                    }],
                };
            }

            return {
                content: [{ type: 'text', text: output }],
            };
        }

        case 'golden_fixtures': {
            const port = (args.port as number) || 4444;

            try {
                await startFixtureServer(port);
                return {
                    content: [{
                        type: 'text',
                        text: `Golden Girl fixtures server started on http://localhost:${port}\n` +
                              `Available fixtures: http://localhost:${port}/fixtures`,
                    }],
                };
            } catch (error) {
                return {
                    content: [{
                        type: 'text',
                        text: `Error starting fixtures server: ${error instanceof Error ? error.message : String(error)}`,
                    }],
                };
            }
        }

        // =====================================================================
        // AI TOOLS HANDLERS
        // =====================================================================

        case 'smart_assert': {
            const options: SmartAssertOptions = {
                actual: args.actual,
                expected: args.expected as string,
                context: args.context as string | undefined,
                strict: args.strict as boolean | undefined,
            };

            const result = await smartAssert(options);

            const icon = result.passed ? '✅' : '❌';
            let output = `${icon} **Smart Assert**\n\n`;
            output += `**Status:** ${result.passed ? 'PASSED' : 'FAILED'}\n`;
            output += `**Confidence:** ${(result.confidence * 100).toFixed(0)}%\n`;
            output += `**Reason:** ${result.reason}\n\n`;

            output += `**Actual:** ${result.details.actualSummary}\n`;
            output += `**Expected:** ${result.details.expectedInterpretation}\n\n`;

            if (result.details.matchDetails.length > 0) {
                output += `**Matches:**\n`;
                for (const m of result.details.matchDetails) {
                    output += `  ✓ ${m}\n`;
                }
            }

            if (result.details.mismatchDetails.length > 0) {
                output += `**Mismatches:**\n`;
                for (const m of result.details.mismatchDetails) {
                    output += `  ✗ ${m}\n`;
                }
            }

            if (result.suggestion) {
                output += `\n**Suggestion:** ${result.suggestion}\n`;
            }

            return {
                content: [{ type: 'text', text: output }],
            };
        }

        case 'analyze_failure': {
            const context: FailureContext = {
                error: args.error as string,
                selector: args.selector as string | undefined,
                action: args.action as string | undefined,
                expectedBehavior: args.expectedBehavior as string | undefined,
                actualBehavior: args.actualBehavior as string | undefined,
                htmlSnapshot: args.htmlSnapshot as string | undefined,
                networkErrors: args.networkErrors as string[] | undefined,
                consoleErrors: args.consoleErrors as string[] | undefined,
            };

            const result = await analyzeFailure(context);
            const output = formatAnalysisResult(result);

            return {
                content: [{ type: 'text', text: output }],
            };
        }

        case 'accessibility_audit': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: 'No browser page open. Call browser_launch first.' }],
                };
            }

            const options: A11yAuditOptions = {
                page,
                rules: args.rules as any[] | undefined,
                level: (args.level as 'A' | 'AA' | 'AAA') || 'AA',
                includeWarnings: args.includeWarnings as boolean | undefined,
                selector: args.selector as string | undefined,
            };

            const result = await accessibilityAudit(options);
            const output = formatAuditResult(result);

            return {
                content: [{ type: 'text', text: output }],
            };
        }

        case 'test_from_description': {
            const testOptions: TestFromDescriptionOptions = {
                description: args.description as string,
                baseUrl: args.baseUrl as string | undefined,
            };

            const result = await testFromDescription(testOptions);
            const format = (args.format as string) || 'mcp';

            let output = `# Generated Test: ${result.name}\n\n`;
            output += `**Description:** ${result.description}\n`;
            output += `**Confidence:** ${(result.metadata.confidence * 100).toFixed(0)}%\n\n`;

            if (format === 'mcp') {
                output += formatTestAsMCPCalls(result);
            } else {
                output += formatTestAsCode(result);
            }

            return {
                content: [{ type: 'text', text: output }],
            };
        }

        case 'generate_tests_from_url': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: 'No browser page open. Call browser_launch first.' }],
                };
            }

            // Navigate to URL if provided
            if (args.url) {
                await page.goto(args.url as string);
            }

            const genOptions: GenerateTestsOptions = {
                page,
                url: args.url as string | undefined,
                focus: args.focus as any[] | undefined,
                maxTests: (args.maxTests as number) || 10,
            };

            const tests = await generateTestsFromUrl(genOptions);
            const output = formatTestSuite(tests);

            return {
                content: [{ type: 'text', text: output }],
            };
        }

        case 'generate_tests_from_flow': {
            const flowOptions: GenerateFromFlowOptions = {
                flow: args.flowDescription as string,
                baseUrl: args.baseUrl as string | undefined,
                page: page || undefined,
            };

            const tests = await generateTestsFromFlow(flowOptions);
            const output = formatTestSuite(tests);

            return {
                content: [{ type: 'text', text: output }],
            };
        }

        case 'test_explain': {
            const explainOptions: TestExplainOptions = {
                testCode: args.testCode as string,
                testName: args.testName as string | undefined,
                format: (args.format as 'brief' | 'detailed' | 'technical') || 'detailed',
                includeAssertions: args.includeAssertions !== false,
                includeCoverage: args.includeCoverage !== false,
            };

            const result = explainTest(explainOptions);
            const output = formatTestExplanation(result);

            return {
                content: [{ type: 'text', text: output }],
            };
        }

        case 'suggest_fix': {
            const fixOptions: SuggestFixOptions = {
                errorMessage: args.errorMessage as string,
                testCode: args.testCode as string | undefined,
                stackTrace: args.stackTrace as string | undefined,
                screenshot: args.screenshot as string | undefined,
                html: args.html as string | undefined,
                previousAttempts: args.previousAttempts as string[] | undefined,
            };

            const result = suggestFix(fixOptions);
            const output = formatFixSuggestions(result);

            return {
                content: [{ type: 'text', text: output }],
            };
        }

        case 'compare_runs': {
            const compareOptions: CompareRunsOptions = {
                passingRun: args.passingRun as TestRunData,
                failingRun: args.failingRun as TestRunData,
                focusAreas: args.focusAreas as any[] | undefined,
            };

            const result = compareRuns(compareOptions);
            const output = formatCompareResults(result);

            return {
                content: [{ type: 'text', text: output }],
            };
        }

        case 'accessibility_fix': {
            const a11yFixOptions: AccessibilityFixOptions = {
                issue: args.issue as A11yIssue,
                elementHtml: args.elementHtml as string | undefined,
                context: args.context as string | undefined,
                framework: (args.framework as 'html' | 'react' | 'vue' | 'angular' | 'svelte') || 'html',
            };

            const result = generateAccessibilityFix(a11yFixOptions);
            const output = formatAccessibilityFix(result);

            return {
                content: [{ type: 'text', text: output }],
            };
        }

        case 'accessibility_report': {
            const reportOptions: AccessibilityReportOptions = {
                auditResult: args.auditResult as A11yAuditResult,
                pageTitle: args.pageTitle as string | undefined,
                pageUrl: args.pageUrl as string | undefined,
                reportTitle: (args.reportTitle as string) || 'WCAG Accessibility Audit Report',
                includeFixes: args.includeFixes !== false,
                format: (args.format as 'html' | 'markdown' | 'json') || 'html',
                branding: args.branding as any,
            };

            const report = generateAccessibilityReport(reportOptions);

            // For HTML format, return raw content for saving
            if (reportOptions.format === 'html') {
                const filename = getReportFilename('html', reportOptions.pageTitle);
                return {
                    content: [
                        { type: 'text', text: `# Accessibility Report Generated\n\n**Format:** HTML\n**Filename suggestion:** ${filename}\n\n---\n\n` },
                        { type: 'text', text: report.content },
                    ],
                };
            }

            return {
                content: [{ type: 'text', text: report.content }],
            };
        }

        default:
            return {
                content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            };
    }
}

// Create and run server
async function main() {
    const server = new Server(
        {
            name: 'mcp-playwright',
            version: '1.0.0',
        },
        {
            capabilities: {
                tools: {},
            },
        }
    );

    // List tools handler
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools,
    }));

    // Call tool handler
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        return handleToolCall(name, args ?? {});
    });

    // Connect via stdio
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Clean up on exit
    process.on('SIGINT', async () => {
        if (context) await context.close();
        if (browser) await browser.close();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        if (context) await context.close();
        if (browser) await browser.close();
        process.exit(0);
    });
}

main().catch(console.error);
