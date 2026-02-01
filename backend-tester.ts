/**
 * Backend Tester Module
 *
 * Provides tools for testing backend APIs and services:
 * - HTTP request execution (GET, POST, PUT, DELETE, PATCH)
 * - Response validation
 * - Schema validation for API responses
 * - Load testing / stress testing
 * - Health checks
 * - Authentication testing
 *
 * Architecture:
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                       BarrHawk E2E MCP                         │
 * │  ┌─────────────────────────────────────────────────────────────┐│
 * │  │                   Backend Tester Module                     ││
 * │  │                                                             ││
 * │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      ││
 * │  │  │ HTTP Client  │  │ Response     │  │ Load Tester  │      ││
 * │  │  │              │  │ Validator    │  │              │      ││
 * │  │  │ - fetch      │  │              │  │ - concurrent │      ││
 * │  │  │ - retry      │  │ - status     │  │ - sequential │      ││
 * │  │  │ - timeout    │  │ - schema     │  │ - metrics    │      ││
 * │  │  │ - auth       │  │ - body       │  │ - report     │      ││
 * │  │  └──────────────┘  └──────────────┘  └──────────────┘      ││
 * │  │                                                             ││
 * │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      ││
 * │  │  │ Session Mgr  │  │ Auth Handler │  │ Test Suite   │      ││
 * │  │  │              │  │              │  │ Runner       │      ││
 * │  │  │ - cookies    │  │ - basic      │  │              │      ││
 * │  │  │ - headers    │  │ - bearer     │  │ - sequence   │      ││
 * │  │  │ - state      │  │ - api key    │  │ - assertions │      ││
 * │  │  └──────────────┘  └──────────────┘  └──────────────┘      ││
 * │  └─────────────────────────────────────────────────────────────┘│
 * │                              │                                  │
 * └──────────────────────────────┼──────────────────────────────────┘
 *                                │
 *                    ┌───────────┴───────────┐
 *                    │                       │
 *           ┌────────┴────────┐    ┌─────────┴────────┐
 *           │  Backend API    │    │  External API    │
 *           │  (localhost)    │    │  (remote)        │
 *           └─────────────────┘    └──────────────────┘
 */

// Types
interface HttpRequest {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
    timeout?: number;
    followRedirects?: boolean;
}

interface HttpResponse {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: unknown;
    bodyRaw: string;
    duration: number;
    size: number;
}

interface BackendSession {
    id: string;
    name: string;
    baseUrl?: string;
    defaultHeaders: Record<string, string>;
    cookies: Record<string, string>;
    authType?: 'none' | 'basic' | 'bearer' | 'api-key';
    authCredentials?: {
        username?: string;
        password?: string;
        token?: string;
        apiKey?: string;
        apiKeyHeader?: string;
    };
    history: Array<{
        request: HttpRequest;
        response: HttpResponse;
        timestamp: Date;
    }>;
    variables: Record<string, unknown>;
}

interface ApiTestCase {
    name: string;
    request: HttpRequest;
    assertions: Array<{
        type: 'status' | 'header' | 'body' | 'jsonPath' | 'duration' | 'schema';
        path?: string;
        operator: 'equals' | 'contains' | 'matches' | 'exists' | 'lessThan' | 'greaterThan';
        expected?: unknown;
        schema?: object;
    }>;
}

interface ApiTestResult {
    name: string;
    passed: boolean;
    request: HttpRequest;
    response?: HttpResponse;
    assertions: Array<{
        type: string;
        passed: boolean;
        actual?: unknown;
        expected?: unknown;
        error?: string;
    }>;
    duration: number;
    error?: string;
}

interface LoadTestResult {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalDuration: number;
    avgResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    p50ResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    requestsPerSecond: number;
    errorRate: number;
    errors: string[];
    statusCodes: Record<number, number>;
}

// Global session registry
const sessions: Map<string, BackendSession> = new Map();

// Generate unique ID
function generateId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new backend testing session
 */
