/**
 * Free Tier Tools - MCP Tool Definitions and Handlers
 *
 * Basic, deterministic testing tools without AI.
 * For AI-powered features, upgrade to Premium.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Page } from 'playwright';

// Import free tools implementations
import {
    assertEquals,
    assertContains,
    assertVisible,
    assertExists,
    assertCount,
    assertUrl,
    assertTitle,
    assertAttribute,
    formatAssertionResult,
} from './packages/free-tools/src/assertions.js';

import {
    selectorSuggest,
    selectorValidate,
    selectorAlternatives,
    formatSelectorResult,
} from './packages/free-tools/src/selectors.js';

import {
    testRecordStart,
    testRecordStop,
    testReplay,
    testExport,
    getRecordingStatus,
    getLastRecording,
    recordAction,
} from './packages/free-tools/src/test-recorder.js';

import {
    startTestSuite,
    addTestResult,
    endTestSuite,
    getCurrentSuite,
    reportSummary,
    reportFailures,
    reportTiming,
} from './packages/free-tools/src/reporting.js';

import {
    storageClear,
    storageGet,
    storageSet,
    consoleStartCapture,
    consoleStopCapture,
    consoleGetMessages,
    networkWait,
    networkMock,
    networkUnmock,
    screenshotCompare,
    formatUtilityResult,
} from './packages/free-tools/src/utilities.js';

import {
    a11yCheckBasic,
    formatA11yResult,
} from './packages/free-tools/src/a11y-basic.js';

import {
    selectorStabilityScore,
    formatStabilityResult,
} from './packages/free-tools/src/selector-stability.js';

import {
    detectFlakyTests,
    prioritizeTests,
    deduplicateTests,
    findCoverageGaps,
} from './packages/free-tools/src/test-analysis.js';

import {
    performanceAnalyze,
    detectPerformanceRegression,
    checkPerformanceBudget,
} from './packages/free-tools/src/performance.js';

import {
    generateData,
    generateEdgeCases,
    generateFromSchema,
} from './packages/free-tools/src/data-generation.js';

import {
    securityScan,
    formatSecurityResult,
} from './packages/free-tools/src/security-scan.js';

// Import observability store for dashboard integration
import {
    getObservabilityStore,
    type TestRunRecord,
} from './packages/observability/index.js';

// Track active run for observability
let activeObsRunId: string | null = null;

// ============================================================================
// Tool Definitions
// ============================================================================

export const freeToolDefinitions: Tool[] = [
    // Assertion Tools
    {
        name: 'assert_equals',
        description: 'Assert that two values are equal. Supports strict/loose equality and deep object comparison.',
        inputSchema: {
            type: 'object',
            properties: {
                actual: {
                    description: 'The actual value to compare',
                },
                expected: {
                    description: 'The expected value',
                },
                message: {
                    type: 'string',
                    description: 'Optional custom message',
                },
                strict: {
                    type: 'boolean',
                    description: 'Use strict equality (===) instead of loose (==). Default: true',
                    default: true,
                },
            },
            required: ['actual', 'expected'],
        },
    },
    {
        name: 'assert_contains',
        description: 'Assert that a string contains a substring.',
        inputSchema: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'The text to search in',
                },
                substring: {
                    type: 'string',
                    description: 'The substring to find',
                },
                caseSensitive: {
                    type: 'boolean',
                    description: 'Case sensitive search. Default: false',
                    default: false,
                },
                message: {
                    type: 'string',
                    description: 'Optional custom message',
                },
            },
            required: ['text', 'substring'],
        },
    },
    {
        name: 'assert_visible',
        description: 'Assert that an element is visible on the page.',
        inputSchema: {
            type: 'object',
            properties: {
                selector: {
                    type: 'string',
                    description: 'CSS selector of the element',
                },
                timeout: {
                    type: 'number',
                    description: 'Timeout in ms. Default: 5000',
                    default: 5000,
                },
                message: {
                    type: 'string',
                    description: 'Optional custom message',
                },
            },
            required: ['selector'],
        },
    },
    {
        name: 'assert_exists',
        description: 'Assert that an element exists in the DOM (may not be visible).',
        inputSchema: {
            type: 'object',
            properties: {
                selector: {
                    type: 'string',
                    description: 'CSS selector of the element',
                },
                timeout: {
                    type: 'number',
                    description: 'Timeout in ms. Default: 5000',
                    default: 5000,
                },
                message: {
                    type: 'string',
                    description: 'Optional custom message',
                },
            },
            required: ['selector'],
        },
    },
    {
        name: 'assert_count',
        description: 'Assert the number of elements matching a selector.',
        inputSchema: {
            type: 'object',
            properties: {
                selector: {
                    type: 'string',
                    description: 'CSS selector to count',
                },
                expected: {
                    type: 'number',
                    description: 'Expected count',
                },
                operator: {
                    type: 'string',
                    enum: ['equals', 'greaterThan', 'lessThan', 'greaterOrEqual', 'lessOrEqual'],
                    description: 'Comparison operator. Default: equals',
                    default: 'equals',
                },
                message: {
                    type: 'string',
                    description: 'Optional custom message',
                },
            },
            required: ['selector', 'expected'],
        },
    },
    {
        name: 'assert_url',
        description: 'Assert the current page URL.',
        inputSchema: {
            type: 'object',
            properties: {
                expected: {
                    type: 'string',
                    description: 'Expected URL or pattern',
                },
                matchType: {
                    type: 'string',
                    enum: ['exact', 'contains', 'startsWith', 'endsWith', 'regex'],
                    description: 'How to match. Default: exact',
                    default: 'exact',
                },
                message: {
                    type: 'string',
                    description: 'Optional custom message',
                },
            },
            required: ['expected'],
        },
    },
    {
        name: 'assert_title',
        description: 'Assert the page title.',
        inputSchema: {
            type: 'object',
            properties: {
                expected: {
                    type: 'string',
                    description: 'Expected title or pattern',
                },
                matchType: {
                    type: 'string',
                    enum: ['exact', 'contains', 'startsWith', 'endsWith', 'regex'],
                    description: 'How to match. Default: exact',
                    default: 'exact',
                },
                message: {
                    type: 'string',
                    description: 'Optional custom message',
                },
            },
            required: ['expected'],
        },
    },
    {
        name: 'assert_attribute',
        description: 'Assert an element attribute value.',
        inputSchema: {
            type: 'object',
            properties: {
                selector: {
                    type: 'string',
                    description: 'CSS selector of the element',
                },
                attribute: {
                    type: 'string',
                    description: 'Attribute name to check',
                },
                expected: {
                    type: 'string',
                    description: 'Expected value (omit to just check existence)',
                },
                matchType: {
                    type: 'string',
                    enum: ['exact', 'contains', 'exists'],
                    description: 'How to match. Default: exact',
                    default: 'exact',
                },
                message: {
                    type: 'string',
                    description: 'Optional custom message',
                },
            },
            required: ['selector', 'attribute'],
        },
    },

    // Selector Tools
    {
        name: 'selector_suggest',
        description: 'Suggest selectors for an element based on description or nearby elements. Non-AI, pattern-based.',
        inputSchema: {
            type: 'object',
            properties: {
                description: {
                    type: 'string',
                    description: 'Description of the element to find (e.g., "login button", "email input")',
                },
                near: {
                    type: 'string',
                    description: 'Selector of a nearby element to search around',
                },
            },
        },
    },
    {
        name: 'selector_validate',
        description: 'Validate if a selector works and check uniqueness.',
        inputSchema: {
            type: 'object',
            properties: {
                selector: {
                    type: 'string',
                    description: 'The CSS selector to validate',
                },
                expectUnique: {
                    type: 'boolean',
                    description: 'Whether to require exactly one match. Default: true',
                    default: true,
                },
            },
            required: ['selector'],
        },
    },
    {
        name: 'selector_alternatives',
        description: 'Find alternative selectors for an element, ranked by reliability.',
        inputSchema: {
            type: 'object',
            properties: {
                selector: {
                    type: 'string',
                    description: 'Current selector to find alternatives for',
                },
                maxAlternatives: {
                    type: 'number',
                    description: 'Maximum alternatives to return. Default: 5',
                    default: 5,
                },
            },
            required: ['selector'],
        },
    },

    // Test Recorder Tools
    {
        name: 'test_record_start',
        description: 'Start recording browser actions for test generation.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Name for this recording',
                },
                baseUrl: {
                    type: 'string',
                    description: 'Base URL for relative paths',
                },
            },
        },
    },
    {
        name: 'test_record_stop',
        description: 'Stop recording and get the recorded actions.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'test_replay',
        description: 'Replay a previously recorded test.',
        inputSchema: {
            type: 'object',
            properties: {
                recording: {
                    type: 'object',
                    description: 'The recording object from test_record_stop',
                },
                speed: {
                    type: 'number',
                    description: 'Playback speed (1 = normal, 2 = 2x faster). Default: 1',
                    default: 1,
                },
                stopOnError: {
                    type: 'boolean',
                    description: 'Stop on first error. Default: false',
                    default: false,
                },
                timeout: {
                    type: 'number',
                    description: 'Action timeout in ms. Default: 30000',
                    default: 30000,
                },
            },
            required: ['recording'],
        },
    },
    {
        name: 'test_export',
        description: 'Export a recorded test to code.',
        inputSchema: {
            type: 'object',
            properties: {
                recording: {
                    type: 'object',
                    description: 'The recording object to export',
                },
                format: {
                    type: 'string',
                    enum: ['playwright', 'cypress', 'puppeteer', 'mcp'],
                    description: 'Output format. Default: playwright',
                    default: 'playwright',
                },
                includeAssertions: {
                    type: 'boolean',
                    description: 'Include assertion placeholders. Default: false',
                    default: false,
                },
            },
            required: ['recording'],
        },
    },

    // Reporting Tools
    {
        name: 'report_summary',
        description: 'Generate a test summary report with pass/fail stats.',
        inputSchema: {
            type: 'object',
            properties: {
                results: {
                    type: 'object',
                    description: 'Test suite results object',
                },
                format: {
                    type: 'string',
                    enum: ['text', 'markdown', 'json'],
                    description: 'Output format. Default: text',
                    default: 'text',
                },
            },
            required: ['results'],
        },
    },
    {
        name: 'report_failures',
        description: 'Generate a detailed failure report.',
        inputSchema: {
            type: 'object',
            properties: {
                results: {
                    type: 'object',
                    description: 'Test suite results object',
                },
                includeScreenshots: {
                    type: 'boolean',
                    description: 'Include screenshot paths. Default: false',
                    default: false,
                },
                format: {
                    type: 'string',
                    enum: ['text', 'markdown', 'json'],
                    description: 'Output format. Default: text',
                    default: 'text',
                },
            },
            required: ['results'],
        },
    },
    {
        name: 'report_timing',
        description: 'Generate a timing analysis report showing slowest/fastest tests.',
        inputSchema: {
            type: 'object',
            properties: {
                results: {
                    type: 'object',
                    description: 'Test suite results object',
                },
                sortBy: {
                    type: 'string',
                    enum: ['name', 'duration', 'status'],
                    description: 'Sort order. Default: duration',
                    default: 'duration',
                },
                showSlowest: {
                    type: 'number',
                    description: 'Number of slowest tests to show. Default: 5',
                    default: 5,
                },
            },
            required: ['results'],
        },
    },

    // Storage Tools
    {
        name: 'storage_clear',
        description: 'Clear browser storage (cookies, localStorage, sessionStorage).',
        inputSchema: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    enum: ['cookies', 'localStorage', 'sessionStorage', 'all'],
                    description: 'What to clear',
                },
                origin: {
                    type: 'string',
                    description: 'Origin to clear (for cookies)',
                },
            },
            required: ['type'],
        },
    },
    {
        name: 'storage_get',
        description: 'Get values from browser storage.',
        inputSchema: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    enum: ['cookies', 'localStorage', 'sessionStorage'],
                    description: 'Storage type to read',
                },
                key: {
                    type: 'string',
                    description: 'Specific key to get (omit for all)',
                },
            },
            required: ['type'],
        },
    },
    {
        name: 'storage_set',
        description: 'Set a value in browser storage.',
        inputSchema: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    enum: ['cookies', 'localStorage', 'sessionStorage'],
                    description: 'Storage type',
                },
                key: {
                    type: 'string',
                    description: 'Key to set',
                },
                value: {
                    type: 'string',
                    description: 'Value to set',
                },
                domain: {
                    type: 'string',
                    description: 'Cookie domain',
                },
                path: {
                    type: 'string',
                    description: 'Cookie path',
                },
                expires: {
                    type: 'number',
                    description: 'Cookie expiration (Unix timestamp)',
                },
                httpOnly: {
                    type: 'boolean',
                    description: 'Cookie httpOnly flag',
                },
                secure: {
                    type: 'boolean',
                    description: 'Cookie secure flag',
                },
            },
            required: ['type', 'key', 'value'],
        },
    },

    // Console Tools
    {
        name: 'console_start_capture',
        description: 'Start capturing console messages from the browser.',
        inputSchema: {
            type: 'object',
            properties: {
                types: {
                    type: 'array',
                    items: { type: 'string', enum: ['log', 'info', 'warn', 'error', 'debug'] },
                    description: 'Message types to capture. Default: all except debug',
                },
                maxMessages: {
                    type: 'number',
                    description: 'Max messages to store. Default: 1000',
                    default: 1000,
                },
            },
        },
    },
    {
        name: 'console_stop_capture',
        description: 'Stop capturing console messages and return all captured messages.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'console_get_messages',
        description: 'Get captured console messages without stopping capture.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },

    // Network Tools
    {
        name: 'network_wait',
        description: 'Wait for network to reach a certain state.',
        inputSchema: {
            type: 'object',
            properties: {
                state: {
                    type: 'string',
                    enum: ['load', 'domcontentloaded', 'networkidle'],
                    description: 'State to wait for. Default: networkidle',
                    default: 'networkidle',
                },
                timeout: {
                    type: 'number',
                    description: 'Timeout in ms. Default: 30000',
                    default: 30000,
                },
            },
        },
    },
    {
        name: 'network_mock',
        description: 'Mock network requests matching a URL pattern.',
        inputSchema: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'URL pattern to match (glob or regex)',
                },
                response: {
                    type: 'object',
                    properties: {
                        status: { type: 'number', description: 'HTTP status code' },
                        headers: { type: 'object', description: 'Response headers' },
                        body: { description: 'Response body (string or object)' },
                        contentType: { type: 'string', description: 'Content-Type header' },
                    },
                    description: 'Mock response to return',
                },
            },
            required: ['url', 'response'],
        },
    },
    {
        name: 'network_unmock',
        description: 'Remove network mocks.',
        inputSchema: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'URL pattern to unmock (omit for all)',
                },
            },
        },
    },

    // Screenshot Comparison
    {
        name: 'screenshot_compare',
        description: 'Compare two screenshots (pixel-based, non-AI). For AI visual comparison, use Premium.',
        inputSchema: {
            type: 'object',
            properties: {
                baseline: {
                    type: 'string',
                    description: 'Path to baseline image or base64 data',
                },
                current: {
                    type: 'string',
                    description: 'Path to current image or base64 data',
                },
                threshold: {
                    type: 'number',
                    description: 'Allowed difference ratio (0-1). Default: 0.01 (1%)',
                    default: 0.01,
                },
                outputDiff: {
                    type: 'string',
                    description: 'Path to save diff image',
                },
            },
            required: ['baseline', 'current'],
        },
    },

    // Accessibility Check (Basic)
    {
        name: 'a11y_check_basic',
        description: 'Run basic accessibility checks (rule-based, non-AI). For comprehensive WCAG auditing with AI explanations, use Premium.',
        inputSchema: {
            type: 'object',
            properties: {
                scope: {
                    type: 'string',
                    description: 'CSS selector to limit check scope',
                },
                rules: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['images', 'forms', 'headings', 'links', 'contrast', 'keyboard', 'language', 'landmarks', 'all'],
                    },
                    description: 'Rule sets to run. Default: all',
                },
            },
        },
    },

    // Selector Stability Score
    {
        name: 'selector_stability_score',
        description: 'Score a selector\'s reliability (0-100) based on heuristics. Identifies fragile patterns like dynamic classes, positional indexes, and deep nesting.',
        inputSchema: {
            type: 'object',
            properties: {
                selector: {
                    type: 'string',
                    description: 'The CSS selector to analyze',
                },
            },
            required: ['selector'],
        },
    },

    // Test Flaky Detection
    {
        name: 'test_flaky_detect',
        description: 'Analyze test run history to detect flaky tests. Identifies tests that pass and fail inconsistently.',
        inputSchema: {
            type: 'object',
            properties: {
                testHistory: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            testId: { type: 'string' },
                            testName: { type: 'string' },
                            runs: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        runId: { type: 'string' },
                                        status: { type: 'string', enum: ['passed', 'failed', 'skipped'] },
                                        duration: { type: 'number' },
                                        timestamp: { type: 'string' },
                                        error: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                    description: 'Array of test run histories',
                },
                minRuns: {
                    type: 'number',
                    description: 'Minimum runs needed to detect flakiness. Default: 5',
                    default: 5,
                },
                flakynessThreshold: {
                    type: 'number',
                    description: 'Inconsistency rate to consider flaky (0-1). Default: 0.1',
                    default: 0.1,
                },
            },
            required: ['testHistory'],
        },
    },

    // Test Prioritization
    {
        name: 'test_prioritize',
        description: 'Score and rank tests by priority based on failure rate, recent failures, execution time, and more.',
        inputSchema: {
            type: 'object',
            properties: {
                testHistory: {
                    type: 'array',
                    description: 'Array of test run histories (same format as test_flaky_detect)',
                },
                weights: {
                    type: 'object',
                    properties: {
                        failureRate: { type: 'number', description: 'Weight for failure rate (0-1)' },
                        recentFailures: { type: 'number', description: 'Weight for recent failures (0-1)' },
                        executionTime: { type: 'number', description: 'Weight for fast execution (0-1)' },
                        stability: { type: 'number', description: 'Weight for stability (0-1)' },
                    },
                    description: 'Custom priority weights',
                },
            },
            required: ['testHistory'],
        },
    },

    // Test Deduplication
    {
        name: 'test_deduplicate',
        description: 'Find potentially redundant tests based on action similarity using Jaccard similarity.',
        inputSchema: {
            type: 'object',
            properties: {
                tests: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            steps: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        action: { type: 'string' },
                                        selector: { type: 'string' },
                                        value: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                    description: 'Array of tests with their steps',
                },
                similarityThreshold: {
                    type: 'number',
                    description: 'Jaccard similarity threshold (0-1). Default: 0.8',
                    default: 0.8,
                },
            },
            required: ['tests'],
        },
    },

    // Coverage Gaps
    {
        name: 'test_coverage_gaps',
        description: 'Analyze tests to find potential coverage gaps in authentication, forms, navigation, error handling, and more.',
        inputSchema: {
            type: 'object',
            properties: {
                tests: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            steps: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        action: { type: 'string' },
                                        selector: { type: 'string' },
                                        value: { type: 'string' },
                                        url: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                    description: 'Array of tests with their steps',
                },
                categories: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['authentication', 'forms', 'navigation', 'data', 'errors', 'accessibility', 'security', 'performance'],
                    },
                    description: 'Categories to check. Default: all',
                },
            },
            required: ['tests'],
        },
    },

    // Performance Analyze
    {
        name: 'performance_analyze',
        description: 'Analyze page performance metrics (LCP, FCP, CLS, TTFB) against Web Vitals thresholds.',
        inputSchema: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'Optional URL to navigate to before measuring',
                },
                waitForLoad: {
                    type: 'boolean',
                    description: 'Wait for full page load. Default: true',
                    default: true,
                },
            },
        },
    },

    // Performance Regression
    {
        name: 'performance_regression',
        description: 'Detect performance regressions by comparing baseline and current metrics with statistical analysis.',
        inputSchema: {
            type: 'object',
            properties: {
                baseline: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            lcp: { type: 'number' },
                            fcp: { type: 'number' },
                            cls: { type: 'number' },
                            ttfb: { type: 'number' },
                            tti: { type: 'number' },
                            tbt: { type: 'number' },
                        },
                    },
                    description: 'Array of baseline metric runs',
                },
                current: {
                    type: 'array',
                    items: {
                        type: 'object',
                    },
                    description: 'Array of current metric runs (same format as baseline)',
                },
                thresholds: {
                    type: 'object',
                    properties: {
                        percentageThreshold: { type: 'number', description: 'Percentage change to flag. Default: 10' },
                        absoluteThreshold: { type: 'number', description: 'Absolute ms change to flag. Default: 100' },
                    },
                    description: 'Regression detection thresholds',
                },
            },
            required: ['baseline', 'current'],
        },
    },

    // Performance Budget
    {
        name: 'performance_budget_check',
        description: 'Check if current page performance meets defined budgets for each metric.',
        inputSchema: {
            type: 'object',
            properties: {
                budget: {
                    type: 'object',
                    properties: {
                        lcp: { type: 'number', description: 'Max LCP in ms' },
                        fcp: { type: 'number', description: 'Max FCP in ms' },
                        cls: { type: 'number', description: 'Max CLS score' },
                        ttfb: { type: 'number', description: 'Max TTFB in ms' },
                        tti: { type: 'number', description: 'Max TTI in ms' },
                        tbt: { type: 'number', description: 'Max TBT in ms' },
                        resourceSize: { type: 'number', description: 'Max total resource size in bytes' },
                        requestCount: { type: 'number', description: 'Max request count' },
                    },
                    description: 'Performance budget limits',
                },
                url: {
                    type: 'string',
                    description: 'Optional URL to navigate to',
                },
            },
            required: ['budget'],
        },
    },

    // Data Generation
    {
        name: 'data_generate',
        description: 'Generate realistic test data (names, emails, phones, addresses, etc.) using built-in patterns.',
        inputSchema: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    enum: ['name', 'firstName', 'lastName', 'email', 'phone', 'address', 'city', 'state', 'zip', 'country', 'company', 'jobTitle', 'paragraph', 'sentence', 'word', 'uuid', 'date', 'time', 'datetime', 'boolean', 'number', 'float', 'url', 'ipv4', 'ipv6', 'color', 'hexColor', 'creditCard', 'ssn', 'username', 'password'],
                    description: 'Type of data to generate',
                },
                count: {
                    type: 'number',
                    description: 'Number of values to generate. Default: 1',
                    default: 1,
                },
                options: {
                    type: 'object',
                    properties: {
                        locale: { type: 'string', description: 'Locale for data generation' },
                        min: { type: 'number', description: 'Min value for numbers' },
                        max: { type: 'number', description: 'Max value for numbers' },
                        length: { type: 'number', description: 'Length for strings' },
                    },
                    description: 'Type-specific options',
                },
            },
            required: ['type'],
        },
    },

    // Edge Case Generation
    {
        name: 'data_edge_cases',
        description: 'Generate edge case values for testing (SQL injection, XSS, boundary values, unicode, etc.).',
        inputSchema: {
            type: 'object',
            properties: {
                category: {
                    type: 'string',
                    enum: ['sql_injection', 'xss', 'path_traversal', 'command_injection', 'boundary', 'unicode', 'format', 'empty', 'all'],
                    description: 'Category of edge cases. Default: all',
                    default: 'all',
                },
                limit: {
                    type: 'number',
                    description: 'Max cases per category. Default: 10',
                    default: 10,
                },
            },
        },
    },

    // Generate from Schema
    {
        name: 'data_from_schema',
        description: 'Generate test data from a JSON Schema definition.',
        inputSchema: {
            type: 'object',
            properties: {
                schema: {
                    type: 'object',
                    description: 'JSON Schema object defining the data structure',
                },
                count: {
                    type: 'number',
                    description: 'Number of instances to generate. Default: 1',
                    default: 1,
                },
            },
            required: ['schema'],
        },
    },

    // Security Scan
    {
        name: 'security_scan',
        description: 'Run OWASP-based security checks on the page (headers, cookies, forms, XSS patterns, sensitive data exposure).',
        inputSchema: {
            type: 'object',
            properties: {
                categories: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['security-headers', 'cookies', 'forms', 'xss', 'sensitive-data', 'mixed-content', 'information-disclosure', 'authentication', 'all'],
                    },
                    description: 'Security check categories. Default: all',
                },
                url: {
                    type: 'string',
                    description: 'Optional URL to navigate to before scanning',
                },
            },
        },
    },

    // Test Suite Management
    {
        name: 'test_suite_start',
        description: 'Start a new test suite for organizing test results.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Name of the test suite',
                },
                environment: {
                    type: 'object',
                    properties: {
                        browser: { type: 'string', description: 'Browser name' },
                        viewport: {
                            type: 'object',
                            properties: {
                                width: { type: 'number' },
                                height: { type: 'number' },
                            },
                        },
                        baseUrl: { type: 'string', description: 'Base URL' },
                    },
                    description: 'Test environment info',
                },
            },
            required: ['name'],
        },
    },
    {
        name: 'test_suite_add_result',
        description: 'Add a test result to the current suite.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Test name',
                },
                status: {
                    type: 'string',
                    enum: ['passed', 'failed', 'skipped'],
                    description: 'Test status',
                },
                duration: {
                    type: 'number',
                    description: 'Test duration in ms',
                },
                error: {
                    type: 'string',
                    description: 'Error message if failed',
                },
                screenshot: {
                    type: 'string',
                    description: 'Path to failure screenshot',
                },
            },
            required: ['name', 'status', 'duration'],
        },
    },
    {
        name: 'test_suite_end',
        description: 'End the current test suite and get results.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
];

// ============================================================================
// Tool Handler
// ============================================================================

export async function handleFreeToolCall(
    name: string,
    args: Record<string, unknown>,
    page: Page | null
): Promise<{ content: Array<{ type: string; text?: string }> } | null> {
    switch (name) {
        // Assertion handlers
        case 'assert_equals': {
            const result = assertEquals({
                actual: args.actual,
                expected: args.expected,
                message: args.message as string | undefined,
                strict: args.strict !== false,
            });
            return {
                content: [{ type: 'text', text: formatAssertionResult(result) }],
            };
        }

        case 'assert_contains': {
            const result = assertContains({
                text: args.text as string,
                substring: args.substring as string,
                caseSensitive: args.caseSensitive as boolean | undefined,
                message: args.message as string | undefined,
            });
            return {
                content: [{ type: 'text', text: formatAssertionResult(result) }],
            };
        }

        case 'assert_visible': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: '❌ Browser not launched. Call browser_launch first.' }],
                };
            }
            const result = await assertVisible({
                page,
                selector: args.selector as string,
                timeout: args.timeout as number | undefined,
                message: args.message as string | undefined,
            });
            return {
                content: [{ type: 'text', text: formatAssertionResult(result) }],
            };
        }

        case 'assert_exists': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: '❌ Browser not launched. Call browser_launch first.' }],
                };
            }
            const result = await assertExists({
                page,
                selector: args.selector as string,
                timeout: args.timeout as number | undefined,
                message: args.message as string | undefined,
            });
            return {
                content: [{ type: 'text', text: formatAssertionResult(result) }],
            };
        }

        case 'assert_count': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: '❌ Browser not launched. Call browser_launch first.' }],
                };
            }
            const result = await assertCount({
                page,
                selector: args.selector as string,
                expected: args.expected as number,
                operator: args.operator as 'equals' | 'greaterThan' | 'lessThan' | 'greaterOrEqual' | 'lessOrEqual' | undefined,
                message: args.message as string | undefined,
            });
            return {
                content: [{ type: 'text', text: formatAssertionResult(result) }],
            };
        }

        case 'assert_url': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: '❌ Browser not launched. Call browser_launch first.' }],
                };
            }
            const result = await assertUrl({
                page,
                expected: args.expected as string,
                matchType: args.matchType as 'exact' | 'contains' | 'startsWith' | 'endsWith' | 'regex' | undefined,
                message: args.message as string | undefined,
            });
            return {
                content: [{ type: 'text', text: formatAssertionResult(result) }],
            };
        }

        case 'assert_title': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: '❌ Browser not launched. Call browser_launch first.' }],
                };
            }
            const result = await assertTitle({
                page,
                expected: args.expected as string,
                matchType: args.matchType as 'exact' | 'contains' | 'startsWith' | 'endsWith' | 'regex' | undefined,
                message: args.message as string | undefined,
            });
            return {
                content: [{ type: 'text', text: formatAssertionResult(result) }],
            };
        }

        case 'assert_attribute': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: '❌ Browser not launched. Call browser_launch first.' }],
                };
            }
            const result = await assertAttribute({
                page,
                selector: args.selector as string,
                attribute: args.attribute as string,
                expected: args.expected as string | undefined,
                matchType: args.matchType as 'exact' | 'contains' | 'exists' | undefined,
                message: args.message as string | undefined,
            });
            return {
                content: [{ type: 'text', text: formatAssertionResult(result) }],
            };
        }

        // Selector handlers
        case 'selector_suggest': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: '❌ Browser not launched. Call browser_launch first.' }],
                };
            }
            const result = await selectorSuggest({
                page,
                description: args.description as string | undefined,
                near: args.near as string | undefined,
            });
            return {
                content: [{ type: 'text', text: formatSelectorResult(result) }],
            };
        }

        case 'selector_validate': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: '❌ Browser not launched. Call browser_launch first.' }],
                };
            }
            const result = await selectorValidate({
                page,
                selector: args.selector as string,
                expectUnique: args.expectUnique !== false,
            });
            const icon = result.valid ? '✅' : '❌';
            return {
                content: [{ type: 'text', text: `${icon} ${result.message}${result.suggestion ? `\n💡 ${result.suggestion}` : ''}` }],
            };
        }

        case 'selector_alternatives': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: '❌ Browser not launched. Call browser_launch first.' }],
                };
            }
            const result = await selectorAlternatives({
                page,
                selector: args.selector as string,
                maxAlternatives: args.maxAlternatives as number | undefined,
            });
            return {
                content: [{ type: 'text', text: formatSelectorResult(result) }],
            };
        }

        // Test recorder handlers
        case 'test_record_start': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: '❌ Browser not launched. Call browser_launch first.' }],
                };
            }
            const result = await testRecordStart({
                page,
                name: args.name as string | undefined,
                baseUrl: args.baseUrl as string | undefined,
            });
            return {
                content: [{ type: 'text', text: `🎬 ${result.message}\nRecording ID: ${result.recording.id}` }],
            };
        }

        case 'test_record_stop': {
            const result = testRecordStop();
            return {
                content: [{ type: 'text', text: `🛑 ${result.message}\n\n${JSON.stringify(result.recording, null, 2)}` }],
            };
        }

        case 'test_replay': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: '❌ Browser not launched. Call browser_launch first.' }],
                };
            }
            const result = await testReplay({
                page,
                recording: args.recording as any,
                speed: args.speed as number | undefined,
                stopOnError: args.stopOnError as boolean | undefined,
                timeout: args.timeout as number | undefined,
            });
            const icon = result.success ? '✅' : '❌';
            let output = `${icon} ${result.message}`;
            if (result.errors.length > 0) {
                output += '\n\nErrors:';
                for (const err of result.errors) {
                    output += `\n- ${err.action.type}: ${err.error}`;
                }
            }
            return {
                content: [{ type: 'text', text: output }],
            };
        }

        case 'test_export': {
            // Use provided recording or fall back to last completed recording
            const recording = args.recording || getLastRecording();
            if (!recording) {
                return {
                    content: [{ type: 'text', text: '❌ No recording available. Start and stop a recording first, or provide a recording object.' }],
                };
            }
            const result = testExport({
                recording: recording as any,
                format: (args.format as 'playwright' | 'cypress' | 'puppeteer' | 'mcp') || 'playwright',
                includeAssertions: args.includeAssertions as boolean | undefined,
            });
            return {
                content: [{ type: 'text', text: `# Exported to ${result.format} (${result.lineCount} lines)\n\n\`\`\`${result.format === 'mcp' ? 'yaml' : 'javascript'}\n${result.code}\n\`\`\`` }],
            };
        }

        // Reporting handlers
        case 'report_summary': {
            const result = reportSummary({
                results: args.results as any,
                format: args.format as 'text' | 'markdown' | 'json' | undefined,
            });
            return {
                content: [{ type: 'text', text: result.output }],
            };
        }

        case 'report_failures': {
            const result = reportFailures({
                results: args.results as any,
                includeScreenshots: args.includeScreenshots as boolean | undefined,
                format: args.format as 'text' | 'markdown' | 'json' | undefined,
            });
            return {
                content: [{ type: 'text', text: result.output }],
            };
        }

        case 'report_timing': {
            const result = reportTiming({
                results: args.results as any,
                sortBy: args.sortBy as 'name' | 'duration' | 'status' | undefined,
                showSlowest: args.showSlowest as number | undefined,
            });
            return {
                content: [{ type: 'text', text: result.output }],
            };
        }

        // Storage handlers
        case 'storage_clear': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: '❌ Browser not launched. Call browser_launch first.' }],
                };
            }
            const result = await storageClear({
                page,
                type: args.type as 'cookies' | 'localStorage' | 'sessionStorage' | 'all',
                origin: args.origin as string | undefined,
            });
            return {
                content: [{ type: 'text', text: `✅ ${result.message}` }],
            };
        }

        case 'storage_get': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: '❌ Browser not launched. Call browser_launch first.' }],
                };
            }
            const result = await storageGet({
                page,
                type: args.type as 'cookies' | 'localStorage' | 'sessionStorage',
                key: args.key as string | undefined,
            });
            return {
                content: [{ type: 'text', text: `📦 ${result.type} (${result.count} items):\n${JSON.stringify(result.data, null, 2)}` }],
            };
        }

        case 'storage_set': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: '❌ Browser not launched. Call browser_launch first.' }],
                };
            }
            const result = await storageSet({
                page,
                type: args.type as 'cookies' | 'localStorage' | 'sessionStorage',
                key: args.key as string,
                value: args.value as string,
                domain: args.domain as string | undefined,
                path: args.path as string | undefined,
                expires: args.expires as number | undefined,
                httpOnly: args.httpOnly as boolean | undefined,
                secure: args.secure as boolean | undefined,
            });
            const icon = result.success ? '✅' : '❌';
            return {
                content: [{ type: 'text', text: `${icon} ${result.message}` }],
            };
        }

        // Console handlers
        case 'console_start_capture': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: '❌ Browser not launched. Call browser_launch first.' }],
                };
            }
            consoleStartCapture({
                page,
                types: args.types as ('log' | 'info' | 'warn' | 'error' | 'debug')[] | undefined,
                maxMessages: args.maxMessages as number | undefined,
            });
            return {
                content: [{ type: 'text', text: '🎤 Console capture started' }],
            };
        }

        case 'console_stop_capture': {
            const result = consoleStopCapture();
            return {
                content: [{ type: 'text', text: `🛑 Console capture stopped\n\nCaptured ${result.count} messages (${result.errors} errors, ${result.warnings} warnings)\n\n${JSON.stringify(result.messages, null, 2)}` }],
            };
        }

        case 'console_get_messages': {
            const result = consoleGetMessages();
            return {
                content: [{ type: 'text', text: `📋 Console messages (${result.count} total, ${result.errors} errors, ${result.warnings} warnings)\n\n${JSON.stringify(result.messages, null, 2)}` }],
            };
        }

        // Network handlers
        case 'network_wait': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: '❌ Browser not launched. Call browser_launch first.' }],
                };
            }
            const result = await networkWait({
                page,
                state: args.state as 'load' | 'domcontentloaded' | 'networkidle' | undefined,
                timeout: args.timeout as number | undefined,
            });
            const icon = result.success ? '✅' : '❌';
            return {
                content: [{ type: 'text', text: `${icon} ${result.message} (${result.duration}ms)` }],
            };
        }

        case 'network_mock': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: '❌ Browser not launched. Call browser_launch first.' }],
                };
            }
            const result = await networkMock({
                page,
                url: args.url as string,
                response: args.response as any,
            });
            const icon = result.success ? '✅' : '❌';
            return {
                content: [{ type: 'text', text: `${icon} ${result.message}` }],
            };
        }

        case 'network_unmock': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: '❌ Browser not launched. Call browser_launch first.' }],
                };
            }
            const result = await networkUnmock(page, args.url as string | undefined);
            const icon = result.success ? '✅' : '❌';
            return {
                content: [{ type: 'text', text: `${icon} ${result.message}` }],
            };
        }

        // Screenshot comparison
        case 'screenshot_compare': {
            const result = await screenshotCompare({
                baseline: args.baseline as string,
                current: args.current as string,
                threshold: args.threshold as number | undefined,
                outputDiff: args.outputDiff as string | undefined,
            });
            const icon = result.match ? '✅' : '❌';
            return {
                content: [{ type: 'text', text: `${icon} ${result.message}\n\nDiff: ${result.diffPercentage}% (${result.diffPixels}/${result.totalPixels} pixels)${result.diffImage ? `\nDiff saved to: ${result.diffImage}` : ''}` }],
            };
        }

        // Accessibility check
        case 'a11y_check_basic': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: '❌ Browser not launched. Call browser_launch first.' }],
                };
            }
            const result = await a11yCheckBasic({
                page,
                scope: args.scope as string | undefined,
                rules: args.rules as any[] | undefined,
            });
            return {
                content: [{ type: 'text', text: formatA11yResult(result) }],
            };
        }

        // Selector stability score
        case 'selector_stability_score': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: '❌ Browser not launched. Call browser_launch first.' }],
                };
            }
            const result = await selectorStabilityScore({
                page,
                selector: args.selector as string,
            });
            return {
                content: [{ type: 'text', text: formatStabilityResult(result) }],
            };
        }

        // Test flaky detection
        case 'test_flaky_detect': {
            const result = detectFlakyTests({
                history: args.testHistory as any[],
                minRuns: args.minRuns as number | undefined,
                threshold: args.flakynessThreshold as number | undefined,
            });
            const flakyCount = result.flakyTests.filter(t => t.isFlaky).length;
            let output = `🔍 Flaky Test Analysis\n\n`;
            output += `Analyzed: ${result.totalTests} tests\n`;
            output += `Stable: ${result.stableTests} | Flaky: ${flakyCount}\n\n`;
            if (flakyCount > 0) {
                output += `**Flaky Tests:**\n`;
                for (const test of result.flakyTests.filter(t => t.isFlaky)) {
                    output += `- ${test.testName}: ${test.flakinessScore.toFixed(1)}% flaky (${test.passCount}/${test.totalRuns} passed)\n`;
                }
            }
            return {
                content: [{ type: 'text', text: output }],
            };
        }

        // Test prioritization
        case 'test_prioritize': {
            const result = prioritizeTests({
                history: args.testHistory as any[],
                criticalPaths: args.criticalPaths as string[] | undefined,
            });
            let output = `📊 Test Priority Ranking\n\n`;
            for (let i = 0; i < Math.min(10, result.prioritized.length); i++) {
                const test = result.prioritized[i];
                output += `${i + 1}. ${test.testName} (score: ${test.priorityScore.toFixed(1)}) [${test.recommendation}]\n`;
                output += `   Failure rate: ${(test.factors.failureRate * 100).toFixed(1)}%\n`;
            }
            return {
                content: [{ type: 'text', text: output }],
            };
        }

        // Test deduplication
        case 'test_deduplicate': {
            const result = deduplicateTests({
                tests: args.tests as any[],
                threshold: args.similarityThreshold as number | undefined,
            });
            let output = `🔄 Test Deduplication Analysis\n\n`;
            output += `Unique tests: ${result.uniqueTests}\n`;
            output += `Potential duplicates: ${result.duplicates.length} pairs\n\n`;
            if (result.duplicates.length > 0) {
                output += `**Similar Test Pairs:**\n`;
                for (const pair of result.duplicates) {
                    output += `- "${pair.testName1}" ↔ "${pair.testName2}" (${pair.similarityScore.toFixed(0)}% similar) [${pair.recommendation}]\n`;
                }
            }
            return {
                content: [{ type: 'text', text: output }],
            };
        }

        // Coverage gaps
        case 'test_coverage_gaps': {
            const result = findCoverageGaps({
                tests: args.tests as any[],
            });
            let output = `📋 Coverage Gap Analysis\n\n`;
            output += `Coverage score: ${result.coverageScore}/100\n`;
            output += `Gaps found: ${result.gaps.length}\n\n`;
            if (result.gaps.length > 0) {
                for (const gap of result.gaps) {
                    const icon = gap.severity === 'high' ? '🔴' : gap.severity === 'medium' ? '🟡' : '🟢';
                    output += `${icon} **${gap.area}** (${gap.severity})\n`;
                    output += `   ${gap.description}\n`;
                    if (gap.suggestedTests.length > 0) {
                        output += `   Suggested tests: ${gap.suggestedTests.join(', ')}\n`;
                    }
                    output += '\n';
                }
            }
            return {
                content: [{ type: 'text', text: output }],
            };
        }

        // Performance analyze
        case 'performance_analyze': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: '❌ Browser not launched. Call browser_launch first.' }],
                };
            }
            const result = await performanceAnalyze({
                page,
                url: args.url as string | undefined,
                waitForLoad: args.waitForLoad !== false,
            });
            let output = `⚡ Performance Analysis\n\n`;
            output += `Overall: ${result.scores.overall}/100 (Grade: ${result.grade})\n\n`;
            output += `**Core Web Vitals:**\n`;
            if (result.metrics.lcp !== null) output += `LCP: ${result.metrics.lcp}ms (score: ${result.scores.lcp})\n`;
            if (result.metrics.fcp !== null) output += `FCP: ${result.metrics.fcp}ms (score: ${result.scores.fcp})\n`;
            if (result.metrics.cls !== null) output += `CLS: ${result.metrics.cls} (score: ${result.scores.cls})\n`;
            if (result.metrics.ttfb !== null) output += `TTFB: ${result.metrics.ttfb}ms (score: ${result.scores.ttfb})\n`;
            if (result.issues.length > 0) {
                output += `\n**Issues:**\n`;
                for (const issue of result.issues) {
                    const icon = issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵';
                    output += `${icon} ${issue.metric}: ${issue.suggestion}\n`;
                }
            }
            return {
                content: [{ type: 'text', text: output }],
            };
        }

        // Performance regression
        case 'performance_regression': {
            const result = detectPerformanceRegression({
                baseline: args.baseline as any[],
                current: args.current as any[],
                thresholds: args.thresholds as any,
            });
            const icon = result.hasRegression ? '❌' : '✅';
            let output = `${icon} Performance Regression Check\n\n`;
            output += `Status: ${result.hasRegression ? 'REGRESSION DETECTED' : 'No regression'}\n\n`;
            if (result.regressions.length > 0) {
                output += `**Regressions:**\n`;
                for (const reg of result.regressions) {
                    output += `- ${reg.metric}: ${reg.baselineAvg.toFixed(0)} → ${reg.currentAvg.toFixed(0)} (${reg.change > 0 ? '+' : ''}${reg.change.toFixed(1)}%) [${reg.severity}]\n`;
                }
            }
            if (result.improvements.length > 0) {
                output += `\n**Improvements:**\n`;
                for (const imp of result.improvements) {
                    output += `- ${imp.metric}: ${imp.baselineAvg.toFixed(0)} → ${imp.currentAvg.toFixed(0)} (${imp.change.toFixed(1)}%)\n`;
                }
            }
            return {
                content: [{ type: 'text', text: output }],
            };
        }

        // Performance budget check
        case 'performance_budget_check': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: '❌ Browser not launched. Call browser_launch first.' }],
                };
            }
            // First collect metrics, then check budget
            const perf = await performanceAnalyze({ page, url: args.url as string | undefined });
            const result = checkPerformanceBudget({
                metrics: perf.metrics,
                budget: args.budget as any,
            });
            const icon = result.passed ? '✅' : '❌';
            let output = `${icon} Performance Budget Check\n\n`;
            output += `Status: ${result.passed ? 'PASSED' : 'FAILED'} (Score: ${result.score}%)\n\n`;
            if (result.violations.length > 0) {
                output += `**Violations:**\n`;
                for (const v of result.violations) {
                    output += `❌ ${v.metric}: ${v.actual} (budget: ${v.budget}, +${v.overage.toFixed(1)}% over)\n`;
                }
            }
            if (result.passing.length > 0) {
                output += `\n**Passing:**\n`;
                for (const p of result.passing) {
                    output += `✅ ${p}\n`;
                }
            }
            return {
                content: [{ type: 'text', text: output }],
            };
        }

        // Data generation
        case 'data_generate': {
            const result = generateData({
                type: args.type as any,
                count: args.count as number | undefined,
                options: args.options as any,
            });
            return {
                content: [{ type: 'text', text: `📝 Generated ${result.count} ${result.type} value(s):\n\n${JSON.stringify(result.data, null, 2)}` }],
            };
        }

        // Edge case generation
        case 'data_edge_cases': {
            const result = generateEdgeCases({
                type: (args.category || 'string') as any,
                includeValid: true,
                includeMalicious: true,
            });
            let output = `🔧 Edge Cases Generated\n\n`;
            output += `Type: ${result.type}\n`;
            output += `Total cases: ${result.count}\n\n`;
            for (const c of result.cases.slice(0, 10)) {
                const valueStr = String(c.value);
                const preview = valueStr.length > 50 ? valueStr.substring(0, 50) + '...' : valueStr;
                output += `- [${c.category}] ${c.description}: \`${preview}\`\n`;
            }
            if (result.cases.length > 10) {
                output += `\n... and ${result.cases.length - 10} more cases\n`;
            }
            return {
                content: [{ type: 'text', text: output }],
            };
        }

        // Generate from schema
        case 'data_from_schema': {
            const result = generateFromSchema({
                schema: args.schema as any,
                count: args.count as number | undefined,
            });
            return {
                content: [{ type: 'text', text: `📋 Generated ${result.count} instance(s) from schema:\n\n${JSON.stringify(result.data, null, 2)}` }],
            };
        }

        // Security scan
        case 'security_scan': {
            if (!page) {
                return {
                    content: [{ type: 'text', text: '❌ Browser not launched. Call browser_launch first.' }],
                };
            }
            const result = await securityScan({
                page,
                checks: args.categories as any[] | undefined,
            });
            return {
                content: [{ type: 'text', text: formatSecurityResult(result) }],
            };
        }

        // Test suite management
        case 'test_suite_start': {
            startTestSuite(args.name as string, args.environment as any);

            // Create run in observability store for dashboard
            const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            activeObsRunId = runId;

            try {
                const store = await getObservabilityStore('./observability-data');
                await store.createRun({
                    runId,
                    projectId: 'default',
                    tenantId: 'mcp-free-tier',
                    origin: 'human_api',
                    status: 'running',
                    startedAt: new Date(),
                    metadata: {
                        suiteName: args.name,
                        environment: args.environment,
                    },
                });

                // Add initial log entry
                await store.addLog({
                    id: `log_${Date.now()}`,
                    runId,
                    timestamp: new Date(),
                    type: 'step',
                    level: 'info',
                    message: `Test suite "${args.name}" started`,
                });
            } catch (e) {
                // Silently continue if store fails
                console.error('[Obs] Failed to create run:', e);
            }

            return {
                content: [{ type: 'text', text: `🧪 Test suite "${args.name}" started\nRun ID: ${runId}` }],
            };
        }

        case 'test_suite_add_result': {
            addTestResult({
                name: args.name as string,
                status: args.status as 'passed' | 'failed' | 'skipped',
                duration: args.duration as number,
                error: args.error as string | undefined,
                screenshot: args.screenshot as string | undefined,
            });

            // Log to observability store
            if (activeObsRunId) {
                try {
                    const store = await getObservabilityStore('./observability-data');
                    const level = args.status === 'passed' ? 'info' : args.status === 'failed' ? 'error' : 'info';
                    await store.addLog({
                        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                        runId: activeObsRunId,
                        timestamp: new Date(),
                        type: 'step',
                        level,
                        message: `Test "${args.name}": ${args.status} (${args.duration}ms)${args.error ? ` - ${args.error}` : ''}`,
                        data: {
                            testName: args.name,
                            status: args.status,
                            duration: args.duration,
                            error: args.error,
                        },
                    });
                } catch (e) {
                    // Silently continue
                }
            }

            const icon = args.status === 'passed' ? '✅' : args.status === 'failed' ? '❌' : '⏭️';
            return {
                content: [{ type: 'text', text: `${icon} Added result: ${args.name} (${args.status})` }],
            };
        }

        case 'test_suite_end': {
            const results = endTestSuite();
            const passed = results.tests.filter(t => t.status === 'passed').length;
            const failed = results.tests.filter(t => t.status === 'failed').length;
            const skipped = results.tests.filter(t => t.status === 'skipped').length;
            const totalDuration = results.tests.reduce((sum, t) => sum + t.duration, 0);

            // Update observability store
            if (activeObsRunId) {
                try {
                    const store = await getObservabilityStore('./observability-data');

                    // Add completion log
                    await store.addLog({
                        id: `log_${Date.now()}`,
                        runId: activeObsRunId,
                        timestamp: new Date(),
                        type: 'step',
                        level: failed > 0 ? 'error' : 'info',
                        message: `Test suite "${results.name}" completed: ${passed}/${results.tests.length} passed`,
                    });

                    // Update run status
                    await store.updateRun(activeObsRunId, {
                        status: failed > 0 ? 'failed' : 'passed',
                        completedAt: new Date(),
                        duration: totalDuration,
                        summary: {
                            total: results.tests.length,
                            passed,
                            failed,
                            skipped,
                        },
                    });

                    // Flush all data
                    await store.flushAll(activeObsRunId);
                } catch (e) {
                    console.error('[Obs] Failed to update run:', e);
                }

                activeObsRunId = null;
            }

            return {
                content: [{ type: 'text', text: `🏁 Test suite "${results.name}" completed\n\n✅ ${passed} passed | ❌ ${failed} failed | ${results.tests.length} total\n\n${JSON.stringify(results, null, 2)}` }],
            };
        }

        default:
            return null; // Not a free tier tool
    }
}

// Export tool names for easy checking
export const freeToolNames = new Set(freeToolDefinitions.map(t => t.name));
