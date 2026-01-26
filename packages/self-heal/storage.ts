/**
 * Selector Mapping Storage
 *
 * SQLite-based storage for persisting successful selector healings.
 * Allows quick lookup of previously healed selectors.
 */

import type {
  SelectorMapping,
  HealingStats,
  ElementInfo,
  HealingStrategy,
} from './types.js';

// Use dynamic import for better-sqlite3 to avoid issues if not installed
let Database: any = null;

async function getDatabase() {
  if (!Database) {
    try {
      const module = await import('better-sqlite3');
      Database = module.default;
    } catch {
      console.warn('better-sqlite3 not available, using in-memory storage');
      return null;
    }
  }
  return Database;
}

/**
 * In-memory fallback storage
 */
class InMemoryStorage {
  private mappings: Map<string, SelectorMapping> = new Map();
  private healingHistory: Array<{
    originalSelector: string;
    healedSelector: string;
    strategy: HealingStrategy;
    confidence: number;
    url: string;
    timestamp: Date;
    success: boolean;
  }> = [];

  getMapping(originalSelector: string, url: string): SelectorMapping | null {
    const key = this.makeKey(originalSelector, url);
    return this.mappings.get(key) || null;
  }

  saveMapping(mapping: Omit<SelectorMapping, 'id' | 'createdAt' | 'lastUsedAt' | 'useCount'>): void {
    const key = this.makeKey(mapping.originalSelector, mapping.urlPattern);
    const existing = this.mappings.get(key);

    const now = new Date();
    const fullMapping: SelectorMapping = {
      ...mapping,
      id: existing?.id || crypto.randomUUID(),
      createdAt: existing?.createdAt || now,
      lastUsedAt: now,
      useCount: (existing?.useCount || 0) + 1,
      isValid: true,
    };

    this.mappings.set(key, fullMapping);
  }

  recordHealing(
    originalSelector: string,
    healedSelector: string | undefined,
    strategy: HealingStrategy | undefined,
    confidence: number,
    url: string,
    success: boolean
  ): void {
    this.healingHistory.push({
      originalSelector,
      healedSelector: healedSelector || '',
      strategy: strategy || 'id',
      confidence,
      url,
      timestamp: new Date(),
      success,
    });

    // Keep only last 1000 entries
    if (this.healingHistory.length > 1000) {
      this.healingHistory = this.healingHistory.slice(-1000);
    }
  }

  getStats(): HealingStats {
    const total = this.healingHistory.length;
    const successes = this.healingHistory.filter(h => h.success);
    const failures = this.healingHistory.filter(h => !h.success);

    const byStrategy: Record<HealingStrategy, { attempts: number; successes: number; avgConfidence: number }> = {
      'id': { attempts: 0, successes: 0, avgConfidence: 0 },
      'data-testid': { attempts: 0, successes: 0, avgConfidence: 0 },
      'aria-label': { attempts: 0, successes: 0, avgConfidence: 0 },
      'text': { attempts: 0, successes: 0, avgConfidence: 0 },
      'css-path': { attempts: 0, successes: 0, avgConfidence: 0 },
      'xpath': { attempts: 0, successes: 0, avgConfidence: 0 },
      'proximity': { attempts: 0, successes: 0, avgConfidence: 0 },
    };

    for (const h of this.healingHistory) {
      const strat = byStrategy[h.strategy];
      if (strat) {
        strat.attempts++;
        if (h.success) {
          strat.successes++;
          strat.avgConfidence = (strat.avgConfidence * (strat.successes - 1) + h.confidence) / strat.successes;
        }
      }
    }

    return {
      totalAttempts: total,
      successCount: successes.length,
      failureCount: failures.length,
      successRate: total > 0 ? (successes.length / total) * 100 : 0,
      avgConfidence: successes.length > 0
        ? successes.reduce((sum, h) => sum + h.confidence, 0) / successes.length
        : 0,
      avgHealingTimeMs: 0, // Not tracked in simple version
      byStrategy,
      recentHealings: this.healingHistory
        .filter(h => h.success)
        .slice(-10)
        .map(h => ({
          originalSelector: h.originalSelector,
          healedSelector: h.healedSelector,
          strategy: h.strategy,
          confidence: h.confidence,
          url: h.url,
          timestamp: h.timestamp,
        })),
    };
  }

