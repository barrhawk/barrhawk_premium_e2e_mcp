/**
 * Dynamic Tool: math_stats
 * Created: 2026-01-23T14:32:49.712Z
 * Permissions: none
 *
 * Calculate statistical measures (mean, median, mode, std dev, min, max, percentiles) for a dataset.
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'math_stats',
  description: "Calculate statistical measures (mean, median, mode, std dev, min, max, percentiles) for a dataset.",
  schema: {
      "type": "object",
      "properties": {
          "data": {
              "type": "array",
              "items": {
                  "type": "number"
              },
              "description": "Array of numbers"
          },
          "percentiles": {
              "type": "array",
              "items": {
                  "type": "number"
              },
              "description": "Percentiles to calculate (0-100). Default: [25, 50, 75, 90, 95, 99]"
          }
      },
      "required": [
          "data"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const data = (args.data as number[]).filter(n => typeof n === 'number' && !isNaN(n));
    const pctls = (args.percentiles as number[]) || [25, 50, 75, 90, 95, 99];
    
    if (data.length === 0) return { error: 'No valid numbers in data' };
    
    const sorted = [...data].sort((a, b) => a - b);
    const sum = data.reduce((a, b) => a + b, 0);
    const mean = sum / data.length;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const range = max - min;
    
    // Median
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    
    // Mode
    const freq = new Map<number, number>();
    data.forEach(n => freq.set(n, (freq.get(n) || 0) + 1));
    const maxFreq = Math.max(...freq.values());
    const mode = [...freq.entries()].filter(([_, f]) => f === maxFreq).map(([n]) => n);
    
    // Standard deviation
    const variance = data.reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) / data.length;
    const stdDev = Math.sqrt(variance);
    
    // Percentiles
    const percentile = (p: number) => {
      const idx = (p / 100) * (sorted.length - 1);
      const lower = Math.floor(idx);
      const upper = Math.ceil(idx);
      if (lower === upper) return sorted[lower];
      return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
    };
    
    const percentiles: Record<string, number> = {};
    pctls.forEach(p => percentiles[`p${p}`] = percentile(p));
    
    return {
      count: data.length,
      sum,
      mean,
      median,
      mode: mode.length === data.length ? undefined : mode,
      min,
      max,
      range,
      variance,
      stdDev,
      percentiles,
    };
  },
};
