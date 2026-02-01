/**
 * MCP Tester Module
 *
 * Provides tools for testing MCP servers:
 * - Launch and manage MCP server processes
 * - Connect as client and communicate via JSON-RPC
 * - Invoke tools and validate responses
 * - Generate test suites
 *
 * Architecture:
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                       BarrHawk E2E MCP                         │
 * │  ┌─────────────────────────────────────────────────────────┐   │
 * │  │                    MCP Tester Module                     │   │
 * │  │                                                          │   │
 * │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │   │
 * │  │  │ Process Mgr  │  │ JSON-RPC     │  │ Schema       │   │   │
 * │  │  │              │  │ Client       │  │ Validator    │   │   │
 * │  │  │ - spawn      │  │              │  │              │   │   │
 * │  │  │ - kill       │  │ - request    │  │ - validate   │   │   │
 * │  │  │ - monitor    │  │ - response   │  │ - report     │   │   │
 * │  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │   │
 * │  │         │                 │                 │           │   │
 * │  │         └─────────────────┴─────────────────┘           │   │
 * │  │                           │                              │   │
 * │  │                    ┌──────┴──────┐                       │   │
 * │  │                    │   stdio     │                       │   │
 * │  │                    │  transport  │                       │   │
 * │  │                    └──────┬──────┘                       │   │
 * │  └───────────────────────────┼──────────────────────────────┘   │
 * │                              │                                   │
 * └──────────────────────────────┼───────────────────────────────────┘
 *                                │
 *                    ┌───────────┴───────────┐
 *                    │                       │
 *           ┌────────┴────────┐    ┌─────────┴────────┐
 *           │  Target MCP #1  │    │  Target MCP #2   │
 *           │   (under test)  │    │   (under test)   │
 *           └─────────────────┘    └──────────────────┘
 */

import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as readline from 'readline';

// Types for MCP protocol
interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: number;
    method: string;
    params?: Record<string, unknown>;
}

interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: number;
    result?: unknown;
    error?: {
        code: number;
        message: string;
        data?: unknown;
    };
}

interface MCPTool {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties?: Record<string, unknown>;
        required?: string[];
    };
}

interface MCPServerInfo {
    name: string;
    version: string;
}

interface MCPInstance {
    id: string;
    process: ChildProcess;
    command: string;
    args: string[];
    startTime: Date;
    status: 'starting' | 'running' | 'stopped' | 'error';
    serverInfo?: MCPServerInfo;
    tools?: MCPTool[];
    pendingRequests: Map<number, {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
        timeout: NodeJS.Timeout;
    }>;
    requestId: number;
    stdout: string[];
    stderr: string[];
}

interface TestResult {
    tool: string;
    input: Record<string, unknown>;
    success: boolean;
    output?: unknown;
    error?: string;
    duration: number;
}

interface TestSuite {
    mcpId: string;
    serverInfo: MCPServerInfo;
    tools: MCPTool[];
    results: TestResult[];
    summary: {
        total: number;
        passed: number;
        failed: number;
        duration: number;
    };
}

// Global registry of running MCP instances
const mcpInstances: Map<string, MCPInstance> = new Map();

