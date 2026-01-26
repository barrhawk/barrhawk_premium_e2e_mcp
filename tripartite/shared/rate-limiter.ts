/**
 * RateLimiter - Token bucket rate limiting
 *
 * Features:
 * - Per-connection rate limiting
 * - Configurable burst capacity
 * - Sliding window tracking
 */

export interface RateLimiterConfig {
  /** Tokens per second (default: 100) */
  tokensPerSecond?: number;
  /** Maximum burst capacity (default: tokensPerSecond * 2) */
  burstCapacity?: number;
  /** Cleanup interval for stale buckets in ms (default: 60000) */
  cleanupIntervalMs?: number;
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

export class RateLimiter {
  private buckets = new Map<string, TokenBucket>();
  private config: Required<RateLimiterConfig>;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  // Stats
  private totalAllowed = 0;
  private totalRejected = 0;

  constructor(config: RateLimiterConfig = {}) {
    const tokensPerSecond = config.tokensPerSecond ?? 100;
    this.config = {
      tokensPerSecond,
      burstCapacity: config.burstCapacity ?? tokensPerSecond * 2,
      cleanupIntervalMs: config.cleanupIntervalMs ?? 60000,
    };

    // Start cleanup timer
    this.cleanupTimer = setInterval(() => this.cleanup(), this.config.cleanupIntervalMs);
  }

  /**
   * Check if request is allowed and consume a token
   * Returns true if allowed, false if rate limited
   */
  allow(key: string, tokens = 1): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = {
        tokens: this.config.burstCapacity,
        lastRefill: now,
      };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on time elapsed
    const elapsed = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.config.tokensPerSecond;
    bucket.tokens = Math.min(this.config.burstCapacity, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    // Check if we have enough tokens
    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      this.totalAllowed++;
      return true;
    }

    this.totalRejected++;
    return false;
  }

  /**
   * Get remaining tokens for a key
   */
  getRemaining(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket) return this.config.burstCapacity;

    // Calculate current tokens with refill
    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.config.tokensPerSecond;
    return Math.min(this.config.burstCapacity, bucket.tokens + tokensToAdd);
  }

  /**
   * Reset a specific bucket
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Cleanup stale buckets (not accessed recently)
   */
  private cleanup(): void {
    const now = Date.now();
    const staleThreshold = this.config.cleanupIntervalMs;

    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefill > staleThreshold) {
        this.buckets.delete(key);
      }
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    activeBuckets: number;
    tokensPerSecond: number;
    burstCapacity: number;
    totalAllowed: number;
    totalRejected: number;
    rejectionRate: number;
  } {
    const total = this.totalAllowed + this.totalRejected;
    return {
      activeBuckets: this.buckets.size,
      tokensPerSecond: this.config.tokensPerSecond,
      burstCapacity: this.config.burstCapacity,
      totalAllowed: this.totalAllowed,
      totalRejected: this.totalRejected,
      rejectionRate: total > 0 ? this.totalRejected / total : 0,
    };
  }

  /**
   * Stop cleanup timer (for shutdown)
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.buckets.clear();
  }
}

/**
 * SlidingWindowCounter - Tracks counts over sliding time windows
 * Useful for error rate tracking
 */
export interface SlidingWindowConfig {
  /** Window size in milliseconds (default: 60000 = 1 minute) */
  windowMs?: number;
  /** Number of buckets in the window (default: 60) */
  bucketCount?: number;
}

export class SlidingWindowCounter {
  private buckets: number[];
  private bucketTimestamps: number[];
  private config: Required<SlidingWindowConfig>;
  private bucketDuration: number;
  private currentBucket = 0;

  constructor(config: SlidingWindowConfig = {}) {
    this.config = {
      windowMs: config.windowMs ?? 60000,
      bucketCount: config.bucketCount ?? 60,
    };
    this.bucketDuration = this.config.windowMs / this.config.bucketCount;
    this.buckets = new Array(this.config.bucketCount).fill(0);
    this.bucketTimestamps = new Array(this.config.bucketCount).fill(0);
  }

  /**
   * Increment the counter
   */
  increment(amount = 1): void {
    this.rotateBuckets();
    this.buckets[this.currentBucket] += amount;
  }

  /**
   * Get total count over the window
   */
  getCount(): number {
    this.rotateBuckets();
    return this.buckets.reduce((sum, count) => sum + count, 0);
  }

  /**
   * Get rate per second over the window
   */
  getRate(): number {
    return this.getCount() / (this.config.windowMs / 1000);
  }

  /**
   * Reset all buckets
   */
  reset(): void {
    this.buckets.fill(0);
    this.bucketTimestamps.fill(0);
  }

  private rotateBuckets(): void {
    const now = Date.now();
    const currentBucketTime = Math.floor(now / this.bucketDuration);

    // Clear stale buckets
    for (let i = 0; i < this.config.bucketCount; i++) {
      const bucketAge = currentBucketTime - this.bucketTimestamps[i];
      if (bucketAge >= this.config.bucketCount) {
        this.buckets[i] = 0;
      }
    }

    // Update current bucket
    this.currentBucket = currentBucketTime % this.config.bucketCount;
    if (this.bucketTimestamps[this.currentBucket] !== currentBucketTime) {
      this.buckets[this.currentBucket] = 0;
      this.bucketTimestamps[this.currentBucket] = currentBucketTime;
    }
  }
}
