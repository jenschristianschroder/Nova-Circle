import { describe, it, expect, vi } from 'vitest';
import { buildDatabaseConfig, subscribeToPoolErrors } from './database-config.js';

describe('buildDatabaseConfig', () => {
  it('uses pg as the client', () => {
    const config = buildDatabaseConfig('postgresql://localhost:5432/test', false);
    expect(config.client).toBe('pg');
  });

  it('includes the connection string', () => {
    const url = 'postgresql://host:5432/mydb';
    const config = buildDatabaseConfig(url, false);
    const conn = config.connection as Record<string, unknown>;
    expect(conn.connectionString).toBe(url);
  });

  it('enables TCP keepalive with a 10 s initial delay', () => {
    const config = buildDatabaseConfig('postgresql://remote:5432/db', true);
    const conn = config.connection as Record<string, unknown>;
    expect(conn.keepAlive).toBe(true);
    expect(conn.keepAliveInitialDelayMillis).toBe(10_000);
  });

  it('sets a 5 s connection timeout', () => {
    const config = buildDatabaseConfig('postgresql://remote:5432/db', true);
    const conn = config.connection as Record<string, unknown>;
    expect(conn.connectionTimeoutMillis).toBe(5_000);
  });

  it('configures pool min/max', () => {
    const config = buildDatabaseConfig('postgresql://localhost:5432/test', false);
    expect(config.pool).toMatchObject({ min: 2, max: 10 });
  });

  it('sets acquireTimeoutMillis shorter than the default 60 s', () => {
    const config = buildDatabaseConfig('postgresql://localhost:5432/test', false);
    expect(config.pool).toMatchObject({ acquireTimeoutMillis: 15_000 });
  });

  it('sets idleTimeoutMillis to proactively destroy stale connections', () => {
    const config = buildDatabaseConfig('postgresql://localhost:5432/test', false);
    expect(config.pool).toMatchObject({ idleTimeoutMillis: 30_000 });
  });

  it('sets reapIntervalMillis for frequent idle-connection cleanup', () => {
    const config = buildDatabaseConfig('postgresql://localhost:5432/test', false);
    expect(config.pool).toMatchObject({ reapIntervalMillis: 1_000 });
  });

  it('sets createRetryIntervalMillis for fast recovery on failed connection creation', () => {
    const config = buildDatabaseConfig('postgresql://localhost:5432/test', false);
    expect(config.pool).toMatchObject({ createRetryIntervalMillis: 200 });
  });

  it('configures SSL for remote hosts', () => {
    const config = buildDatabaseConfig('postgresql://remote-host:5432/db', true);
    const conn = config.connection as Record<string, unknown>;
    expect(conn.ssl).toEqual({ rejectUnauthorized: true });
  });

  it('disables SSL for localhost', () => {
    const config = buildDatabaseConfig('postgresql://localhost:5432/db', false);
    const conn = config.connection as Record<string, unknown>;
    expect(conn.ssl).toBe(false);
  });
});

describe('subscribeToPoolErrors', () => {
  it('subscribes to pool error events when pool.on exists', () => {
    const onFn = vi.fn();
    const fakeDb = { client: { pool: { on: onFn } } };
    const callback = vi.fn();

    subscribeToPoolErrors(fakeDb, callback);

    expect(onFn).toHaveBeenCalledWith('error', callback);
  });

  it('does nothing when pool is undefined', () => {
    const fakeDb = { client: {} };
    // Should not throw.
    expect(() => subscribeToPoolErrors(fakeDb, vi.fn())).not.toThrow();
  });

  it('does nothing when pool.on is not a function', () => {
    const fakeDb = { client: { pool: {} } };
    // Should not throw.
    expect(() => subscribeToPoolErrors(fakeDb, vi.fn())).not.toThrow();
  });
});
