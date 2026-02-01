import { spawn, ChildProcess } from 'child_process';
import * as readline from 'readline';
import path from 'path';
import fs from 'fs';

const EXTENSION_PATH = '/home/raptor/mortis/purlpal_monorepo/packages/chrome-extension/dist';
const TEST_URL = 'https://www.medicare.gov/plan-compare/#/';

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

class BarrHawkTester {
    private process: ChildProcess | null = null;
    private requestId = 0;
    private pendingRequests = new Map<number, { resolve: Function; reject: Function }>();
    private rl: readline.Interface | null = null;

    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.process = spawn('npx', ['tsx', 'server.ts'], {
                cwd: '/home/raptor/barrhawk/barrhawk_e2e_premium_mcp',
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            this.rl = readline.createInterface({
                input: this.process.stdout!,
                crlfDelay: Infinity
            });

            this.rl.on('line', (line) => {
                console.log(`[MCP OUT] ${line}`);
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
                    // Not JSON
                }
            });

            this.process.stderr?.on('data', (data) => {
                console.error(`[MCP ERR] ${data}`);
            });

            this.process.on('error', reject);

            // Give it time to start
            setTimeout(() => {
                this.send({ jsonrpc: '2.0', id: this.requestId++, method: 'initialize', params: {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: { name: 'medicare-tester', version: '1.0.0' }
                }});
                resolve();
            }, 5000);
        });
    }

    private send(request: MCPRequest): void {
        if (this.process?.stdin) {
            this.process.stdin.write(JSON.stringify(request) + '\n');
        }
    }

    async callTool(name: string, args: Record<string, any>): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = this.requestId++;
            this.pendingRequests.set(id, { resolve, reject });

            this.send({
                jsonrpc: '2.0',
                id,
                method: 'tools/call',
                params: { name, arguments: args }
            });

            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`Request timeout for tool: ${name}`));
                }
            }, 60000);
        });
    }

    async stop(): Promise<void> {
        if (this.process) {
            this.process.kill();
        }
    }
}

async function runTest() {
    console.log('Starting Medicare Extension Test via BarrHawk Premium MCP...');
    
    if (!fs.existsSync(EXTENSION_PATH)) {
        console.error(`Extension dist not found at ${EXTENSION_PATH}`);
        process.exit(1);
    }

    const tester = new BarrHawkTester();
    await tester.start();

    try {
        console.log('Launching browser with extension...');
        await tester.callTool('browser_launch', {
            headless: false,
            extensionPath: EXTENSION_PATH,
            url: TEST_URL
        });

        console.log('Waiting for page to load...');
        await tester.callTool('browser_wait', { timeout: 10000 });

        console.log('Taking initial screenshot...');
        await tester.callTool('browser_screenshot', {});

        console.log('Typing ZIP code...');
        await tester.callTool('browser_type', {
            selector: 'input#zipcode, input[name=zipcode], .zip-code-input input',
            text: '90210',
            pressEnter: true
        });

        console.log('Waiting after ZIP entry...');
        await tester.callTool('browser_wait', { timeout: 5000 });

        console.log('Pressing Ctrl+B to attempt side panel opening...');
        await tester.callTool('browser_press_key', { key: 'Control+b' });
        
        await tester.callTool('browser_wait', { timeout: 5000 });

        console.log('Test sequence completed.');
        console.log('Browser will remain open for 20 seconds for manual inspection.');
        await new Promise(resolve => setTimeout(resolve, 20000));

    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        await tester.stop();
        process.exit(0);
    }
}

runTest();
