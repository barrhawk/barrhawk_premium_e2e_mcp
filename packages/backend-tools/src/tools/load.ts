import axios from 'axios';

// =============================================================================
// Load Cannon (Stress Testing)
// =============================================================================

export interface LoadTestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  duration?: string; // e.g., "10s", "1m"
  users?: number;    // Concurrency
  rps?: number;      // Target requests per second
}

export interface LoadTestResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rps: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  errors: Record<string, number>; // Error message -> count
}

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(s|m|h)$/);
  if (!match) return 10000; // Default 10s
  const val = parseInt(match[1]);
  const unit = match[2];
  if (unit === 's') return val * 1000;
  if (unit === 'm') return val * 60 * 1000;
  if (unit === 'h') return val * 60 * 60 * 1000;
  return 10000;
}

export async function backend_load_test(options: LoadTestOptions): Promise<LoadTestResult> {
  const durationMs = parseDuration(options.duration || '10s');
  const users = options.users || 10;
  const targetRps = options.rps || 0; // 0 = unlimited
  
  const startTime = Date.now();
  const latencies: number[] = [];
  const errors: Record<string, number> = {};
  let requests = 0;
  let success = 0;
  let active = true;

  // Stop timer
  setTimeout(() => active = false, durationMs);

  const worker = async () => {
    while (active) {
      const reqStart = Date.now();
      try {
        await axios({
          method: options.method || 'GET',
          url: options.url,
          headers: options.headers,
          data: options.body,
          validateStatus: () => true // Treat non-200 as "success" for protocol, but maybe track status?
        });
        latencies.push(Date.now() - reqStart);
        success++;
      } catch (err: any) {
        const msg = err.message || 'Unknown error';
        errors[msg] = (errors[msg] || 0) + 1;
      }
      requests++;

      // RPS throttling
      if (targetRps > 0) {
        const elapsed = Date.now() - startTime;
        const expectedRequests = (elapsed / 1000) * targetRps;
        if (requests > expectedRequests) {
          await new Promise(r => setTimeout(r, 10)); // simple backoff
        }
      }
    }
  };

  // Launch workers
  const workers = Array(users).fill(0).map(() => worker());
  await Promise.all(workers);

  // Calculate stats
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const max = latencies[latencies.length - 1] || 0;
  const actualDuration = (Date.now() - startTime) / 1000;

  return {
    totalRequests: requests,
    successfulRequests: success,
    failedRequests: requests - success,
    rps: Math.round(requests / actualDuration),
    p50,
    p95,
    p99,
    max,
    errors
  };
}
