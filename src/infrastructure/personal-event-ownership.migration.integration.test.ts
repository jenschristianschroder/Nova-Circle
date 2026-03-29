import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import knex from 'knex';
import type { Knex } from 'knex';
import { createTestDb } from '../infrastructure/test-db.js';

const skipReason = !process.env['TEST_DATABASE_URL']
  ? 'TEST_DATABASE_URL is not set – skipping personal-event-ownership migration tests'
  : undefined;

interface IdRow {
  id: string;
}
interface EventRow {
  id: string;
  group_id: string | null;
  owner_id: string;
  created_by: string;
}
interface EventShareRow {
  id: string;
  event_id: string;
  group_id: string;
  visibility_level: string;
  shared_by_user_id: string;
}
interface NullabilityRow {
  is_nullable: string;
}
interface IndexRow {
  indexname: string;
}
interface ConstraintRow {
  constraint_name: string;
}

/**
 * Drops and recreates the `public` schema so that migrations can be applied
 * from scratch on the same test database.
 *
 * Uses IF EXISTS / IF NOT EXISTS so the helper is idempotent and robust
 * across repeated runs and crash recovery.
 */
async function resetSchema(connection: Knex): Promise<void> {
  await connection.raw('DROP SCHEMA IF EXISTS public CASCADE');
  await connection.raw('CREATE SCHEMA IF NOT EXISTS public');
}

/**
 * Creates a Knex instance backed by an ephemeral PostgreSQL schema so that
 * step-by-step and rollback tests do not clobber the `public` schema used
 * by the suite-level `db` connection. Each call creates a unique schema,
 * preventing test-order dependencies and cross-test interference.
 *
 * Returns the Knex instance and a cleanup function that drops the schema.
 */
