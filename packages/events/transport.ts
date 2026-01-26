/**
 * BarrHawk E2E Event Transport
 *
 * Redis-based pub/sub and streams for real-time event distribution.
 * Supports pattern-based subscriptions, event persistence, and replay.
 */

import Redis, { type RedisOptions } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import type {
  BarrHawkEvent,
  EventType,
  EventTypeMap,
  TypedEvent,
  EventHandler,
  EventSubscription,
  EventFilter,
  EventTransportConfig,
  RedisConfig,
} from './types.js';

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: Partial<EventTransportConfig> = {
  maxStreamLength: 10000,
  persistEvents: true,
  persistableTypes: [
    'test.run.started',
    'test.run.completed',
    'test.step.completed',
    'screenshot.captured',
    'billing.usage.recorded',
    'billing.quota.exceeded',
    'system.alert.fired',
  ],
};

// =============================================================================
// Event Transport Interface
// =============================================================================

export interface IEventTransport {
  /** Publish an event to subscribers */
  publish<T extends EventType>(event: TypedEvent<T>): Promise<void>;

  /** Subscribe to events matching a pattern */
  subscribe(pattern: string, handler: EventHandler): EventSubscription;

  /** Subscribe to specific event types */
  subscribeToTypes<T extends EventType>(
    types: T[],
    tenantId: string,
    handler: EventHandler<T>
  ): EventSubscription;

  /** Get recent events from stream */
  getRecentEvents(
    tenantId: string,
    count?: number,
    filter?: EventFilter
  ): Promise<BarrHawkEvent[]>;

  /** Get events for a specific correlation ID (test run) */
  getEventsForRun(
    tenantId: string,
    correlationId: string,
    since?: Date
  ): Promise<BarrHawkEvent[]>;

  /** Close connections */
  close(): Promise<void>;
}

// =============================================================================
// Redis Event Transport Implementation
// =============================================================================

export class RedisEventTransport implements IEventTransport {
  private publisher: Redis;
  private subscriber: Redis;
  private config: EventTransportConfig;
  private subscriptions: Map<string, EventSubscription> = new Map();
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private isConnected: boolean = false;

  constructor(config: EventTransportConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Create Redis clients
    const redisOptions = this.buildRedisOptions(config.redis);
    this.publisher = new Redis(redisOptions);
    this.subscriber = new Redis(redisOptions);

    // Set up subscriber
    this.setupSubscriber();
  }

  private buildRedisOptions(config: RedisConfig): RedisOptions {
    return {
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db ?? 0,
      keyPrefix: config.keyPrefix,
      tls: config.tls ? {} : undefined,
      retryStrategy: (times: number) => {
        if (times > 10) return null;
        return Math.min(times * 100, 3000);
      },
    };
  }

  private setupSubscriber(): void {
    this.subscriber.on('pmessage', (pattern: string, channel: string, message: string) => {
      try {
        const event = JSON.parse(message) as BarrHawkEvent;
        // Restore Date object
        event.timestamp = new Date(event.timestamp);

        // Call all handlers for this pattern
        const handlers = this.handlers.get(pattern);
        if (handlers) {
          for (const handler of handlers) {
            try {
              handler(event as TypedEvent<EventType>);
            } catch (err) {
              console.error('[EventTransport] Handler error:', err);
            }
          }
        }
      } catch (err) {
        console.error('[EventTransport] Failed to parse event:', err);
      }
    });

    this.subscriber.on('connect', () => {
      this.isConnected = true;
      console.log('[EventTransport] Redis subscriber connected');
    });

    this.subscriber.on('error', (err) => {
      console.error('[EventTransport] Redis subscriber error:', err);
    });
  }

  // ---------------------------------------------------------------------------
  // Channel Naming
  // ---------------------------------------------------------------------------

  /**
   * Get the pub/sub channel for an event.
   * Pattern: events:{tenantId}:{eventType}
   */
  private getChannel(event: BarrHawkEvent): string {
    return `events:${event.tenantId}:${event.type}`;
  }

  /**
   * Get the stream key for a tenant.
   * Pattern: stream:{tenantId}
   */
  private getStreamKey(tenantId: string): string {
    return `stream:${tenantId}`;
  }

  /**
   * Get the correlation index key.
   * Pattern: correlation:{tenantId}:{correlationId}
   */
  private getCorrelationKey(tenantId: string, correlationId: string): string {
    return `correlation:${tenantId}:${correlationId}`;
  }

