#!/usr/bin/env npx tsx
/**
 * BarrHawk E2E Observability CLI
 *
 * Command-line tool for browsing test logs, screenshots, and network requests.
 *
 * Usage:
 *   npx tsx packages/observability/cli.ts runs              # List test runs
 *   npx tsx packages/observability/cli.ts logs <runId>      # View logs for a run
 *   npx tsx packages/observability/cli.ts screenshots <runId>  # List screenshots
 *   npx tsx packages/observability/cli.ts network <runId>   # View network requests
 *   npx tsx packages/observability/cli.ts summary <runId>   # Get run summary
 *   npx tsx packages/observability/cli.ts stats             # Get overall stats
 *   npx tsx packages/observability/cli.ts tail <runId>      # Live tail logs
 */

import { getObservabilityStore } from './store.js';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

function colorize(text: string, color: keyof typeof COLORS): string {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

function formatDate(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatLogLevel(level?: string): string {
  switch (level) {
    case 'error': return colorize('ERROR', 'red');
    case 'warn': return colorize('WARN ', 'yellow');
    case 'info': return colorize('INFO ', 'blue');
    case 'debug': return colorize('DEBUG', 'dim');
    default: return colorize('LOG  ', 'white');
  }
}

function formatStatus(status: string): string {
  switch (status) {
    case 'passed': return colorize('PASSED', 'green');
    case 'failed': return colorize('FAILED', 'red');
    case 'running': return colorize('RUNNING', 'yellow');
    case 'cancelled': return colorize('CANCELLED', 'dim');
    default: return status;
  }
}

function formatOrigin(origin: string): string {
  switch (origin) {
    case 'ai_agent': return colorize('AI', 'magenta');
    case 'human_dashboard': return colorize('Dashboard', 'blue');
    case 'human_api': return colorize('API', 'cyan');
    case 'scheduled': return colorize('Scheduled', 'dim');
    case 'ci_cd': return colorize('CI/CD', 'yellow');
    default: return origin;
  }
}

async function listRuns(options: { status?: string; origin?: string; limit?: number }) {
  const store = await getObservabilityStore();
  const runs = await store.getRuns({
    status: options.status,
    origin: options.origin,
    limit: options.limit || 20,
  });

  if (runs.length === 0) {
    console.log(colorize('No test runs found.', 'dim'));
    return;
  }

  console.log(colorize('\n TEST RUNS', 'bold'));
  console.log('─'.repeat(100));
  console.log(
    colorize('Run ID'.padEnd(30), 'dim') +
    colorize('Status'.padEnd(12), 'dim') +
    colorize('Origin'.padEnd(15), 'dim') +
    colorize('Started'.padEnd(25), 'dim') +
    colorize('Duration', 'dim')
  );
  console.log('─'.repeat(100));

  for (const run of runs) {
    console.log(
      run.runId.substring(0, 28).padEnd(30) +
      formatStatus(run.status).padEnd(12 + 9) +  // +9 for color codes
      formatOrigin(run.origin).padEnd(15 + 9) +
      formatDate(run.startedAt).padEnd(25) +
      (run.duration ? formatDuration(run.duration) : '-')
    );
  }

  console.log('─'.repeat(100));
  console.log(colorize(`Total: ${runs.length} runs`, 'dim'));
}

async function viewLogs(runId: string, options: { type?: string; level?: string; search?: string; limit?: number }) {
  const store = await getObservabilityStore();
  const logs = await store.getLogs(runId, {
    type: options.type,
    level: options.level,
    search: options.search,
    limit: options.limit || 100,
  });

  if (logs.length === 0) {
    console.log(colorize('No logs found for this run.', 'dim'));
    return;
  }

  console.log(colorize(`\n LOGS FOR: ${runId}`, 'bold'));
  console.log('─'.repeat(120));

  for (const log of logs) {
    const time = formatDate(log.timestamp).substring(11, 23);  // HH:mm:ss.sss
    const level = formatLogLevel(log.level);
    const type = colorize(`[${log.type}]`, 'dim');

    // Truncate message if too long
    let message = log.message;
    if (message.length > 80) {
      message = message.substring(0, 77) + '...';
    }

    console.log(`${colorize(time, 'dim')} ${level} ${type} ${message}`);

    // Show source location for errors
    if (log.level === 'error' && log.source) {
      console.log(colorize(`         at ${log.source.url}:${log.source.line}:${log.source.column}`, 'dim'));
    }
  }

  console.log('─'.repeat(120));
  console.log(colorize(`Total: ${logs.length} log entries`, 'dim'));
}

async function listScreenshots(runId: string) {
  const store = await getObservabilityStore();
  const screenshots = await store.getScreenshots(runId);

  if (screenshots.length === 0) {
    console.log(colorize('No screenshots found for this run.', 'dim'));
    return;
  }

  console.log(colorize(`\n SCREENSHOTS FOR: ${runId}`, 'bold'));
  console.log('─'.repeat(100));
  console.log(
    colorize('ID'.padEnd(25), 'dim') +
    colorize('Type'.padEnd(12), 'dim') +
    colorize('Size'.padEnd(12), 'dim') +
    colorize('Dimensions'.padEnd(15), 'dim') +
    colorize('Path', 'dim')
  );
  console.log('─'.repeat(100));

  for (const ss of screenshots) {
    console.log(
      ss.id.substring(0, 23).padEnd(25) +
      ss.type.padEnd(12) +
      formatSize(ss.sizeBytes).padEnd(12) +
      `${ss.width}x${ss.height}`.padEnd(15) +
      ss.url.substring(0, 40)
    );
  }

  console.log('─'.repeat(100));
  console.log(colorize(`Total: ${screenshots.length} screenshots`, 'dim'));
}

async function viewNetwork(runId: string, options: { status?: number; method?: string; slow?: boolean }) {
  const store = await getObservabilityStore();
  const network = await store.getNetworkRequests(runId, {
    status: options.status,
    method: options.method,
    minDuration: options.slow ? 1000 : undefined,
  });

  if (network.length === 0) {
    console.log(colorize('No network requests found for this run.', 'dim'));
    return;
  }

  console.log(colorize(`\n NETWORK REQUESTS FOR: ${runId}`, 'bold'));
  console.log('─'.repeat(120));
  console.log(
    colorize('Method'.padEnd(8), 'dim') +
    colorize('Status'.padEnd(8), 'dim') +
    colorize('Duration'.padEnd(12), 'dim') +
    colorize('Size'.padEnd(10), 'dim') +
    colorize('URL', 'dim')
  );
  console.log('─'.repeat(120));

  for (const req of network) {
    const method = req.method.padEnd(8);
    const status = req.status
      ? (req.status >= 400 ? colorize(String(req.status), 'red') : colorize(String(req.status), 'green')).padEnd(8 + 9)
      : '-'.padEnd(8);
    const duration = req.duration ? formatDuration(req.duration).padEnd(12) : '-'.padEnd(12);
    const size = req.responseSize ? formatSize(req.responseSize).padEnd(10) : '-'.padEnd(10);
    const url = req.url.length > 70 ? req.url.substring(0, 67) + '...' : req.url;

    console.log(`${method}${status}${duration}${size}${url}`);
  }

  console.log('─'.repeat(120));
  console.log(colorize(`Total: ${network.length} requests`, 'dim'));
}

async function viewSummary(runId: string) {
  const store = await getObservabilityStore();
  const summary = await store.getRunSummary(runId);

  if (!summary) {
    console.log(colorize('Run not found.', 'red'));
    return;
  }

  const { run } = summary;

  console.log(colorize('\n TEST RUN SUMMARY', 'bold'));
  console.log('═'.repeat(60));
  console.log(`Run ID:      ${run.runId}`);
  console.log(`Project:     ${run.projectId}`);
  console.log(`Status:      ${formatStatus(run.status)}`);
  console.log(`Origin:      ${formatOrigin(run.origin)}`);
  console.log(`Started:     ${formatDate(run.startedAt)}`);
  if (run.completedAt) {
    console.log(`Completed:   ${formatDate(run.completedAt)}`);
  }
  if (run.duration) {
    console.log(`Duration:    ${formatDuration(run.duration)}`);
  }
  console.log('─'.repeat(60));

  if (run.summary) {
    console.log(colorize('\n Test Results:', 'bold'));
    console.log(`  Total:     ${run.summary.total}`);
    console.log(`  Passed:    ${colorize(String(run.summary.passed), 'green')}`);
    console.log(`  Failed:    ${colorize(String(run.summary.failed), 'red')}`);
    console.log(`  Skipped:   ${run.summary.skipped}`);
  }

  console.log(colorize('\n Collected Data:', 'bold'));
  console.log(`  Logs:           ${summary.logCount}`);
  console.log(`  Console logs:   ${summary.consoleLogCount}`);
  console.log(`  Errors:         ${colorize(String(summary.errorCount), summary.errorCount > 0 ? 'red' : 'green')}`);
  console.log(`  Screenshots:    ${summary.screenshotCount}`);
  console.log(`  Network reqs:   ${summary.networkRequestCount}`);
  console.log('═'.repeat(60));
}

async function viewStats() {
  const store = await getObservabilityStore();
  const stats = await store.getStats();

  console.log(colorize('\n OBSERVABILITY STATS', 'bold'));
  console.log('═'.repeat(50));
  console.log(`Total test runs:      ${stats.totalRuns}`);
  console.log(`Total log entries:    ${stats.totalLogs}`);
  console.log(`Total screenshots:    ${stats.totalScreenshots}`);
  console.log(`Total network reqs:   ${stats.totalNetworkRequests}`);

  console.log(colorize('\n By Status:', 'bold'));
  for (const [status, count] of Object.entries(stats.runsByStatus)) {
    console.log(`  ${formatStatus(status).padEnd(20)} ${count}`);
  }

  console.log(colorize('\n By Origin:', 'bold'));
  for (const [origin, count] of Object.entries(stats.runsByOrigin)) {
    console.log(`  ${formatOrigin(origin).padEnd(20)} ${count}`);
  }
  console.log('═'.repeat(50));
}

async function tailLogs(runId: string) {
  const store = await getObservabilityStore();
  let lastCount = 0;

  console.log(colorize(`\n TAILING LOGS FOR: ${runId}`, 'bold'));
  console.log(colorize('Press Ctrl+C to stop\n', 'dim'));

  // Poll for new logs
  const interval = setInterval(async () => {
    const logs = await store.getLogs(runId, { limit: 1000 });

    if (logs.length > lastCount) {
      const newLogs = logs.slice(lastCount);
      for (const log of newLogs) {
        const time = formatDate(log.timestamp).substring(11, 23);
        const level = formatLogLevel(log.level);
        const type = colorize(`[${log.type}]`, 'dim');
        console.log(`${colorize(time, 'dim')} ${level} ${type} ${log.message}`);
      }
      lastCount = logs.length;
    }
  }, 500);

  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log(colorize('\n\nStopped tailing.', 'dim'));
    process.exit(0);
  });
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'runs':
      await listRuns({
        status: args.includes('--failed') ? 'failed' : args.includes('--passed') ? 'passed' : undefined,
        origin: args.find(a => a.startsWith('--origin='))?.split('=')[1],
        limit: parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '20'),
      });
      break;

    case 'logs':
      if (!args[1]) {
        console.error('Usage: logs <runId> [--type=console] [--level=error] [--search=text]');
        process.exit(1);
      }
      await viewLogs(args[1], {
        type: args.find(a => a.startsWith('--type='))?.split('=')[1],
        level: args.find(a => a.startsWith('--level='))?.split('=')[1],
        search: args.find(a => a.startsWith('--search='))?.split('=')[1],
        limit: parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '100'),
      });
      break;

    case 'screenshots':
      if (!args[1]) {
        console.error('Usage: screenshots <runId>');
        process.exit(1);
      }
      await listScreenshots(args[1]);
      break;

    case 'network':
      if (!args[1]) {
        console.error('Usage: network <runId> [--status=404] [--method=POST] [--slow]');
        process.exit(1);
      }
      await viewNetwork(args[1], {
        status: args.find(a => a.startsWith('--status=')) ? parseInt(args.find(a => a.startsWith('--status='))!.split('=')[1]) : undefined,
        method: args.find(a => a.startsWith('--method='))?.split('=')[1],
        slow: args.includes('--slow'),
      });
      break;

    case 'summary':
      if (!args[1]) {
        console.error('Usage: summary <runId>');
        process.exit(1);
      }
      await viewSummary(args[1]);
      break;

    case 'stats':
      await viewStats();
      break;

    case 'tail':
      if (!args[1]) {
        console.error('Usage: tail <runId>');
        process.exit(1);
      }
      await tailLogs(args[1]);
      break;

    default:
      console.log(colorize('\nBarrHawk E2E Observability CLI', 'bold'));
      console.log('─'.repeat(40));
      console.log('\nCommands:');
      console.log('  runs                    List all test runs');
      console.log('  logs <runId>            View logs for a run');
      console.log('  screenshots <runId>     List screenshots for a run');
      console.log('  network <runId>         View network requests');
      console.log('  summary <runId>         Get run summary');
      console.log('  stats                   Get overall statistics');
      console.log('  tail <runId>            Live tail logs');
      console.log('\nOptions:');
      console.log('  --limit=N               Limit results');
      console.log('  --type=console          Filter logs by type');
      console.log('  --level=error           Filter logs by level');
      console.log('  --search=text           Search log messages');
      console.log('  --status=404            Filter network by status');
      console.log('  --slow                  Show slow requests (>1s)');
      console.log('  --failed/--passed       Filter runs by status');
      console.log('  --origin=ai_agent       Filter runs by origin');
      break;
  }
}

main().catch(console.error);
