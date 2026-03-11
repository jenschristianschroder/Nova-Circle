import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('event_drafts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('created_by_user_id')
      .notNullable()
      .references('id')
      .inTable('user_profiles')
      .onDelete('RESTRICT');
    // groupId may be null if no group could be identified from the input.
    table.uuid('group_id').nullable().references('id').inTable('groups').onDelete('SET NULL');
    table
      .string('raw_input_type', 20)
      .notNullable()
      .checkIn(['text', 'voice', 'image']);
    table.text('raw_text_content').nullable();
    table.text('audio_blob_reference').nullable();
    table.text('image_blob_reference').nullable();
    table.string('candidate_title', 500).nullable();
    table.text('candidate_description').nullable();
    table.timestamp('candidate_start_at', { useTz: true }).nullable();
    table.timestamp('candidate_end_at', { useTz: true }).nullable();
    // issues is stored as a JSONB array of DraftIssue objects.
    table.jsonb('issues').notNullable().defaultTo('[]');
    table
      .string('status', 20)
      .notNullable()
      .checkIn(['pending_review', 'promoted', 'abandoned'])
      .defaultTo('pending_review');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['created_by_user_id', 'status']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('event_drafts');
}
