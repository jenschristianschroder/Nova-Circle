import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import knex from 'knex';
import type { Knex } from 'knex';
import { createTestDb } from '../infrastructure/test-db.js';

const skipReason = !process.env['TEST_DATABASE_URL']
  ? 'TEST_DATABASE_URL is not set – skipping visibility-level-enum migration tests'
  : undefined;

interface IdRow {
  id: string;
}
interface ColumnTypeRow {
  data_type: string;
  udt_name: string;
  column_default: string | null;
}
interface CheckConstraintRow {
  constraint_name: string;
  check_clause: string;
}
interface EnumLabelRow {
  enumlabel: string;
}

/**
 * Creates a Knex instance backed by an ephemeral PostgreSQL schema so that
 * migration up/down tests do not interfere with other test suites.
 */
async function createIsolatedTestDb(): Promise<{
  db: Knex;
  cleanup: () => Promise<void>;
}> {
  const schemaName = `test_vle_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

  const setup = createTestDb();
  await setup.raw(`CREATE SCHEMA "${schemaName}"`);
  await setup.destroy();

  const isolatedDb = knex({
    client: 'pg',
    connection: process.env['TEST_DATABASE_URL']!,
    searchPath: [schemaName],
    migrations: {
      directory: new URL('../../db/migrations', import.meta.url).pathname,
      extension: 'ts',
      loadExtensions: ['.ts'],
    },
    pool: { min: 1, max: 5 },
  });

  const cleanup = async (): Promise<void> => {
    await isolatedDb.destroy();
    const teardown = createTestDb();
    await teardown.raw(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await teardown.destroy();
  };

  return { db: isolatedDb, cleanup };
}

/** Run all migrations up to and including migration 10 (personal-event-ownership). */
async function migrateToBaseline(db: Knex): Promise<void> {
  await db.migrate.up({ name: '20260309000001_initial_schema.ts' });
  await db.migrate.up({ name: '20260309000002_identity_profile.ts' });
  await db.migrate.up({ name: '20260309000003_group_management.ts' });
  await db.migrate.up({ name: '20260309000004_group_membership.ts' });
  await db.migrate.up({ name: '20260310000005_event_management.ts' });
  await db.migrate.up({ name: '20260310000006_audit_security.ts' });
  await db.migrate.up({ name: '20260311000007_event_collaboration.ts' });
  await db.migrate.up({ name: '20260311000008_event_capture.ts' });
  await db.migrate.up({ name: '20260312000009_add_production_indexes.ts' });
  await db.migrate.up({ name: '20260328000010_personal_event_ownership.ts' });
}

/**
 * Integration tests for the 20260401000011_visibility_level_enum migration.
 *
 * Verifies:
 * - visibility_level column becomes a PostgreSQL ENUM after up migration
 * - ENUM type has the expected labels (busy, title, details)
 * - Default value is set correctly
 * - Invalid values are rejected by the ENUM type
 * - Down migration restores VARCHAR(20) + CHECK constraint
 * - ENUM type is dropped on rollback
 */
describe('Visibility level enum migration', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterAll(async () => {
    for (const cleanup of cleanups) {
      await cleanup();
    }
  });

  // ── Up migration tests ──────────────────────────────────────────────────

  it.skipIf(skipReason !== undefined)(
    'up migration converts visibility_level to ENUM with expected labels and default',
    async () => {
      const { db, cleanup } = await createIsolatedTestDb();
      cleanups.push(cleanup);
      try {
        await migrateToBaseline(db);
        await db.migrate.up({ name: '20260401000011_visibility_level_enum.ts' });

        // Verify column type is USER-DEFINED (PostgreSQL ENUM)
        const colInfo = await db.raw<{ rows: ColumnTypeRow[] }>(
          `SELECT data_type, udt_name, column_default
           FROM information_schema.columns
           WHERE table_schema = current_schema()
             AND table_name = 'event_shares'
             AND column_name = 'visibility_level'`,
        );
        expect(colInfo.rows.length).toBe(1);
        expect(colInfo.rows[0]!.data_type).toBe('USER-DEFINED');
        expect(colInfo.rows[0]!.udt_name).toBe('event_shares_visibility_level');
        expect(colInfo.rows[0]!.column_default).toContain('title');

        // Verify ENUM labels
        const labels = await db.raw<{ rows: EnumLabelRow[] }>(
          `SELECT enumlabel
           FROM pg_enum
           JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
           JOIN pg_namespace ON pg_type.typnamespace = pg_namespace.oid
           WHERE pg_namespace.nspname = current_schema()
             AND pg_type.typname = 'event_shares_visibility_level'
           ORDER BY pg_enum.enumsortorder`,
        );
        expect(labels.rows.map((r) => r.enumlabel)).toEqual(['busy', 'title', 'details']);
      } finally {
        await cleanup();
        cleanups.pop();
      }
    },
  );

  it.skipIf(skipReason !== undefined)('ENUM rejects invalid visibility_level values', async () => {
    const { db, cleanup } = await createIsolatedTestDb();
    cleanups.push(cleanup);
    try {
      await migrateToBaseline(db);
      await db.migrate.up({ name: '20260401000011_visibility_level_enum.ts' });

      // Insert test data to set up a valid share target
      const userId = 'eeeeeeee-0000-4000-8000-000000000001';
      await db('user_profiles').insert({ id: userId, display_name: 'Enum Test User' });
      const groups = await db<IdRow>('groups')
        .insert({ name: 'Enum Test Group', owner_id: userId })
        .returning('id');
      const events = await db<IdRow>('events')
        .insert({
          group_id: null,
          title: 'Enum Test Event',
          start_at: new Date('2026-06-01T12:00:00Z'),
          created_by: userId,
          owner_id: userId,
        })
        .returning('id');

      // Valid values should succeed
      for (const level of ['busy', 'title', 'details']) {
        await db('event_shares')
          .insert({
            event_id: events[0]!.id,
            group_id: groups[0]!.id,
            visibility_level: level,
            shared_by_user_id: userId,
          })
          .onConflict(['event_id', 'group_id'])
          .merge();
      }

      // Invalid value should be rejected by the ENUM type
      await expect(
        db('event_shares').insert({
          event_id: events[0]!.id,
          group_id: groups[0]!.id,
          visibility_level: 'invalid_value',
          shared_by_user_id: userId,
        }),
      ).rejects.toThrow();
    } finally {
      await cleanup();
      cleanups.pop();
    }
  });

  // ── Down migration tests ────────────────────────────────────────────────

  it.skipIf(skipReason !== undefined)(
    'down migration restores VARCHAR(20) + CHECK constraint and drops ENUM type',
    async () => {
      const { db, cleanup } = await createIsolatedTestDb();
      cleanups.push(cleanup);
      try {
        await migrateToBaseline(db);
        await db.migrate.up({ name: '20260401000011_visibility_level_enum.ts' });

        // Insert a row so the down migration exercises data conversion
        const userId = 'eeeeeeee-0000-4000-8000-000000000002';
        await db('user_profiles').insert({ id: userId, display_name: 'Rollback Test User' });
        const groups = await db<IdRow>('groups')
          .insert({ name: 'Rollback Test Group', owner_id: userId })
          .returning('id');
        const events = await db<IdRow>('events')
          .insert({
            group_id: null,
            title: 'Rollback Test Event',
            start_at: new Date('2026-06-01T12:00:00Z'),
            created_by: userId,
            owner_id: userId,
          })
          .returning('id');
        await db('event_shares').insert({
          event_id: events[0]!.id,
          group_id: groups[0]!.id,
          visibility_level: 'details',
          shared_by_user_id: userId,
        });

        // Roll back only the enum migration
        await db.migrate.rollback();

        // Verify column reverted to VARCHAR
        const colInfo = await db.raw<{ rows: ColumnTypeRow[] }>(
          `SELECT data_type, udt_name, column_default
           FROM information_schema.columns
           WHERE table_schema = current_schema()
             AND table_name = 'event_shares'
             AND column_name = 'visibility_level'`,
        );
        expect(colInfo.rows.length).toBe(1);
        expect(colInfo.rows[0]!.data_type).toBe('character varying');
        expect(colInfo.rows[0]!.column_default).toContain('title');

        // Verify the named CHECK constraint created by our down migration exists
        const checks = await db.raw<{ rows: CheckConstraintRow[] }>(
          `SELECT con.conname AS constraint_name,
                  pg_get_constraintdef(con.oid) AS check_clause
           FROM pg_constraint con
           JOIN pg_class rel ON rel.oid = con.conrelid
           JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
           WHERE nsp.nspname = current_schema()
             AND rel.relname = 'event_shares'
             AND con.contype = 'c'
             AND con.conname = 'event_shares_visibility_level_check'`,
        );
        expect(checks.rows.length).toBe(1);
        expect(checks.rows[0]!.check_clause).toContain('visibility_level');

        // Verify ENUM type no longer exists in the current schema
        const enumCheck = await db.raw<{ rows: Array<{ count: string }> }>(
          `SELECT count(*)::TEXT AS count
           FROM pg_type
           JOIN pg_namespace ON pg_type.typnamespace = pg_namespace.oid
           WHERE pg_namespace.nspname = current_schema()
             AND pg_type.typname = 'event_shares_visibility_level'`,
        );
        expect(enumCheck.rows[0]!.count).toBe('0');

        // Verify existing data survived the conversion
        const shares = await db<{ visibility_level: string }>('event_shares').where({
          event_id: events[0]!.id,
        });
        expect(shares.length).toBe(1);
        expect(shares[0]!.visibility_level).toBe('details');

        // Verify the restored CHECK constraint rejects invalid values
        await expect(
          db('event_shares').insert({
            event_id: events[0]!.id,
            group_id: groups[0]!.id,
            visibility_level: 'invalid_after_rollback',
            shared_by_user_id: userId,
          }),
        ).rejects.toThrow();
      } finally {
        await cleanup();
        cleanups.pop();
      }
    },
  );
});
