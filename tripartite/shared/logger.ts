/**
 * Structured JSON Logger
 *
 * Provides consistent, machine-readable logging across all components.
 * Supports log levels, request ID propagation, and contextual metadata.
 */

// =============================================================================
// Types
// =============================================================================

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  version: string;
  message: string;
  requestId?: string;
  planId?: string;
  stepIndex?: number;
  duration?: number;
  error?: {
    code?: string;
    message: string;
    stack?: string;
  };
  meta?: Record<string, unknown>;
}

export interface LoggerConfig {
  component: string;
  version: string;
  minLevel?: LogLevel;
  pretty?: boolean;  // Human-readable format for development
}

// =============================================================================
// Logger Class
// =============================================================================

export class Logger {
  private component: string;
  private version: string;
  private minLevel: number;
  private pretty: boolean;
  private context: Record<string, unknown> = {};

  constructor(config: LoggerConfig) {
    this.component = config.component;
    this.version = config.version;
    this.minLevel = LOG_LEVELS[config.minLevel || 'INFO'];
    this.pretty = config.pretty ?? (process.env.NODE_ENV === 'development');
  }

  /**
   * Set persistent context that will be included in all log entries
   */
  setContext(ctx: Record<string, unknown>): void {
    this.context = { ...this.context, ...ctx };
  }

  /**
   * Clear context
   */
  clearContext(): void {
    this.context = {};
  }

  /**
   * Create a child logger with additional context
   */
  child(ctx: Record<string, unknown>): Logger {
    const child = new Logger({
      component: this.component,
      version: this.version,
      minLevel: Object.entries(LOG_LEVELS).find(([, v]) => v === this.minLevel)?.[0] as LogLevel,
      pretty: this.pretty,
    });
    child.context = { ...this.context, ...ctx };
    return child;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('DEBUG', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('INFO', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('WARN', message, meta);
  }

  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    const errorMeta = error ? this.formatError(error) : undefined;
    this.log('ERROR', message, { ...meta, error: errorMeta });
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LOG_LEVELS[level] < this.minLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      version: this.version,
      message,
      ...this.context,
      ...meta,
    };

    // Remove undefined values
    Object.keys(entry).forEach(key => {
      if ((entry as any)[key] === undefined) {
        delete (entry as any)[key];
      }
    });

    if (this.pretty) {
      this.writePretty(entry);
    } else {
      this.writeJSON(entry);
    }
  }

  private formatError(error: unknown): LogEntry['error'] {
    if (error instanceof Error) {
      return {
        code: (error as any).code,
        message: error.message,
        stack: error.stack,
      };
    }
    return {
      message: String(error),
    };
  }

  private writeJSON(entry: LogEntry): void {
    console.log(JSON.stringify(entry));
  }

  private writePretty(entry: LogEntry): void {
    const levelColors: Record<LogLevel, string> = {
      DEBUG: '\x1b[36m', // cyan
      INFO: '\x1b[32m',  // green
      WARN: '\x1b[33m',  // yellow
      ERROR: '\x1b[31m', // red
    };
    const reset = '\x1b[0m';
    const dim = '\x1b[2m';

    const color = levelColors[entry.level];
    const time = entry.timestamp.split('T')[1].split('.')[0];

    let line = `${dim}${time}${reset} ${color}${entry.level.padEnd(5)}${reset} `;
    line += `${dim}[${entry.component}]${reset} ${entry.message}`;

    // Add relevant metadata
    const metaKeys = ['requestId', 'planId', 'stepIndex', 'duration'];
    const metaParts: string[] = [];
    for (const key of metaKeys) {
      if ((entry as any)[key] !== undefined) {
        metaParts.push(`${key}=${(entry as any)[key]}`);
      }
    }
    if (metaParts.length > 0) {
      line += ` ${dim}(${metaParts.join(', ')})${reset}`;
    }

    console.log(line);

    // Print error details if present
    if (entry.error) {
      console.log(`${dim}  Error: ${entry.error.message}${reset}`);
      if (entry.error.code) {
        console.log(`${dim}  Code: ${entry.error.code}${reset}`);
      }
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createLogger(config: LoggerConfig): Logger {
  return new Logger(config);
}

// =============================================================================
// Request ID Middleware
// =============================================================================

let currentRequestId: string | undefined;

export function setRequestId(id: string): void {
  currentRequestId = id;
}

export function getRequestId(): string | undefined {
  return currentRequestId;
}

export function clearRequestId(): void {
  currentRequestId = undefined;
}

// =============================================================================
// Performance Timing
// =============================================================================

export function startTimer(): () => number {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}