  invalidateMapping(originalSelector: string, url: string): void {
    const key = this.makeKey(originalSelector, url);
    const mapping = this.mappings.get(key);
    if (mapping) {
      mapping.isValid = false;
    }
  }

  clearAll(): void {
    this.mappings.clear();
    this.healingHistory = [];
  }

  private makeKey(selector: string, url: string): string {
    // Normalize URL to pattern (remove query params, trailing slash)
    const urlPattern = url.split('?')[0].replace(/\/$/, '');
    return `${urlPattern}::${selector}`;
  }
}

/**
 * SQLite-backed storage
 */
class SqliteStorage {
  private db: any;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS selector_mappings (
        id TEXT PRIMARY KEY,
        original_selector TEXT NOT NULL,
        healed_selector TEXT NOT NULL,
        url_pattern TEXT NOT NULL,
        strategy TEXT NOT NULL,
        confidence REAL NOT NULL,
        element_info TEXT NOT NULL,
        use_count INTEGER DEFAULT 1,
        last_used_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        is_valid INTEGER DEFAULT 1,
        UNIQUE(original_selector, url_pattern)
      );

      CREATE TABLE IF NOT EXISTS healing_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_selector TEXT NOT NULL,
        healed_selector TEXT,
        strategy TEXT,
        confidence REAL NOT NULL,
        url TEXT NOT NULL,
        success INTEGER NOT NULL,
        healing_time_ms INTEGER,
        timestamp TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_mappings_selector ON selector_mappings(original_selector);
      CREATE INDEX IF NOT EXISTS idx_mappings_url ON selector_mappings(url_pattern);
      CREATE INDEX IF NOT EXISTS idx_history_timestamp ON healing_history(timestamp);
    `);
  }

  getMapping(originalSelector: string, url: string): SelectorMapping | null {
    const urlPattern = url.split('?')[0].replace(/\/$/, '');

    const row = this.db.prepare(`
      SELECT * FROM selector_mappings
      WHERE original_selector = ? AND url_pattern = ? AND is_valid = 1
    `).get(originalSelector, urlPattern);

    if (!row) return null;

    // Update use count and last used
    this.db.prepare(`
      UPDATE selector_mappings
      SET use_count = use_count + 1, last_used_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), row.id);

    return {
      id: row.id,
      originalSelector: row.original_selector,
      healedSelector: row.healed_selector,
      urlPattern: row.url_pattern,
      strategy: row.strategy as HealingStrategy,
      confidence: row.confidence,
      elementInfo: JSON.parse(row.element_info),
      useCount: row.use_count + 1,
      lastUsedAt: new Date(row.last_used_at),
      createdAt: new Date(row.created_at),
      isValid: Boolean(row.is_valid),
    };
  }

  saveMapping(mapping: Omit<SelectorMapping, 'id' | 'createdAt' | 'lastUsedAt' | 'useCount'>): void {
    const urlPattern = mapping.urlPattern.split('?')[0].replace(/\/$/, '');
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    this.db.prepare(`
      INSERT INTO selector_mappings
        (id, original_selector, healed_selector, url_pattern, strategy, confidence, element_info, last_used_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(original_selector, url_pattern)
      DO UPDATE SET
        healed_selector = excluded.healed_selector,
        strategy = excluded.strategy,
        confidence = excluded.confidence,
        element_info = excluded.element_info,
        last_used_at = excluded.last_used_at,
        use_count = use_count + 1,
        is_valid = 1
    `).run(
      id,
      mapping.originalSelector,
      mapping.healedSelector,
      urlPattern,
      mapping.strategy,
      mapping.confidence,
      JSON.stringify(mapping.elementInfo),
      now,
      now
    );
  }

  recordHealing(
    originalSelector: string,
    healedSelector: string | undefined,
    strategy: HealingStrategy | undefined,
    confidence: number,
    url: string,
    success: boolean,
    healingTimeMs?: number
  ): void {
    this.db.prepare(`
      INSERT INTO healing_history
        (original_selector, healed_selector, strategy, confidence, url, success, healing_time_ms, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      originalSelector,
      healedSelector || null,
      strategy || null,
      confidence,
      url,
      success ? 1 : 0,
      healingTimeMs || null,
      new Date().toISOString()
    );
  }

  getStats(): HealingStats {
    const totals = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
        AVG(CASE WHEN success = 1 THEN confidence ELSE NULL END) as avg_confidence,
        AVG(healing_time_ms) as avg_time
      FROM healing_history
    `).get();

    const byStrategyRows = this.db.prepare(`
      SELECT
        strategy,
        COUNT(*) as attempts,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
        AVG(CASE WHEN success = 1 THEN confidence ELSE NULL END) as avg_confidence
      FROM healing_history
      WHERE strategy IS NOT NULL
      GROUP BY strategy
    `).all();

    const recentRows = this.db.prepare(`
      SELECT
        original_selector,
        healed_selector,
        strategy,
        confidence,
        url,
        timestamp
      FROM healing_history
      WHERE success = 1
      ORDER BY timestamp DESC
      LIMIT 10
    `).all();

    const byStrategy: Record<HealingStrategy, { attempts: number; successes: number; avgConfidence: number }> = {
      'id': { attempts: 0, successes: 0, avgConfidence: 0 },
      'data-testid': { attempts: 0, successes: 0, avgConfidence: 0 },
      'aria-label': { attempts: 0, successes: 0, avgConfidence: 0 },
      'text': { attempts: 0, successes: 0, avgConfidence: 0 },
      'css-path': { attempts: 0, successes: 0, avgConfidence: 0 },
      'xpath': { attempts: 0, successes: 0, avgConfidence: 0 },
      'proximity': { attempts: 0, successes: 0, avgConfidence: 0 },
    };

    for (const row of byStrategyRows) {
      if (row.strategy && byStrategy[row.strategy as HealingStrategy]) {
        byStrategy[row.strategy as HealingStrategy] = {
          attempts: row.attempts,
          successes: row.successes,
          avgConfidence: row.avg_confidence || 0,
        };
      }
    }

    return {
      totalAttempts: totals.total || 0,
      successCount: totals.successes || 0,
      failureCount: (totals.total || 0) - (totals.successes || 0),
      successRate: totals.total > 0 ? ((totals.successes || 0) / totals.total) * 100 : 0,
      avgConfidence: totals.avg_confidence || 0,
      avgHealingTimeMs: totals.avg_time || 0,
      byStrategy,
      recentHealings: recentRows.map((row: any) => ({
        originalSelector: row.original_selector,
        healedSelector: row.healed_selector,
        strategy: row.strategy as HealingStrategy,
        confidence: row.confidence,
        url: row.url,
        timestamp: new Date(row.timestamp),
      })),
    };
  }

  invalidateMapping(originalSelector: string, url: string): void {
    const urlPattern = url.split('?')[0].replace(/\/$/, '');
    this.db.prepare(`
      UPDATE selector_mappings
      SET is_valid = 0
      WHERE original_selector = ? AND url_pattern = ?
    `).run(originalSelector, urlPattern);
  }

  clearAll(): void {
    this.db.exec(`
      DELETE FROM selector_mappings;
      DELETE FROM healing_history;
    `);
  }

  close(): void {
    this.db.close();
  }
}

