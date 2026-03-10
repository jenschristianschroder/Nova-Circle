import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('audit_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('action', 100).notNullable();
    table.uuid('actor_id').notNullable();
    table.string('resource_type', 100).notNullable();
    table.uuid('resource_id').notNullable();
    table.uuid('group_id').nullable();
    table.jsonb('metadata').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index('actor_id');
    table.index('resource_id');
    table.index('group_id');
    table.index('created_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_log');
}
