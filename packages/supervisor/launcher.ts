#!/usr/bin/env bun
/**
 * Frankencode Launcher - Orchestrates the three-tier architecture
 *
 * Starts: Doctor → Igor → Frankenstein (in order)
 * Philosophy: "The whole is greater than the sum of its parts"
 */

import { spawn, type Subprocess } from 'bun';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================
// Configuration
// ============================================

interface ServerConfig {
  name: string;
  role: 'doctor' | 'igor' | 'frankenstein';
  port: number;
  script: string;
  env: Record<string, string>;
}

const DEFAULT_CONFIGS: ServerConfig[] = [
  {
    name: 'Frankenstein',
    role: 'frankenstein',
    port: 3100,
    script: 'frankenstein/index.ts',
    env: {
      FRANKENSTEIN_PORT: '3100',
      FRANKENSTEIN_HOT_RELOAD: 'true',
      FRANKENSTEIN_SANDBOXED: 'true',
    },
  },
  {
    name: 'Igor',
    role: 'igor',
    port: 3001,
    script: 'igor/index.ts',
    env: {
      IGOR_PORT: '3001',
      IGOR_POOL_SIZE: '3',
      IGOR_PERFORMANCE_MODE: 'true',
      FRANKENSTEIN_BASE_PORT: '3100',
    },
  },
  {
    name: 'Doctor',
    role: 'doctor',
    port: 3000,
    script: 'doctor/index.ts',
    env: {
      DOCTOR_PORT: '3000',
      IGOR_PORT: '3001',
      FRANKENSTEIN_PORT: '3100',
    },
  },
];

// ============================================
// Process Manager
// ============================================

interface ManagedProcess {
  config: ServerConfig;
  process: Subprocess | null;
  status: 'starting' | 'running' | 'stopped' | 'crashed';
  restarts: number;
  lastStart: Date | null;
}

class ProcessManager {
  private processes: Map<string, ManagedProcess> = new Map();
  private isShuttingDown = false;

  async startAll(configs: ServerConfig[]): Promise<void> {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║            FRANKENCODE - Three-Tier Architecture         ║');
    console.log('║     "Foolproof. Performant. Adaptive. Unstoppable."      ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    // Start in order (Frankenstein first, Doctor last)
    for (const config of configs) {
      await this.startServer(config);
      // Small delay between starts
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n[Launcher] All servers started successfully!\n');
    this.printStatus();
  }

  private async startServer(config: ServerConfig): Promise<void> {
    console.log(`[Launcher] Starting ${config.name}...`);

    const scriptPath = join(__dirname, config.script);

    const managed: ManagedProcess = {
      config,
      process: null,
      status: 'starting',
      restarts: 0,
      lastStart: new Date(),
    };

    this.processes.set(config.role, managed);

    try {
      // Use process.execPath to ensure we use the same Bun that's running this script
      const bunPath = process.execPath;
      const proc = spawn({
        cmd: [bunPath, 'run', scriptPath],
        env: {
          ...process.env,
          ...config.env,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });

      managed.process = proc;

      // Handle stdout
      this.streamOutput(proc.stdout, config.name, 'log');
      this.streamOutput(proc.stderr, config.name, 'error');

      // Wait for process to be ready
      await this.waitForReady(config);

      managed.status = 'running';
      console.log(`[Launcher] ${config.name} is running on port ${config.port}`);
    } catch (err: any) {
      managed.status = 'crashed';
      console.error(`[Launcher] Failed to start ${config.name}: ${err.message}`);
    }
  }

  private async streamOutput(
    stream: ReadableStream<Uint8Array>,
    name: string,
    type: 'log' | 'error'
  ): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n').filter(l => l.trim());

        for (const line of lines) {
          if (type === 'error') {
            console.error(`[${name}] ${line}`);
          } else {
            console.log(`[${name}] ${line}`);
          }
        }
      }
    } catch {
      // Stream closed
    }
  }

  private async waitForReady(config: ServerConfig, timeout = 10000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const res = await fetch(`http://localhost:${config.port}/ping`, {
          signal: AbortSignal.timeout(1000),
        });
        if (res.ok) return;
      } catch {
        // Not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    throw new Error(`${config.name} did not become ready within ${timeout}ms`);
  }

