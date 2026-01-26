/**
 * SeenMessageCache - Tracks seen message IDs for deduplication
 *
 * Uses a Map with TTL-based expiration to prevent unbounded growth.
 */

export interface SeenCacheConfig {
  /** Maximum number of IDs to track (default: 10000) */
  maxSize?: number;
  /** TTL in milliseconds (default: 60000 = 1 minute) */
  ttlMs?: number;
  /** Cleanup interval in milliseconds (default: 10000 = 10 seconds) */
  cleanupIntervalMs?: number;
}

interface CacheEntry {
  seenAt: number;
}

export class SeenMessageCache {
  private cache = new Map<string, CacheEntry>();
  private config: Required<SeenCacheConfig>;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private evictionCount = 0;
  private hitCount = 0;
  private missCount = 0;

  constructor(config: SeenCacheConfig = {}) {
    this.config = {
      maxSize: config.maxSize ?? 10000,
      ttlMs: config.ttlMs ?? 60000,
      cleanupIntervalMs: config.cleanupIntervalMs ?? 10000,
    };

    // Start cleanup interval
    this.cleanupTimer = setInterval(() => this.cleanup(), this.config.cleanupIntervalMs);
  }

  /**
   * Check if message ID was seen. Returns true if duplicate.
   * Automatically marks as seen if not duplicate.
   */
  isDuplicate(messageId: string): boolean {
    const existing = this.cache.get(messageId);
    const now = Date.now();

    if (existing) {
      // Check if expired
      if (now - existing.seenAt > this.config.ttlMs) {
        // Expired, treat as new
        this.cache.set(messageId, { seenAt: now });
        this.missCount++;
        return false;
      }
      // Valid duplicate
      this.hitCount++;
      return true;
    }

    // New message - mark as seen
    this.markSeen(messageId);
    this.missCount++;
    return false;
  }

  /**
   * Explicitly mark a message ID as seen
   */
  markSeen(messageId: string): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.config.maxSize) {
      this.evictOldest();
    }
    this.cache.set(messageId, { seenAt: Date.now() });
  }

  /**
   * Check if message was seen (without marking)
   */
  hasSeen(messageId: string): boolean {
    const entry = this.cache.get(messageId);
    if (!entry) return false;
    if (Date.now() - entry.seenAt > this.config.ttlMs) {
      this.cache.delete(messageId);
      return false;
    }
    return true;
  }

  /**
   * Remove expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [id, entry] of this.cache) {
      if (now - entry.seenAt > this.config.ttlMs) {
        this.cache.delete(id);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Evict oldest entry when at capacity
   */
  private evictOldest(): void {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [id, entry] of this.cache) {
      if (entry.seenAt < oldestTime) {
        oldestTime = entry.seenAt;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.cache.delete(oldestId);
      this.evictionCount++;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitCount: number;
    missCount: number;
    hitRate: number;
    evictionCount: number;
  } {
    const total = this.hitCount + this.missCount;
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: total > 0 ? this.hitCount / total : 0,
      evictionCount: this.evictionCount,
    };
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Stop cleanup timer (for shutdown)
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cache.clear();
  }
}
