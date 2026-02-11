#!/usr/bin/env bun
/**
 * Igor-DB - Database Watcher Igor Variant
 *
 * Specialized Igor that:
 * - Connects to PostgreSQL/MySQL/SQLite databases
 * - Executes queries before/after triggers
 * - Subscribes to real-time changes (LISTEN/NOTIFY for Postgres)
 * - Reports state changes back to Hub
 */

import { Client as PgClient } from 'pg';
import { Database } from 'bun:sqlite';
import { WebSocket } from 'ws';

const PORT = parseInt(process.env.IGOR_DB_PORT || '7012');
const BRIDGE_URL = process.env.BRIDGE_URL || 'ws://localhost:7000';
const IGOR_ID = `igor-db-${Date.now().toString(36)}`;

// =============================================================================
// Logger
// =============================================================================

function log(level: 'info' | 'warn' | 'error' | 'debug', msg: string, data?: object) {
  const time = new Date().toISOString();
  const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : level === 'debug' ? '🔍' : '🗄️';
  console.log(`${time} ${prefix} [Igor-DB] ${msg}`, data ? JSON.stringify(data) : '');
}

// =============================================================================
// Database Connections
// =============================================================================

interface DbConnection {
  type: 'postgres' | 'mysql' | 'sqlite';
  client: PgClient | Database | null;
  connectionString: string;
  subscriptions: Map<string, SubscriptionHandler>;
}

interface SubscriptionHandler {
  table: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  callback: (event: DbEvent) => void;
}

interface DbEvent {
  table: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  data: object;
  timestamp: Date;
}

const connections: Map<string, DbConnection> = new Map();

// =============================================================================
// PostgreSQL
// =============================================================================

async function connectPostgres(id: string, connectionString: string): Promise<DbConnection> {
  const client = new PgClient({ connectionString });
  await client.connect();

  const conn: DbConnection = {
    type: 'postgres',
    client,
    connectionString,
    subscriptions: new Map(),
  };

  // Set up notification handler
  client.on('notification', (msg) => {
    if (msg.channel?.startsWith('table_changes_')) {
      const table = msg.channel.replace('table_changes_', '');
      const payload = JSON.parse(msg.payload || '{}');

      const event: DbEvent = {
        table,
        operation: payload.operation,
        data: payload.data,
        timestamp: new Date(),
      };

      // Notify all subscriptions for this table
      for (const [, handler] of conn.subscriptions) {
        if (handler.table === table) {
          if (handler.operation === 'ALL' || handler.operation === event.operation) {
            handler.callback(event);
          }
        }
      }
    }
  });

  connections.set(id, conn);
  log('info', `Connected to PostgreSQL`, { id });
  return conn;
}

