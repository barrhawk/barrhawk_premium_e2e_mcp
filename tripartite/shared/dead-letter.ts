/**
 * DeadLetterQueue - Stores undeliverable messages for inspection/retry
 *
 * Provides persistence layer for messages that couldn't be delivered.
 */

import { CircularBuffer } from './circular-buffer.js';

export interface DeadLetter<T = unknown> {
  id: string;
  originalMessage: T;
  reason: string;
  targetComponent: string;
  timestamp: Date;
  retryCount: number;
  lastRetryAt?: Date;
}

export interface DeadLetterQueueConfig {
  /** Maximum entries to keep (default: 1000) */
  maxSize?: number;
  /** Maximum retries before permanent failure (default: 3) */
  maxRetries?: number;
  /** Callback when message permanently fails */
  onPermanentFailure?: (letter: DeadLetter) => void;
}

export class DeadLetterQueue<T = unknown> {
  private queue: CircularBuffer<DeadLetter<T>>;
  private config: Required<Omit<DeadLetterQueueConfig, 'onPermanentFailure'>> & {
    onPermanentFailure?: (letter: DeadLetter<T>) => void;
  };
  private totalEnqueued = 0;
  private totalRetried = 0;
  private totalPermanentFailed = 0;

  constructor(config: DeadLetterQueueConfig = {}) {
    this.config = {
      maxSize: config.maxSize ?? 1000,
      maxRetries: config.maxRetries ?? 3,
      onPermanentFailure: config.onPermanentFailure,
    };
    this.queue = new CircularBuffer<DeadLetter<T>>(this.config.maxSize);
  }

  /**
   * Add a message to the dead letter queue
   */
  enqueue(message: T, messageId: string, target: string, reason: string): DeadLetter<T> {
    const letter: DeadLetter<T> = {
      id: messageId,
      originalMessage: message,
      reason,
      targetComponent: target,
      timestamp: new Date(),
      retryCount: 0,
    };

    this.queue.push(letter);
    this.totalEnqueued++;
    return letter;
  }

  /**
   * Get all dead letters (for inspection)
   */
  getAll(): DeadLetter<T>[] {
    return this.queue.toArray();
  }

  /**
   * Get recent N dead letters
   */
  getRecent(count: number): DeadLetter<T>[] {
    return this.queue.getRecent(count);
  }

  /**
   * Find a specific dead letter by message ID
   */
  findById(messageId: string): DeadLetter<T> | undefined {
    return this.queue.find(letter => letter.id === messageId);
  }

  /**
   * Get dead letters for a specific target
   */
  getByTarget(target: string): DeadLetter<T>[] {
    return this.queue.toArray().filter(letter => letter.targetComponent === target);
  }

  /**
   * Mark a letter for retry (increments retry count)
   * Returns the letter if still retryable, undefined if max retries exceeded
   */
  markForRetry(messageId: string): DeadLetter<T> | undefined {
    const letter = this.findById(messageId);
    if (!letter) return undefined;

    letter.retryCount++;
    letter.lastRetryAt = new Date();

    if (letter.retryCount > this.config.maxRetries) {
      this.totalPermanentFailed++;
      if (this.config.onPermanentFailure) {
        this.config.onPermanentFailure(letter);
      }
      return undefined;
    }

    this.totalRetried++;
    return letter;
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    currentSize: number;
    maxSize: number;
    totalEnqueued: number;
    totalRetried: number;
    totalPermanentFailed: number;
    byTarget: Record<string, number>;
    byReason: Record<string, number>;
  } {
    const letters = this.queue.toArray();
    const byTarget: Record<string, number> = {};
    const byReason: Record<string, number> = {};

    for (const letter of letters) {
      byTarget[letter.targetComponent] = (byTarget[letter.targetComponent] || 0) + 1;
      byReason[letter.reason] = (byReason[letter.reason] || 0) + 1;
    }

    return {
      currentSize: this.queue.getSize(),
      maxSize: this.config.maxSize,
      totalEnqueued: this.totalEnqueued,
      totalRetried: this.totalRetried,
      totalPermanentFailed: this.totalPermanentFailed,
      byTarget,
      byReason,
    };
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this.queue.clear();
  }

  /**
   * Current size
   */
  size(): number {
    return this.queue.getSize();
  }
}
