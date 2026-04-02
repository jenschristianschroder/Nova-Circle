import type { Knex } from 'knex';

/**
 * Replaces ON DELETE CASCADE with ON DELETE RESTRICT on the
 * `event_shares.event_id` and `event_shares.group_id` foreign keys.
 *
 * CASCADE caused silent data loss when an event or group was deleted —
 * all associated share records would vanish without application-level
 * awareness.  RESTRICT ensures the application must explicitly revoke
 * shares (via RevokeEventShareUseCase) before an event or group can be
 * removed, preserving auditability and preventing accidental data loss.
 */
export async function up(knex: Knex): Promise<void> {
  // ── event_id FK: CASCADE → RESTRICT ────────────────────────────────────
  await knex.raw(`
    ALTER TABLE event_shares
      DROP CONSTRAINT event_shares_event_id_foreign,
      ADD CONSTRAINT event_shares_event_id_foreign
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE RESTRICT
  `);

  // ── group_id FK: CASCADE → RESTRICT ────────────────────────────────────
  await knex.raw(`
    ALTER TABLE event_shares
      DROP CONSTRAINT event_shares_group_id_foreign,
      ADD CONSTRAINT event_shares_group_id_foreign
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE RESTRICT
  `);
}

export async function down(knex: Knex): Promise<void> {
  // ── event_id FK: RESTRICT → CASCADE ────────────────────────────────────
  await knex.raw(`
    ALTER TABLE event_shares
      DROP CONSTRAINT event_shares_event_id_foreign,
      ADD CONSTRAINT event_shares_event_id_foreign
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  `);

  // ── group_id FK: RESTRICT → CASCADE ────────────────────────────────────
  await knex.raw(`
    ALTER TABLE event_shares
      DROP CONSTRAINT event_shares_group_id_foreign,
      ADD CONSTRAINT event_shares_group_id_foreign
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
  `);
}
