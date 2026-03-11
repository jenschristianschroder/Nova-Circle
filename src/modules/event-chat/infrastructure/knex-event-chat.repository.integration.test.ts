import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Knex } from 'knex';
import { createTestDb } from '../../../infrastructure/test-db.js';
import { KnexEventChatRepository } from './knex-event-chat.repository.js';
import { KnexUserProfileRepository } from '../../identity-profile/infrastructure/knex-user-profile.repository.js';
import { KnexGroupCreationService } from '../../group-management/infrastructure/knex-group-creation.service.js';
import { KnexEventCreationService } from '../../event-management/infrastructure/knex-event-creation.service.js';

const skipReason = !process.env['TEST_DATABASE_URL']
  ? 'TEST_DATABASE_URL is not set – skipping database integration tests'
  : undefined;

const AUTHOR_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const OTHER_ID = 'bbbbbbbb-0000-4000-8000-000000000002';

describe('KnexEventChatRepository integration', () => {
  let db: Knex;
  let chatRepo: KnexEventChatRepository;
  let eventId: string;

  beforeAll(async () => {
    if (skipReason) return;
    db = createTestDb();
    await db.migrate.latest();

    const profileRepo = new KnexUserProfileRepository(db);
    await profileRepo.upsert({ userId: AUTHOR_ID, displayName: 'Author' });
    await profileRepo.upsert({ userId: OTHER_ID, displayName: 'Other' });

    const groupCreator = new KnexGroupCreationService(db);
    const group = await groupCreator.createGroupWithOwner({
      name: 'Chat Repo Test Group',
      description: null,
      ownerId: AUTHOR_ID,
    });

    const eventCreator = new KnexEventCreationService(db);
    const event = await eventCreator.createEventWithInvitations({
      groupId: group.id,
      title: 'Chat Repo Test Event',
      description: null,
      startAt: new Date('2026-08-01T10:00:00Z'),
      endAt: null,
      createdBy: AUTHOR_ID,
      inviteeIds: [AUTHOR_ID, OTHER_ID],
    });
    eventId = event.id;

    chatRepo = new KnexEventChatRepository(db);
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  it.skipIf(skipReason !== undefined)(
    'listMessages includes soft-deleted messages with their metadata',
    async () => {
      const thread = await chatRepo.findOrCreateThread(eventId);

      const active = await chatRepo.postMessage(thread.id, 'Active message', AUTHOR_ID);
      const toDelete = await chatRepo.postMessage(thread.id, 'Will be deleted', AUTHOR_ID);

      // Soft-delete one message.
      await chatRepo.softDeleteMessage(toDelete.id, AUTHOR_ID);

      const messages = await chatRepo.listMessages(thread.id);

      const activeMsg = messages.find((m) => m.id === active.id);
      const deletedMsg = messages.find((m) => m.id === toDelete.id);

      // Both messages must be returned.
      expect(activeMsg).toBeDefined();
      expect(deletedMsg).toBeDefined();

      // Active message has original content.
      expect(activeMsg?.content).toBe('Active message');
      expect(activeMsg?.deletedAt).toBeNull();

      // Deleted message still has original content in the DB row (masking is at the API layer).
      expect(deletedMsg?.content).toBe('Will be deleted');
      expect(deletedMsg?.deletedAt).not.toBeNull();
      expect(deletedMsg?.deletedByUserId).toBe(AUTHOR_ID);
    },
  );

  it.skipIf(skipReason !== undefined)(
    'listMessages returns messages in ascending posted_at order',
    async () => {
      const thread = await chatRepo.findOrCreateThread(eventId);

      await chatRepo.postMessage(thread.id, 'First', AUTHOR_ID);
      await chatRepo.postMessage(thread.id, 'Second', AUTHOR_ID);
      await chatRepo.postMessage(thread.id, 'Third', AUTHOR_ID);

      const messages = await chatRepo.listMessages(thread.id);
      const contents = messages.map((m) => m.content);

      // Messages seeded earlier in this suite may also appear; just verify ordering.
      const seededIndices = ['First', 'Second', 'Third'].map((c) => contents.indexOf(c));
      expect(seededIndices[0]).toBeLessThan(seededIndices[1]!);
      expect(seededIndices[1]).toBeLessThan(seededIndices[2]!);
    },
  );
});
