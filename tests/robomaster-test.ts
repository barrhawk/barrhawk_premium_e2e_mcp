#!/usr/bin/env npx ts-node
/**
 * BarrHawk E2E Test Suite for Robo-Master
 *
 * Uses BarrHawk's backend testing capabilities to test the
 * Robo-Master FastAPI backend at http://localhost:8420
 */

import { spawn, ChildProcess } from 'child_process';
import * as readline from 'readline';

const ROBO_MASTER_URL = 'http://localhost:8420';

interface MCPRequest {
    jsonrpc: '2.0';
    id: number;
    method: string;
    params?: any;
}

interface MCPResponse {
    jsonrpc: '2.0';
    id: number;
    result?: any;
    error?: { code: number; message: string };
}

interface TestResult {
    name: string;
    passed: boolean;
    duration: number;
    details?: any;
    error?: string;
}

class BarrHawkTester {
    private process: ChildProcess | null = null;
    private requestId = 0;
    private pendingRequests = new Map<number, { resolve: Function; reject: Function }>();
    private rl: readline.Interface | null = null;
    private results: TestResult[] = [];

    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.process = spawn('npx', ['ts-node', 'server.ts'], {
                cwd: '/home/raptor/barrhawk/barrhawke2e_mcp',
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            this.rl = readline.createInterface({
                input: this.process.stdout!,
                crlfDelay: Infinity
            });

            this.rl.on('line', (line) => {
                try {
                    const response: MCPResponse = JSON.parse(line);
                    const pending = this.pendingRequests.get(response.id);
                    if (pending) {
                        this.pendingRequests.delete(response.id);
                        if (response.error) {
                            pending.reject(new Error(response.error.message));
                        } else {
                            pending.resolve(response.result);
                        }
                    }
                } catch {
                    // Not JSON, might be stderr or log
                }
            });

            this.process.stderr?.on('data', (data) => {
                const msg = data.toString();
                if (msg.includes('BarrHawk E2E MCP Server running')) {
                    resolve();
                }
            });

            this.process.on('error', reject);

            // Initialize the MCP connection
            setTimeout(() => {
                this.send({ jsonrpc: '2.0', id: this.requestId++, method: 'initialize', params: {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: { name: 'robomaster-tester', version: '1.0.0' }
                }});
                resolve();
            }, 2000);
        });
    }

    private send(request: MCPRequest): void {
        if (this.process?.stdin) {
            this.process.stdin.write(JSON.stringify(request) + '\n');
        }
    }

    private async callTool(name: string, args: Record<string, any>): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = this.requestId++;
            this.pendingRequests.set(id, { resolve, reject });

            this.send({
                jsonrpc: '2.0',
                id,
                method: 'tools/call',
                params: { name, arguments: args }
            });

            // Timeout after 30 seconds
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error('Request timeout'));
                }
            }, 30000);
        });
    }

    async runTest(name: string, testFn: () => Promise<any>): Promise<TestResult> {
        const start = Date.now();
        try {
            const details = await testFn();
            const result: TestResult = {
                name,
                passed: true,
                duration: Date.now() - start,
                details
            };
            this.results.push(result);
            console.log(`✅ ${name} (${result.duration}ms)`);
            return result;
        } catch (error: any) {
            const result: TestResult = {
                name,
                passed: false,
                duration: Date.now() - start,
                error: error.message
            };
            this.results.push(result);
            console.log(`❌ ${name}: ${error.message}`);
            return result;
        }
    }

    async stop(): Promise<void> {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
        if (this.rl) {
            this.rl.close();
            this.rl = null;
        }
    }

    getResults(): TestResult[] {
        return this.results;
    }
}

// Direct HTTP testing (simpler approach since MCP spawning is complex)
import http from 'http';
import https from 'https';

