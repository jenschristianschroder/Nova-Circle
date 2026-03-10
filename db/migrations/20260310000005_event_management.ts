import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('group_id').notNullable().references('id').inTable('groups').onDelete('CASCADE');
    table.string('title', 200).notNullable();
    table.text('description').nullable();
    table.timestamp('start_at', { useTz: true }).notNullable();
    table.timestamp('end_at', { useTz: true }).nullable();
    table
      .uuid('created_by')
      .notNullable()
      .references('id')
      .inTable('user_profiles')
      .onDelete('RESTRICT');
    table
      .string('status', 20)
      .notNullable()
      .defaultTo('scheduled')
      .checkIn(['scheduled', 'cancelled']);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('event_invitations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('event_id').notNullable().references('id').inTable('events').onDelete('CASCADE');
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('user_profiles')
      .onDelete('CASCADE');
    table
      .string('status', 20)
      .notNullable()
      .defaultTo('invited')
      .checkIn(['invited', 'accepted', 'declined', 'tentative', 'removed']);
    table.timestamp('invited_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('responded_at', { useTz: true }).nullable();
    table.unique(['event_id', 'user_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('event_invitations');
  await knex.schema.dropTableIfExists('events');
}
