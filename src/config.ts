/**
 * Configuration loader for BarrHawk E2E
 */

import { existsSync, readFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

export interface Config {
  browser: {
    headless: boolean;
    viewport: {
      width: number;
      height: number;
    };
    userAgent?: string;
  };
  timeout: number;
  screenshotDir: string;
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
  };
  selfHealing: {
    enabled: boolean;
    minConfidence: number;
  };
}

const DEFAULT_CONFIG: Config = {
  browser: {
    headless: false,
    viewport: {
      width: 1280,
      height: 720,
    },
    userAgent: 'BarrHawk/0.1.0 (+https://github.com/anthropics/barrhawk)',
  },
  timeout: 30000,
  screenshotDir: './screenshots',
  logging: {
    level: 'info',
  },
  selfHealing: {
    enabled: true,
    minConfidence: 0.7,
  },
};

/**
 * Load configuration from file and environment variables
 */
export function loadConfig(): Config {
  let config = { ...DEFAULT_CONFIG };

  // Try to load config file
  const configPaths = [
    'barrhawk.config.json',
    '.barrhawkrc.json',
    join(process.cwd(), 'barrhawk.config.json'),
  ];

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        const fileConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
        config = mergeConfig(config, fileConfig);
        console.error(`Loaded config from ${configPath}`);
        break;
      } catch (err) {
        console.error(`Failed to parse config from ${configPath}:`, err);
      }
    }
  }

  // Override with environment variables
  if (process.env.BARRHAWK_HEADLESS !== undefined) {
    config.browser.headless = process.env.BARRHAWK_HEADLESS === 'true';
  }

  if (process.env.BARRHAWK_TIMEOUT !== undefined) {
    config.timeout = parseInt(process.env.BARRHAWK_TIMEOUT, 10);
  }

  if (process.env.BARRHAWK_SCREENSHOT_DIR !== undefined) {
    config.screenshotDir = process.env.BARRHAWK_SCREENSHOT_DIR;
  }

  if (process.env.BARRHAWK_LOG_LEVEL !== undefined) {
    config.logging.level = process.env.BARRHAWK_LOG_LEVEL as Config['logging']['level'];
  }

  if (process.env.BARRHAWK_SELF_HEAL !== undefined) {
    config.selfHealing.enabled = process.env.BARRHAWK_SELF_HEAL === 'true';
  }

  // Ensure screenshot directory exists
  const screenshotDir = resolve(config.screenshotDir);
  if (!existsSync(screenshotDir)) {
    try {
      mkdirSync(screenshotDir, { recursive: true });
    } catch (err) {
      console.error(`Failed to create screenshot directory: ${screenshotDir}`);
    }
  }
  config.screenshotDir = screenshotDir;

  return config;
}

/**
 * Deep merge two config objects
 */
function mergeConfig(base: Config, override: Partial<Config>): Config {
  const result = { ...base };

  if (override.browser) {
    result.browser = {
      ...result.browser,
      ...override.browser,
      viewport: {
        ...result.browser.viewport,
        ...override.browser.viewport,
      },
    };
  }

  if (override.timeout !== undefined) {
    result.timeout = override.timeout;
  }

  if (override.screenshotDir !== undefined) {
    result.screenshotDir = override.screenshotDir;
  }

  if (override.logging) {
    result.logging = {
      ...result.logging,
      ...override.logging,
    };
  }

  if (override.selfHealing) {
    result.selfHealing = {
      ...result.selfHealing,
      ...override.selfHealing,
    };
  }

  return result;
}

/**
 * Log helper that respects log level
 */
export function log(level: Config['logging']['level'], message: string, config: Config) {
  const levels = ['debug', 'info', 'warn', 'error'];
  const configLevel = levels.indexOf(config.logging.level);
  const messageLevel = levels.indexOf(level);

  if (messageLevel >= configLevel) {
    console.error(`[${level.toUpperCase()}] ${message}`);
  }
}