/**
 * Storage interface
 */
export interface ISelectorStorage {
  getMapping(originalSelector: string, url: string): SelectorMapping | null;
  saveMapping(mapping: Omit<SelectorMapping, 'id' | 'createdAt' | 'lastUsedAt' | 'useCount'>): void;
  recordHealing(
    originalSelector: string,
    healedSelector: string | undefined,
    strategy: HealingStrategy | undefined,
    confidence: number,
    url: string,
    success: boolean,
    healingTimeMs?: number
  ): void;
  getStats(): HealingStats;
  invalidateMapping(originalSelector: string, url: string): void;
  clearAll(): void;
}

// Global storage instance
let storage: ISelectorStorage | null = null;

/**
 * Get or create storage instance
 */
export async function getStorage(dbPath?: string): Promise<ISelectorStorage> {
  if (storage) return storage;

  if (dbPath) {
    const Db = await getDatabase();
    if (Db) {
      Database = Db;
      storage = new SqliteStorage(dbPath) as ISelectorStorage;
      return storage;
    }
  }

  // Fall back to in-memory
  storage = new InMemoryStorage() as ISelectorStorage;
  return storage;
}

/**
 * Reset storage (for testing)
 */
export function resetStorage(): void {
  if (storage && 'close' in storage) {
    (storage as SqliteStorage).close();
  }
  storage = null;
}

export { InMemoryStorage, SqliteStorage };