  // ---------------------------------------------------------------------------
  // Publish
  // ---------------------------------------------------------------------------

  async publish<T extends EventType>(event: TypedEvent<T>): Promise<void> {
    const channel = this.getChannel(event);
    const payload = JSON.stringify(event);

    // Publish to pub/sub for real-time subscribers
    await this.publisher.publish(channel, payload);

    // Add to stream for persistence and replay
    const streamKey = this.getStreamKey(event.tenantId);
    await this.publisher.xadd(
      streamKey,
      'MAXLEN',
      '~',
      String(this.config.maxStreamLength),
      '*',
      'event',
      payload,
      'type',
      event.type,
      'correlationId',
      event.correlationId
    );

    // Index by correlation ID for fast lookup
    if (event.correlationId) {
      const correlationKey = this.getCorrelationKey(event.tenantId, event.correlationId);
      await this.publisher.rpush(correlationKey, event.id);
      // Expire correlation index after 24 hours
      await this.publisher.expire(correlationKey, 86400);
    }
  }

  // ---------------------------------------------------------------------------
  // Subscribe
  // ---------------------------------------------------------------------------

  subscribe(pattern: string, handler: EventHandler): EventSubscription {
    const subscriptionId = uuidv4();

    // Track handler
    if (!this.handlers.has(pattern)) {
      this.handlers.set(pattern, new Set());
      // Subscribe to pattern
      this.subscriber.psubscribe(pattern);
    }
    this.handlers.get(pattern)!.add(handler);

    const subscription: EventSubscription = {
      id: subscriptionId,
      pattern,
      handler,
      unsubscribe: () => {
        const handlers = this.handlers.get(pattern);
        if (handlers) {
          handlers.delete(handler);
          if (handlers.size === 0) {
            this.handlers.delete(pattern);
            this.subscriber.punsubscribe(pattern);
          }
        }
        this.subscriptions.delete(subscriptionId);
      },
    };

    this.subscriptions.set(subscriptionId, subscription);
    return subscription;
  }

  subscribeToTypes<T extends EventType>(
    types: T[],
    tenantId: string,
    handler: EventHandler<T>
  ): EventSubscription {
    // Create pattern that matches any of the specified types
    // Subscribe to all events for tenant, filter in handler
    const pattern = `events:${tenantId}:*`;

    const filteredHandler: EventHandler = (event) => {
      if (types.includes(event.type as T)) {
        handler(event as TypedEvent<T>);
      }
    };

    return this.subscribe(pattern, filteredHandler);
  }

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  async getRecentEvents(
    tenantId: string,
    count: number = 100,
    filter?: EventFilter
  ): Promise<BarrHawkEvent[]> {
    const streamKey = this.getStreamKey(tenantId);

    // Read from stream (newest first)
    const results = await this.publisher.xrevrange(streamKey, '+', '-', 'COUNT', count);

    const events: BarrHawkEvent[] = [];
    for (const [, fields] of results) {
      const eventJson = this.getFieldValue(fields, 'event');
      if (eventJson) {
        try {
          const event = JSON.parse(eventJson) as BarrHawkEvent;
          event.timestamp = new Date(event.timestamp);

          // Apply filters
          if (this.matchesFilter(event, filter)) {
            events.push(event);
          }
        } catch {
          // Skip malformed events
        }
      }
    }

    // Reverse to get chronological order
    return events.reverse();
  }

  async getEventsForRun(
    tenantId: string,
    correlationId: string,
    since?: Date
  ): Promise<BarrHawkEvent[]> {
    // Get events from stream filtered by correlation ID
    const streamKey = this.getStreamKey(tenantId);

    // Use XREAD with correlation filter
    // For simplicity, we'll read recent events and filter
    const allEvents = await this.getRecentEvents(tenantId, 1000, {
      correlationId,
      since,
    });

    return allEvents;
  }

  private getFieldValue(fields: string[], key: string): string | undefined {
    for (let i = 0; i < fields.length; i += 2) {
      if (fields[i] === key) {
        return fields[i + 1];
      }
    }
    return undefined;
  }

