/**
 * THE SABOTEUR - Network Chaos
 */

export interface NetworkConditions {
  offline: boolean;
  latency: number; // ms
  downloadThroughput: number; // bytes/sec
  uploadThroughput: number; // bytes/sec
}

export const CONDITIONS = {
  '3g': { offline: false, latency: 100, downloadThroughput: 750 * 1024, uploadThroughput: 250 * 1024 },
  '4g': { offline: false, latency: 20, downloadThroughput: 4 * 1024 * 1024, uploadThroughput: 3 * 1024 * 1024 },
  'offline': { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
};

// Note: The actual implementation relies on Playwright's CDPSession
// This package exports the definitions and helper logic for Frank to use
export function getConditions(preset: string): NetworkConditions {
  return CONDITIONS[preset as keyof typeof CONDITIONS] || CONDITIONS['4g'];
}
