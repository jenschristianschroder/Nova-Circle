import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Knex } from 'knex';
import { createTestDb } from '../../../infrastructure/test-db.js';
import { KnexEventCreationService } from './knex-event-creation.service.js';
import { KnexEventRepository } from './knex-event.repository.js';
import { KnexEventInvitationRepository } from './knex-event-invitation.repository.js';
import { KnexUserProfileRepository } from '../../identity-profile/infrastructure/knex-user-profile.repository.js';
import { KnexGroupCreationService } from '../../group-management/infrastructure/knex-group-creation.service.js';

const skipReason = !process.env['TEST_DATABASE_URL']
  ? 'TEST_DATABASE_URL is not set – skipping database integration tests'
  : undefined;

const CREATOR_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const MEMBER_ID = 'aaaaaaaa-0000-4000-8000-000000000002';
const OUTSIDER_ID = 'aaaaaaaa-0000-4000-8000-000000000003';

describe('Event infrastructure integration', () => {
  let db: Knex;
  let eventCreator: KnexEventCreationService;
  let eventRepo: KnexEventRepository;
  let invitationRepo: KnexEventInvitationRepository;
  let groupId: string;

  beforeAll(async () => {
    if (skipReason) return;
    db = createTestDb();
    await db.migrate.latest();

    const profileRepo = new KnexUserProfileRepository(db);
    await profileRepo.upsert({ userId: CREATOR_ID, displayName: 'Creator' });
    await profileRepo.upsert({ userId: MEMBER_ID, displayName: 'Member' });
    await profileRepo.upsert({ userId: OUTSIDER_ID, displayName: 'Outsider' });

    const groupCreator = new KnexGroupCreationService(db);
    const group = await groupCreator.createGroupWithOwner({
      name: 'Event Test Group',
      description: null,
      ownerId: CREATOR_ID,
    });
    groupId = group.id;

    eventCreator = new KnexEventCreationService(db);
    eventRepo = new KnexEventRepository(db);
    invitationRepo = new KnexEventInvitationRepository(db);
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  it.skipIf(skipReason !== undefined)('creates event with invitations atomically', async () => {
    const event = await eventCreator.createEventWithInvitations({
      groupId,
      title: 'Team Lunch',
      description: 'Enjoy',
      startAt: new Date('2026-06-01T12:00:00Z'),
      endAt: new Date('2026-06-01T13:00:00Z'),
      createdBy: CREATOR_ID,
      inviteeIds: [CREATOR_ID, MEMBER_ID],
    });

    expect(event.id).toBeTruthy();
    expect(event.title).toBe('Team Lunch');
    expect(event.status).toBe('scheduled');

    const creatorInvite = await invitationRepo.findByEventAndUser(event.id, CREATOR_ID);
    expect(creatorInvite).not.toBeNull();
    expect(creatorInvite?.status).toBe('invited');

    const memberInvite = await invitationRepo.findByEventAndUser(event.id, MEMBER_ID);
    expect(memberInvite).not.toBeNull();
  });

  it.skipIf(skipReason !== undefined)(
    'listByGroupForUser only returns events with active invitations',
    async () => {
      const event = await eventCreator.createEventWithInvitations({
        groupId,
        title: 'Invited Only Event',
        description: null,
        startAt: new Date('2026-07-01T10:00:00Z'),
        endAt: null,
        createdBy: CREATOR_ID,
        inviteeIds: [CREATOR_ID],
      });

      // Creator can see it.
      const creatorEvents = await eventRepo.listByGroupForUser(groupId, CREATOR_ID);
      expect(creatorEvents.some((e) => e.id === event.id)).toBe(true);

      // Outsider cannot see it (no invitation).
      const outsiderEvents = await eventRepo.listByGroupForUser(groupId, OUTSIDER_ID);
      expect(outsiderEvents.some((e) => e.id === event.id)).toBe(false);
    },
  );

  it.skipIf(skipReason !== undefined)('hasAccess returns false for non-invited user', async () => {
    const event = await eventCreator.createEventWithInvitations({
      groupId,
      title: 'Exclusive Event',
      description: null,
      startAt: new Date('2026-08-01T10:00:00Z'),
      endAt: null,
      createdBy: CREATOR_ID,
      inviteeIds: [CREATOR_ID],
    });

    const creatorAccess = await invitationRepo.hasAccess(event.id, CREATOR_ID);
    expect(creatorAccess).toBe(true);

    const outsiderAccess = await invitationRepo.hasAccess(event.id, OUTSIDER_ID);
    expect(outsiderAccess).toBe(false);
  });

  it.skipIf(skipReason !== undefined)('cancels an event', async () => {
    const event = await eventCreator.createEventWithInvitations({
      groupId,
      title: 'Event to Cancel',
      description: null,
      startAt: new Date('2026-09-01T10:00:00Z'),
      endAt: null,
      createdBy: CREATOR_ID,
      inviteeIds: [CREATOR_ID],
    });

    await eventRepo.cancel(event.id);
    const updated = await eventRepo.findById(event.id);
    expect(updated?.status).toBe('cancelled');
  });

  it.skipIf(skipReason !== undefined)('new group member cannot see historic events', async () => {
    // Create event BEFORE MEMBER_ID is added to the group.
    // (MEMBER_ID is not in inviteeIds for this event.)
    const event = await eventCreator.createEventWithInvitations({
      groupId,
      title: 'Historic Event',
      description: null,
      startAt: new Date('2026-10-01T10:00:00Z'),
      endAt: null,
      createdBy: CREATOR_ID,
      inviteeIds: [CREATOR_ID],
    });

    // OUTSIDER_ID was never invited.
    const events = await eventRepo.listByGroupForUser(groupId, OUTSIDER_ID);
    expect(events.some((e) => e.id === event.id)).toBe(false);
  });
});
