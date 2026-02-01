/**
 * Docker Tools - Container and Compose Management
 *
 * Full Docker automation for testing workflows
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Track running containers we started
const managedContainers: Map<string, { id: string; name: string; image: string }> = new Map();

// =============================================================================
// DOCKER CORE
// =============================================================================

export async function handleDockerPs(args: {
  all?: boolean;
  filter?: string;
}): Promise<object> {
  try {
    const flags = args.all ? '-a' : '';
    const filter = args.filter ? `--filter "${args.filter}"` : '';

    const { stdout } = await execAsync(
      `docker ps ${flags} ${filter} --format '{{json .}}'`
    );

    const containers = stdout
      .trim()
      .split('\n')
      .filter(line => line)
      .map(line => JSON.parse(line));

    return {
      success: true,
      containers,
      count: containers.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleDockerRun(args: {
  image: string;
  name?: string;
  ports?: string[];
  env?: Record<string, string>;
  volumes?: string[];
  detach?: boolean;
  rm?: boolean;
  command?: string;
}): Promise<object> {
  try {
    const flags: string[] = [];

    if (args.detach !== false) flags.push('-d');
    if (args.rm) flags.push('--rm');
    if (args.name) flags.push(`--name ${args.name}`);

    if (args.ports) {
      args.ports.forEach(p => flags.push(`-p ${p}`));
    }

    if (args.env) {
      Object.entries(args.env).forEach(([k, v]) => {
        flags.push(`-e ${k}=${v}`);
      });
    }

    if (args.volumes) {
      args.volumes.forEach(v => flags.push(`-v ${v}`));
    }

    const cmd = `docker run ${flags.join(' ')} ${args.image} ${args.command || ''}`;
    const { stdout } = await execAsync(cmd);

    const containerId = stdout.trim();
    const containerName = args.name || containerId.substring(0, 12);

    managedContainers.set(containerName, {
      id: containerId,
      name: containerName,
      image: args.image,
    });

    return {
      success: true,
      containerId,
      name: containerName,
      image: args.image,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleDockerStop(args: {
  container: string;
  timeout?: number;
}): Promise<object> {
  try {
    const timeout = args.timeout ? `-t ${args.timeout}` : '';
    await execAsync(`docker stop ${timeout} ${args.container}`);

    managedContainers.delete(args.container);

    return {
      success: true,
      container: args.container,
      message: 'Container stopped',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleDockerRm(args: {
  container: string;
  force?: boolean;
  volumes?: boolean;
}): Promise<object> {
  try {
    const flags: string[] = [];
    if (args.force) flags.push('-f');
    if (args.volumes) flags.push('-v');

    await execAsync(`docker rm ${flags.join(' ')} ${args.container}`);

    managedContainers.delete(args.container);

    return {
      success: true,
      container: args.container,
      message: 'Container removed',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleDockerLogs(args: {
  container: string;
  tail?: number;
  since?: string;
  follow?: boolean;
}): Promise<object> {
  try {
    const flags: string[] = [];
    if (args.tail) flags.push(`--tail ${args.tail}`);
    if (args.since) flags.push(`--since ${args.since}`);

    // Don't follow in MCP context - just get current logs
    const { stdout, stderr } = await execAsync(
      `docker logs ${flags.join(' ')} ${args.container}`
    );

    return {
      success: true,
      container: args.container,
      stdout,
      stderr,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleDockerExec(args: {
  container: string;
  command: string;
  interactive?: boolean;
  user?: string;
  workdir?: string;
}): Promise<object> {
  try {
    const flags: string[] = [];
    if (args.user) flags.push(`-u ${args.user}`);
    if (args.workdir) flags.push(`-w ${args.workdir}`);

    const { stdout, stderr } = await execAsync(
      `docker exec ${flags.join(' ')} ${args.container} ${args.command}`
    );

    return {
      success: true,
      container: args.container,
      stdout,
      stderr,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleDockerBuild(args: {
  path: string;
  tag?: string;
  dockerfile?: string;
  buildArgs?: Record<string, string>;
  noCache?: boolean;
}): Promise<object> {
  try {
    const flags: string[] = [];
    if (args.tag) flags.push(`-t ${args.tag}`);
    if (args.dockerfile) flags.push(`-f ${args.dockerfile}`);
    if (args.noCache) flags.push('--no-cache');

    if (args.buildArgs) {
      Object.entries(args.buildArgs).forEach(([k, v]) => {
        flags.push(`--build-arg ${k}=${v}`);
      });
    }

    const { stdout, stderr } = await execAsync(
      `docker build ${flags.join(' ')} ${args.path}`,
      { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer for build output
    );

    return {
      success: true,
      tag: args.tag,
      output: stdout,
      warnings: stderr,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleDockerImages(args: {
  filter?: string;
  all?: boolean;
}): Promise<object> {
  try {
    const flags: string[] = [];
    if (args.all) flags.push('-a');
    if (args.filter) flags.push(`--filter "${args.filter}"`);

    const { stdout } = await execAsync(
      `docker images ${flags.join(' ')} --format '{{json .}}'`
    );

    const images = stdout
      .trim()
      .split('\n')
      .filter(line => line)
      .map(line => JSON.parse(line));

    return {
      success: true,
      images,
      count: images.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleDockerPull(args: {
  image: string;
}): Promise<object> {
  try {
    const { stdout } = await execAsync(`docker pull ${args.image}`);

    return {
      success: true,
      image: args.image,
      output: stdout,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleDockerInspect(args: {
  target: string;
  format?: string;
}): Promise<object> {
  try {
    const format = args.format ? `--format '${args.format}'` : '';
    const { stdout } = await execAsync(`docker inspect ${format} ${args.target}`);

    const data = args.format ? stdout.trim() : JSON.parse(stdout);

    return {
      success: true,
      target: args.target,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// DOCKER COMPOSE
// =============================================================================

export async function handleComposeUp(args: {
  file?: string;
  project?: string;
  services?: string[];
  detach?: boolean;
  build?: boolean;
  recreate?: boolean;
}): Promise<object> {
  try {
    const flags: string[] = [];
    if (args.file) flags.push(`-f ${args.file}`);
    if (args.project) flags.push(`-p ${args.project}`);
    if (args.detach !== false) flags.push('-d');
    if (args.build) flags.push('--build');
    if (args.recreate) flags.push('--force-recreate');

    const services = args.services ? args.services.join(' ') : '';

    const { stdout, stderr } = await execAsync(
      `docker compose ${flags.join(' ')} up ${services}`,
      { maxBuffer: 10 * 1024 * 1024 }
    );

    return {
      success: true,
      output: stdout,
      warnings: stderr,
      project: args.project,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleComposeDown(args: {
  file?: string;
  project?: string;
  volumes?: boolean;
  removeOrphans?: boolean;
  timeout?: number;
}): Promise<object> {
  try {
    const flags: string[] = [];
    if (args.file) flags.push(`-f ${args.file}`);
    if (args.project) flags.push(`-p ${args.project}`);
    if (args.volumes) flags.push('-v');
    if (args.removeOrphans) flags.push('--remove-orphans');
    if (args.timeout) flags.push(`-t ${args.timeout}`);

    const { stdout } = await execAsync(`docker compose ${flags.join(' ')} down`);

    return {
      success: true,
      output: stdout,
      project: args.project,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleComposePs(args: {
  file?: string;
  project?: string;
  services?: string[];
}): Promise<object> {
  try {
    const flags: string[] = [];
    if (args.file) flags.push(`-f ${args.file}`);
    if (args.project) flags.push(`-p ${args.project}`);

    const services = args.services ? args.services.join(' ') : '';

    const { stdout } = await execAsync(
      `docker compose ${flags.join(' ')} ps --format json ${services}`
    );

    const containers = stdout
      .trim()
      .split('\n')
      .filter(line => line)
      .map(line => JSON.parse(line));

    return {
      success: true,
      containers,
      count: containers.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleComposeLogs(args: {
  file?: string;
  project?: string;
  services?: string[];
  tail?: number;
  since?: string;
}): Promise<object> {
  try {
    const flags: string[] = [];
    if (args.file) flags.push(`-f ${args.file}`);
    if (args.project) flags.push(`-p ${args.project}`);
    if (args.tail) flags.push(`--tail ${args.tail}`);
    if (args.since) flags.push(`--since ${args.since}`);

    const services = args.services ? args.services.join(' ') : '';

    const { stdout } = await execAsync(
      `docker compose ${flags.join(' ')} logs --no-color ${services}`
    );

    return {
      success: true,
      logs: stdout,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleComposeExec(args: {
  file?: string;
  project?: string;
  service: string;
  command: string;
  user?: string;
  workdir?: string;
}): Promise<object> {
  try {
    const flags: string[] = ['-T']; // No TTY
    if (args.file) flags.push(`-f ${args.file}`);
    if (args.project) flags.push(`-p ${args.project}`);
    if (args.user) flags.push(`-u ${args.user}`);
    if (args.workdir) flags.push(`-w ${args.workdir}`);

    const { stdout, stderr } = await execAsync(
      `docker compose ${flags.join(' ')} exec ${args.service} ${args.command}`
    );

    return {
      success: true,
      service: args.service,
      stdout,
      stderr,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// DOCKER NETWORKS & VOLUMES
// =============================================================================

export async function handleDockerNetworks(args: {
  action: 'list' | 'create' | 'remove' | 'inspect';
  name?: string;
  driver?: string;
}): Promise<object> {
  try {
    switch (args.action) {
      case 'list': {
        const { stdout } = await execAsync(`docker network ls --format '{{json .}}'`);
        const networks = stdout.trim().split('\n').filter(l => l).map(l => JSON.parse(l));
        return { success: true, networks };
      }

      case 'create': {
        if (!args.name) throw new Error('name required for create');
        const driver = args.driver ? `-d ${args.driver}` : '';
        await execAsync(`docker network create ${driver} ${args.name}`);
        return { success: true, name: args.name, created: true };
      }

      case 'remove': {
        if (!args.name) throw new Error('name required for remove');
        await execAsync(`docker network rm ${args.name}`);
        return { success: true, name: args.name, removed: true };
      }

      case 'inspect': {
        if (!args.name) throw new Error('name required for inspect');
        const { stdout } = await execAsync(`docker network inspect ${args.name}`);
        return { success: true, network: JSON.parse(stdout) };
      }

      default:
        throw new Error(`Unknown action: ${args.action}`);
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleDockerVolumes(args: {
  action: 'list' | 'create' | 'remove' | 'inspect' | 'prune';
  name?: string;
}): Promise<object> {
  try {
    switch (args.action) {
      case 'list': {
        const { stdout } = await execAsync(`docker volume ls --format '{{json .}}'`);
        const volumes = stdout.trim().split('\n').filter(l => l).map(l => JSON.parse(l));
        return { success: true, volumes };
      }

      case 'create': {
        if (!args.name) throw new Error('name required for create');
        await execAsync(`docker volume create ${args.name}`);
        return { success: true, name: args.name, created: true };
      }

      case 'remove': {
        if (!args.name) throw new Error('name required for remove');
        await execAsync(`docker volume rm ${args.name}`);
        return { success: true, name: args.name, removed: true };
      }

      case 'inspect': {
        if (!args.name) throw new Error('name required for inspect');
        const { stdout } = await execAsync(`docker volume inspect ${args.name}`);
        return { success: true, volume: JSON.parse(stdout) };
      }

      case 'prune': {
        const { stdout } = await execAsync(`docker volume prune -f`);
        return { success: true, output: stdout };
      }

      default:
        throw new Error(`Unknown action: ${args.action}`);
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// CLEANUP
// =============================================================================

export async function handleDockerCleanup(args: {
  containers?: boolean;
  images?: boolean;
  volumes?: boolean;
  networks?: boolean;
  all?: boolean;
}): Promise<object> {
  const results: any = {};

  try {
    if (args.containers || args.all) {
      await execAsync('docker container prune -f');
      results.containers = 'pruned';
    }

    if (args.images || args.all) {
      await execAsync('docker image prune -f');
      results.images = 'pruned';
    }

    if (args.volumes || args.all) {
      await execAsync('docker volume prune -f');
      results.volumes = 'pruned';
    }

    if (args.networks || args.all) {
      await execAsync('docker network prune -f');
      results.networks = 'pruned';
    }

    return {
      success: true,
      cleaned: results,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      partialResults: results,
    };
  }
}