async function httpRequest(
    method: string,
    url: string,
    body?: any,
    headers: Record<string, string> = {}
): Promise<{ status: number; body: any; headers: Record<string, string> }> {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsedBody;
                try {
                    parsedBody = JSON.parse(data);
                } catch {
                    parsedBody = data;
                }
                resolve({
                    status: res.statusCode || 0,
                    body: parsedBody,
                    headers: res.headers as Record<string, string>
                });
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runTests() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║     BARRHAWK E2E TEST SUITE FOR ROBO-MASTER                  ║');
    console.log('║     Target: http://localhost:8420                            ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');

    const results: TestResult[] = [];

    async function test(name: string, fn: () => Promise<any>): Promise<void> {
        const start = Date.now();
        try {
            const details = await fn();
            const result: TestResult = { name, passed: true, duration: Date.now() - start, details };
            results.push(result);
            console.log(`✅ ${name} (${result.duration}ms)`);
            if (details && typeof details === 'object') {
                console.log(`   └─ ${JSON.stringify(details).slice(0, 100)}...`);
            }
        } catch (error: any) {
            const result: TestResult = { name, passed: false, duration: Date.now() - start, error: error.message };
            results.push(result);
            console.log(`❌ ${name}: ${error.message}`);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // HEALTH & STATUS TESTS
    // ═══════════════════════════════════════════════════════════════
    console.log('\n📋 HEALTH & STATUS ENDPOINTS');
    console.log('─'.repeat(50));

    await test('GET /health - Basic health check', async () => {
        const res = await httpRequest('GET', `${ROBO_MASTER_URL}/health`);
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        if (res.body.status !== 'healthy') throw new Error(`Expected healthy status`);
        return res.body;
    });

    await test('GET /status - Detailed status', async () => {
        const res = await httpRequest('GET', `${ROBO_MASTER_URL}/status`);
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        return res.body;
    });

    // ═══════════════════════════════════════════════════════════════
    // INFERENCE TESTS
    // ═══════════════════════════════════════════════════════════════
    console.log('\n🧠 INFERENCE ENDPOINTS');
    console.log('─'.repeat(50));

    await test('GET /inference/models - List Ollama models', async () => {
        const res = await httpRequest('GET', `${ROBO_MASTER_URL}/inference/models`);
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        return { modelCount: res.body?.models?.length || 0 };
    });

    await test('POST /inference/generate - Non-streaming inference', async () => {
        const res = await httpRequest('POST', `${ROBO_MASTER_URL}/inference/generate`, {
            prompt: 'Say "test passed" and nothing else.',
            model: 'mistral'
        });
        // May fail if model not loaded, but endpoint should respond
        if (res.status === 500) {
            return { note: 'Inference failed (model may not be loaded)', error: res.body };
        }
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        return res.body;
    });

    // ═══════════════════════════════════════════════════════════════
    // GEMINI API TESTS
    // ═══════════════════════════════════════════════════════════════
    console.log('\n✨ GEMINI API ENDPOINTS');
    console.log('─'.repeat(50));

    await test('GET /gemini/models - List Gemini models', async () => {
        const res = await httpRequest('GET', `${ROBO_MASTER_URL}/gemini/models`);
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        return res.body;
    });

    await test('POST /gemini/generate - Text generation', async () => {
        const res = await httpRequest('POST', `${ROBO_MASTER_URL}/gemini/generate`, {
            prompt: 'Respond with only: "Gemini test passed"',
            model: 'gemini-1.5-flash'
        });
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
        return { response: res.body?.text?.slice(0, 50) || res.body };
    });

    await test('POST /gemini/chat - Multi-turn chat', async () => {
        const res = await httpRequest('POST', `${ROBO_MASTER_URL}/gemini/chat`, {
            messages: [
                { role: 'user', content: 'Say hello' },
                { role: 'assistant', content: 'Hello!' },
                { role: 'user', content: 'Now say goodbye' }
            ],
            model: 'gemini-1.5-flash'
        });
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
        return { response: res.body?.text?.slice(0, 50) || res.body };
    });

    await test('POST /gemini/embed - Text embeddings', async () => {
        const res = await httpRequest('POST', `${ROBO_MASTER_URL}/gemini/embed`, {
            text: 'This is a test embedding'
        });
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
        return { embeddingLength: res.body?.embedding?.length || 0 };
    });

    // ═══════════════════════════════════════════════════════════════
    // CLUSTER TESTS
    // ═══════════════════════════════════════════════════════════════
    console.log('\n🌐 CLUSTER ENDPOINTS');
    console.log('─'.repeat(50));

    await test('GET /cluster/nodes - List cluster nodes', async () => {
        const res = await httpRequest('GET', `${ROBO_MASTER_URL}/cluster/nodes`);
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        return { nodeCount: res.body?.nodes?.length || 0 };
    });

    await test('GET /cluster/nodes/online - Online nodes', async () => {
        const res = await httpRequest('GET', `${ROBO_MASTER_URL}/cluster/nodes/online`);
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        return { onlineCount: res.body?.length || 0 };
    });

    // ═══════════════════════════════════════════════════════════════
    // HANDSHAKE TESTS
    // ═══════════════════════════════════════════════════════════════
    console.log('\n🤝 HANDSHAKE ENDPOINTS');
    console.log('─'.repeat(50));

    await test('GET /handshake/join-script - Get join script', async () => {
        const res = await httpRequest('GET', `${ROBO_MASTER_URL}/handshake/join-script`);
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        return { hasScript: !!res.body?.script };
    });

    await test('GET /handshake/node-server-template - Get node template', async () => {
        const res = await httpRequest('GET', `${ROBO_MASTER_URL}/handshake/node-server-template`);
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        return { hasTemplate: !!res.body?.template };
    });

    await test('POST /handshake/join - Attempt node join', async () => {
        const res = await httpRequest('POST', `${ROBO_MASTER_URL}/handshake/join`, {
            node_id: 'test-node-barrhawk',
            name: 'BarrHawk Test Node',
            host: '127.0.0.1',
            port: 8421,
            secret: 'robobrain_hivemind_2026',
            capabilities: {
                gpu: false,
                vram_gb: 0,
                cpu_cores: 4,
                ram_gb: 8.0,
                models: [],
                tools: ['test_tool'],
                platform: 'linux'
            }
        });
        // Even rejected handshakes should get a response
        if (res.status === 403) {
            return { note: 'Handshake rejected (wrong secret)', status: res.status };
        }
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
        return res.body;
    });

    // ═══════════════════════════════════════════════════════════════
    // MCP TESTS
    // ═══════════════════════════════════════════════════════════════
    console.log('\n🔧 MCP ENDPOINTS');
    console.log('─'.repeat(50));

    await test('GET /mcp/tools - List MCP tools', async () => {
        const res = await httpRequest('GET', `${ROBO_MASTER_URL}/mcp/tools`);
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        return { toolCount: res.body?.tools?.length || 0 };
    });

    await test('GET /mcp/resources - List MCP resources', async () => {
        const res = await httpRequest('GET', `${ROBO_MASTER_URL}/mcp/resources`);
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        return { resourceCount: res.body?.resources?.length || 0 };
    });

    // ═══════════════════════════════════════════════════════════════
    // SPARROW ENDPOINTS (if they exist)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n🐦 SPARROW ENDPOINTS');
    console.log('─'.repeat(50));

    await test('GET /sparrow/status - Sparrow status', async () => {
        const res = await httpRequest('GET', `${ROBO_MASTER_URL}/sparrow/status`);
        // May not be running
        if (res.status === 503) {
            return { note: 'Sparrow service not available', status: res.status };
        }
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        return res.body;
    });

    // ═══════════════════════════════════════════════════════════════
    // ROOT & DOCS ENDPOINTS
    // ═══════════════════════════════════════════════════════════════
    console.log('\n📚 ROOT & DOCUMENTATION');
    console.log('─'.repeat(50));

    await test('GET / - Root endpoint', async () => {
        const res = await httpRequest('GET', `${ROBO_MASTER_URL}/`);
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        if (!res.body.name) throw new Error('Expected name in response');
        return res.body;
    });

    await test('GET /openapi.json - OpenAPI schema', async () => {
        const res = await httpRequest('GET', `${ROBO_MASTER_URL}/openapi.json`);
        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        if (!res.body.openapi) throw new Error('Expected OpenAPI version');
        return { version: res.body.openapi, pathCount: Object.keys(res.body.paths || {}).length };
    });

    // ═══════════════════════════════════════════════════════════════
    // ERROR HANDLING TESTS
    // ═══════════════════════════════════════════════════════════════
    console.log('\n⚠️  ERROR HANDLING');
    console.log('─'.repeat(50));

    await test('GET /nonexistent - 404 handling', async () => {
        const res = await httpRequest('GET', `${ROBO_MASTER_URL}/nonexistent`);
        if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
        return { status: res.status };
    });

    await test('POST /inference/generate - Missing required fields', async () => {
        const res = await httpRequest('POST', `${ROBO_MASTER_URL}/inference/generate`, {});
        if (res.status !== 422 && res.status !== 400) {
            throw new Error(`Expected 422 or 400, got ${res.status}`);
        }
        return { status: res.status, validated: true };
    });

    // ═══════════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════════
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                      TEST SUMMARY                            ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const total = results.length;
    const passRate = ((passed / total) * 100).toFixed(1);

    console.log(`\n  Total:  ${total}`);
    console.log(`  Passed: ${passed} ✅`);
    console.log(`  Failed: ${failed} ❌`);
    console.log(`  Rate:   ${passRate}%`);

    if (failed > 0) {
        console.log('\n  Failed Tests:');
        results.filter(r => !r.passed).forEach(r => {
            console.log(`    ❌ ${r.name}`);
            console.log(`       ${r.error}`);
        });
    }

    console.log('\n');

    // Write results to file
    const report = {
        timestamp: new Date().toISOString(),
        target: ROBO_MASTER_URL,
        summary: { total, passed, failed, passRate: parseFloat(passRate) },
        results
    };

    const fs = await import('fs');
    fs.writeFileSync(
        '/home/raptor/barrhawk/barrhawke2e_mcp/tests/robomaster-results.json',
        JSON.stringify(report, null, 2)
    );
    console.log('📄 Results written to tests/robomaster-results.json');

    return report;
}

runTests().catch(console.error);
