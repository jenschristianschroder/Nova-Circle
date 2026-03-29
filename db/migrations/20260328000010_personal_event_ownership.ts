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
  // ── 1. Add owner_id to events (nullable first, then back-fill) ─────────
  await knex.schema.alterTable('events', (table) => {
    table
      .uuid('owner_id')
      .nullable()
      .references('id')
      .inTable('user_profiles')
      .onDelete('RESTRICT');
  });

  // Back-fill owner_id from created_by for all existing events.
  await knex.raw('UPDATE events SET owner_id = created_by WHERE owner_id IS NULL');

  // Now enforce NOT NULL.
  await knex.raw('ALTER TABLE events ALTER COLUMN owner_id SET NOT NULL');

  // ── 2. Make group_id nullable ──────────────────────────────────────────
  await knex.raw('ALTER TABLE events ALTER COLUMN group_id DROP NOT NULL');

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
  await knex.raw(`
    INSERT INTO event_shares (event_id, group_id, visibility_level, shared_by_user_id)
    SELECT id, group_id, 'details', created_by
    FROM events
    WHERE group_id IS NOT NULL
  `);

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
  await knex('events').whereNull('group_id').delete();
  await knex.raw('ALTER TABLE events ALTER COLUMN group_id SET NOT NULL');
}
