/**
 * Snapshot Manager - Handles backup and restore of secondary server state
 */

import { mkdir, readdir, rm, stat, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, basename } from 'path';
import { spawn } from 'bun';
import type { SnapshotMeta } from '../shared/types.js';

export class SnapshotManager {
  private snapshotDir: string;
  private secondaryDir: string;
  private retention: number;

  constructor(
    snapshotDir: string,
    secondaryDir: string,
    retention = 10
  ) {
    this.snapshotDir = snapshotDir;
    this.secondaryDir = secondaryDir;
    this.retention = retention;
  }

  /**
   * Initialize snapshot directory
   */
  async init(): Promise<void> {
    if (!existsSync(this.snapshotDir)) {
      await mkdir(this.snapshotDir, { recursive: true });
    }
  }

  /**
   * Create a snapshot of the secondary server
   */
  async create(
    name: string,
    trigger: 'manual' | 'auto' | 'pre-rollback' = 'manual'
  ): Promise<SnapshotMeta> {
    const id = `${name}-${Date.now()}`;
    const snapshotPath = join(this.snapshotDir, id);

    console.error(`[Snapshot] Creating snapshot: ${id}`);

    // Copy secondary directory
    const proc = spawn({
      cmd: ['cp', '-r', this.secondaryDir, snapshotPath],
      stdout: 'inherit',
      stderr: 'inherit',
    });
    await proc.exited;

    if (proc.exitCode !== 0) {
      throw new Error(`Failed to create snapshot: exit code ${proc.exitCode}`);
    }

    // Count tools
    const toolsDir = join(snapshotPath, 'tools');
    let toolCount = 0;
    if (existsSync(toolsDir)) {
      const files = await readdir(toolsDir);
      toolCount = files.filter(f => f.endsWith('.ts')).length;
    }

    // Calculate size
    const size = await this.getDirectorySize(snapshotPath);

    // Save metadata
    const meta: SnapshotMeta = {
      id,
      name,
      createdAt: new Date(),
      size,
      toolCount,
      trigger,
    };

    await writeFile(
      join(snapshotPath, '.meta.json'),
      JSON.stringify(meta, null, 2)
    );

    // Cleanup old snapshots
    await this.cleanupOldSnapshots();

    console.error(`[Snapshot] Created: ${id} (${toolCount} tools, ${this.formatSize(size)})`);

    return meta;
  }

  /**
   * List all available snapshots
   */
  async list(): Promise<SnapshotMeta[]> {
    if (!existsSync(this.snapshotDir)) {
      return [];
    }

    const entries = await readdir(this.snapshotDir);
    const snapshots: SnapshotMeta[] = [];

    for (const entry of entries) {
      const metaPath = join(this.snapshotDir, entry, '.meta.json');
      if (existsSync(metaPath)) {
        try {
          const meta = JSON.parse(await readFile(metaPath, 'utf-8'));
          meta.createdAt = new Date(meta.createdAt);
          snapshots.push(meta);
        } catch {
          // Skip invalid snapshots
        }
      }
    }

    // Sort by date descending
    return snapshots.sort((a, b) =>
      b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  /**
   * Restore a snapshot
   */
  async restore(snapshotId?: string): Promise<SnapshotMeta> {
    const snapshots = await this.list();

    if (snapshots.length === 0) {
      throw new Error('No snapshots available');
    }

    // Find target snapshot
    let target: SnapshotMeta;
    if (snapshotId) {
      const found = snapshots.find(s => s.id === snapshotId || s.id.startsWith(snapshotId));
      if (!found) {
        throw new Error(`Snapshot not found: ${snapshotId}`);
      }
      target = found;
    } else {
      // Use latest
      target = snapshots[0];
    }

    const snapshotPath = join(this.snapshotDir, target.id);

    console.error(`[Snapshot] Restoring: ${target.id}`);

    // Create backup of current state before restore
    await this.create('pre-restore', 'pre-rollback');

    // Remove current secondary (except node_modules)
    const secondaryContents = await readdir(this.secondaryDir);
    for (const item of secondaryContents) {
      if (item !== 'node_modules') {
        await rm(join(this.secondaryDir, item), { recursive: true, force: true });
      }
    }

    // Copy snapshot contents (except node_modules and .meta.json)
    const snapshotContents = await readdir(snapshotPath);
    for (const item of snapshotContents) {
      if (item !== 'node_modules' && item !== '.meta.json') {
        const src = join(snapshotPath, item);
        const dest = join(this.secondaryDir, item);

        const proc = spawn({
          cmd: ['cp', '-r', src, dest],
        });
        await proc.exited;
      }
    }

    console.error(`[Snapshot] Restored: ${target.id}`);

    return target;
  }

  /**
   * Delete a snapshot
   */
  async delete(snapshotId: string): Promise<void> {
    const snapshots = await this.list();
    const found = snapshots.find(s => s.id === snapshotId);

    if (!found) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    const snapshotPath = join(this.snapshotDir, found.id);
    await rm(snapshotPath, { recursive: true, force: true });

    console.error(`[Snapshot] Deleted: ${snapshotId}`);
  }

  /**
   * Get the latest snapshot
   */
  async getLatest(): Promise<SnapshotMeta | null> {
    const snapshots = await this.list();
    return snapshots[0] || null;
  }

  /**
   * Cleanup old snapshots beyond retention limit
   */
  private async cleanupOldSnapshots(): Promise<void> {
    const snapshots = await this.list();

    if (snapshots.length <= this.retention) {
      return;
    }

    // Keep the most recent N snapshots
    const toDelete = snapshots.slice(this.retention);

    for (const snapshot of toDelete) {
      const snapshotPath = join(this.snapshotDir, snapshot.id);
      await rm(snapshotPath, { recursive: true, force: true });
      console.error(`[Snapshot] Cleaned up old snapshot: ${snapshot.id}`);
    }
  }

  /**
   * Calculate directory size recursively
   */
  private async getDirectorySize(dir: string): Promise<number> {
    let size = 0;
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        size += await this.getDirectorySize(path);
      } else {
        const stats = await stat(path);
        size += stats.size;
      }
    }

    return size;
  }

  /**
   * Format size in human readable format
   */
  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}
