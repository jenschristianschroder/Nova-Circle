import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Knex } from 'knex';
import { createTestDb } from '../../../infrastructure/test-db.js';
import { KnexEventChecklistRepository } from './knex-event-checklist.repository.js';
import { KnexUserProfileRepository } from '../../identity-profile/infrastructure/knex-user-profile.repository.js';
import { KnexGroupCreationService } from '../../group-management/infrastructure/knex-group-creation.service.js';
import { KnexEventCreationService } from '../../event-management/infrastructure/knex-event-creation.service.js';

const skipReason = !process.env['TEST_DATABASE_URL']
  ? 'TEST_DATABASE_URL is not set – skipping database integration tests'
  : undefined;

const CREATOR_ID = 'cccccccc-0000-4000-8000-000000000001';

describe('KnexEventChecklistRepository integration', () => {
  let db: Knex;
  let checklistRepo: KnexEventChecklistRepository;
  let eventId: string;

  beforeAll(async () => {
    if (skipReason) return;
    db = createTestDb();
    await db.migrate.latest();

    const profileRepo = new KnexUserProfileRepository(db);
    await profileRepo.upsert({ userId: CREATOR_ID, displayName: 'Checklist Creator' });

    const groupCreator = new KnexGroupCreationService(db);
    const group = await groupCreator.createGroupWithOwner({
      name: 'Checklist Repo Test Group',
      description: null,
      ownerId: CREATOR_ID,
    });

    const eventCreator = new KnexEventCreationService(db);
    const event = await eventCreator.createEventWithInvitations({
      groupId: group.id,
      title: 'Checklist Repo Test Event',
      description: null,
      startAt: new Date('2026-09-01T10:00:00Z'),
      endAt: null,
      createdBy: CREATOR_ID,
      inviteeIds: [CREATOR_ID],
    });
    eventId = event.id;

    checklistRepo = new KnexEventChecklistRepository(db);
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  it.skipIf(skipReason !== undefined)(
    'findOrCreateChecklist creates a checklist when none exists',
    async () => {
      const checklist = await checklistRepo.findOrCreateChecklist(eventId);

      expect(checklist.id).toBeTruthy();
      expect(checklist.eventId).toBe(eventId);
      expect(checklist.createdAt).toBeInstanceOf(Date);
    },
  );

  it.skipIf(skipReason !== undefined)(
    'findOrCreateChecklist returns the same row on a second call (idempotent)',
    async () => {
      const first = await checklistRepo.findOrCreateChecklist(eventId);
      const second = await checklistRepo.findOrCreateChecklist(eventId);

      expect(second.id).toBe(first.id);
      expect(second.eventId).toBe(first.eventId);
    },
  );

  it.skipIf(skipReason !== undefined)(
    'findOrCreateChecklist concurrent calls both return the same row (upsert on conflict)',
    async () => {
      // Simulate a concurrent-insert race by calling findOrCreateChecklist in
      // parallel.  Both calls must resolve to the same checklist id, confirming
      // that .onConflict().merge().returning() hands back the existing row even
      // when the INSERT hits the unique constraint.
      const [a, b] = await Promise.all([
        checklistRepo.findOrCreateChecklist(eventId),
        checklistRepo.findOrCreateChecklist(eventId),
      ]);

      expect(a.id).toBe(b.id);
      expect(a.eventId).toBe(eventId);
      expect(b.eventId).toBe(eventId);
    },
  );
});
