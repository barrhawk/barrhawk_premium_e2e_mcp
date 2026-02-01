/**
 * Advanced Filesystem Tools
 *
 * Enhanced filesystem operations for testing workflows
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as crypto from 'crypto';
import archiver from 'archiver';
import extract from 'extract-zip';

const execAsync = promisify(exec);

// Watch sessions
const watchSessions: Map<string, { watcher: any; events: any[] }> = new Map();

// =============================================================================
// CORE FILESYSTEM
// =============================================================================

export async function handleFsReadFile(args: {
  path: string;
  encoding?: BufferEncoding;
}): Promise<object> {
  try {
    const content = await fs.readFile(args.path, args.encoding || 'utf-8');
    const stats = await fs.stat(args.path);

    return {
      success: true,
      path: args.path,
      content,
      size: stats.size,
      modified: stats.mtime.toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleFsWriteFile(args: {
  path: string;
  content: string;
  encoding?: BufferEncoding;
  createDirs?: boolean;
}): Promise<object> {
  try {
    if (args.createDirs !== false) {
      await fs.mkdir(path.dirname(args.path), { recursive: true });
    }

    await fs.writeFile(args.path, args.content, args.encoding || 'utf-8');
    const stats = await fs.stat(args.path);

    return {
      success: true,
      path: args.path,
      size: stats.size,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleFsListDir(args: {
  path: string;
  recursive?: boolean;
  pattern?: string;
}): Promise<object> {
  try {
    const entries: any[] = [];

    async function listDir(dirPath: string, depth: number = 0) {
      const items = await fs.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(dirPath, item.name);
        const stats = await fs.stat(fullPath);

        const entry = {
          name: item.name,
          path: fullPath,
          type: item.isDirectory() ? 'directory' : 'file',
          size: stats.size,
          modified: stats.mtime.toISOString(),
          depth,
        };

        if (args.pattern) {
          const regex = new RegExp(args.pattern);
          if (regex.test(item.name)) {
            entries.push(entry);
          }
        } else {
          entries.push(entry);
        }

        if (args.recursive && item.isDirectory()) {
          await listDir(fullPath, depth + 1);
        }
      }
    }

    await listDir(args.path);

    return {
      success: true,
      path: args.path,
      entries,
      count: entries.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleFsExists(args: {
  path: string;
}): Promise<object> {
  try {
    const stats = await fs.stat(args.path);

    return {
      success: true,
      path: args.path,
      exists: true,
      type: stats.isDirectory() ? 'directory' : 'file',
      size: stats.size,
    };
  } catch {
    return {
      success: true,
      path: args.path,
      exists: false,
    };
  }
}

export async function handleFsMkdir(args: {
  path: string;
  recursive?: boolean;
}): Promise<object> {
  try {
    await fs.mkdir(args.path, { recursive: args.recursive !== false });

    return {
      success: true,
      path: args.path,
      created: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleFsRemove(args: {
  path: string;
  recursive?: boolean;
  force?: boolean;
}): Promise<object> {
  try {
    await fs.rm(args.path, {
      recursive: args.recursive || false,
      force: args.force || false,
    });

    return {
      success: true,
      path: args.path,
      removed: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleFsCopy(args: {
  source: string;
  destination: string;
  recursive?: boolean;
}): Promise<object> {
  try {
    const stats = await fs.stat(args.source);

    if (stats.isDirectory()) {
      await fs.cp(args.source, args.destination, { recursive: true });
    } else {
      await fs.mkdir(path.dirname(args.destination), { recursive: true });
      await fs.copyFile(args.source, args.destination);
    }

    return {
      success: true,
      source: args.source,
      destination: args.destination,
      copied: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleFsMove(args: {
  source: string;
  destination: string;
}): Promise<object> {
  try {
    await fs.mkdir(path.dirname(args.destination), { recursive: true });
    await fs.rename(args.source, args.destination);

    return {
      success: true,
      source: args.source,
      destination: args.destination,
      moved: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// ADVANCED OPERATIONS
// =============================================================================

export async function handleFsWatch(args: {
  action: 'start' | 'stop' | 'events';
  path?: string;
  id?: string;
}): Promise<object> {
  try {
    switch (args.action) {
      case 'start': {
        if (!args.path) throw new Error('path required for start');

        const id = args.id || crypto.randomUUID();
        const events: any[] = [];

        const watcher = fsSync.watch(args.path, { recursive: true }, (eventType: string, filename: string | null) => {
          events.push({
            type: eventType,
            file: filename,
            timestamp: new Date().toISOString(),
          });

          // Keep only last 100 events
          if (events.length > 100) events.shift();
        });

        watchSessions.set(id, { watcher, events });

        return {
          success: true,
          id,
          path: args.path,
          watching: true,
        };
      }

      case 'stop': {
        if (!args.id) throw new Error('id required for stop');

        const session = watchSessions.get(args.id);
        if (!session) throw new Error(`No watch session: ${args.id}`);

        session.watcher.close();
        watchSessions.delete(args.id);

        return {
          success: true,
          id: args.id,
          stopped: true,
        };
      }

      case 'events': {
        if (!args.id) throw new Error('id required for events');

        const session = watchSessions.get(args.id);
        if (!session) throw new Error(`No watch session: ${args.id}`);

        return {
          success: true,
          id: args.id,
          events: session.events,
          count: session.events.length,
        };
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

export async function handleFsDiff(args: {
  file1: string;
  file2: string;
  context?: number;
}): Promise<object> {
  try {
    const context = args.context || 3;
    const { stdout, stderr } = await execAsync(
      `diff -u -U${context} "${args.file1}" "${args.file2}"`,
      { maxBuffer: 10 * 1024 * 1024 }
    ).catch(e => ({ stdout: e.stdout || '', stderr: e.stderr || '' }));

    const lines = stdout.split('\n');
    const additions = lines.filter((l: string) => l.startsWith('+')).length;
    const deletions = lines.filter((l: string) => l.startsWith('-')).length;

    return {
      success: true,
      file1: args.file1,
      file2: args.file2,
      diff: stdout,
      additions,
      deletions,
      identical: stdout.trim() === '',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleFsSearch(args: {
  path: string;
  pattern: string;
  type?: 'file' | 'directory' | 'all';
  maxDepth?: number;
}): Promise<object> {
  try {
    const results: any[] = [];
    const regex = new RegExp(args.pattern);
    const maxDepth = args.maxDepth || 10;

    async function search(dirPath: string, depth: number) {
      if (depth > maxDepth) return;

      const items = await fs.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(dirPath, item.name);
        const isDir = item.isDirectory();

        const typeMatch =
          args.type === 'all' || !args.type ||
          (args.type === 'file' && !isDir) ||
          (args.type === 'directory' && isDir);

        if (regex.test(item.name) && typeMatch) {
          const stats = await fs.stat(fullPath);
          results.push({
            name: item.name,
            path: fullPath,
            type: isDir ? 'directory' : 'file',
            size: stats.size,
            modified: stats.mtime.toISOString(),
          });
        }

        if (isDir) {
          await search(fullPath, depth + 1);
        }
      }
    }

    await search(args.path, 0);

    return {
      success: true,
      pattern: args.pattern,
      results,
      count: results.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleFsHash(args: {
  path: string;
  algorithm?: 'md5' | 'sha1' | 'sha256' | 'sha512';
}): Promise<object> {
  try {
    const algorithm = args.algorithm || 'sha256';
    const content = await fs.readFile(args.path);
    const hash = crypto.createHash(algorithm).update(content).digest('hex');

    return {
      success: true,
      path: args.path,
      algorithm,
      hash,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// COMPRESSION
// =============================================================================

export async function handleFsZip(args: {
  source: string;
  destination: string;
  level?: number;
}): Promise<object> {
  return new Promise((resolve) => {
    try {
      const output = createWriteStream(args.destination);
      const archive = archiver('zip', {
        zlib: { level: args.level || 9 },
      });

      let size = 0;

      output.on('close', () => {
        resolve({
          success: true,
          source: args.source,
          destination: args.destination,
          size: archive.pointer(),
        });
      });

      archive.on('error', (err) => {
        resolve({
          success: false,
          error: err.message,
        });
      });

      archive.pipe(output);

      fs.stat(args.source).then(stats => {
        if (stats.isDirectory()) {
          archive.directory(args.source, false);
        } else {
          archive.file(args.source, { name: path.basename(args.source) });
        }
        archive.finalize();
      });
    } catch (error) {
      resolve({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

export async function handleFsUnzip(args: {
  source: string;
  destination: string;
}): Promise<object> {
  try {
    await fs.mkdir(args.destination, { recursive: true });
    await extract(args.source, { dir: path.resolve(args.destination) });

    const entries = await fs.readdir(args.destination);

    return {
      success: true,
      source: args.source,
      destination: args.destination,
      entries: entries.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// PERMISSIONS
// =============================================================================

export async function handleFsChmod(args: {
  path: string;
  mode: string | number;
}): Promise<object> {
  try {
    const mode = typeof args.mode === 'string' ? parseInt(args.mode, 8) : args.mode;
    await fs.chmod(args.path, mode);

    return {
      success: true,
      path: args.path,
      mode: args.mode,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleFsChown(args: {
  path: string;
  uid: number;
  gid: number;
}): Promise<object> {
  try {
    await fs.chown(args.path, args.uid, args.gid);

    return {
      success: true,
      path: args.path,
      uid: args.uid,
      gid: args.gid,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// TEMPLATES
// =============================================================================

export async function handleFsTemplate(args: {
  template: string;
  variables: Record<string, string>;
  output: string;
}): Promise<object> {
  try {
    let content = await fs.readFile(args.template, 'utf-8');

    // Replace {{variable}} patterns
    for (const [key, value] of Object.entries(args.variables)) {
      content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    await fs.mkdir(path.dirname(args.output), { recursive: true });
    await fs.writeFile(args.output, content, 'utf-8');

    return {
      success: true,
      template: args.template,
      output: args.output,
      variablesReplaced: Object.keys(args.variables).length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// BACKUP/RESTORE
// =============================================================================

export async function handleFsBackup(args: {
  source: string;
  destination?: string;
  compress?: boolean;
}): Promise<object> {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = path.basename(args.source);
    const backupName = `${baseName}.backup.${timestamp}`;
    const destination = args.destination || path.join(path.dirname(args.source), backupName);

    const stats = await fs.stat(args.source);

    if (stats.isDirectory()) {
      if (args.compress) {
        const zipDest = destination + '.zip';
        return handleFsZip({ source: args.source, destination: zipDest });
      } else {
        await fs.cp(args.source, destination, { recursive: true });
      }
    } else {
      if (args.compress) {
        const zipDest = destination + '.zip';
        return handleFsZip({ source: args.source, destination: zipDest });
      } else {
        await fs.copyFile(args.source, destination);
      }
    }

    return {
      success: true,
      source: args.source,
      backup: destination,
      compressed: args.compress || false,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleFsRestore(args: {
  backup: string;
  destination: string;
  overwrite?: boolean;
}): Promise<object> {
  try {
    // Check if destination exists
    try {
      await fs.stat(args.destination);
      if (!args.overwrite) {
        throw new Error('Destination exists. Set overwrite: true to replace.');
      }
      await fs.rm(args.destination, { recursive: true, force: true });
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e;
    }

    // Check if backup is a zip
    if (args.backup.endsWith('.zip')) {
      return handleFsUnzip({ source: args.backup, destination: args.destination });
    }

    const stats = await fs.stat(args.backup);

    if (stats.isDirectory()) {
      await fs.cp(args.backup, args.destination, { recursive: true });
    } else {
      await fs.mkdir(path.dirname(args.destination), { recursive: true });
      await fs.copyFile(args.backup, args.destination);
    }

    return {
      success: true,
      backup: args.backup,
      destination: args.destination,
      restored: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