async function createIsolatedTestDb(): Promise<{
  db: Knex;
  cleanup: () => Promise<void>;
}> {
  const schemaName = `test_step_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

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

/**
 * Integration tests for the 20260328000010_personal_event_ownership migration.
 *
 * Verifies:
 * - events.owner_id column exists and is NOT NULL
 * - events.group_id is nullable
 * - event_shares table exists with the expected columns and constraints
 * - Existing events have owner_id populated from created_by
 * - Existing group-scoped events have corresponding event_shares rows
 * - Indexes are present
 * - Down migration reverses all changes
 */
describe('Personal event ownership migration', () => {
  let db: Knex;

  beforeAll(async () => {
    if (skipReason) return;
    db = createTestDb();
    await resetSchema(db);
    await db.migrate.latest();
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  // ── Schema structure tests ──────────────────────────────────────────────

  it.skipIf(skipReason !== undefined)('events table has owner_id column', async () => {
    const hasColumn = await db.schema.hasColumn('events', 'owner_id');
    expect(hasColumn).toBe(true);
  });

  it.skipIf(skipReason !== undefined)('events.group_id is nullable', async () => {
    const result = await db.raw<{ rows: NullabilityRow[] }>(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_name = 'events' AND column_name = 'group_id'`,
    );
    expect(result.rows[0]?.is_nullable).toBe('YES');
  });

  it.skipIf(skipReason !== undefined)('events.owner_id is NOT NULL', async () => {
    const result = await db.raw<{ rows: NullabilityRow[] }>(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_name = 'events' AND column_name = 'owner_id'`,
    );
    expect(result.rows[0]?.is_nullable).toBe('NO');
  });

  it.skipIf(skipReason !== undefined)('event_shares table exists', async () => {
    const exists = await db.schema.hasTable('event_shares');
    expect(exists).toBe(true);
  });

  it.skipIf(skipReason !== undefined)(
    'event_shares table has expected columns',
    async () => {
      const columns = [
        'id',
        'event_id',
        'group_id',
        'visibility_level',
        'shared_by_user_id',
        'shared_at',
        'updated_at',
      ];
      for (const col of columns) {
        const hasCol = await db.schema.hasColumn('event_shares', col);
        expect(hasCol, `event_shares should have column '${col}'`).toBe(true);
      }
    },
  );

  it.skipIf(skipReason !== undefined)(
    'event_shares has unique constraint on (event_id, group_id)',
    async () => {
      const result = await db.raw<{ rows: ConstraintRow[] }>(
        `SELECT constraint_name FROM information_schema.table_constraints
         WHERE table_name = 'event_shares' AND constraint_type = 'UNIQUE'`,
      );
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
    },
  );

  // ── Index tests ─────────────────────────────────────────────────────────

  it.skipIf(skipReason !== undefined)('idx_events_owner_id index exists', async () => {
    const result = await db.raw<{ rows: IndexRow[] }>(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'events' AND indexname = 'idx_events_owner_id'`,
    );
    expect(result.rows.length).toBe(1);
  });

  it.skipIf(skipReason !== undefined)('idx_event_shares_group_id index exists', async () => {
    const result = await db.raw<{ rows: IndexRow[] }>(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'event_shares' AND indexname = 'idx_event_shares_group_id'`,
    );
    expect(result.rows.length).toBe(1);
  });

  it.skipIf(skipReason !== undefined)(
    'idx_event_shares_shared_by_user_id index exists',
    async () => {
      const result = await db.raw<{ rows: IndexRow[] }>(
        `SELECT indexname FROM pg_indexes
         WHERE tablename = 'event_shares' AND indexname = 'idx_event_shares_shared_by_user_id'`,
      );
      expect(result.rows.length).toBe(1);
    },
  );

  // ── Data migration tests (step-by-step migration) ───────────────────────

  it.skipIf(skipReason !== undefined)(
    'migration back-fills owner_id from created_by for existing events',
    async () => {
      // Use an isolated schema so we can control migrations step-by-step
      // without clobbering the suite-level `public` schema.
      const { db: stepDb, cleanup } = await createIsolatedTestDb();
      try {
        // Step 1: Run all migrations EXCEPT the personal-event-ownership one.
        await stepDb.migrate.up({ name: '20260309000001_initial_schema.ts' });
        await stepDb.migrate.up({ name: '20260309000002_identity_profile.ts' });
        await stepDb.migrate.up({ name: '20260309000003_group_management.ts' });
        await stepDb.migrate.up({ name: '20260309000004_group_membership.ts' });
        await stepDb.migrate.up({ name: '20260310000005_event_management.ts' });
        await stepDb.migrate.up({ name: '20260310000006_audit_security.ts' });
        await stepDb.migrate.up({ name: '20260311000007_event_collaboration.ts' });
        await stepDb.migrate.up({ name: '20260311000008_event_capture.ts' });
        await stepDb.migrate.up({ name: '20260312000009_add_production_indexes.ts' });

        // Step 2: Insert test data in the pre-migration schema (no owner_id column).
        const userId = 'cccccccc-0000-4000-8000-000000000001';
        await stepDb('user_profiles').insert({ id: userId, display_name: 'Backfill User' });

        const groups = await stepDb<IdRow>('groups')
          .insert({ name: 'Backfill Group', owner_id: userId })
          .returning('id');

        const events = await stepDb<IdRow>('events')
          .insert({
            group_id: groups[0]!.id,
            title: 'Backfill Event',
            start_at: new Date('2026-06-01T12:00:00Z'),
            created_by: userId,
          })
          .returning('id');

        // Step 3: Run the personal-event-ownership migration.
        await stepDb.migrate.up({ name: '20260328000010_personal_event_ownership.ts' });

        // Step 4: Verify owner_id was back-filled from created_by.
        const rows = await stepDb<EventRow>('events')
          .where({ id: events[0]!.id })
          .select('owner_id', 'created_by');

        expect(rows[0]!.owner_id).toBe(userId);
        expect(rows[0]!.owner_id).toBe(rows[0]!.created_by);
      } finally {
        await cleanup();
      }
    },
  );

  it.skipIf(skipReason !== undefined)(
    'migration back-fills event_shares for existing group-scoped events',
    async () => {
      // Use an isolated schema so we can control migrations step-by-step
      // without clobbering the suite-level `public` schema.
      const { db: stepDb, cleanup } = await createIsolatedTestDb();
      try {
        // Step 1: Run all migrations EXCEPT the personal-event-ownership one.
        await stepDb.migrate.up({ name: '20260309000001_initial_schema.ts' });
        await stepDb.migrate.up({ name: '20260309000002_identity_profile.ts' });
        await stepDb.migrate.up({ name: '20260309000003_group_management.ts' });
        await stepDb.migrate.up({ name: '20260309000004_group_membership.ts' });
        await stepDb.migrate.up({ name: '20260310000005_event_management.ts' });
        await stepDb.migrate.up({ name: '20260310000006_audit_security.ts' });
        await stepDb.migrate.up({ name: '20260311000007_event_collaboration.ts' });
        await stepDb.migrate.up({ name: '20260311000008_event_capture.ts' });
        await stepDb.migrate.up({ name: '20260312000009_add_production_indexes.ts' });

        // Step 2: Insert test data in the pre-migration schema.
        const userId = 'cccccccc-0000-4000-8000-000000000002';
        await stepDb('user_profiles').insert({ id: userId, display_name: 'Shares Backfill User' });

        const groups = await stepDb<IdRow>('groups')
          .insert({ name: 'Shares Backfill Group', owner_id: userId })
          .returning('id');

        const events = await stepDb<IdRow>('events')
          .insert({
            group_id: groups[0]!.id,
            title: 'Shares Backfill Event',
            start_at: new Date('2026-06-01T12:00:00Z'),
            created_by: userId,
          })
          .returning('id');

        // Step 3: Run the personal-event-ownership migration.
        await stepDb.migrate.up({ name: '20260328000010_personal_event_ownership.ts' });

        // Step 4: Verify event_shares row was created by the migration.
        const shares = await stepDb<EventShareRow>('event_shares').where({
          event_id: events[0]!.id,
        });

        expect(shares.length).toBe(1);
        expect(shares[0]!.group_id).toBe(groups[0]!.id);
        expect(shares[0]!.visibility_level).toBe('details');
        expect(shares[0]!.shared_by_user_id).toBe(userId);
      } finally {
        await cleanup();
      }
    },
  );

  it.skipIf(skipReason !== undefined)(
    'visibility_level check constraint allows only valid values',
    async () => {
      const userId = 'bbbbbbbb-0000-4000-8000-000000000003';
      await db('user_profiles')
        .insert({ id: userId, display_name: 'Check Test User' })
        .onConflict('id')
        .ignore();

      const groups = await db<IdRow>('groups')
        .insert({ name: 'Check Test Group', owner_id: userId })
        .returning('id');

      const events = await db<IdRow>('events')
        .insert({
          group_id: groups[0]!.id,
          title: 'Check Test Event',
          start_at: new Date('2026-06-01T12:00:00Z'),
          created_by: userId,
          owner_id: userId,
        })
        .returning('id');

      // Valid values should work.
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

      // Invalid value should fail.
      await expect(
        db('event_shares').insert({
          event_id: events[0]!.id,
          group_id: groups[0]!.id,
          visibility_level: 'invalid_value',
          shared_by_user_id: userId,
        }),
      ).rejects.toThrow();
    },
  );

  it.skipIf(skipReason !== undefined)(
    'personal event can be created without a group_id',
    async () => {
      const userId = 'bbbbbbbb-0000-4000-8000-000000000004';
      await db('user_profiles')
        .insert({ id: userId, display_name: 'Personal Event User' })
        .onConflict('id')
        .ignore();

      const events = await db<EventRow>('events')
        .insert({
          group_id: null,
          title: 'Personal Event',
          start_at: new Date('2026-06-01T12:00:00Z'),
          created_by: userId,
          owner_id: userId,
        })
        .returning(['id', 'group_id', 'owner_id']);

      expect(events[0]!.group_id).toBeNull();
      expect(events[0]!.owner_id).toBe(userId);
    },
  );

  it.skipIf(skipReason !== undefined)(
    'unique constraint on event_shares(event_id, group_id) prevents duplicates',
    async () => {
      const userId = 'bbbbbbbb-0000-4000-8000-000000000005';
      await db('user_profiles')
        .insert({ id: userId, display_name: 'Unique Test User' })
        .onConflict('id')
        .ignore();

      const groups = await db<IdRow>('groups')
        .insert({ name: 'Unique Test Group', owner_id: userId })
        .returning('id');

      const events = await db<IdRow>('events')
        .insert({
          group_id: groups[0]!.id,
          title: 'Unique Test Event',
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

      // Duplicate insert should fail.
      await expect(
        db('event_shares').insert({
          event_id: events[0]!.id,
          group_id: groups[0]!.id,
          visibility_level: 'title',
          shared_by_user_id: userId,
        }),
      ).rejects.toThrow();
    },
  );

  // ── Down migration test ─────────────────────────────────────────────────

  it.skipIf(skipReason !== undefined)(
    'down migration reverses all changes and deletes personal events',
    async () => {
      // Use an isolated schema so this destructive test does not affect `public`.
      const { db: rollbackDb, cleanup } = await createIsolatedTestDb();
      try {
        // Apply migrations one-by-one to put each in its own batch.
        // This lets rollback() undo only the personal-event-ownership migration.
        await rollbackDb.migrate.up({ name: '20260309000001_initial_schema.ts' });
        await rollbackDb.migrate.up({ name: '20260309000002_identity_profile.ts' });
        await rollbackDb.migrate.up({ name: '20260309000003_group_management.ts' });
        await rollbackDb.migrate.up({ name: '20260309000004_group_membership.ts' });
        await rollbackDb.migrate.up({ name: '20260310000005_event_management.ts' });
        await rollbackDb.migrate.up({ name: '20260310000006_audit_security.ts' });
        await rollbackDb.migrate.up({ name: '20260311000007_event_collaboration.ts' });
        await rollbackDb.migrate.up({ name: '20260311000008_event_capture.ts' });
        await rollbackDb.migrate.up({ name: '20260312000009_add_production_indexes.ts' });
        await rollbackDb.migrate.up({ name: '20260328000010_personal_event_ownership.ts' });

        // Verify the schema exists before rollback.
        expect(await rollbackDb.schema.hasTable('event_shares')).toBe(true);
        expect(await rollbackDb.schema.hasColumn('events', 'owner_id')).toBe(true);

        // Insert a personal event (group_id IS NULL) to exercise the down
        // migration's delete-before-NOT-NULL-restore behaviour.
        const userId = 'dddddddd-0000-4000-8000-000000000001';
        await rollbackDb('user_profiles').insert({
          id: userId,
          display_name: 'Rollback User',
        });
        const personalEvents = await rollbackDb<IdRow>('events')
          .insert({
            group_id: null,
            title: 'Personal Event To Delete',
            start_at: new Date('2026-07-01T12:00:00Z'),
            created_by: userId,
            owner_id: userId,
          })
          .returning('id');

        // Roll back the last migration only.
        await rollbackDb.migrate.rollback();

        // event_shares table should be gone.
        expect(await rollbackDb.schema.hasTable('event_shares')).toBe(false);

        // owner_id column should be gone.
        expect(await rollbackDb.schema.hasColumn('events', 'owner_id')).toBe(false);

        // group_id should be NOT NULL again.
        const result = await rollbackDb.raw<{ rows: NullabilityRow[] }>(
          `SELECT is_nullable FROM information_schema.columns
           WHERE table_schema = current_schema()
             AND table_name = 'events' AND column_name = 'group_id'`,
        );
        expect(result.rows[0]?.is_nullable).toBe('NO');

        // Personal event should have been deleted by the down migration.
        const remaining = await rollbackDb('events').where({
          id: personalEvents[0]!.id,
        });
        expect(remaining.length).toBe(0);
      } finally {
        await cleanup();
      }
    },
  );
});