export function backendCreateSession(
    name: string,
    options: {
        baseUrl?: string;
        defaultHeaders?: Record<string, string>;
        auth?: BackendSession['authCredentials'] & { type: BackendSession['authType'] };
    } = {}
): { id: string; session: BackendSession } {
    const id = generateId();

    const session: BackendSession = {
        id,
        name,
        baseUrl: options.baseUrl,
        defaultHeaders: options.defaultHeaders || {},
        cookies: {},
        authType: options.auth?.type || 'none',
        authCredentials: options.auth,
        history: [],
        variables: {},
    };

    sessions.set(id, session);
    return { id, session };
}

/**
 * Get or list sessions
 */
export function backendListSessions(): Array<{
    id: string;
    name: string;
    baseUrl?: string;
    authType?: string;
    requestCount: number;
}> {
    const result = [];
    for (const [id, session] of sessions) {
        result.push({
            id,
            name: session.name,
            baseUrl: session.baseUrl,
            authType: session.authType,
            requestCount: session.history.length,
        });
    }
    return result;
}

/**
 * Delete a session
 */
export function backendDeleteSession(id: string): { success: boolean; error?: string } {
    if (!sessions.has(id)) {
        return { success: false, error: `Session not found: ${id}` };
    }
    sessions.delete(id);
    return { success: true };
}

/**
 * Execute an HTTP request
 */
