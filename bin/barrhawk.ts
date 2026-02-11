#!/usr/bin/env bun
/**
 * BarrHawk E2E - Single command startup
 * Usage: npx barrhawk or bun run bin/barrhawk.ts
 */

import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TRIPARTITE = resolve(ROOT, 'tripartite');
const HUB = resolve(ROOT, 'hub');

// =============================================================================
// Config
// =============================================================================
interface Component {
  name: string;
  port: number;
  script: string;
  cwd: string;
  color: string;
  process?: ChildProcess;
  status: 'starting' | 'healthy' | 'unhealthy' | 'crashed';
  restarts: number;
  optional?: boolean;  // Don't fail if component can't start
}

// Parse CLI args for component selection
const args = process.argv.slice(2);
const hubMode = args.includes('--hub') || args.includes('-h');
const minimalMode = args.includes('--minimal') || args.includes('-m');

// Core tripartite components
const CORE_COMPONENTS: Component[] = [
  { name: 'Bridge', port: 7000, script: 'bridge/index.ts', cwd: TRIPARTITE, color: '\x1b[36m', status: 'starting', restarts: 0 },
  { name: 'Igor', port: 7002, script: 'igor/index.ts', cwd: TRIPARTITE, color: '\x1b[33m', status: 'starting', restarts: 0 },
  { name: 'Frank', port: 7003, script: 'frankenstein/index.ts', cwd: TRIPARTITE, color: '\x1b[35m', status: 'starting', restarts: 0 },
  { name: 'Doctor', port: 7001, script: 'doctor/index.ts', cwd: TRIPARTITE, color: '\x1b[32m', status: 'starting', restarts: 0 },
];

// Hub components (test orchestration platform)
const HUB_COMPONENTS: Component[] = [
  { name: 'Hub', port: 7010, script: 'index.ts', cwd: HUB, color: '\x1b[94m', status: 'starting', restarts: 0 },
  { name: 'Coord', port: 7011, script: 'coordinator.ts', cwd: HUB, color: '\x1b[95m', status: 'starting', restarts: 0 },
  { name: 'IgorDB', port: 7012, script: 'igor-db.ts', cwd: HUB, color: '\x1b[96m', status: 'starting', restarts: 0, optional: true },
];

// Select components based on mode
const COMPONENTS: Component[] = minimalMode
  ? CORE_COMPONENTS.slice(0, 2)  // Just Bridge + Igor
  : hubMode
    ? [...CORE_COMPONENTS, ...HUB_COMPONENTS]
    : CORE_COMPONENTS;

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';

const MAX_RESTARTS = 3;
const HEALTH_CHECK_INTERVAL = 5000;
const STARTUP_DELAY = 1500;

// =============================================================================
// Logging
// =============================================================================
function log(msg: string) {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`${DIM}${time}${RESET} ${msg}`);
}

function componentLog(comp: Component, msg: string) {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  const prefix = `${comp.color}[${comp.name}]${RESET}`;
  console.log(`${DIM}${time}${RESET} ${prefix} ${msg}`);
}

function banner() {
  const mode = hubMode ? ' + Hub' : minimalMode ? ' (minimal)' : '';
  console.log(`
${BOLD}╔═══════════════════════════════════════════════════════════╗
║  ${YELLOW}🦅 BarrHawk E2E${RESET}${BOLD}${mode.padEnd(44 - mode.length)}║
║  Premium Browser Automation + Test Orchestration MCP       ║
╚═══════════════════════════════════════════════════════════╝${RESET}
`);
}

function statusLine() {
  const statuses = COMPONENTS.map(c => {
    const icon = c.status === 'healthy' ? '●' : c.status === 'starting' ? '○' : '✗';
    const color = c.status === 'healthy' ? GREEN : c.status === 'starting' ? YELLOW : RED;
    return `${color}${icon} ${c.name}:${c.port}${RESET}`;
  }).join('  ');
  return statuses;
}

// =============================================================================
// Process Management
// =============================================================================
function startComponent(comp: Component): Promise<void> {
  return new Promise((resolve) => {
    const scriptPath = `${comp.cwd}/${comp.script}`;

    if (!existsSync(scriptPath)) {
      if (comp.optional) {
        componentLog(comp, `${DIM}Skipped (optional)${RESET}`);
        comp.status = 'crashed';
        resolve();
        return;
      }
      componentLog(comp, `${RED}Script not found: ${scriptPath}${RESET}`);
      comp.status = 'crashed';
      resolve();
      return;
    }

    comp.status = 'starting';
    componentLog(comp, `Starting on port ${comp.port}...`);

    const proc = spawn('bun', ['run', scriptPath], {
      cwd: comp.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '1' },
    });

    comp.process = proc;

    // Stream stdout (minimal - only errors and important info)
    proc.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        // Only show errors and important startup messages
        if (line.includes('ERROR') || line.includes('error') ||
            line.includes('Connected') || line.includes('ready') ||
            line.includes('listening')) {
          componentLog(comp, line.replace(/\x1b\[[0-9;]*m/g, '').trim());
        }
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      componentLog(comp, `${RED}${data.toString().trim()}${RESET}`);
    });

    proc.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        comp.status = 'crashed';
        componentLog(comp, `${RED}Exited with code ${code}${RESET}`);

        // Auto-restart if under limit
        if (comp.restarts < MAX_RESTARTS) {
          comp.restarts++;
          componentLog(comp, `${YELLOW}Restarting (attempt ${comp.restarts}/${MAX_RESTARTS})...${RESET}`);
          setTimeout(() => startComponent(comp), 2000);
        } else {
          componentLog(comp, `${RED}Max restarts reached, giving up${RESET}`);
        }
      }
    });

    // Give it time to start
    setTimeout(resolve, STARTUP_DELAY);
  });
}

