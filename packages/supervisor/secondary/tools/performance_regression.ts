/**
 * Dynamic Tool: performance_regression
 * Created: 2026-01-23T14:31:52.079Z
 * Permissions: none
 *
 * Detect performance regressions by comparing baseline and current metrics with statistical analysis.
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'performance_regression',
  description: "Detect performance regressions by comparing baseline and current metrics with statistical analysis.",
  schema: {
      "type": "object",
      "properties": {
          "baseline": {
              "type": "array",
              "description": "Array of baseline metric runs (lcp, fcp, cls, ttfb, tti, tbt)"
          },
          "current": {
              "type": "array",
              "description": "Array of current metric runs"
          },
          "thresholds": {
              "type": "object",
              "properties": {
                  "percentageThreshold": {
                      "type": "number",
                      "description": "Percentage change to flag. Default: 10"
                  },
                  "absoluteThreshold": {
                      "type": "number",
                      "description": "Absolute ms change to flag. Default: 100"
                  }
              }
          }
      },
      "required": [
          "baseline",
          "current"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const baseline = args.baseline as Array<Record<string, number>>;
    const current = args.current as Array<Record<string, number>>;
    const thresholds = (args.thresholds as Record<string, number>) || {};
    const pctThreshold = thresholds.percentageThreshold ?? 10;
    const absThreshold = thresholds.absoluteThreshold ?? 100;
    
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const metrics = ['lcp', 'fcp', 'cls', 'ttfb', 'tti', 'tbt'];
    
    const regressions: Array<{metric: string, baselineAvg: number, currentAvg: number, change: number, severity: string}> = [];
    const improvements: Array<{metric: string, baselineAvg: number, currentAvg: number, change: number}> = [];
    const stable: string[] = [];
    
    for (const metric of metrics) {
      const baseVals = baseline.map(b => b[metric]).filter(v => v !== undefined && v !== null);
      const currVals = current.map(c => c[metric]).filter(v => v !== undefined && v !== null);
      
      if (baseVals.length === 0 || currVals.length === 0) continue;
      
      const baselineAvg = avg(baseVals);
      const currentAvg = avg(currVals);
      const change = baselineAvg > 0 ? ((currentAvg - baselineAvg) / baselineAvg) * 100 : 0;
      const absDiff = Math.abs(currentAvg - baselineAvg);
      
      if (change > pctThreshold && absDiff > absThreshold) {
        let severity = 'warning';
        if (change > pctThreshold * 2) severity = 'critical';
        regressions.push({ metric, baselineAvg, currentAvg, change, severity });
      } else if (change < -pctThreshold && absDiff > absThreshold) {
        improvements.push({ metric, baselineAvg, currentAvg, change });
      } else {
        stable.push(metric);
      }
    }
    
    const hasRegression = regressions.length > 0;
    const icon = hasRegression ? '[REGRESSION]' : '[OK]';
    
    let output = `${icon} Performance Regression Check\n\n`;
    output += `Status: ${hasRegression ? 'REGRESSION DETECTED' : 'No regression'}\n\n`;
    
    if (regressions.length > 0) {
      output += `Regressions:\n`;
      for (const r of regressions) {
        output += `- ${r.metric.toUpperCase()}: ${r.baselineAvg.toFixed(0)} -> ${r.currentAvg.toFixed(0)} (+${r.change.toFixed(1)}%) [${r.severity}]\n`;
      }
    }
    
    if (improvements.length > 0) {
      output += `\nImprovements:\n`;
      for (const i of improvements) {
        output += `- ${i.metric.toUpperCase()}: ${i.baselineAvg.toFixed(0)} -> ${i.currentAvg.toFixed(0)} (${i.change.toFixed(1)}%)\n`;
      }
    }
    
    if (stable.length > 0) {
      output += `\nStable: ${stable.map(s => s.toUpperCase()).join(', ')}\n`;
    }
    
    return { hasRegression, regressions, improvements, stable, output };
  },
};