  printStatus(): void {
    console.log('┌─────────────────┬────────┬──────────┬──────────┐');
    console.log('│ Server          │ Port   │ Status   │ Restarts │');
    console.log('├─────────────────┼────────┼──────────┼──────────┤');

    for (const [role, managed] of this.processes) {
      const name = managed.config.name.padEnd(15);
      const port = String(managed.config.port).padEnd(6);
      const status = managed.status.padEnd(8);
      const restarts = String(managed.restarts).padEnd(8);
      console.log(`│ ${name} │ ${port} │ ${status} │ ${restarts} │`);
    }

    console.log('└─────────────────┴────────┴──────────┴──────────┘');
  }

  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log('\n[Launcher] Initiating graceful shutdown...\n');

    // Shutdown in reverse order (Doctor first, Frankenstein last)
    const order = ['doctor', 'igor', 'frankenstein'] as const;

    for (const role of order) {
      const managed = this.processes.get(role);
      if (managed?.process) {
        console.log(`[Launcher] Stopping ${managed.config.name}...`);

        try {
          // Try graceful shutdown first
          await fetch(`http://localhost:${managed.config.port}/shutdown`, {
            method: 'POST',
            signal: AbortSignal.timeout(2000),
          });
        } catch {
          // Force kill if graceful fails
          managed.process.kill();
        }

        managed.status = 'stopped';
      }
    }

    console.log('[Launcher] All servers stopped.');
    process.exit(0);
  }

  async restartServer(role: 'doctor' | 'igor' | 'frankenstein'): Promise<void> {
    const managed = this.processes.get(role);
    if (!managed) {
      console.error(`[Launcher] Unknown server: ${role}`);
      return;
    }

    console.log(`[Launcher] Restarting ${managed.config.name}...`);

    // Stop current process
    if (managed.process) {
      try {
        await fetch(`http://localhost:${managed.config.port}/shutdown`, {
          method: 'POST',
          signal: AbortSignal.timeout(2000),
        });
      } catch {
        managed.process.kill();
      }
    }

    managed.restarts++;

    // Restart
    await this.startServer(managed.config);
  }

  async healthCheck(): Promise<{ healthy: boolean; servers: Record<string, any> }> {
    const servers: Record<string, any> = {};
    let allHealthy = true;

    for (const [role, managed] of this.processes) {
      try {
        const res = await fetch(`http://localhost:${managed.config.port}/health`, {
          signal: AbortSignal.timeout(2000),
        });
        const health = await res.json();
        servers[role] = health;

        if (health.status === 'unhealthy') {
          allHealthy = false;
        }
      } catch {
        servers[role] = { status: 'unreachable' };
        allHealthy = false;
      }
    }

    return { healthy: allHealthy, servers };
  }
}

// ============================================
// CLI Interface
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'start';

  const manager = new ProcessManager();

  // Handle signals
  process.on('SIGINT', () => manager.shutdown());
  process.on('SIGTERM', () => manager.shutdown());

  switch (command) {
    case 'start':
      await manager.startAll(DEFAULT_CONFIGS);

      // Keep process alive
      console.log('\nPress Ctrl+C to shutdown all servers.\n');

      // Periodic health check
      setInterval(async () => {
        const { healthy, servers } = await manager.healthCheck();
        if (!healthy) {
          console.log('\n[Launcher] Health check detected issues:');
          for (const [role, health] of Object.entries(servers)) {
            if (health.status === 'unhealthy' || health.status === 'unreachable') {
              console.log(`  - ${role}: ${health.status}`);
            }
          }
        }
      }, 30000);

      break;

    case 'status':
      const { healthy, servers } = await manager.healthCheck();
      console.log(JSON.stringify(servers, null, 2));
      process.exit(healthy ? 0 : 1);
      break;

    case 'stop':
      await manager.shutdown();
      break;

    default:
      console.log(`
Frankencode Launcher

Usage:
  bun run launcher.ts [command]

Commands:
  start   Start all three servers (default)
  status  Check health of all servers
  stop    Stop all servers

Environment Variables:
  DOCTOR_PORT           Doctor port (default: 3000)
  IGOR_PORT             Igor port (default: 3001)
  FRANKENSTEIN_PORT     Frankenstein base port (default: 3100)
  IGOR_POOL_SIZE        Number of Frankenstein instances (default: 3)
`);
  }
}

main().catch(err => {
  console.error('[Launcher] Fatal error:', err);
  process.exit(1);
});

export { ProcessManager, DEFAULT_CONFIGS };