async function checkHealth(comp: Component): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${comp.port}/health`, {
      signal: AbortSignal.timeout(2000)
    });
    const data = await res.json() as { status?: string };
    return data.status === 'healthy';
  } catch {
    return false;
  }
}

async function healthCheckLoop() {
  for (const comp of COMPONENTS) {
    const healthy = await checkHealth(comp);
    const wasHealthy = comp.status === 'healthy';
    comp.status = healthy ? 'healthy' : (comp.process ? 'unhealthy' : 'crashed');

    if (!wasHealthy && healthy) {
      componentLog(comp, `${GREEN}Healthy${RESET}`);
    } else if (wasHealthy && !healthy) {
      componentLog(comp, `${RED}Unhealthy${RESET}`);
    }
  }

  // Update status line
  process.stdout.write(`\r${statusLine()}  `);
}

// =============================================================================
// Shutdown
// =============================================================================
let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log('\n');
  log(`${YELLOW}Shutting down...${RESET}`);

  for (const comp of COMPONENTS.reverse()) {
    if (comp.process) {
      componentLog(comp, 'Stopping...');
      comp.process.kill('SIGTERM');
    }
  }

  // Give processes time to clean up
  await new Promise(r => setTimeout(r, 2000));

  // Force kill any remaining
  for (const comp of COMPONENTS) {
    if (comp.process && !comp.process.killed) {
      comp.process.kill('SIGKILL');
    }
  }

  log(`${GREEN}All components stopped${RESET}`);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// =============================================================================
// Main
// =============================================================================
async function main() {
  banner();

  // Check if bun is available
  try {
    const { execSync } = await import('child_process');
    execSync('bun --version', { stdio: 'ignore' });
  } catch {
    console.error(`${RED}Error: bun is required but not found${RESET}`);
    console.error('Install bun: curl -fsSL https://bun.sh/install | bash');
    process.exit(1);
  }

  // Kill any existing processes
  log('Cleaning up existing processes...');
  try {
    const { execSync } = await import('child_process');
    execSync('pkill -f "bun.*(tripartite|hub)/(bridge|doctor|igor|frankenstein|index|coordinator|igor-db)" 2>/dev/null || true', { stdio: 'ignore' });
  } catch {}
  await new Promise(r => setTimeout(r, 1000));

  // Start components in order (Bridge first, then others)
  const modeLabel = hubMode ? 'tripartite stack + Hub' : minimalMode ? 'minimal stack' : 'tripartite stack';
  log(`Starting ${modeLabel}...\n`);

  for (const comp of COMPONENTS) {
    await startComponent(comp);
  }

  // Initial health check
  await new Promise(r => setTimeout(r, 2000));
  await healthCheckLoop();

  console.log('\n');
  log(`${GREEN}${BOLD}Stack ready!${RESET}`);

  const hubEndpoints = hubMode ? `
    ${DIM}─── Hub (Test Orchestration) ───${RESET}
    Hub:         http://localhost:7010  ${DIM}(REST API)${RESET}
    Coordinator: http://localhost:7011
    Igor-DB:     http://localhost:7012` : '';

  console.log(`
  ${DIM}Endpoints:${RESET}
    Bridge:      http://localhost:7000
    Doctor:      http://localhost:7001  ${DIM}(POST /plan)${RESET}
    Igor:        http://localhost:7002
    Frankenstein: http://localhost:7003
${hubEndpoints}

  ${DIM}Quick test:${RESET}
    curl -X POST http://localhost:7001/plan \\
      -H "Content-Type: application/json" \\
      -d '{"intent":"go to google.com and search for barrhawk","url":"https://google.com"}'
${hubMode ? `
  ${DIM}Hub API:${RESET}
    curl http://localhost:7010/projects
    curl -X POST http://localhost:7010/projects \\
      -d '{"name":"MyApp","baseUrl":"http://localhost:3000"}'
` : ''}
  ${DIM}Press Ctrl+C to stop${RESET}
`);

  // Continuous health monitoring
  setInterval(healthCheckLoop, HEALTH_CHECK_INTERVAL);
}

main().catch(err => {
  console.error(`${RED}Fatal error:${RESET}`, err);
  process.exit(1);
});
