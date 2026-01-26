/**
 * BarrHawk E2E Event Persistence
 *
 * Persists critical events to the database for long-term storage,
 * querying, and analytics.
 */

import type {
  BarrHawkEvent,
  EventType,
  EventFilter,
  EventSource,
} from './types.js';

// =============================================================================
// Persistence Interface
// =============================================================================

export interface IEventPersistence {
  /** Persist an event to the database */
  persist(event: BarrHawkEvent): Promise<void>;

  /** Query events from the database */
  query(filter: EventFilter, options?: QueryOptions): Promise<BarrHawkEvent[]>;

  /** Get events for a specific test run */
  getEventsForRun(runId: string): Promise<BarrHawkEvent[]>;

  /** Delete old events (for retention policy) */
  deleteOldEvents(olderThan: Date): Promise<number>;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'asc' | 'desc';
}

// =============================================================================
// Persistable Events
// =============================================================================

/**
 * Events that should be persisted to the database.
 * High-volume events like console.captured are NOT persisted by default.
 */
export const PERSISTABLE_EVENTS: EventType[] = [
  'test.run.started',
  'test.run.completed',
  'test.step.completed',
  'screenshot.captured',
  'api.request.sent',
  'api.response.received',
  'mcp.instance.started',
  'mcp.instance.stopped',
  'mcp.tool.invoked',
  'billing.usage.recorded',
  'billing.quota.exceeded',
  'system.alert.fired',
];

/**
 * Check if an event should be persisted.
 */
export function shouldPersist(eventType: EventType): boolean {
  return PERSISTABLE_EVENTS.includes(eventType);
}

// =============================================================================
// Prisma-based Persistence
// =============================================================================

/**
 * Database event record structure.
 * This matches the Prisma schema Event model.
 */
export interface EventRecord {
  id: string;
  type: string;
  tenantId: string;
  correlationId: string;
  source: EventSource;
  payload: unknown;
  timestamp: Date;
  version: string;
  metadata?: Record<string, unknown>;
}

/**
 * Convert BarrHawkEvent to database record.
 */
export function toEventRecord(event: BarrHawkEvent): EventRecord {
  return {
    id: event.id,
    type: event.type,
    tenantId: event.tenantId,
    correlationId: event.correlationId,
    source: event.source,
    payload: event.payload,
    timestamp: event.timestamp,
    version: event.version,
    metadata: event.metadata,
  };
}

/**
 * Convert database record to BarrHawkEvent.
 */
export function fromEventRecord(record: EventRecord): BarrHawkEvent {
  return {
    id: record.id,
    type: record.type,
    tenantId: record.tenantId,
    correlationId: record.correlationId,
    source: record.source,
    payload: record.payload,
    timestamp: record.timestamp,
    version: record.version,
    metadata: record.metadata,
  };
}

/**
 * Prisma-based event persistence.
 * Pass in the Prisma client to avoid circular dependencies.
 */
export class PrismaEventPersistence implements IEventPersistence {
  private prisma: any; // PrismaClient type - using any to avoid import issues

  constructor(prismaClient: any) {
    this.prisma = prismaClient;
  }

  async persist(event: BarrHawkEvent): Promise<void> {
    // Only persist certain event types
    if (!shouldPersist(event.type as EventType)) {
      return;
    }

    const record = toEventRecord(event);

    await this.prisma.event.create({
      data: {
        id: record.id,
        type: record.type,
        tenantId: record.tenantId,
        correlationId: record.correlationId,
        source: record.source as any,
        payload: record.payload as any,
        timestamp: record.timestamp,
        version: record.version,
        metadata: record.metadata as any,
      },
    });
  }