// Generate unique ID
function generateId(): string {
    return `mcp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Start an MCP server process
 */
export async function mcpStart(
    command: string,
    args: string[] = [],
    options: {
        cwd?: string;
        env?: Record<string, string>;
        timeout?: number;
    } = {}
): Promise<{ id: string; status: string; error?: string }> {
    const id = generateId();
    const timeout = options.timeout || 10000;

    return new Promise((resolve) => {
        try {
            const proc = spawn(command, args, {
                cwd: options.cwd,
                env: { ...process.env, ...options.env },
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            const instance: MCPInstance = {
                id,
                process: proc,
                command,
                args,
                startTime: new Date(),
                status: 'starting',
                pendingRequests: new Map(),
                requestId: 0,
                stdout: [],
                stderr: [],
            };

            mcpInstances.set(id, instance);

            // Set up line-based reading for JSON-RPC
            const rl = readline.createInterface({
                input: proc.stdout!,
                crlfDelay: Infinity,
            });

            rl.on('line', (line) => {
                instance.stdout.push(line);
                try {
                    const response = JSON.parse(line) as JsonRpcResponse;
                    if (response.id !== undefined) {
                        const pending = instance.pendingRequests.get(response.id);
                        if (pending) {
                            clearTimeout(pending.timeout);
                            instance.pendingRequests.delete(response.id);
                            if (response.error) {
                                pending.reject(new Error(response.error.message));
                            } else {
                                pending.resolve(response.result);
                            }
                        }
                    }
                } catch {
                    // Not JSON, just log output
                }
            });

            proc.stderr?.on('data', (data) => {
                instance.stderr.push(data.toString());
            });

            proc.on('error', (error) => {
                instance.status = 'error';
                resolve({ id, status: 'error', error: error.message });
            });

            proc.on('exit', (code) => {
                instance.status = 'stopped';
                // Clean up pending requests
                for (const [, pending] of instance.pendingRequests) {
                    clearTimeout(pending.timeout);
                    pending.reject(new Error(`Process exited with code ${code}`));
                }
                instance.pendingRequests.clear();
            });

            // Wait a moment for the server to start, then try to initialize
            setTimeout(async () => {
                if (instance.status === 'starting') {
                    try {
                        // Send initialize request
                        const initResult = await sendRequest(instance, 'initialize', {
                            protocolVersion: '2024-11-05',
                            capabilities: {},
                            clientInfo: {
                                name: 'barrhawk-mcp-tester',
                                version: '1.0.0',
                            },
                        }, 5000) as { serverInfo?: MCPServerInfo };

                        instance.serverInfo = initResult?.serverInfo;
                        instance.status = 'running';

                        // Send initialized notification
                        sendNotification(instance, 'notifications/initialized', {});

                        resolve({ id, status: 'running' });
                    } catch (error) {
                        instance.status = 'error';
                        resolve({
                            id,
                            status: 'error',
                            error: `Failed to initialize: ${(error as Error).message}`,
                        });
                    }
                }
            }, 500);

            // Overall timeout
            setTimeout(() => {
                if (instance.status === 'starting') {
                    instance.status = 'error';
                    resolve({ id, status: 'error', error: 'Startup timeout' });
                }
            }, timeout);

        } catch (error) {
            resolve({ id, status: 'error', error: (error as Error).message });
        }
    });
}

/**
 * Send a JSON-RPC request to an MCP instance
 */
function sendRequest(
    instance: MCPInstance,
    method: string,
    params: Record<string, unknown>,
    timeout: number = 30000
): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const id = ++instance.requestId;
        const request: JsonRpcRequest = {
            jsonrpc: '2.0',
            id,
            method,
            params,
        };

        const timeoutHandle = setTimeout(() => {
            instance.pendingRequests.delete(id);
            reject(new Error(`Request timeout: ${method}`));
        }, timeout);

        instance.pendingRequests.set(id, {
            resolve,
            reject,
            timeout: timeoutHandle,
        });

        instance.process.stdin?.write(JSON.stringify(request) + '\n');
    });
}

/**
 * Send a JSON-RPC notification (no response expected)
 */
function sendNotification(
    instance: MCPInstance,
    method: string,
    params: Record<string, unknown>
): void {
    const notification = {
        jsonrpc: '2.0',
        method,
        params,
    };
    instance.process.stdin?.write(JSON.stringify(notification) + '\n');
}

/**
 * Stop an MCP server process
 */
export async function mcpStop(id: string): Promise<{ success: boolean; error?: string }> {
    const instance = mcpInstances.get(id);
    if (!instance) {
        return { success: false, error: `MCP instance not found: ${id}` };
    }

    return new Promise((resolve) => {
        instance.process.on('exit', () => {
            mcpInstances.delete(id);
            resolve({ success: true });
        });

        instance.process.kill('SIGTERM');

        // Force kill after 5 seconds
        setTimeout(() => {
            if (mcpInstances.has(id)) {
                instance.process.kill('SIGKILL');
                mcpInstances.delete(id);
                resolve({ success: true });
            }
        }, 5000);
    });
}

/**
 * List tools from an MCP server
 */
export async function mcpListTools(id: string): Promise<{
    success: boolean;
    tools?: MCPTool[];
    error?: string;
}> {
    const instance = mcpInstances.get(id);
    if (!instance) {
        return { success: false, error: `MCP instance not found: ${id}` };
    }

    if (instance.status !== 'running') {
        return { success: false, error: `MCP instance not running: ${instance.status}` };
    }

    try {
        const result = await sendRequest(instance, 'tools/list', {}) as { tools: MCPTool[] };
        instance.tools = result.tools;
        return { success: true, tools: result.tools };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

/**
 * Invoke a tool on an MCP server
 */
export async function mcpInvoke(
    id: string,
    toolName: string,
    args: Record<string, unknown> = {}
): Promise<{
    success: boolean;
    result?: unknown;
    error?: string;
    duration: number;
}> {
    const startTime = Date.now();
    const instance = mcpInstances.get(id);

    if (!instance) {
        return { success: false, error: `MCP instance not found: ${id}`, duration: 0 };
    }

    if (instance.status !== 'running') {
        return {
            success: false,
            error: `MCP instance not running: ${instance.status}`,
            duration: 0,
        };
    }

    try {
        const result = await sendRequest(instance, 'tools/call', {
            name: toolName,
            arguments: args,
        });

        return {
            success: true,
            result,
            duration: Date.now() - startTime,
        };
    } catch (error) {
        return {
            success: false,
            error: (error as Error).message,
            duration: Date.now() - startTime,
        };
    }
}

/**
 * Validate tool schemas against MCP spec
 */
export function mcpValidateSchema(tools: MCPTool[]): {
    valid: boolean;
    errors: Array<{ tool: string; error: string }>;
} {
    const errors: Array<{ tool: string; error: string }> = [];

    for (const tool of tools) {
        // Check required fields
        if (!tool.name || typeof tool.name !== 'string') {
            errors.push({ tool: tool.name || 'unknown', error: 'Missing or invalid name' });
        }

        if (!tool.description || typeof tool.description !== 'string') {
            errors.push({ tool: tool.name, error: 'Missing or invalid description' });
        }

        if (!tool.inputSchema || typeof tool.inputSchema !== 'object') {
            errors.push({ tool: tool.name, error: 'Missing or invalid inputSchema' });
            continue;
        }

        // Validate inputSchema structure
        if (tool.inputSchema.type !== 'object') {
            errors.push({
                tool: tool.name,
                error: `inputSchema.type must be "object", got "${tool.inputSchema.type}"`,
            });
        }

        // Check properties if defined
        if (tool.inputSchema.properties) {
            if (typeof tool.inputSchema.properties !== 'object') {
                errors.push({ tool: tool.name, error: 'inputSchema.properties must be an object' });
            }
        }

        // Check required array if defined
        if (tool.inputSchema.required) {
            if (!Array.isArray(tool.inputSchema.required)) {
                errors.push({ tool: tool.name, error: 'inputSchema.required must be an array' });
            } else {
                // Verify required fields exist in properties
                const props = tool.inputSchema.properties || {};
                for (const req of tool.inputSchema.required) {
                    if (!(req in props)) {
                        errors.push({
                            tool: tool.name,
                            error: `Required field "${req}" not in properties`,
                        });
                    }
                }
            }
        }

        // Check for valid JSON Schema property definitions
        if (tool.inputSchema.properties) {
            for (const [propName, propSchema] of Object.entries(tool.inputSchema.properties)) {
                if (typeof propSchema !== 'object' || propSchema === null) {
                    errors.push({
                        tool: tool.name,
                        error: `Property "${propName}" has invalid schema`,
                    });
                    continue;
                }

                const schema = propSchema as Record<string, unknown>;
                if (!schema.type && !schema.$ref && !schema.oneOf && !schema.anyOf) {
                    errors.push({
                        tool: tool.name,
                        error: `Property "${propName}" missing type definition`,
                    });
                }
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Run a stress test on an MCP server
 */
export async function mcpStressTest(
    id: string,
    toolName: string,
    args: Record<string, unknown>,
    options: {
        iterations?: number;
        concurrency?: number;
        delayMs?: number;
    } = {}
): Promise<{
    success: boolean;
    results: {
        total: number;
        succeeded: number;
        failed: number;
        avgDuration: number;
        minDuration: number;
        maxDuration: number;
        errors: string[];
    };
}> {
    const iterations = options.iterations || 10;
    const concurrency = options.concurrency || 1;
    const delayMs = options.delayMs || 0;

    const results: Array<{ success: boolean; duration: number; error?: string }> = [];

    // Run in batches based on concurrency
    for (let i = 0; i < iterations; i += concurrency) {
        const batch = [];
        for (let j = 0; j < concurrency && i + j < iterations; j++) {
            batch.push(mcpInvoke(id, toolName, args));
        }

        const batchResults = await Promise.all(batch);
        results.push(...batchResults.map((r) => ({
            success: r.success,
            duration: r.duration,
            error: r.error,
        })));

        if (delayMs > 0 && i + concurrency < iterations) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }

    const succeeded = results.filter((r) => r.success).length;
    const durations = results.map((r) => r.duration);
    const errors = results.filter((r) => r.error).map((r) => r.error!);

    return {
        success: succeeded === iterations,
        results: {
            total: iterations,
            succeeded,
            failed: iterations - succeeded,
            avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
            minDuration: Math.min(...durations),
            maxDuration: Math.max(...durations),
            errors: [...new Set(errors)], // Unique errors
        },
    };
}

/**
 * Generate a test suite for an MCP server
 */
export async function mcpGenerateTests(
    id: string,
    options: {
        includeEdgeCases?: boolean;
        outputFormat?: 'json' | 'yaml' | 'typescript';
    } = {}
): Promise<{
    success: boolean;
    testSuite?: string;
    error?: string;
}> {
    const instance = mcpInstances.get(id);
    if (!instance) {
        return { success: false, error: `MCP instance not found: ${id}` };
    }

    // Get tools if not already fetched
    if (!instance.tools) {
        const toolsResult = await mcpListTools(id);
        if (!toolsResult.success) {
            return { success: false, error: toolsResult.error };
        }
    }

    const tools = instance.tools!;
    const format = options.outputFormat || 'yaml';
    const includeEdgeCases = options.includeEdgeCases ?? true;

    // Generate test cases for each tool
    const testCases: Array<{
        name: string;
        tool: string;
        input: Record<string, unknown>;
        expectedBehavior: string;
    }> = [];

    for (const tool of tools) {
        // Basic invocation test
        testCases.push({
            name: `${tool.name}_basic_invocation`,
            tool: tool.name,
            input: generateSampleInput(tool.inputSchema),
            expectedBehavior: 'Should return successfully without error',
        });

        // Required fields test
        if (tool.inputSchema.required && tool.inputSchema.required.length > 0) {
            testCases.push({
                name: `${tool.name}_missing_required_fields`,
                tool: tool.name,
                input: {},
                expectedBehavior: 'Should return error for missing required fields',
            });
        }

        if (includeEdgeCases) {
            // Empty input test
            testCases.push({
                name: `${tool.name}_empty_input`,
                tool: tool.name,
                input: {},
                expectedBehavior: 'Should handle empty input gracefully',
            });

            // Invalid type test
            testCases.push({
                name: `${tool.name}_invalid_types`,
                tool: tool.name,
                input: generateInvalidInput(tool.inputSchema),
                expectedBehavior: 'Should reject invalid input types',
            });
        }
    }

    // Format output
    let testSuite: string;

    if (format === 'yaml') {
        testSuite = generateYamlTestSuite(instance.serverInfo!, tools, testCases);
    } else if (format === 'typescript') {
        testSuite = generateTypeScriptTestSuite(instance.serverInfo!, tools, testCases);
    } else {
        testSuite = JSON.stringify({ serverInfo: instance.serverInfo, tools, testCases }, null, 2);
    }

    return { success: true, testSuite };
}

/**
 * Run a full test suite against an MCP server
 */
export async function mcpRunTests(id: string): Promise<TestSuite | { error: string }> {
    const instance = mcpInstances.get(id);
    if (!instance) {
        return { error: `MCP instance not found: ${id}` };
    }

    const startTime = Date.now();
    const results: TestResult[] = [];

    // Get tools
    const toolsResult = await mcpListTools(id);
    if (!toolsResult.success || !toolsResult.tools) {
        return { error: `Failed to list tools: ${toolsResult.error}` };
    }

    const tools = toolsResult.tools;

    // Test each tool
    for (const tool of tools) {
        const sampleInput = generateSampleInput(tool.inputSchema);
        const result = await mcpInvoke(id, tool.name, sampleInput);

        results.push({
            tool: tool.name,
            input: sampleInput,
            success: result.success,
            output: result.result,
            error: result.error,
            duration: result.duration,
        });
    }

    const passed = results.filter((r) => r.success).length;

    return {
        mcpId: id,
        serverInfo: instance.serverInfo || { name: 'unknown', version: 'unknown' },
        tools,
        results,
        summary: {
            total: results.length,
            passed,
            failed: results.length - passed,
            duration: Date.now() - startTime,
        },
    };
}

/**
 * Get status of all running MCP instances
 */
export function mcpListInstances(): Array<{
    id: string;
    command: string;
    status: string;
    uptime: number;
    serverInfo?: MCPServerInfo;
    toolCount?: number;
}> {
    const instances: Array<{
        id: string;
        command: string;
        status: string;
        uptime: number;
        serverInfo?: MCPServerInfo;
        toolCount?: number;
    }> = [];

    for (const [id, instance] of mcpInstances) {
        instances.push({
            id,
            command: `${instance.command} ${instance.args.join(' ')}`,
            status: instance.status,
            uptime: Date.now() - instance.startTime.getTime(),
            serverInfo: instance.serverInfo,
            toolCount: instance.tools?.length,
        });
    }

    return instances;
}

/**
 * Get detailed info about an MCP instance
 */
export function mcpGetInstance(id: string): {
    found: boolean;
    instance?: {
        id: string;
        command: string;
        args: string[];
        status: string;
        startTime: Date;
        serverInfo?: MCPServerInfo;
        tools?: MCPTool[];
        recentStdout: string[];
        recentStderr: string[];
    };
} {
    const instance = mcpInstances.get(id);
    if (!instance) {
        return { found: false };
    }

    return {
        found: true,
        instance: {
            id: instance.id,
            command: instance.command,
            args: instance.args,
            status: instance.status,
            startTime: instance.startTime,
            serverInfo: instance.serverInfo,
            tools: instance.tools,
            recentStdout: instance.stdout.slice(-20),
            recentStderr: instance.stderr.slice(-20),
        },
    };
}

// Helper functions

function generateSampleInput(schema: MCPTool['inputSchema']): Record<string, unknown> {
    const input: Record<string, unknown> = {};

    if (!schema.properties) {
        return input;
    }

    for (const [name, propSchema] of Object.entries(schema.properties)) {
        const prop = propSchema as Record<string, unknown>;
        const isRequired = schema.required?.includes(name);

        // Only generate values for required fields by default
        if (!isRequired) continue;

        if (prop.type === 'string') {
            if (prop.enum && Array.isArray(prop.enum)) {
                input[name] = prop.enum[0];
            } else {
                input[name] = `test_${name}`;
            }
        } else if (prop.type === 'number' || prop.type === 'integer') {
            input[name] = prop.default ?? 1;
        } else if (prop.type === 'boolean') {
            input[name] = prop.default ?? true;
        } else if (prop.type === 'array') {
            input[name] = [];
        } else if (prop.type === 'object') {
            input[name] = {};
        }
    }

    return input;
}

function generateInvalidInput(schema: MCPTool['inputSchema']): Record<string, unknown> {
    const input: Record<string, unknown> = {};

    if (!schema.properties) {
        return { __invalid__: 'not a valid input' };
    }

    // Generate wrong types for each property
    for (const [name, propSchema] of Object.entries(schema.properties)) {
        const prop = propSchema as Record<string, unknown>;

        if (prop.type === 'string') {
            input[name] = 12345; // Number instead of string
        } else if (prop.type === 'number' || prop.type === 'integer') {
            input[name] = 'not a number';
        } else if (prop.type === 'boolean') {
            input[name] = 'not a boolean';
        } else if (prop.type === 'array') {
            input[name] = 'not an array';
        } else if (prop.type === 'object') {
            input[name] = 'not an object';
        }
    }

    return input;
}

function generateYamlTestSuite(
    serverInfo: MCPServerInfo,
    tools: MCPTool[],
    testCases: Array<{ name: string; tool: string; input: Record<string, unknown>; expectedBehavior: string }>
): string {
    let yaml = `# Auto-generated test suite for ${serverInfo.name} v${serverInfo.version}
# Generated by BarrHawk MCP Tester

server:
  name: ${serverInfo.name}
  version: ${serverInfo.version}

tools:
${tools.map((t) => `  - name: ${t.name}
    description: "${t.description.replace(/"/g, '\\"')}"
    required_params: [${(t.inputSchema.required || []).join(', ')}]`).join('\n')}

tests:
${testCases.map((tc) => `  - name: ${tc.name}
    tool: ${tc.tool}
    input: ${JSON.stringify(tc.input)}
    expected: "${tc.expectedBehavior}"`).join('\n\n')}
`;

    return yaml;
}

function generateTypeScriptTestSuite(
    serverInfo: MCPServerInfo,
    tools: MCPTool[],
    testCases: Array<{ name: string; tool: string; input: Record<string, unknown>; expectedBehavior: string }>
): string {
    return `/**
 * Auto-generated test suite for ${serverInfo.name} v${serverInfo.version}
 * Generated by BarrHawk MCP Tester
 */

import { mcpStart, mcpInvoke, mcpStop } from './mcp-tester';

describe('${serverInfo.name}', () => {
    let mcpId: string;

    beforeAll(async () => {
        const result = await mcpStart('npx', ['tsx', 'path/to/server.ts']);
        if (result.status !== 'running') {
            throw new Error(\`Failed to start MCP: \${result.error}\`);
        }
        mcpId = result.id;
    });

    afterAll(async () => {
        await mcpStop(mcpId);
    });

${testCases.map((tc) => `
    test('${tc.name}', async () => {
        const result = await mcpInvoke(mcpId, '${tc.tool}', ${JSON.stringify(tc.input)});
        // ${tc.expectedBehavior}
        expect(result.success).toBe(true);
    });`).join('\n')}
});
`;
}

// Export all functions
export {
    MCPTool,
    MCPServerInfo,
    MCPInstance,
    TestResult,
    TestSuite,
};
