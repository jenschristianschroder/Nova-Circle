import type { Knex } from 'knex';

/**
 * Initial schema migration – baseline migration to verify that the migration tooling is wired up correctly.
 * gen_random_uuid() is available natively in PostgreSQL 13+ without any extension.
 */
export async function up(_knex: Knex): Promise<void> {
  // No-op: gen_random_uuid() is built-in from PostgreSQL 13+.
  // Azure Database for PostgreSQL does not allow user-created extensions like pgcrypto.
}

export async function down(_knex: Knex): Promise<void> {
  // No-op.
}
