/**
 * CircularBuffer - Fixed-size buffer that overwrites oldest entries
 *
 * O(1) push, O(1) get by index, no memory churn from shift()
 */

export class CircularBuffer<T> {
  private buffer: (T | undefined)[];
  private head = 0;  // Next write position
  private size = 0;  // Current number of items
  private readonly capacity: number;

  constructor(capacity: number) {
    if (capacity <= 0) throw new Error('Capacity must be positive');
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  /**
   * Add item to buffer, overwriting oldest if full
   */
  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size++;
    }
  }

  /**
   * Get item by index (0 = oldest, size-1 = newest)
   */
  get(index: number): T | undefined {
    if (index < 0 || index >= this.size) return undefined;
    const actualIndex = (this.head - this.size + index + this.capacity) % this.capacity;
    return this.buffer[actualIndex];
  }

  /**
   * Get the most recent N items (newest first)
   */
  getRecent(count: number): T[] {
    const result: T[] = [];
    const actualCount = Math.min(count, this.size);
    for (let i = 0; i < actualCount; i++) {
      const index = (this.head - 1 - i + this.capacity) % this.capacity;
      const item = this.buffer[index];
      if (item !== undefined) {
        result.push(item);
      }
    }
    return result;
  }

  /**
   * Get all items as array (oldest first)
   */
  toArray(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.size; i++) {
      const item = this.get(i);
      if (item !== undefined) {
        result.push(item);
      }
    }
    return result;
  }

  /**
   * Find item matching predicate (searches from newest)
   */
  find(predicate: (item: T) => boolean): T | undefined {
    for (let i = this.size - 1; i >= 0; i--) {
      const item = this.get(i);
      if (item !== undefined && predicate(item)) {
        return item;
      }
    }
    return undefined;
  }

  /**
   * Current number of items
   */
  getSize(): number {
    return this.size;
  }

  /**
   * Maximum capacity
   */
  getCapacity(): number {
    return this.capacity;
  }

  /**
   * Is buffer at capacity?
   */
  isFull(): boolean {
    return this.size >= this.capacity;
  }

  /**
   * Clear all items
   */
  clear(): void {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.size = 0;
  }

  /**
   * Iterate over items (oldest first)
   */
  *[Symbol.iterator](): Iterator<T> {
    for (let i = 0; i < this.size; i++) {
      const item = this.get(i);
      if (item !== undefined) {
        yield item;
      }
    }
  }
}