  private matchesFilter(event: BarrHawkEvent, filter?: EventFilter): boolean {
    if (!filter) return true;

    if (filter.types && !filter.types.includes(event.type as EventType)) {
      return false;
    }

    if (filter.tenantId && event.tenantId !== filter.tenantId) {
      return false;
    }

    if (filter.correlationId && event.correlationId !== filter.correlationId) {
      return false;
    }

    if (filter.origin && !filter.origin.includes(event.source.origin)) {
      return false;
    }

    if (filter.since && event.timestamp < filter.since) {
      return false;
    }

    if (filter.until && event.timestamp > filter.until) {
      return false;
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  async close(): Promise<void> {
    // Unsubscribe all
    for (const [, subscription] of this.subscriptions) {
      subscription.unsubscribe();
    }

    await this.subscriber.quit();
    await this.publisher.quit();
    this.isConnected = false;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createEventTransport(config: EventTransportConfig): IEventTransport {
  return new RedisEventTransport(config);
}

// =============================================================================
// In-Memory Transport (for testing/development without Redis)
// =============================================================================

export class InMemoryEventTransport implements IEventTransport {
  private events: BarrHawkEvent[] = [];
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private subscriptions: Map<string, EventSubscription> = new Map();
  private maxEvents: number;

  constructor(maxEvents: number = 10000) {
    this.maxEvents = maxEvents;
  }

  async publish<T extends EventType>(event: TypedEvent<T>): Promise<void> {
    // Store event
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // Notify handlers
    for (const [pattern, handlers] of this.handlers) {
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
      );
      const channel = `events:${event.tenantId}:${event.type}`;

      if (regex.test(channel)) {
        for (const handler of handlers) {
          try {
            await handler(event);
          } catch (err) {
            console.error('[InMemoryTransport] Handler error:', err);
          }
        }
      }
    }
  }

  subscribe(pattern: string, handler: EventHandler): EventSubscription {
    const subscriptionId = uuidv4();

    if (!this.handlers.has(pattern)) {
      this.handlers.set(pattern, new Set());
    }
    this.handlers.get(pattern)!.add(handler);

    const subscription: EventSubscription = {
      id: subscriptionId,
      pattern,
      handler,
      unsubscribe: () => {
        const handlers = this.handlers.get(pattern);
        if (handlers) {
          handlers.delete(handler);
          if (handlers.size === 0) {
            this.handlers.delete(pattern);
          }
        }
        this.subscriptions.delete(subscriptionId);
      },
    };

    this.subscriptions.set(subscriptionId, subscription);
    return subscription;
  }

  subscribeToTypes<T extends EventType>(
    types: T[],
    tenantId: string,
    handler: EventHandler<T>
  ): EventSubscription {
    const pattern = `events:${tenantId}:*`;

    const filteredHandler: EventHandler = (event) => {
      if (types.includes(event.type as T)) {
        handler(event as TypedEvent<T>);
      }
    };

    return this.subscribe(pattern, filteredHandler);
  }

  async getRecentEvents(
    tenantId: string,
    count: number = 100,
    filter?: EventFilter
  ): Promise<BarrHawkEvent[]> {
    return this.events
      .filter((e) => e.tenantId === tenantId)
      .filter((e) => this.matchesFilter(e, filter))
      .slice(-count);
  }

  async getEventsForRun(
    tenantId: string,
    correlationId: string,
    since?: Date
  ): Promise<BarrHawkEvent[]> {
    return this.events
      .filter((e) => e.tenantId === tenantId && e.correlationId === correlationId)
      .filter((e) => !since || e.timestamp >= since);
  }

  private matchesFilter(event: BarrHawkEvent, filter?: EventFilter): boolean {
    if (!filter) return true;

    if (filter.types && !filter.types.includes(event.type as EventType)) {
      return false;
    }

    if (filter.correlationId && event.correlationId !== filter.correlationId) {
      return false;
    }

    if (filter.origin && !filter.origin.includes(event.source.origin)) {
      return false;
    }

    if (filter.since && event.timestamp < filter.since) {
      return false;
    }

    if (filter.until && event.timestamp > filter.until) {
      return false;
    }

    return true;
  }

  async close(): Promise<void> {
    for (const [, subscription] of this.subscriptions) {
      subscription.unsubscribe();
    }
    this.events = [];
  }

  /** Get all events (for testing) */
  getAllEvents(): BarrHawkEvent[] {
    return [...this.events];
  }

  /** Clear all events (for testing) */
  clear(): void {
    this.events = [];
  }
}
