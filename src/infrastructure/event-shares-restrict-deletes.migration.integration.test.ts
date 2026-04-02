import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import knex from 'knex';
import type { Knex } from 'knex';
import { createTestDb } from '../infrastructure/test-db.js';

const skipReason = !process.env['TEST_DATABASE_URL']
  ? 'TEST_DATABASE_URL is not set – skipping event-shares-restrict-deletes migration tests'
  : undefined;

interface IdRow {
  id: string;
}
interface FkActionRow {
  constraint_name: string;
  delete_rule: string;
}

/**
 * Creates a Knex instance backed by an ephemeral PostgreSQL schema so that
 * migration up/down tests do not interfere with other test suites.
 */
async function createIsolatedTestDb(): Promise<{
  db: Knex;
  cleanup: () => Promise<void>;
}> {
  const schemaName = `test_rd_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

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

/** Run all migrations up to and including migration 11 (visibility-level-enum). */
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
  await db.migrate.up({ name: '20260401000011_visibility_level_enum.ts' });
}

/**
 * Helper: query the FK delete rule for a specific constraint using
 * pg_constraint (schema-safe).
 */
async function getFkDeleteRule(db: Knex, constraintName: string): Promise<string | undefined> {
  const result = await db.raw<{ rows: FkActionRow[] }>(
    `SELECT con.conname  AS constraint_name,
            CASE con.confdeltype
              WHEN 'a' THEN 'NO ACTION'
              WHEN 'r' THEN 'RESTRICT'
              WHEN 'c' THEN 'CASCADE'
              WHEN 'n' THEN 'SET NULL'
              WHEN 'd' THEN 'SET DEFAULT'
            END AS delete_rule
     FROM pg_constraint con
     JOIN pg_class rel ON rel.oid = con.conrelid
     JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
     WHERE nsp.nspname = current_schema()
       AND rel.relname = 'event_shares'
       AND con.contype  = 'f'
       AND con.conname  = ?`,
    [constraintName],
  );
  return result.rows[0]?.delete_rule;
}

/**
 * Integration tests for 20260402000012_event_shares_restrict_deletes migration.
 *
 * Verifies:
 * - event_shares.event_id FK changes from CASCADE to RESTRICT after up
 * - event_shares.group_id FK changes from CASCADE to RESTRICT after up
 * - Deleting an event that has shares is blocked by RESTRICT
 * - Deleting a group that has shares is blocked by RESTRICT
 * - Down migration restores CASCADE on both FKs
 */
describe('Event shares restrict deletes migration', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterAll(async () => {
    for (const cleanup of cleanups) {
      await cleanup();
    }
  });

  // ── Up migration: FK rules change to RESTRICT ──────────────────────────

  it.skipIf(skipReason !== undefined)('event_id FK uses RESTRICT after up migration', async () => {
    const { db, cleanup } = await createIsolatedTestDb();
    cleanups.push(cleanup);
    try {
      await migrateToBaseline(db);

      // Before: should be CASCADE from migration 10
      const before = await getFkDeleteRule(db, 'event_shares_event_id_foreign');
      expect(before).toBe('CASCADE');

      await db.migrate.up({ name: '20260402000012_event_shares_restrict_deletes.ts' });

      const after = await getFkDeleteRule(db, 'event_shares_event_id_foreign');
      expect(after).toBe('RESTRICT');
    } finally {
      await cleanup();
      cleanups.pop();
    }
  });

  it.skipIf(skipReason !== undefined)('group_id FK uses RESTRICT after up migration', async () => {
    const { db, cleanup } = await createIsolatedTestDb();
    cleanups.push(cleanup);
    try {
      await migrateToBaseline(db);

      const before = await getFkDeleteRule(db, 'event_shares_group_id_foreign');
      expect(before).toBe('CASCADE');

      await db.migrate.up({ name: '20260402000012_event_shares_restrict_deletes.ts' });

      const after = await getFkDeleteRule(db, 'event_shares_group_id_foreign');
      expect(after).toBe('RESTRICT');
    } finally {
      await cleanup();
      cleanups.pop();
    }
  });

  // ── Behavioral tests: RESTRICT blocks deletion ─────────────────────────

  it.skipIf(skipReason !== undefined)(
    'deleting an event with active shares is blocked by RESTRICT',
    async () => {
      const { db, cleanup } = await createIsolatedTestDb();
      cleanups.push(cleanup);
      try {
        await migrateToBaseline(db);
        await db.migrate.up({ name: '20260402000012_event_shares_restrict_deletes.ts' });

        // Insert test data
        const userId = 'ffffffff-0000-4000-8000-000000000001';
        await db('user_profiles').insert({ id: userId, display_name: 'Restrict Test User' });

        const groups = await db<IdRow>('groups')
          .insert({ name: 'Restrict Test Group', owner_id: userId })
          .returning('id');

        const events = await db<IdRow>('events')
          .insert({
            group_id: null,
            title: 'Restrict Test Event',
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

        // Deleting the event should fail because of the RESTRICT FK
        await expect(db('events').where({ id: events[0]!.id }).delete()).rejects.toThrow();
      } finally {
        await cleanup();
        cleanups.pop();
      }
    },
  );

  it.skipIf(skipReason !== undefined)(
    'deleting a group with active shares is blocked by RESTRICT',
    async () => {
      const { db, cleanup } = await createIsolatedTestDb();
      cleanups.push(cleanup);
      try {
        await migrateToBaseline(db);
        await db.migrate.up({ name: '20260402000012_event_shares_restrict_deletes.ts' });

        // Insert test data
        const userId = 'ffffffff-0000-4000-8000-000000000002';
        await db('user_profiles').insert({ id: userId, display_name: 'Restrict Group User' });

        const groups = await db<IdRow>('groups')
          .insert({ name: 'Restrict Group Test', owner_id: userId })
          .returning('id');

        const events = await db<IdRow>('events')
          .insert({
            group_id: null,
            title: 'Restrict Group Event',
            start_at: new Date('2026-06-01T12:00:00Z'),
            created_by: userId,
            owner_id: userId,
          })
          .returning('id');

        await db('event_shares').insert({
          event_id: events[0]!.id,
          group_id: groups[0]!.id,
          visibility_level: 'title',
          shared_by_user_id: userId,
        });

        // Deleting the group should fail because of the RESTRICT FK
        await expect(db('groups').where({ id: groups[0]!.id }).delete()).rejects.toThrow();
      } finally {
        await cleanup();
        cleanups.pop();
      }
    },
  );

  it.skipIf(skipReason !== undefined)(
    'deleting an event succeeds after its shares are removed',
    async () => {
      const { db, cleanup } = await createIsolatedTestDb();
      cleanups.push(cleanup);
      try {
        await migrateToBaseline(db);
        await db.migrate.up({ name: '20260402000012_event_shares_restrict_deletes.ts' });

        const userId = 'ffffffff-0000-4000-8000-000000000003';
        await db('user_profiles').insert({ id: userId, display_name: 'Cleanup Test User' });

        const groups = await db<IdRow>('groups')
          .insert({ name: 'Cleanup Test Group', owner_id: userId })
          .returning('id');

        const events = await db<IdRow>('events')
          .insert({
            group_id: null,
            title: 'Cleanup Test Event',
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

        // Remove shares first, then delete the event — should succeed
        await db('event_shares').where({ event_id: events[0]!.id }).delete();
        await db('events').where({ id: events[0]!.id }).delete();

        const remaining = await db('events').where({ id: events[0]!.id });
        expect(remaining.length).toBe(0);
      } finally {
        await cleanup();
        cleanups.pop();
      }
    },
  );

  it.skipIf(skipReason !== undefined)(
    'deleting a group succeeds after its shares are removed',
    async () => {
      const { db, cleanup } = await createIsolatedTestDb();
      cleanups.push(cleanup);
      try {
        await migrateToBaseline(db);
        await db.migrate.up({ name: '20260402000012_event_shares_restrict_deletes.ts' });

        const userId = 'ffffffff-0000-4000-8000-000000000004';
        await db('user_profiles').insert({ id: userId, display_name: 'Cleanup Group User' });

        const groups = await db<IdRow>('groups')
          .insert({ name: 'Cleanup Group Test', owner_id: userId })
          .returning('id');

        const events = await db<IdRow>('events')
          .insert({
            group_id: null,
            title: 'Cleanup Group Event',
            start_at: new Date('2026-06-01T12:00:00Z'),
            created_by: userId,
            owner_id: userId,
          })
          .returning('id');

        await db('event_shares').insert({
          event_id: events[0]!.id,
          group_id: groups[0]!.id,
          visibility_level: 'title',
          shared_by_user_id: userId,
        });

        // Remove shares first, then delete the group — should succeed
        await db('event_shares').where({ group_id: groups[0]!.id }).delete();
        await db('groups').where({ id: groups[0]!.id }).delete();

        const remaining = await db('groups').where({ id: groups[0]!.id });
        expect(remaining.length).toBe(0);
      } finally {
        await cleanup();
        cleanups.pop();
      }
    },
  );

  // ── Down migration: restores CASCADE ───────────────────────────────────

  it.skipIf(skipReason !== undefined)('down migration restores CASCADE on both FKs', async () => {
    const { db, cleanup } = await createIsolatedTestDb();
    cleanups.push(cleanup);
    try {
      await migrateToBaseline(db);
      await db.migrate.up({ name: '20260402000012_event_shares_restrict_deletes.ts' });

      // Confirm RESTRICT is active
      expect(await getFkDeleteRule(db, 'event_shares_event_id_foreign')).toBe('RESTRICT');
      expect(await getFkDeleteRule(db, 'event_shares_group_id_foreign')).toBe('RESTRICT');

      // Roll back
      await db.migrate.rollback();

      // After rollback, both FKs should be CASCADE again
      expect(await getFkDeleteRule(db, 'event_shares_event_id_foreign')).toBe('CASCADE');
      expect(await getFkDeleteRule(db, 'event_shares_group_id_foreign')).toBe('CASCADE');
    } finally {
      await cleanup();
      cleanups.pop();
    }
  });
});
