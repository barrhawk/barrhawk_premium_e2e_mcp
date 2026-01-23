/**
 * Dynamic Tool: date_utils
 * Created: 2026-01-23T14:34:37.342Z
 * Permissions: none
 *
 * Date utilities: parse, format, diff, add/subtract time.
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'date_utils',
  description: "Date utilities: parse, format, diff, add/subtract time.",
  schema: {
      "type": "object",
      "properties": {
          "operation": {
              "type": "string",
              "enum": [
                  "now",
                  "parse",
                  "format",
                  "diff",
                  "add",
                  "subtract",
                  "startOf",
                  "endOf"
              ],
              "description": "Operation to perform"
          },
          "date": {
              "type": "string",
              "description": "Date string or ISO format"
          },
          "date2": {
              "type": "string",
              "description": "Second date for diff operation"
          },
          "amount": {
              "type": "number",
              "description": "Amount for add/subtract"
          },
          "unit": {
              "type": "string",
              "enum": [
                  "milliseconds",
                  "seconds",
                  "minutes",
                  "hours",
                  "days",
                  "weeks",
                  "months",
                  "years"
              ],
              "description": "Unit for add/subtract/diff"
          },
          "format": {
              "type": "string",
              "description": "Output format: iso, date, time, datetime, unix"
          }
      },
      "required": [
          "operation"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const op = args.operation as string;
    const dateStr = args.date as string | undefined;
    const date2Str = args.date2 as string | undefined;
    const amount = (args.amount as number) || 0;
    const unit = (args.unit as string) || 'days';
    const fmt = (args.format as string) || 'iso';
    
    const parseDate = (s?: string) => s ? new Date(s) : new Date();
    const formatDate = (d: Date) => {
      switch (fmt) {
        case 'date': return d.toISOString().split('T')[0];
        case 'time': return d.toTimeString().split(' ')[0];
        case 'datetime': return d.toISOString().replace('T', ' ').split('.')[0];
        case 'unix': return Math.floor(d.getTime() / 1000);
        default: return d.toISOString();
      }
    };
    
    const msPerUnit: Record<string, number> = {
      milliseconds: 1, seconds: 1000, minutes: 60000, hours: 3600000,
      days: 86400000, weeks: 604800000, months: 2592000000, years: 31536000000,
    };
    
    let result: unknown;
    const date = parseDate(dateStr);
    
    switch (op) {
      case 'now':
        result = { iso: new Date().toISOString(), unix: Math.floor(Date.now() / 1000) };
        break;
      case 'parse':
        result = { iso: date.toISOString(), unix: Math.floor(date.getTime() / 1000), valid: !isNaN(date.getTime()) };
        break;
      case 'format':
        result = formatDate(date);
        break;
      case 'diff':
        const d2 = parseDate(date2Str);
        const diffMs = Math.abs(date.getTime() - d2.getTime());
        result = { [unit]: Math.floor(diffMs / msPerUnit[unit]), milliseconds: diffMs };
        break;
      case 'add':
        result = formatDate(new Date(date.getTime() + amount * msPerUnit[unit]));
        break;
      case 'subtract':
        result = formatDate(new Date(date.getTime() - amount * msPerUnit[unit]));
        break;
      case 'startOf':
        const start = new Date(date);
        if (unit === 'days') start.setHours(0, 0, 0, 0);
        else if (unit === 'months') { start.setDate(1); start.setHours(0, 0, 0, 0); }
        else if (unit === 'years') { start.setMonth(0, 1); start.setHours(0, 0, 0, 0); }
        result = formatDate(start);
        break;
      case 'endOf':
        const end = new Date(date);
        if (unit === 'days') end.setHours(23, 59, 59, 999);
        else if (unit === 'months') { end.setMonth(end.getMonth() + 1, 0); end.setHours(23, 59, 59, 999); }
        else if (unit === 'years') { end.setMonth(11, 31); end.setHours(23, 59, 59, 999); }
        result = formatDate(end);
        break;
      default:
        return { error: `Unknown operation: ${op}` };
    }
    
    return { operation: op, result };
  },
};
