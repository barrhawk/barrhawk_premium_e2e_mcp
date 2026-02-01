/**
 * BarrHawk E2E Visual Diff Engine
 *
 * Pixel-by-pixel screenshot comparison for visual regression testing.
 * Uses PNG image comparison with configurable thresholds.
 */

import { readFile, writeFile, mkdir, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import sharp from 'sharp';

// =============================================================================
// Types
// =============================================================================

export interface DiffResult {
  /** Whether the images match within threshold */
  match: boolean;
  /** Percentage of pixels that differ (0-100) */
  diffPercentage: number;
  /** Number of different pixels */
  diffPixels: number;
  /** Total pixels compared */
  totalPixels: number;
  /** Path to generated diff image (if created) */
  diffImagePath?: string;
  /** Dimensions of compared images */
  dimensions: { width: number; height: number };
  /** Error message if comparison failed */
  error?: string;
}

export interface VisualDiffConfig {
  /** Directory for baseline images */
  baselineDir: string;
  /** Directory for current/actual images */
  actualDir: string;
  /** Directory for diff output images */
  diffDir: string;
  /** Threshold for pixel difference (0-1, lower = stricter) */
  threshold?: number;
  /** Percentage of different pixels allowed before failing (0-100) */
  allowedDiffPercentage?: number;
  /** Include anti-aliasing detection */
  antiAliasing?: boolean;
  /** Color for highlighting differences in diff image (RGBA) */
  diffColor?: [number, number, number, number];
}

export interface ComparisonReport {
  timestamp: Date;
  totalComparisons: number;
  passed: number;
  failed: number;
  newBaselines: number;
  comparisons: Array<{
    name: string;
    status: 'passed' | 'failed' | 'new_baseline' | 'error';
    diffPercentage?: number;
    diffImagePath?: string;
    error?: string;
  }>;
}

// =============================================================================
// Visual Diff Engine
// =============================================================================

export class VisualDiffEngine {
  private config: Required<VisualDiffConfig>;

  constructor(config: VisualDiffConfig) {
    this.config = {
      threshold: 0.1,
      allowedDiffPercentage: 0.1,
      antiAliasing: true,
      diffColor: [255, 0, 255, 255], // Magenta
      ...config,
    };
  }

  async initialize(): Promise<void> {
    await mkdir(this.config.baselineDir, { recursive: true });
    await mkdir(this.config.actualDir, { recursive: true });
    await mkdir(this.config.diffDir, { recursive: true });
  }

  /**
   * Compare two images pixel by pixel
   */
  async compareImages(
    baselinePath: string,
    actualPath: string,
    diffOutputPath?: string
  ): Promise<DiffResult> {
    try {
      // Load images
      const [baselineBuffer, actualBuffer] = await Promise.all([
        readFile(baselinePath),
        readFile(actualPath),
      ]);

      // Get image metadata
      const [baselineMeta, actualMeta] = await Promise.all([
        sharp(baselineBuffer).metadata(),
        sharp(actualBuffer).metadata(),
      ]);

      // Check dimensions match
      if (baselineMeta.width !== actualMeta.width || baselineMeta.height !== actualMeta.height) {
        return {
          match: false,
          diffPercentage: 100,
          diffPixels: 0,
          totalPixels: 0,
          dimensions: { width: actualMeta.width || 0, height: actualMeta.height || 0 },
          error: `Dimension mismatch: baseline ${baselineMeta.width}x${baselineMeta.height} vs actual ${actualMeta.width}x${actualMeta.height}`,
        };
      }

      const width = baselineMeta.width!;
      const height = baselineMeta.height!;
      const totalPixels = width * height;

      // Convert to raw RGBA pixels
      const [baselineRaw, actualRaw] = await Promise.all([
        sharp(baselineBuffer).raw().ensureAlpha().toBuffer(),
        sharp(actualBuffer).raw().ensureAlpha().toBuffer(),
      ]);

      // Compare pixels
      let diffPixels = 0;
      const diffBuffer = Buffer.alloc(width * height * 4);

      for (let i = 0; i < totalPixels; i++) {
        const offset = i * 4;
        const r1 = baselineRaw[offset];
        const g1 = baselineRaw[offset + 1];
        const b1 = baselineRaw[offset + 2];
        const a1 = baselineRaw[offset + 3];

        const r2 = actualRaw[offset];
        const g2 = actualRaw[offset + 1];
        const b2 = actualRaw[offset + 2];
        const a2 = actualRaw[offset + 3];

        // Calculate color distance
        const colorDiff = this.colorDistance(r1, g1, b1, a1, r2, g2, b2, a2);

        if (colorDiff > this.config.threshold * 255) {
          // Check for anti-aliasing if enabled
          if (this.config.antiAliasing && this.isAntiAliased(baselineRaw, actualRaw, i, width, height)) {
            // Anti-aliased pixel, copy from actual
            diffBuffer[offset] = r2;
            diffBuffer[offset + 1] = g2;
            diffBuffer[offset + 2] = b2;
            diffBuffer[offset + 3] = a2;
          } else {
            diffPixels++;
            // Mark as different with diff color
            diffBuffer[offset] = this.config.diffColor[0];
            diffBuffer[offset + 1] = this.config.diffColor[1];
            diffBuffer[offset + 2] = this.config.diffColor[2];
            diffBuffer[offset + 3] = this.config.diffColor[3];
          }
        } else {
          // Copy from actual (dimmed)
          diffBuffer[offset] = Math.floor(r2 * 0.3);
          diffBuffer[offset + 1] = Math.floor(g2 * 0.3);
          diffBuffer[offset + 2] = Math.floor(b2 * 0.3);
          diffBuffer[offset + 3] = a2;
        }
      }

      const diffPercentage = (diffPixels / totalPixels) * 100;
      const match = diffPercentage <= this.config.allowedDiffPercentage;

      // Save diff image if requested
      let savedDiffPath: string | undefined;
      if (diffOutputPath && diffPixels > 0) {
        await sharp(diffBuffer, { raw: { width, height, channels: 4 } })
          .png()
          .toFile(diffOutputPath);
        savedDiffPath = diffOutputPath;
      }

      return {
        match,
        diffPercentage,
        diffPixels,
        totalPixels,
        diffImagePath: savedDiffPath,
        dimensions: { width, height },
      };
    } catch (error) {
      return {
        match: false,
        diffPercentage: 100,
        diffPixels: 0,
        totalPixels: 0,
        dimensions: { width: 0, height: 0 },
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private colorDistance(
    r1: number, g1: number, b1: number, a1: number,
    r2: number, g2: number, b2: number, a2: number
  ): number {
    // Euclidean distance in RGBA space
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    const da = a1 - a2;
    return Math.sqrt(dr * dr + dg * dg + db * db + da * da) / 2;
  }

  private isAntiAliased(
    img1: Buffer,
    img2: Buffer,
    pixelIndex: number,
    width: number,
    height: number
  ): boolean {
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);

    // Check if pixel is on edge (has very different neighbors)
    let hasHighContrast = false;
    let hasSimilarNeighbor = false;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;

        const nx = x + dx;
        const ny = y + dy;

        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

        const neighborIndex = ny * width + nx;
        const offset = pixelIndex * 4;
        const neighborOffset = neighborIndex * 4;

        // Check contrast with neighbor in baseline
        const contrast1 = this.colorDistance(
          img1[offset], img1[offset + 1], img1[offset + 2], img1[offset + 3],
          img1[neighborOffset], img1[neighborOffset + 1], img1[neighborOffset + 2], img1[neighborOffset + 3]
        );

        if (contrast1 > 50) hasHighContrast = true;

        // Check if neighbor is similar between images
        const neighborDiff = this.colorDistance(
          img1[neighborOffset], img1[neighborOffset + 1], img1[neighborOffset + 2], img1[neighborOffset + 3],
          img2[neighborOffset], img2[neighborOffset + 1], img2[neighborOffset + 2], img2[neighborOffset + 3]
        );

        if (neighborDiff < this.config.threshold * 255) hasSimilarNeighbor = true;
      }
    }

    return hasHighContrast && hasSimilarNeighbor;
  }

  /**
   * Compare a screenshot against its baseline
   */
  async compareWithBaseline(screenshotName: string): Promise<DiffResult> {
    const baselinePath = path.join(this.config.baselineDir, `${screenshotName}.png`);
    const actualPath = path.join(this.config.actualDir, `${screenshotName}.png`);
    const diffPath = path.join(this.config.diffDir, `${screenshotName}-diff.png`);

    if (!existsSync(baselinePath)) {
      // No baseline exists, this is a new screenshot
      return {
        match: true,
        diffPercentage: 0,
        diffPixels: 0,
        totalPixels: 0,
        dimensions: { width: 0, height: 0 },
        error: 'NO_BASELINE',
      };
    }

    if (!existsSync(actualPath)) {
      return {
        match: false,
        diffPercentage: 100,
        diffPixels: 0,
        totalPixels: 0,
        dimensions: { width: 0, height: 0 },
        error: 'NO_ACTUAL_IMAGE',
      };
    }

    return this.compareImages(baselinePath, actualPath, diffPath);
  }

  /**
   * Save current screenshot as new baseline
   */
  async updateBaseline(screenshotName: string): Promise<void> {
    const actualPath = path.join(this.config.actualDir, `${screenshotName}.png`);
    const baselinePath = path.join(this.config.baselineDir, `${screenshotName}.png`);

    if (!existsSync(actualPath)) {
      throw new Error(`Actual image not found: ${actualPath}`);
    }

    const content = await readFile(actualPath);
    await writeFile(baselinePath, content);
  }

  /**
   * Run comparison for all screenshots in actual directory
   */
  async runFullComparison(): Promise<ComparisonReport> {
    const report: ComparisonReport = {
      timestamp: new Date(),
      totalComparisons: 0,
      passed: 0,
      failed: 0,
      newBaselines: 0,
      comparisons: [],
    };

    if (!existsSync(this.config.actualDir)) {
      return report;
    }

    const files = await readdir(this.config.actualDir);
    const pngFiles = files.filter(f => f.endsWith('.png'));

    for (const file of pngFiles) {
      const name = file.replace('.png', '');
      report.totalComparisons++;

      const result = await this.compareWithBaseline(name);

      if (result.error === 'NO_BASELINE') {
        report.newBaselines++;
        report.comparisons.push({
          name,
          status: 'new_baseline',
        });
      } else if (result.error) {
        report.failed++;
        report.comparisons.push({
          name,
          status: 'error',
          error: result.error,
        });
      } else if (result.match) {
        report.passed++;
        report.comparisons.push({
          name,
          status: 'passed',
          diffPercentage: result.diffPercentage,
        });
      } else {
        report.failed++;
        report.comparisons.push({
          name,
          status: 'failed',
          diffPercentage: result.diffPercentage,
          diffImagePath: result.diffImagePath,
        });
      }
    }

    return report;
  }

  /**
   * Generate HTML report of visual comparisons
   */
  async generateHtmlReport(report: ComparisonReport, outputPath: string): Promise<void> {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Visual Diff Report - ${report.timestamp.toISOString()}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #eee; padding: 20px; }
    .summary { display: flex; gap: 20px; margin-bottom: 30px; }
    .stat { background: #16213e; padding: 20px; border-radius: 8px; text-align: center; }
    .stat-value { font-size: 2em; font-weight: bold; }
    .stat-label { color: #888; }
    .passed { color: #22c55e; }
    .failed { color: #ef4444; }
    .new { color: #3b82f6; }
    .comparison { background: #16213e; margin: 10px 0; padding: 15px; border-radius: 8px; }
    .comparison-header { display: flex; justify-content: space-between; align-items: center; }
    .status-badge { padding: 4px 12px; border-radius: 4px; font-size: 0.85em; }
    .status-passed { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
    .status-failed { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
    .status-new { background: rgba(59, 130, 246, 0.2); color: #3b82f6; }
    .images { display: flex; gap: 10px; margin-top: 15px; flex-wrap: wrap; }
    .images img { max-width: 300px; border: 1px solid #333; border-radius: 4px; }
    .image-label { font-size: 0.8em; color: #888; margin-top: 4px; }
  </style>
</head>
<body>
  <h1>Visual Diff Report</h1>
  <p>Generated: ${report.timestamp.toISOString()}</p>

  <div class="summary">
    <div class="stat">
      <div class="stat-value">${report.totalComparisons}</div>
      <div class="stat-label">Total</div>
    </div>
    <div class="stat">
      <div class="stat-value passed">${report.passed}</div>
      <div class="stat-label">Passed</div>
    </div>
    <div class="stat">
      <div class="stat-value failed">${report.failed}</div>
      <div class="stat-label">Failed</div>
    </div>
    <div class="stat">
      <div class="stat-value new">${report.newBaselines}</div>
      <div class="stat-label">New Baselines</div>
    </div>
  </div>

  <h2>Comparisons</h2>
  ${report.comparisons.map(c => `
    <div class="comparison">
      <div class="comparison-header">
        <strong>${c.name}</strong>
        <span class="status-badge status-${c.status === 'passed' ? 'passed' : c.status === 'new_baseline' ? 'new' : 'failed'}">
          ${c.status.toUpperCase()}
        </span>
      </div>
      ${c.diffPercentage !== undefined ? `<p>Diff: ${c.diffPercentage.toFixed(3)}%</p>` : ''}
      ${c.error ? `<p style="color: #ef4444;">Error: ${c.error}</p>` : ''}
      ${c.diffImagePath ? `
        <div class="images">
          <div>
            <img src="${this.config.baselineDir}/${c.name}.png" alt="Baseline">
            <div class="image-label">Baseline</div>
          </div>
          <div>
            <img src="${this.config.actualDir}/${c.name}.png" alt="Actual">
            <div class="image-label">Actual</div>
          </div>
          <div>
            <img src="${c.diffImagePath}" alt="Diff">
            <div class="image-label">Diff</div>
          </div>
        </div>
      ` : ''}
    </div>
  `).join('')}
</body>
</html>`;

    await writeFile(outputPath, html);
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

let defaultEngine: VisualDiffEngine | null = null;

export async function getVisualDiffEngine(config?: Partial<VisualDiffConfig>): Promise<VisualDiffEngine> {
  if (!defaultEngine) {
    defaultEngine = new VisualDiffEngine({
      baselineDir: './visual-baselines',
      actualDir: './visual-actual',
      diffDir: './visual-diffs',
      ...config,
    });
    await defaultEngine.initialize();
  }
  return defaultEngine;
}

export async function compareScreenshot(
  baselinePath: string,
  actualPath: string,
  options?: { threshold?: number; outputDiff?: string }
): Promise<DiffResult> {
  const engine = await getVisualDiffEngine();
  return engine.compareImages(baselinePath, actualPath, options?.outputDiff);
}
