import type { Knex } from 'knex';

/**
 * Initial schema migration – creates the knex_migrations tracking table.
 * The actual domain schema will be added in subsequent migrations.
 * This migration exists to verify that the migration tooling is wired up correctly.
 */
export async function up(knex: Knex): Promise<void> {
  // Enable pgcrypto for gen_random_uuid() support.
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');
}

export async function down(_knex: Knex): Promise<void> {
  // pgcrypto is kept in place on rollback to avoid impacting other schemas.
}
