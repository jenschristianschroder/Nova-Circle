import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../infrastructure/test-db.js';
import type { Knex } from 'knex';

/**
 * Example integration test – verifies that the migration tooling is wired up and
 * the database schema can bootstrap from scratch.
 *
 * Requires TEST_DATABASE_URL to be set. In CI this is provided by the PostgreSQL
 * service container. This test is skipped automatically when the env var is absent.
 */
describe('Database migrations', () => {
  const skipReason = !process.env['TEST_DATABASE_URL']
    ? 'TEST_DATABASE_URL is not set – skipping database integration tests'
    : undefined;

  let db: Knex | undefined;

  beforeAll(async () => {
    if (skipReason) return;
    db = createTestDb();
    await db.migrate.latest();
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  it.skipIf(skipReason !== undefined)('latest migration completes without error', async () => {
    const currentVersion = await db!.migrate.currentVersion();
    expect(typeof currentVersion).toBe('string');
    expect(currentVersion.length).toBeGreaterThan(0);
  });

  it.skipIf(skipReason !== undefined)('can connect and execute a simple query', async () => {
    const result = await db!.raw<{ rows: Array<{ answer: number }> }>('SELECT 1 AS answer');
    expect(result.rows[0]?.answer).toBe(1);
  });

  it.skipIf(skipReason !== undefined)(
    'migration tracking table exists after running migrations',
    async () => {
      const exists = await db!.schema.hasTable('knex_migrations');
      expect(exists).toBe(true);
    },
  );
});
