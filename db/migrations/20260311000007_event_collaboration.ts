import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // event_locations – one location per event (upsert-style, unique on event_id)
  await knex.schema.createTable('event_locations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('event_id')
      .notNullable()
      .references('id')
      .inTable('events')
      .onDelete('CASCADE')
      .unique();
    table.string('location_type', 20).notNullable().checkIn(['physical', 'virtual', 'hybrid']);
    table.string('display_text', 500).nullable();
    table.text('street_address').nullable();
    table.text('address_line2').nullable();
    table.string('city', 200).nullable();
    table.string('region', 200).nullable();
    table.string('postal_code', 20).nullable();
    table.specificType('country_code', 'char(2)').nullable();
    table.decimal('latitude', 9, 6).nullable();
    table.decimal('longitude', 9, 6).nullable();
    table.text('virtual_meeting_url').nullable();
    table.string('virtual_platform', 100).nullable();
    table.string('notes', 1000).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table
      .uuid('created_by_user_id')
      .notNullable()
      .references('id')
      .inTable('user_profiles')
      .onDelete('RESTRICT');
    table
      .uuid('updated_by_user_id')
      .notNullable()
      .references('id')
      .inTable('user_profiles')
      .onDelete('RESTRICT');
  });

  // event_chat_threads – one thread per event (lazy creation on first message)
  await knex.schema.createTable('event_chat_threads', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('event_id')
      .notNullable()
      .references('id')
      .inTable('events')
      .onDelete('CASCADE')
      .unique();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // event_chat_messages – soft-deletable messages
  await knex.schema.createTable('event_chat_messages', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('thread_id')
      .notNullable()
      .references('id')
      .inTable('event_chat_threads')
      .onDelete('CASCADE');
    table
      .uuid('author_user_id')
      .notNullable()
      .references('id')
      .inTable('user_profiles')
      .onDelete('RESTRICT');
    table.text('content').notNullable();
    table.timestamp('posted_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('edited_at', { useTz: true }).nullable();
    table.timestamp('deleted_at', { useTz: true }).nullable();
    table
      .uuid('deleted_by_user_id')
      .nullable()
      .references('id')
      .inTable('user_profiles')
      .onDelete('RESTRICT');
    table.index(['thread_id', 'posted_at']);
  });

  // event_checklists – one checklist per event (lazy creation on first item)
  await knex.schema.createTable('event_checklists', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('event_id')
      .notNullable()
      .references('id')
      .inTable('events')
      .onDelete('CASCADE')
      .unique();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // event_checklist_items
  await knex.schema.createTable('event_checklist_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('checklist_id')
      .notNullable()
      .references('id')
      .inTable('event_checklists')
      .onDelete('CASCADE');
    table
      .uuid('created_by_user_id')
      .notNullable()
      .references('id')
      .inTable('user_profiles')
      .onDelete('RESTRICT');
    table.string('text', 500).notNullable();
    table.boolean('is_done').notNullable().defaultTo(false);
    table
      .uuid('assigned_to_user_id')
      .nullable()
      .references('id')
      .inTable('user_profiles')
      .onDelete('SET NULL');
    table.timestamp('due_at', { useTz: true }).nullable();
    table.integer('display_order').notNullable().defaultTo(0);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('completed_at', { useTz: true }).nullable();
    table
      .uuid('completed_by_user_id')
      .nullable()
      .references('id')
      .inTable('user_profiles')
      .onDelete('RESTRICT');
    table.index(['checklist_id', 'display_order']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('event_checklist_items');
  await knex.schema.dropTableIfExists('event_checklists');
  await knex.schema.dropTableIfExists('event_chat_messages');
  await knex.schema.dropTableIfExists('event_chat_threads');
  await knex.schema.dropTableIfExists('event_locations');
}
