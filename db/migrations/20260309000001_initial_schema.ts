import type { Knex } from 'knex';

/**
 * Initial schema migration – baseline migration to verify that the migration tooling is wired up correctly.
 *
 * gen_random_uuid() has been a built-in PostgreSQL function (pg_catalog) since PostgreSQL 13 and requires
 * no extension. This project targets PostgreSQL 16 (see infra/modules/postgres.bicep), so all subsequent
 * migrations can use gen_random_uuid() as a column default without any CREATE EXTENSION prerequisite.
 */
export async function up(_knex: Knex): Promise<void> {
  // No-op: gen_random_uuid() is available as a core built-in in PostgreSQL 13+; no extension needed.
}

export async function down(_knex: Knex): Promise<void> {
  // No-op.
}
