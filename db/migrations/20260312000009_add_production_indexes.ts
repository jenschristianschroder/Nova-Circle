import type { Knex } from 'knex';

/**
 * Adds indexes for columns that are frequently used in WHERE, JOIN, and
 * ORDER BY clauses but lack dedicated indexes. These are critical for
 * production performance as the data set grows.
 */
export async function up(knex: Knex): Promise<void> {
  // ── events ───────────────────────────────────────────────────────────────
  // listByGroupForUser filters by events.group_id.
  await knex.schema.alterTable('events', (table) => {
    table.index('group_id', 'idx_events_group_id');
    table.index('created_by_user_id', 'idx_events_created_by_user_id');
  });

  // ── event_invitations ────────────────────────────────────────────────────
  // Permission checks query by (event_id, user_id) — covered by the existing
  // UNIQUE constraint. Add a separate user_id index for queries that look up
  // all invitations for a user across events.
  await knex.schema.alterTable('event_invitations', (table) => {
    table.index('user_id', 'idx_event_invitations_user_id');
  });

  // ── group_members ────────────────────────────────────────────────────────
  // Membership lookups by user (e.g. "which groups does this user belong
  // to?"). The existing UNIQUE(group_id, user_id) covers group-first lookups.
  await knex.schema.alterTable('group_members', (table) => {
    table.index('user_id', 'idx_group_members_user_id');
  });

  // ── event_chat_messages ──────────────────────────────────────────────────
  // Soft-delete filtering for active messages.
  await knex.schema.alterTable('event_chat_messages', (table) => {
    table.index('author_id', 'idx_event_chat_messages_author_id');
  });

  // ── event_checklist_items ────────────────────────────────────────────────
  // Lookup by assignee across events.
  await knex.schema.alterTable('event_checklist_items', (table) => {
    table.index('assigned_to_user_id', 'idx_event_checklist_items_assigned_to');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('event_checklist_items', (table) => {
    table.dropIndex([], 'idx_event_checklist_items_assigned_to');
  });
  await knex.schema.alterTable('event_chat_messages', (table) => {
    table.dropIndex([], 'idx_event_chat_messages_author_id');
  });
  await knex.schema.alterTable('group_members', (table) => {
    table.dropIndex([], 'idx_group_members_user_id');
  });
  await knex.schema.alterTable('event_invitations', (table) => {
    table.dropIndex([], 'idx_event_invitations_user_id');
  });
  await knex.schema.alterTable('events', (table) => {
    table.dropIndex([], 'idx_events_created_by_user_id');
    table.dropIndex([], 'idx_events_group_id');
  });
}