  async query(filter: EventFilter, options?: QueryOptions): Promise<BarrHawkEvent[]> {
    const where: any = {};

    if (filter.tenantId) {
      where.tenantId = filter.tenantId;
    }

    if (filter.correlationId) {
      where.correlationId = filter.correlationId;
    }

    if (filter.types && filter.types.length > 0) {
      where.type = { in: filter.types };
    }

    if (filter.since || filter.until) {
      where.timestamp = {};
      if (filter.since) {
        where.timestamp.gte = filter.since;
      }
      if (filter.until) {
        where.timestamp.lte = filter.until;
      }
    }

    const records = await this.prisma.event.findMany({
      where,
      take: options?.limit ?? 100,
      skip: options?.offset ?? 0,
      orderBy: {
        timestamp: options?.orderBy ?? 'desc',
      },
    });

    return records.map(fromEventRecord);
  }

  async getEventsForRun(runId: string): Promise<BarrHawkEvent[]> {
    const records = await this.prisma.event.findMany({
      where: { correlationId: runId },
      orderBy: { timestamp: 'asc' },
    });

    return records.map(fromEventRecord);
  }

  async deleteOldEvents(olderThan: Date): Promise<number> {
    const result = await this.prisma.event.deleteMany({
      where: {
        timestamp: { lt: olderThan },
      },
    });

    return result.count;
  }
}

// =============================================================================
// Retention Policy
// =============================================================================

export interface RetentionPolicy {
  /** Default retention period in days */
  defaultDays: number;

  /** Per-event-type overrides */
  overrides?: Record<string, number>;

  /** Per-tier overrides */
  tierOverrides?: Record<string, number>;
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  defaultDays: 30,
  overrides: {
    'billing.usage.recorded': 365,  // Keep billing events for 1 year
    'system.alert.fired': 90,       // Keep alerts for 90 days
    'test.run.completed': 90,       // Keep completed runs for 90 days
  },
  tierOverrides: {
    FREE: 7,
    STARTER: 30,
    PRO: 90,
    ENTERPRISE: 365,
  },
};

/**
 * Get retention days for an event type and tier.
 */
export function getRetentionDays(
  eventType: string,
  tier: string,
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY
): number {
  // Check event-type specific override
  if (policy.overrides?.[eventType]) {
    return policy.overrides[eventType];
  }

  // Check tier override
  if (policy.tierOverrides?.[tier]) {
    return policy.tierOverrides[tier];
  }

  return policy.defaultDays;
}

// =============================================================================
// Event Aggregation (for analytics)
// =============================================================================

export interface EventAggregation {
  eventType: string;
  count: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
}

export interface UsageAggregation {
  tenantId: string;
  period: string;  // YYYY-MM or YYYY-MM-DD
  testRuns: number;
  screenshots: number;
  apiCalls: number;
  byOrigin: Record<string, number>;
}

/**
 * Aggregate events for analytics.
 * This would typically be run as a background job.
 */
export async function aggregateEvents(
  prisma: any,
  tenantId: string,
  startDate: Date,
  endDate: Date
): Promise<UsageAggregation> {
  const events = await prisma.event.findMany({
    where: {
      tenantId,
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
      type: {
        in: ['test.run.completed', 'screenshot.captured', 'api.request.sent'],
      },
    },
    select: {
      type: true,
      source: true,
    },
  });

  const aggregation: UsageAggregation = {
    tenantId,
    period: startDate.toISOString().substring(0, 7),
    testRuns: 0,
    screenshots: 0,
    apiCalls: 0,
    byOrigin: {},
  };

  for (const event of events) {
    const origin = (event.source as EventSource)?.origin ?? 'unknown';

    if (!aggregation.byOrigin[origin]) {
      aggregation.byOrigin[origin] = 0;
    }
    aggregation.byOrigin[origin]++;

    switch (event.type) {
      case 'test.run.completed':
        aggregation.testRuns++;
        break;
      case 'screenshot.captured':
        aggregation.screenshots++;
        break;
      case 'api.request.sent':
        aggregation.apiCalls++;
        break;
    }
  }

  return aggregation;
}
