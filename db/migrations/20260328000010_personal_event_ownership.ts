import type { Knex } from 'knex';

/**
 * Adds personal event ownership and event sharing support.
 *
 * Changes:
 * 1. Makes `events.group_id` nullable – events can now exist without a group.
 * 2. Adds `events.owner_id` (UUID FK → user_profiles.id, NOT NULL) to
 *    explicitly track event ownership. Populated from `created_by` for
 *    existing rows.
 * 3. Creates `event_shares` junction table so events can be shared to one
 *    or more groups with a configurable visibility level.
 * 4. Back-fills `event_shares` rows for every existing group-scoped event
 *    (visibility_level = 'details' preserves current behaviour).
 * 5. Adds performance indexes on the new columns/tables.
 */
export async function up(knex: Knex): Promise<void> {
  // ── 1. Add owner_id to events ──────────────────────────────────────────
  // The column is added as nullable first, back-filled from created_by,
  // then altered to NOT NULL. This is safe because the entire migration
  // runs inside a transaction, so no concurrent code can observe the
  // intermediate nullable state.
  await knex.schema.alterTable('events', (table) => {
    table.uuid('owner_id').nullable();
  });

  // Back-fill owner_id from created_by for all existing events.
  await knex('events').update({ owner_id: knex.ref('created_by') });

  // Set NOT NULL now that every row has a real value.
  await knex.schema.alterTable('events', (table) => {
    table.uuid('owner_id').notNullable().alter();
  });

  // Add the FK constraint to user_profiles.
  await knex.schema.alterTable('events', (table) => {
    table.foreign('owner_id').references('id').inTable('user_profiles').onDelete('RESTRICT');
  });

  // ── 2. Make group_id nullable ──────────────────────────────────────────
  await knex.schema.alterTable('events', (table) => {
    table.uuid('group_id').nullable().alter();
  });

  // ── 3. Create event_shares table ───────────────────────────────────────
  await knex.schema.createTable('event_shares', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('event_id').notNullable().references('id').inTable('events').onDelete('CASCADE');
    table.uuid('group_id').notNullable().references('id').inTable('groups').onDelete('CASCADE');
    table
      .string('visibility_level', 20)
      .notNullable()
      .defaultTo('title')
      .checkIn(['busy', 'title', 'details']);
    table
      .uuid('shared_by_user_id')
      .notNullable()
      .references('id')
      .inTable('user_profiles')
      .onDelete('RESTRICT');
    table.timestamp('shared_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['event_id', 'group_id']);
  });

  // ── 4. Back-fill event_shares for existing group-scoped events ─────────
  await knex('event_shares').insert(
    knex('events')
      .select({
        event_id: 'id',
        group_id: 'group_id',
        shared_by_user_id: 'created_by',
      })
      .select(knex.raw("'details' as visibility_level"))
      .whereNotNull('group_id'),
  );

  // ── 5. Add performance indexes ─────────────────────────────────────────
  await knex.schema.alterTable('events', (table) => {
    table.index('owner_id', 'idx_events_owner_id');
  });

  await knex.schema.alterTable('event_shares', (table) => {
    table.index('group_id', 'idx_event_shares_group_id');
    table.index('shared_by_user_id', 'idx_event_shares_shared_by_user_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  // ── Drop event_shares table (removes indexes and constraints) ──────────
  await knex.schema.dropTableIfExists('event_shares');

  // ── Drop owner_id index and column ─────────────────────────────────────
  await knex.schema.alterTable('events', (table) => {
    table.dropIndex('owner_id', 'idx_events_owner_id');
  });
  await knex.schema.alterTable('events', (table) => {
    table.dropColumn('owner_id');
  });

  // ── Restore group_id NOT NULL constraint ───────────────────────────────
  // Personal events (group_id IS NULL) cannot satisfy the restored NOT NULL
  // constraint, so remove them before restoring it.
  // WARNING: This deletion is intentional and irreversible. Back up personal
  // events before rolling back if recovery is needed.
  await knex('events').whereNull('group_id').delete();
  await knex.schema.alterTable('events', (table) => {
    table.uuid('group_id').notNullable().alter();
  });
}