async function subscribePostgres(
  conn: DbConnection,
  table: string,
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL',
  callback: (event: DbEvent) => void
): Promise<string> {
  const client = conn.client as PgClient;
  const subId = `${table}-${operation}-${Date.now()}`;

  // Create trigger function if not exists
  await client.query(`
    CREATE OR REPLACE FUNCTION notify_table_changes()
    RETURNS TRIGGER AS $$
    BEGIN
      PERFORM pg_notify(
        'table_changes_' || TG_TABLE_NAME,
        json_build_object(
          'operation', TG_OP,
          'data', CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE row_to_json(NEW) END
        )::text
      );
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Create trigger for this table
  const triggerName = `notify_${table}_changes`;
  await client.query(`
    DROP TRIGGER IF EXISTS ${triggerName} ON ${table};
    CREATE TRIGGER ${triggerName}
    AFTER INSERT OR UPDATE OR DELETE ON ${table}
    FOR EACH ROW EXECUTE FUNCTION notify_table_changes();
  `);

  // Listen for notifications
  await client.query(`LISTEN table_changes_${table}`);

  conn.subscriptions.set(subId, { table, operation, callback });
  log('info', `Subscribed to ${table} ${operation}`, { subId });

  return subId;
}

// =============================================================================
// SQLite
// =============================================================================

function connectSqlite(id: string, path: string): DbConnection {
  const client = new Database(path);
  client.exec('PRAGMA journal_mode = WAL');

  const conn: DbConnection = {
    type: 'sqlite',
    client,
    connectionString: path,
    subscriptions: new Map(),
  };

  connections.set(id, conn);
  log('info', `Connected to SQLite`, { id, path });
  return conn;
}

// =============================================================================
// Query Execution
// =============================================================================

interface QueryResult {
  rows: object[];
  rowCount: number;
  fields?: string[];
}

async function executeQuery(
  conn: DbConnection,
  query: string,
  params?: Record<string, unknown>
): Promise<QueryResult> {
  if (conn.type === 'postgres') {
    const client = conn.client as PgClient;

    // Convert named params to positional
    const positionalParams: unknown[] = [];
    let positionalQuery = query;

    if (params) {
      const keys = Object.keys(params);
      keys.forEach((key, i) => {
        positionalQuery = positionalQuery.replace(new RegExp(`:${key}`, 'g'), `$${i + 1}`);
        positionalParams.push(params[key]);
      });
    }

    const result = await client.query(positionalQuery, positionalParams);
    return {
      rows: result.rows,
      rowCount: result.rowCount || 0,
      fields: result.fields?.map(f => f.name),
    };
  }

  if (conn.type === 'sqlite') {
    const client = conn.client as Database;

    // Convert named params to SQLite format ($key instead of :key for bun:sqlite)
    const sqliteParams: Record<string, unknown> = {};
    let processedQuery = query;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        sqliteParams[`$${key}`] = value;
        processedQuery = processedQuery.replace(new RegExp(`:${key}`, 'g'), `$${key}`);
      }
    }

    const stmt = client.prepare(processedQuery);
    const rows = stmt.all(sqliteParams) as object[];

    return {
      rows,
      rowCount: rows.length,
    };
  }

  throw new Error(`Unsupported database type: ${conn.type}`);
}

// =============================================================================
// Bridge Connection
// =============================================================================

let bridge: WebSocket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

function connectToBridge() {
  log('info', `Connecting to Bridge at ${BRIDGE_URL}`);

  bridge = new WebSocket(BRIDGE_URL);

  bridge.on('open', () => {
    log('info', 'Connected to Bridge');
    reconnectAttempts = 0;

    // Register as Igor-DB
    bridge?.send(JSON.stringify({
      type: 'register',
      payload: {
        id: IGOR_ID,
        component: 'igor-db',
        capabilities: ['postgres', 'sqlite', 'subscribe', 'query'],
      },
    }));
  });

  bridge.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      await handleBridgeMessage(message);
    } catch (err) {
      log('error', `Failed to handle message: ${err}`);
    }
  });

  bridge.on('close', () => {
    log('warn', 'Bridge connection closed');
    scheduleReconnect();
  });

  bridge.on('error', (err) => {
    log('error', `Bridge error: ${err.message}`);
  });
}

function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    log('error', 'Max reconnection attempts reached');
    return;
  }

  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
  reconnectAttempts++;

  log('info', `Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
  setTimeout(connectToBridge, delay);
}

async function handleBridgeMessage(message: any) {
  const { type, payload, correlationId } = message;

  switch (type) {
    case 'db.connect':
      await handleConnect(payload, correlationId);
      break;

    case 'db.query':
      await handleQuery(payload, correlationId);
      break;

    case 'db.subscribe':
      await handleSubscribe(payload, correlationId);
      break;

    case 'db.unsubscribe':
      await handleUnsubscribe(payload, correlationId);
      break;

    case 'db.disconnect':
      await handleDisconnect(payload, correlationId);
      break;

    default:
      log('debug', `Unknown message type: ${type}`);
  }
}

async function handleConnect(payload: any, correlationId: string) {
  const { id, type, connectionString, path } = payload;

  try {
    let conn: DbConnection;

    if (type === 'postgres') {
      conn = await connectPostgres(id, connectionString);
    } else if (type === 'sqlite') {
      conn = connectSqlite(id, path || connectionString);
    } else {
      throw new Error(`Unsupported database type: ${type}`);
    }

    sendToBridge('db.connected', { id, type: conn.type }, correlationId);
  } catch (err: any) {
    sendToBridge('db.error', { id, error: err.message }, correlationId);
  }
}

async function handleQuery(payload: any, correlationId: string) {
  const { connectionId, query, params } = payload;

  try {
    const conn = connections.get(connectionId);
    if (!conn) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    const result = await executeQuery(conn, query, params);
    sendToBridge('db.result', { connectionId, result }, correlationId);
  } catch (err: any) {
    sendToBridge('db.error', { connectionId, error: err.message }, correlationId);
  }
}

async function handleSubscribe(payload: any, correlationId: string) {
  const { connectionId, table, operation } = payload;

  try {
    const conn = connections.get(connectionId);
    if (!conn) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    if (conn.type !== 'postgres') {
      throw new Error('Subscriptions only supported for PostgreSQL');
    }

    const subId = await subscribePostgres(conn, table, operation, (event) => {
      sendToBridge('db.event', { connectionId, subscriptionId: subId, event }, correlationId);
    });

    sendToBridge('db.subscribed', { connectionId, subscriptionId: subId, table, operation }, correlationId);
  } catch (err: any) {
    sendToBridge('db.error', { connectionId, error: err.message }, correlationId);
  }
}

async function handleUnsubscribe(payload: any, correlationId: string) {
  const { connectionId, subscriptionId } = payload;

  const conn = connections.get(connectionId);
  if (conn) {
    conn.subscriptions.delete(subscriptionId);
    log('info', `Unsubscribed`, { subscriptionId });
  }

  sendToBridge('db.unsubscribed', { connectionId, subscriptionId }, correlationId);
}

async function handleDisconnect(payload: any, correlationId: string) {
  const { id } = payload;

  const conn = connections.get(id);
  if (conn) {
    if (conn.type === 'postgres') {
      await (conn.client as PgClient).end();
    } else if (conn.type === 'sqlite') {
      (conn.client as Database).close();
    }
    connections.delete(id);
    log('info', `Disconnected`, { id });
  }

  sendToBridge('db.disconnected', { id }, correlationId);
}

function sendToBridge(type: string, payload: object, correlationId?: string) {
  if (!bridge || bridge.readyState !== WebSocket.OPEN) {
    log('warn', 'Bridge not connected, cannot send message');
    return;
  }

  bridge.send(JSON.stringify({
    type,
    payload,
    correlationId,
    source: IGOR_ID,
    timestamp: new Date().toISOString(),
  }));
}

// =============================================================================
// HTTP API (for direct access)
// =============================================================================

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === '/health') {
    return Response.json({
      status: 'healthy',
      service: 'igor-db',
      id: IGOR_ID,
      connections: connections.size,
      bridgeConnected: bridge?.readyState === WebSocket.OPEN,
    });
  }

  if (path === '/connections' && req.method === 'GET') {
    const list = Array.from(connections.entries()).map(([id, conn]) => ({
      id,
      type: conn.type,
      subscriptions: conn.subscriptions.size,
    }));
    return Response.json({ connections: list });
  }

  if (path === '/connect' && req.method === 'POST') {
    const body = await req.json() as any;
    const { id, type, connectionString, path: dbPath } = body;

    try {
      if (type === 'postgres') {
        await connectPostgres(id, connectionString);
      } else if (type === 'sqlite') {
        connectSqlite(id, dbPath || connectionString);
      } else {
        return Response.json({ error: `Unsupported type: ${type}` }, { status: 400 });
      }
      return Response.json({ success: true, id });
    } catch (err: any) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  if (path === '/query' && req.method === 'POST') {
    const body = await req.json() as any;
    const { connectionId, query, params } = body;

    const conn = connections.get(connectionId);
    if (!conn) {
      return Response.json({ error: 'Connection not found' }, { status: 404 });
    }

    try {
      const result = await executeQuery(conn, query, params);
      return Response.json({ result });
    } catch (err: any) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  return Response.json({ error: 'Not found' }, { status: 404 });
}

// =============================================================================
// Main
// =============================================================================

log('info', `Igor-DB starting on port ${PORT}`);
connectToBridge();

const server = Bun.serve({
  port: PORT,
  fetch: handleRequest,
});

log('info', `Igor-DB listening on http://localhost:${PORT}`);

// Cleanup on exit
process.on('SIGINT', async () => {
  log('info', 'Shutting down...');

  for (const [id, conn] of connections) {
    try {
      if (conn.type === 'postgres') {
        await (conn.client as PgClient).end();
      } else if (conn.type === 'sqlite') {
        (conn.client as Database).close();
      }
    } catch {}
  }

  bridge?.close();
  process.exit(0);
});
