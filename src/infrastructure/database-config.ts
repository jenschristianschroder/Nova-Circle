import type { Knex } from 'knex';
import { resolveDbSsl } from './database-ssl.js';

/**
 * Builds the Knex configuration for the production database connection.
 *
 * Encapsulates all resilience-critical settings so they are easy to test
 * and difficult to accidentally remove during refactoring:
 *
 * - **TCP keepalive** — detects server-side closed connections (e.g. Azure
 *   PostgreSQL idle timeout) before Knex tries to use a dead socket.
 * - **Connection timeout** — prevents hanging indefinitely when the database
 *   is unreachable after a cold start.
 * - **Pool tuning** — shorter acquire timeout, proactive idle reaping, and
 *   retry interval for connection creation failures.
 *
 * @param databaseUrl - PostgreSQL connection string.
 * @param production  - Whether the app is running in production mode.
 */
export function buildDatabaseConfig(databaseUrl: string, production: boolean): Knex.Config {
  return {
    client: 'pg',
    connection: {
      connectionString: databaseUrl,
      ssl: resolveDbSsl(databaseUrl, production),
      // TCP keepalive: detects server-side closed connections (e.g. Azure
      // PostgreSQL idle timeout) before Knex tries to use a dead socket.
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      // Hard cap on establishing a new TCP connection. Prevents hanging
      // indefinitely when the database is unreachable after a cold start.
      connectionTimeoutMillis: 5_000,
    },
    pool: {
      min: 2,
      max: 10,
      // Time Knex waits to acquire a connection from the pool before
      // throwing.  Default (60 s) is too long for user-facing requests.
      acquireTimeoutMillis: 15_000,
      // Time a connection can sit idle in the pool before being destroyed.
      // Azure PostgreSQL Flexible Server can close idle connections after a
      // few minutes; keeping our timeout shorter avoids using dead sockets.
      idleTimeoutMillis: 30_000,
      // How often the pool checks for idle connections to destroy.
      reapIntervalMillis: 1_000,
      // How often to retry connection creation when it fails.
      createRetryIntervalMillis: 200,
    },
  };
}

/**
 * Subscribes to pool-level error events on a Knex instance so that
 * dead-connection or capacity issues are visible in logs instead of
 * silently causing 500s.
 *
 * These errors are typically transient (e.g. PostgreSQL closes an idle TCP
 * socket) and the pool recovers automatically by creating new connections.
 * Persistent or frequent errors indicate a database connectivity problem
 * that needs investigation (wrong credentials, firewall rules, DB down).
 *
 * @param db        - The Knex instance whose pool to subscribe to.
 * @param onError   - Callback invoked for each pool error event.
 */
export function subscribeToPoolErrors(
  db: { client: unknown },
  onError: (err: unknown) => void,
): void {
  // Knex's pg client exposes its tarn.Pool via `client.pool`.  The type is
  // not part of the public Knex API, so we narrow defensively rather than
  // relying on an internal interface.
  type PoolLike = { on?: (event: string, cb: (err: unknown) => void) => void };
  const pool = (db.client as Record<string, unknown>).pool as PoolLike | undefined;
  if (pool?.on) {
    pool.on('error', onError);
  }
}
