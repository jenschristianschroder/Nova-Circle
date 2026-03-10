import type { Knex } from 'knex';

// This migration is superseded by 20260310000006_audit_security.ts which
// creates the audit_log table with the canonical schema (occurred_at, metadata).
// This file is retained as a no-op so that the migration history remains
// consistent across environments that ran an earlier version of the branch.
export async function up(_knex: Knex): Promise<void> {}

export async function down(_knex: Knex): Promise<void> {}