export async function backendRequest(
    sessionId: string | null,
    request: HttpRequest
): Promise<{ success: boolean; response?: HttpResponse; error?: string }> {
    const session = sessionId ? sessions.get(sessionId) : null;

    try {
        // Build full URL
        let url = request.url;
        if (session?.baseUrl && !url.startsWith('http')) {
            url = `${session.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
        }

        // Build headers
        const headers: Record<string, string> = {
            ...(session?.defaultHeaders || {}),
            ...(request.headers || {}),
        };

        // Add auth headers
        if (session?.authType === 'basic' && session.authCredentials?.username) {
            const credentials = Buffer.from(
                `${session.authCredentials.username}:${session.authCredentials.password || ''}`
            ).toString('base64');
            headers['Authorization'] = `Basic ${credentials}`;
        } else if (session?.authType === 'bearer' && session.authCredentials?.token) {
            headers['Authorization'] = `Bearer ${session.authCredentials.token}`;
        } else if (session?.authType === 'api-key' && session.authCredentials?.apiKey) {
            const headerName = session.authCredentials.apiKeyHeader || 'X-API-Key';
            headers[headerName] = session.authCredentials.apiKey;
        }

        // Add cookies
        if (session && Object.keys(session.cookies).length > 0) {
            const cookieString = Object.entries(session.cookies)
                .map(([k, v]) => `${k}=${v}`)
                .join('; ');
            headers['Cookie'] = cookieString;
        }

        // Prepare body
        let bodyString: string | undefined;
        if (request.body !== undefined) {
            if (typeof request.body === 'string') {
                bodyString = request.body;
            } else {
                bodyString = JSON.stringify(request.body);
                if (!headers['Content-Type']) {
                    headers['Content-Type'] = 'application/json';
                }
            }
        }

        // Execute request
        const startTime = Date.now();
        const controller = new AbortController();
        const timeout = request.timeout || 30000;
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const fetchResponse = await fetch(url, {
            method: request.method,
            headers,
            body: bodyString,
            redirect: request.followRedirects === false ? 'manual' : 'follow',
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;

        // Parse response
        const responseHeaders: Record<string, string> = {};
        fetchResponse.headers.forEach((value, key) => {
            responseHeaders[key] = value;
        });

        const bodyRaw = await fetchResponse.text();
        let body: unknown = bodyRaw;

        // Try to parse as JSON
        const contentType = responseHeaders['content-type'] || '';
        if (contentType.includes('application/json') || bodyRaw.startsWith('{') || bodyRaw.startsWith('[')) {
            try {
                body = JSON.parse(bodyRaw);
            } catch {
                // Keep as string
            }
        }

        // Extract cookies from response
        const setCookie = fetchResponse.headers.get('set-cookie');
        if (session && setCookie) {
            // Basic cookie parsing (doesn't handle all edge cases)
            const cookies = setCookie.split(',').map(c => c.trim());
            for (const cookie of cookies) {
                const [nameValue] = cookie.split(';');
                const [name, value] = nameValue.split('=');
                if (name && value) {
                    session.cookies[name.trim()] = value.trim();
                }
            }
        }

        const response: HttpResponse = {
            status: fetchResponse.status,
            statusText: fetchResponse.statusText,
            headers: responseHeaders,
            body,
            bodyRaw,
            duration,
            size: bodyRaw.length,
        };

        // Store in history
        if (session) {
            session.history.push({
                request,
                response,
                timestamp: new Date(),
            });
        }

        return { success: true, response };

    } catch (error) {
        const err = error as Error;
        return {
            success: false,
            error: err.name === 'AbortError' ? 'Request timeout' : err.message,
        };
    }
}

/**
 * Run API assertions against a response
 */
export function backendAssert(
    response: HttpResponse,
    assertions: ApiTestCase['assertions']
): Array<{ type: string; passed: boolean; actual?: unknown; expected?: unknown; error?: string }> {
    const results = [];

    for (const assertion of assertions) {
        let passed = false;
        let actual: unknown;
        let error: string | undefined;

        try {
            switch (assertion.type) {
                case 'status':
                    actual = response.status;
                    passed = evaluateAssertion(actual, assertion.operator, assertion.expected);
                    break;

                case 'header':
                    actual = response.headers[assertion.path?.toLowerCase() || ''];
                    passed = evaluateAssertion(actual, assertion.operator, assertion.expected);
                    break;

                case 'body':
                    actual = response.body;
                    passed = evaluateAssertion(actual, assertion.operator, assertion.expected);
                    break;

                case 'jsonPath':
                    actual = getJsonPath(response.body, assertion.path || '');
                    passed = evaluateAssertion(actual, assertion.operator, assertion.expected);
                    break;

                case 'duration':
                    actual = response.duration;
                    passed = evaluateAssertion(actual, assertion.operator, assertion.expected);
                    break;

                case 'schema':
                    // Basic schema validation
                    const schemaResult = validateSchema(response.body, (assertion.schema || {}) as Record<string, unknown>);
                    passed = schemaResult.valid;
                    error = schemaResult.errors.join(', ');
                    break;
            }
        } catch (e) {
            error = (e as Error).message;
            passed = false;
        }

        results.push({
            type: assertion.type,
            passed,
            actual,
            expected: assertion.expected,
            error,
        });
    }

    return results;
}

/**
 * Run a load test against an endpoint
 */
export async function backendLoadTest(
    sessionId: string | null,
    request: HttpRequest,
    options: {
        totalRequests?: number;
        concurrency?: number;
        rampUpSeconds?: number;
        thinkTimeMs?: number;
    } = {}
): Promise<LoadTestResult> {
    const totalRequests = options.totalRequests || 100;
    const concurrency = options.concurrency || 10;
    const rampUpSeconds = options.rampUpSeconds || 0;
    const thinkTimeMs = options.thinkTimeMs || 0;

    const results: Array<{ success: boolean; status?: number; duration: number; error?: string }> = [];
    const startTime = Date.now();

    // Calculate requests per batch
    const batches = Math.ceil(totalRequests / concurrency);
    const rampUpDelay = rampUpSeconds > 0 ? (rampUpSeconds * 1000) / batches : 0;

    for (let batch = 0; batch < batches; batch++) {
        const batchSize = Math.min(concurrency, totalRequests - batch * concurrency);
        const batchPromises = [];

        for (let i = 0; i < batchSize; i++) {
            batchPromises.push(
                backendRequest(sessionId, request).then(result => ({
                    success: result.success,
                    status: result.response?.status,
                    duration: result.response?.duration || 0,
                    error: result.error,
                }))
            );
        }

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Ramp up delay
        if (rampUpDelay > 0 && batch < batches - 1) {
            await sleep(rampUpDelay);
        }

        // Think time between batches
        if (thinkTimeMs > 0 && batch < batches - 1) {
            await sleep(thinkTimeMs);
        }
    }

    const totalDuration = Date.now() - startTime;

    // Calculate metrics
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const durations = successful.map(r => r.duration).sort((a, b) => a - b);

    const statusCodes: Record<number, number> = {};
    for (const r of results) {
        if (r.status) {
            statusCodes[r.status] = (statusCodes[r.status] || 0) + 1;
        }
    }

    const errors = [...new Set(failed.map(r => r.error || 'Unknown error'))];

    return {
        totalRequests,
        successfulRequests: successful.length,
        failedRequests: failed.length,
        totalDuration,
        avgResponseTime: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
        minResponseTime: durations.length > 0 ? durations[0] : 0,
        maxResponseTime: durations.length > 0 ? durations[durations.length - 1] : 0,
        p50ResponseTime: percentile(durations, 50),
        p95ResponseTime: percentile(durations, 95),
        p99ResponseTime: percentile(durations, 99),
        requestsPerSecond: totalRequests / (totalDuration / 1000),
        errorRate: failed.length / totalRequests,
        errors,
        statusCodes,
    };
}

/**
 * Run a test suite
 */
export async function backendRunTestSuite(
    sessionId: string | null,
    testCases: ApiTestCase[]
): Promise<{ results: ApiTestResult[]; summary: { total: number; passed: number; failed: number; duration: number } }> {
    const results: ApiTestResult[] = [];
    const startTime = Date.now();

    for (const testCase of testCases) {
        const testStart = Date.now();

        const requestResult = await backendRequest(sessionId, testCase.request);

        if (!requestResult.success || !requestResult.response) {
            results.push({
                name: testCase.name,
                passed: false,
                request: testCase.request,
                assertions: [],
                duration: Date.now() - testStart,
                error: requestResult.error,
            });
            continue;
        }

        const assertionResults = backendAssert(requestResult.response, testCase.assertions);
        const allPassed = assertionResults.every(a => a.passed);

        results.push({
            name: testCase.name,
            passed: allPassed,
            request: testCase.request,
            response: requestResult.response,
            assertions: assertionResults,
            duration: Date.now() - testStart,
        });
    }

    const passed = results.filter(r => r.passed).length;

    return {
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
 * Health check an endpoint
 */
export async function backendHealthCheck(
    url: string,
    options: {
        expectedStatus?: number;
        timeout?: number;
        retries?: number;
        retryDelay?: number;
    } = {}
): Promise<{
    healthy: boolean;
    status?: number;
    duration: number;
    attempts: number;
    error?: string;
}> {
    const expectedStatus = options.expectedStatus || 200;
    const timeout = options.timeout || 5000;
    const retries = options.retries || 0;
    const retryDelay = options.retryDelay || 1000;

    let attempts = 0;
    let lastError: string | undefined;

    while (attempts <= retries) {
        attempts++;

        const result = await backendRequest(null, {
            method: 'GET',
            url,
            timeout,
        });

        if (result.success && result.response) {
            const healthy = result.response.status === expectedStatus;
            return {
                healthy,
                status: result.response.status,
                duration: result.response.duration,
                attempts,
                error: healthy ? undefined : `Expected status ${expectedStatus}, got ${result.response.status}`,
            };
        }

        lastError = result.error;

        if (attempts <= retries) {
            await sleep(retryDelay);
        }
    }

    return {
        healthy: false,
        duration: 0,
        attempts,
        error: lastError,
    };
}

/**
 * Set session variable (for chaining requests)
 */
export function backendSetVariable(
    sessionId: string,
    name: string,
    value: unknown
): { success: boolean; error?: string } {
    const session = sessions.get(sessionId);
    if (!session) {
        return { success: false, error: `Session not found: ${sessionId}` };
    }
    session.variables[name] = value;
    return { success: true };
}

/**
 * Get session variable
 */
export function backendGetVariable(
    sessionId: string,
    name: string
): { success: boolean; value?: unknown; error?: string } {
    const session = sessions.get(sessionId);
    if (!session) {
        return { success: false, error: `Session not found: ${sessionId}` };
    }
    return { success: true, value: session.variables[name] };
}

/**
 * Extract value from response and store in session variable
 */
export function backendExtractVariable(
    sessionId: string,
    response: HttpResponse,
    jsonPath: string,
    variableName: string
): { success: boolean; value?: unknown; error?: string } {
    const session = sessions.get(sessionId);
    if (!session) {
        return { success: false, error: `Session not found: ${sessionId}` };
    }

    try {
        const value = getJsonPath(response.body, jsonPath);
        session.variables[variableName] = value;
        return { success: true, value };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

// Helper functions

function evaluateAssertion(actual: unknown, operator: string, expected: unknown): boolean {
    switch (operator) {
        case 'equals':
            return JSON.stringify(actual) === JSON.stringify(expected);
        case 'contains':
            if (typeof actual === 'string' && typeof expected === 'string') {
                return actual.includes(expected);
            }
            if (Array.isArray(actual)) {
                return actual.some(item => JSON.stringify(item) === JSON.stringify(expected));
            }
            return false;
        case 'matches':
            if (typeof actual === 'string' && typeof expected === 'string') {
                return new RegExp(expected).test(actual);
            }
            return false;
        case 'exists':
            return actual !== undefined && actual !== null;
        case 'lessThan':
            return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
        case 'greaterThan':
            return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
        default:
            return false;
    }
}

function getJsonPath(obj: unknown, path: string): unknown {
    if (!path || path === '$') return obj;

    const parts = path.replace(/^\$\.?/, '').split('.');
    let current: unknown = obj;

    for (const part of parts) {
        if (current === null || current === undefined) return undefined;

        // Handle array access like items[0]
        const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
        if (arrayMatch) {
            const [, key, index] = arrayMatch;
            current = (current as Record<string, unknown>)[key];
            if (Array.isArray(current)) {
                current = current[parseInt(index)];
            }
        } else {
            current = (current as Record<string, unknown>)[part];
        }
    }

    return current;
}

function validateSchema(data: unknown, schema: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Very basic schema validation
    if (schema.type) {
        const actualType = Array.isArray(data) ? 'array' : typeof data;
        if (actualType !== schema.type) {
            errors.push(`Expected type ${schema.type}, got ${actualType}`);
        }
    }

    if (schema.required && Array.isArray(schema.required) && typeof data === 'object' && data !== null) {
        for (const field of schema.required) {
            if (!(field in (data as Record<string, unknown>))) {
                errors.push(`Missing required field: ${field}`);
            }
        }
    }

    if (schema.properties && typeof data === 'object' && data !== null) {
        const props = schema.properties as Record<string, Record<string, unknown>>;
        const dataObj = data as Record<string, unknown>;

        for (const [key, propSchema] of Object.entries(props)) {
            if (key in dataObj && propSchema.type) {
                const actualType = Array.isArray(dataObj[key]) ? 'array' : typeof dataObj[key];
                if (actualType !== propSchema.type) {
                    errors.push(`Field ${key}: expected ${propSchema.type}, got ${actualType}`);
                }
            }
        }
    }

    return { valid: errors.length === 0, errors };
}

function percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const index = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, Math.min(index, arr.length - 1))];
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Export types
export {
    HttpRequest,
    HttpResponse,
    BackendSession,
    ApiTestCase,
    ApiTestResult,
    LoadTestResult,
};
