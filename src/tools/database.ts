/**
 * Database Tools - PostgreSQL, SQLite, Redis
 *
 * Full database automation for testing workflows
 */

import { Pool, PoolClient } from 'pg';
import Database from 'better-sqlite3';
import { createClient, RedisClientType } from 'redis';

// Connection pools
const pgPools: Map<string, Pool> = new Map();
const sqliteConnections: Map<string, any> = new Map();
const redisClients: Map<string, RedisClientType> = new Map();

// =============================================================================
// POSTGRESQL
// =============================================================================

export async function handlePgConnect(args: {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  alias?: string;
}): Promise<object> {
  const alias = args.alias || 'default';

  try {
    const pool = new Pool({
      connectionString: args.connectionString,
      host: args.host || 'localhost',
      port: args.port || 5432,
      database: args.database || 'postgres',
      user: args.user || 'postgres',
      password: args.password,
      max: 5,
      idleTimeoutMillis: 30000,
    });

    // Test connection
    const client = await pool.connect();
    const result = await client.query('SELECT version()');
    client.release();

    pgPools.set(alias, pool);

    return {
      success: true,
      alias,
      version: result.rows[0].version,
      message: `Connected to PostgreSQL as "${alias}"`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handlePgQuery(args: {
  query: string;
  params?: any[];
  alias?: string;
}): Promise<object> {
  const alias = args.alias || 'default';
  const pool = pgPools.get(alias);

  if (!pool) {
    return { success: false, error: `No connection with alias "${alias}". Call db_pg_connect first.` };
  }

  try {
    const start = Date.now();
    const result = await pool.query(args.query, args.params || []);
    const duration = Date.now() - start;

    return {
      success: true,
      rowCount: result.rowCount,
      rows: result.rows,
      fields: result.fields?.map(f => ({ name: f.name, dataType: f.dataTypeID })),
      duration,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handlePgSchema(args: {
  table?: string;
  alias?: string;
}): Promise<object> {
  const alias = args.alias || 'default';
  const pool = pgPools.get(alias);

  if (!pool) {
    return { success: false, error: `No connection with alias "${alias}"` };
  }

  try {
    if (args.table) {
      // Get specific table schema
      const result = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [args.table]);

      const constraints = await pool.query(`
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_name = $1
      `, [args.table]);

      return {
        success: true,
        table: args.table,
        columns: result.rows,
        constraints: constraints.rows,
      };
    } else {
      // List all tables
      const result = await pool.query(`
        SELECT table_name, table_type
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);

      return {
        success: true,
        tables: result.rows,
        count: result.rowCount,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handlePgSeed(args: {
  table: string;
  data: Record<string, any>[];
  truncateFirst?: boolean;
  alias?: string;
}): Promise<object> {
  const alias = args.alias || 'default';
  const pool = pgPools.get(alias);

  if (!pool) {
    return { success: false, error: `No connection with alias "${alias}"` };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (args.truncateFirst) {
      await client.query(`TRUNCATE TABLE ${args.table} CASCADE`);
    }

    let inserted = 0;
    for (const row of args.data) {
      const columns = Object.keys(row);
      const values = Object.values(row);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

      await client.query(
        `INSERT INTO ${args.table} (${columns.join(', ')}) VALUES (${placeholders})`,
        values
      );
      inserted++;
    }

    await client.query('COMMIT');

    return {
      success: true,
      table: args.table,
      inserted,
      truncated: args.truncateFirst || false,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    client.release();
  }
}

export async function handlePgTransaction(args: {
  queries: Array<{ query: string; params?: any[] }>;
  alias?: string;
}): Promise<object> {
  const alias = args.alias || 'default';
  const pool = pgPools.get(alias);

  if (!pool) {
    return { success: false, error: `No connection with alias "${alias}"` };
  }

  const client = await pool.connect();
  const results: any[] = [];

  try {
    await client.query('BEGIN');

    for (const q of args.queries) {
      const result = await client.query(q.query, q.params || []);
      results.push({
        rowCount: result.rowCount,
        rows: result.rows,
      });
    }

    await client.query('COMMIT');

    return {
      success: true,
      results,
      queriesExecuted: args.queries.length,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      failedAt: results.length,
    };
  } finally {
    client.release();
  }
}

export async function handlePgDisconnect(args: { alias?: string }): Promise<object> {
  const alias = args.alias || 'default';
  const pool = pgPools.get(alias);

  if (!pool) {
    return { success: false, error: `No connection with alias "${alias}"` };
  }

  await pool.end();
  pgPools.delete(alias);

  return {
    success: true,
    message: `Disconnected from PostgreSQL "${alias}"`,
  };
}

// =============================================================================
// SQLITE
// =============================================================================

export async function handleSqliteOpen(args: {
  path: string;
  alias?: string;
  readonly?: boolean;
}): Promise<object> {
  const alias = args.alias || 'default';

  try {
    const db = new (Database as any)(args.path, {
      readonly: args.readonly || false,
    });

    sqliteConnections.set(alias, db);

    const info = db.prepare('SELECT sqlite_version() as version').get() as any;

    return {
      success: true,
      alias,
      path: args.path,
      version: info.version,
      readonly: args.readonly || false,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleSqliteQuery(args: {
  query: string;
  params?: any[];
  alias?: string;
}): Promise<object> {
  const alias = args.alias || 'default';
  const db = sqliteConnections.get(alias);

  if (!db) {
    return { success: false, error: `No SQLite connection "${alias}". Call db_sqlite_open first.` };
  }

  try {
    const start = Date.now();
    const stmt = db.prepare(args.query);

    let result: any;
    if (args.query.trim().toUpperCase().startsWith('SELECT')) {
      result = stmt.all(...(args.params || []));
      return {
        success: true,
        rows: result,
        rowCount: result.length,
        duration: Date.now() - start,
      };
    } else {
      result = stmt.run(...(args.params || []));
      return {
        success: true,
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowid,
        duration: Date.now() - start,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleSqliteSchema(args: {
  table?: string;
  alias?: string;
}): Promise<object> {
  const alias = args.alias || 'default';
  const db = sqliteConnections.get(alias);

  if (!db) {
    return { success: false, error: `No SQLite connection "${alias}"` };
  }

  try {
    if (args.table) {
      const columns = db.prepare(`PRAGMA table_info(${args.table})`).all();
      const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${args.table})`).all();

      return {
        success: true,
        table: args.table,
        columns,
        foreignKeys,
      };
    } else {
      const tables = db.prepare(`
        SELECT name, type FROM sqlite_master
        WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `).all();

      return {
        success: true,
        tables,
        count: tables.length,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleSqliteClose(args: { alias?: string }): Promise<object> {
  const alias = args.alias || 'default';
  const db = sqliteConnections.get(alias);

  if (!db) {
    return { success: false, error: `No SQLite connection "${alias}"` };
  }

  db.close();
  sqliteConnections.delete(alias);

  return {
    success: true,
    message: `Closed SQLite connection "${alias}"`,
  };
}

// =============================================================================
// REDIS
// =============================================================================

export async function handleRedisConnect(args: {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  alias?: string;
}): Promise<object> {
  const alias = args.alias || 'default';

  try {
    const client = createClient({
      url: args.url,
      socket: args.url ? undefined : {
        host: args.host || 'localhost',
        port: args.port || 6379,
      },
      password: args.password,
    });

    await client.connect();

    const info = await client.info('server');
    const versionMatch = info.match(/redis_version:(\S+)/);

    redisClients.set(alias, client as RedisClientType);

    return {
      success: true,
      alias,
      version: versionMatch ? versionMatch[1] : 'unknown',
      message: `Connected to Redis as "${alias}"`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleRedisGet(args: {
  key: string;
  alias?: string;
}): Promise<object> {
  const alias = args.alias || 'default';
  const client = redisClients.get(alias);

  if (!client) {
    return { success: false, error: `No Redis connection "${alias}"` };
  }

  try {
    const value = await client.get(args.key);
    const ttl = await client.ttl(args.key);

    return {
      success: true,
      key: args.key,
      value,
      exists: value !== null,
      ttl: ttl > 0 ? ttl : null,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleRedisSet(args: {
  key: string;
  value: string;
  ttl?: number;
  alias?: string;
}): Promise<object> {
  const alias = args.alias || 'default';
  const client = redisClients.get(alias);

  if (!client) {
    return { success: false, error: `No Redis connection "${alias}"` };
  }

  try {
    if (args.ttl) {
      await client.setEx(args.key, args.ttl, args.value);
    } else {
      await client.set(args.key, args.value);
    }

    return {
      success: true,
      key: args.key,
      ttl: args.ttl || null,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleRedisDel(args: {
  keys: string | string[];
  alias?: string;
}): Promise<object> {
  const alias = args.alias || 'default';
  const client = redisClients.get(alias);

  if (!client) {
    return { success: false, error: `No Redis connection "${alias}"` };
  }

  try {
    const keyList = Array.isArray(args.keys) ? args.keys : [args.keys];
    const deleted = await client.del(keyList);

    return {
      success: true,
      deleted,
      keys: keyList,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleRedisKeys(args: {
  pattern?: string;
  alias?: string;
}): Promise<object> {
  const alias = args.alias || 'default';
  const client = redisClients.get(alias);

  if (!client) {
    return { success: false, error: `No Redis connection "${alias}"` };
  }

  try {
    const keys = await client.keys(args.pattern || '*');

    return {
      success: true,
      keys,
      count: keys.length,
      pattern: args.pattern || '*',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleRedisFlush(args: {
  alias?: string;
  confirm?: boolean;
}): Promise<object> {
  const alias = args.alias || 'default';
  const client = redisClients.get(alias);

  if (!client) {
    return { success: false, error: `No Redis connection "${alias}"` };
  }

  if (!args.confirm) {
    return { success: false, error: 'Must set confirm: true to flush database' };
  }

  try {
    await client.flushDb();

    return {
      success: true,
      message: `Flushed Redis database "${alias}"`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleRedisHash(args: {
  action: 'get' | 'set' | 'getall' | 'del';
  key: string;
  field?: string;
  value?: string;
  fields?: Record<string, string>;
  alias?: string;
}): Promise<object> {
  const alias = args.alias || 'default';
  const client = redisClients.get(alias);

  if (!client) {
    return { success: false, error: `No Redis connection "${alias}"` };
  }

  try {
    switch (args.action) {
      case 'get':
        if (!args.field) throw new Error('field required for get');
        const val = await client.hGet(args.key, args.field);
        return { success: true, key: args.key, field: args.field, value: val };

      case 'set':
        if (args.fields) {
          await client.hSet(args.key, args.fields);
          return { success: true, key: args.key, fieldsSet: Object.keys(args.fields).length };
        } else if (args.field && args.value) {
          await client.hSet(args.key, args.field, args.value);
          return { success: true, key: args.key, field: args.field };
        }
        throw new Error('fields or field+value required for set');

      case 'getall':
        const all = await client.hGetAll(args.key);
        return { success: true, key: args.key, data: all };

      case 'del':
        if (!args.field) throw new Error('field required for del');
        const deleted = await client.hDel(args.key, args.field);
        return { success: true, key: args.key, field: args.field, deleted };

      default:
        throw new Error(`Unknown action: ${args.action}`);
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleRedisDisconnect(args: { alias?: string }): Promise<object> {
  const alias = args.alias || 'default';
  const client = redisClients.get(alias);

  if (!client) {
    return { success: false, error: `No Redis connection "${alias}"` };
  }

  await client.quit();
  redisClients.delete(alias);

  return {
    success: true,
    message: `Disconnected from Redis "${alias}"`,
  };
}
