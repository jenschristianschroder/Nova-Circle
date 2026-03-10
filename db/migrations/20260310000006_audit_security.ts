import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('audit_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.timestamp('occurred_at', { useTz: true }).notNullable();
    // actor_id stores the user ID performing the action – never display names or emails.
    table.string('actor_id', 255).notNullable();
    // action is a dot-separated string such as 'event.created' or 'member.removed'.
    table.string('action', 100).notNullable();
    // resource_type and resource_id identify the primary affected entity.
    table.string('resource_type', 50).notNullable();
    table.string('resource_id', 255).notNullable();
    // group_id provides context when the operation is scoped to a group.
    table.string('group_id', 255).nullable();
    // metadata is safe additional context – must never contain sensitive user data.
    table.jsonb('metadata').nullable();

    table.index(['actor_id'], 'audit_log_actor_id_idx');
    table.index(['resource_type', 'resource_id'], 'audit_log_resource_idx');
    table.index(['group_id'], 'audit_log_group_id_idx');
    table.index(['occurred_at'], 'audit_log_occurred_at_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_log');
}
