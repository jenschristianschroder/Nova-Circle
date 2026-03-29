import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Knex } from 'knex';
import { createTestDb } from '../../../infrastructure/test-db.js';
import { KnexSharedEventQuery } from './knex-shared-event-query.js';
import { KnexEventCreationService } from './knex-event-creation.service.js';
import { KnexUserProfileRepository } from '../../identity-profile/infrastructure/knex-user-profile.repository.js';
import { KnexGroupCreationService } from '../../group-management/infrastructure/knex-group-creation.service.js';
import { KnexEventShareRepository } from '../../event-sharing/infrastructure/knex-event-share.repository.js';

const skipReason = !process.env['TEST_DATABASE_URL']
  ? 'TEST_DATABASE_URL is not set – skipping database integration tests'
  : undefined;

// Deterministic UUIDs for test actors.
const OWNER_ID = 'eeeeeeee-0000-4000-8000-000000000001';
const MEMBER_ID = 'eeeeeeee-0000-4000-8000-000000000002';
const OUTSIDER_ID = 'eeeeeeee-0000-4000-8000-000000000003';

describe('KnexSharedEventQuery integration', () => {
  let db: Knex;
  let query: KnexSharedEventQuery;
  let groupId: string;
  let otherGroupId: string;

  // IDs populated during setup.
  let sharedPersonalBusyEventId: string;
  let sharedPersonalTitleEventId: string;
  let sharedPersonalDetailsEventId: string;
  let legacyGroupEventId: string;
  let legacyRemovedInvitationEventId: string;
  let unsharedPersonalEventId: string;

  beforeAll(async () => {
    if (skipReason) return;
    db = createTestDb();
    await db.migrate.latest();

    const profileRepo = new KnexUserProfileRepository(db);
    await profileRepo.upsert({ userId: OWNER_ID, displayName: 'Event Owner' });
    await profileRepo.upsert({ userId: MEMBER_ID, displayName: 'Group Member' });
    await profileRepo.upsert({ userId: OUTSIDER_ID, displayName: 'Outsider' });

    const groupCreator = new KnexGroupCreationService(db);
    const group = await groupCreator.createGroupWithOwner({
      name: 'Shared Event Query Test Group',
      description: null,
      ownerId: OWNER_ID,
    });
    groupId = group.id;

    const otherGroup = await groupCreator.createGroupWithOwner({
      name: 'Other Group',
      description: null,
      ownerId: OWNER_ID,
    });
    otherGroupId = otherGroup.id;

    // Add MEMBER_ID to the group so they have an invitation for legacy events.
    await db('group_members').insert({
      group_id: groupId,
      user_id: MEMBER_ID,
      role: 'member',
      joined_at: new Date(),
    });

    const eventCreator = new KnexEventCreationService(db);
    const shareRepo = new KnexEventShareRepository(db);

    // ── Source 1: personal events shared to the group via event_shares ──

    // Personal event shared with 'busy' visibility.
    const busyEvent = await eventCreator.createEventWithInvitations({
      groupId: null,
      title: 'Busy Meeting',
      description: 'Private details',
      startAt: new Date('2026-07-01T09:00:00Z'),
      endAt: new Date('2026-07-01T10:00:00Z'),
      createdBy: OWNER_ID,
      inviteeIds: [OWNER_ID],
    });
    sharedPersonalBusyEventId = busyEvent.id;
    await shareRepo.create({
      eventId: busyEvent.id,
      groupId,
      visibilityLevel: 'busy',
      sharedByUserId: OWNER_ID,
    });

    // Personal event shared with 'title' visibility.
    const titleEvent = await eventCreator.createEventWithInvitations({
      groupId: null,
      title: 'Title-Only Event',
      description: 'Should not be visible',
      startAt: new Date('2026-07-02T09:00:00Z'),
      endAt: new Date('2026-07-02T10:00:00Z'),
      createdBy: OWNER_ID,
      inviteeIds: [OWNER_ID],
    });
    sharedPersonalTitleEventId = titleEvent.id;
    await shareRepo.create({
      eventId: titleEvent.id,
      groupId,
      visibilityLevel: 'title',
      sharedByUserId: OWNER_ID,
    });

    // Personal event shared with 'details' visibility.
    const detailsEvent = await eventCreator.createEventWithInvitations({
      groupId: null,
      title: 'Details Event',
      description: 'Full description available',
      startAt: new Date('2026-07-03T09:00:00Z'),
      endAt: new Date('2026-07-03T10:00:00Z'),
      createdBy: OWNER_ID,
      inviteeIds: [OWNER_ID],
    });
    sharedPersonalDetailsEventId = detailsEvent.id;
    await shareRepo.create({
      eventId: detailsEvent.id,
      groupId,
      visibilityLevel: 'details',
      sharedByUserId: OWNER_ID,
    });

    // ── Source 2: legacy group-scoped events with active invitations ──

    // Legacy event with active invitation for MEMBER_ID.
    const legacyEvent = await eventCreator.createEventWithInvitations({
      groupId,
      title: 'Legacy Group Event',
      description: 'Created the old way',
      startAt: new Date('2026-07-04T09:00:00Z'),
      endAt: new Date('2026-07-04T10:00:00Z'),
      createdBy: OWNER_ID,
      inviteeIds: [OWNER_ID, MEMBER_ID],
    });
    legacyGroupEventId = legacyEvent.id;

    // Legacy event where MEMBER_ID has a removed invitation.
    const removedEvent = await eventCreator.createEventWithInvitations({
      groupId,
      title: 'Removed Invitation Event',
      description: 'Member was removed',
      startAt: new Date('2026-07-05T09:00:00Z'),
      endAt: new Date('2026-07-05T10:00:00Z'),
      createdBy: OWNER_ID,
      inviteeIds: [OWNER_ID, MEMBER_ID],
    });
    legacyRemovedInvitationEventId = removedEvent.id;
    // Mark MEMBER_ID's invitation as removed.
    await db('event_invitations')
      .where({ event_id: removedEvent.id, user_id: MEMBER_ID })
      .update({ status: 'removed' });

    // ── Unshared personal event — must never appear ──
    const unsharedEvent = await eventCreator.createEventWithInvitations({
      groupId: null,
      title: 'Unshared Personal Event',
      description: 'Completely private',
      startAt: new Date('2026-07-06T09:00:00Z'),
      endAt: null,
      createdBy: OWNER_ID,
      inviteeIds: [OWNER_ID],
    });
    unsharedPersonalEventId = unsharedEvent.id;

    query = new KnexSharedEventQuery(db);
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  // ── listByGroup: basic retrieval ──────────────────────────────────────

  it.skipIf(skipReason !== undefined)(
    'returns personal events shared via event_shares (Source 1)',
    async () => {
      const { events } = await query.listByGroup(groupId, MEMBER_ID);
      const ids = events.map((e) => e.eventId);
      expect(ids).toContain(sharedPersonalBusyEventId);
      expect(ids).toContain(sharedPersonalTitleEventId);
      expect(ids).toContain(sharedPersonalDetailsEventId);
    },
  );

  it.skipIf(skipReason !== undefined)(
    'returns legacy group-scoped events with active invitations (Source 2)',
    async () => {
      const { events } = await query.listByGroup(groupId, MEMBER_ID);
      const ids = events.map((e) => e.eventId);
      expect(ids).toContain(legacyGroupEventId);
    },
  );

  it.skipIf(skipReason !== undefined)(
    'combines both sources without duplicates (UNION ALL deduplication)',
    async () => {
      const { events, total } = await query.listByGroup(groupId, MEMBER_ID);
      const ids = events.map((e) => e.eventId);

      // Should contain 3 shared + 1 legacy = 4 events.
      expect(ids).toContain(sharedPersonalBusyEventId);
      expect(ids).toContain(sharedPersonalTitleEventId);
      expect(ids).toContain(sharedPersonalDetailsEventId);
      expect(ids).toContain(legacyGroupEventId);

      // Should NOT include removed invitation event or unshared event.
      expect(ids).not.toContain(legacyRemovedInvitationEventId);
      expect(ids).not.toContain(unsharedPersonalEventId);

      expect(total).toBe(4);
    },
  );

  // ── listByGroup: visibility levels ────────────────────────────────────

  it.skipIf(skipReason !== undefined)(
    'shared events carry their configured visibility level',
    async () => {
      const { events } = await query.listByGroup(groupId, MEMBER_ID);

      const busy = events.find((e) => e.eventId === sharedPersonalBusyEventId);
      expect(busy?.visibilityLevel).toBe('busy');

      const title = events.find((e) => e.eventId === sharedPersonalTitleEventId);
      expect(title?.visibilityLevel).toBe('title');

      const details = events.find((e) => e.eventId === sharedPersonalDetailsEventId);
      expect(details?.visibilityLevel).toBe('details');
    },
  );

  it.skipIf(skipReason !== undefined)(
    'legacy group-scoped events default to details visibility',
    async () => {
      const { events } = await query.listByGroup(groupId, MEMBER_ID);
      const legacy = events.find((e) => e.eventId === legacyGroupEventId);
      expect(legacy?.visibilityLevel).toBe('details');
    },
  );

  // ── listByGroup: access control edge cases ────────────────────────────

  it.skipIf(skipReason !== undefined)(
    'removed invitations do not grant access to legacy events',
    async () => {
      const { events } = await query.listByGroup(groupId, MEMBER_ID);
      const ids = events.map((e) => e.eventId);
      expect(ids).not.toContain(legacyRemovedInvitationEventId);
    },
  );

  it.skipIf(skipReason !== undefined)(
    'personal unshared events never appear in group listings',
    async () => {
      const { events } = await query.listByGroup(groupId, MEMBER_ID);
      const ids = events.map((e) => e.eventId);
      expect(ids).not.toContain(unsharedPersonalEventId);
    },
  );

  it.skipIf(skipReason !== undefined)(
    'events from another group do not appear',
    async () => {
      const { events, total } = await query.listByGroup(otherGroupId, MEMBER_ID);
      const ids = events.map((e) => e.eventId);
      expect(ids).not.toContain(sharedPersonalBusyEventId);
      expect(ids).not.toContain(legacyGroupEventId);
      expect(total).toBe(0);
    },
  );

  // ── listByGroup: ordering ─────────────────────────────────────────────

  it.skipIf(skipReason !== undefined)('results are ordered by start_at ascending', async () => {
    const { events } = await query.listByGroup(groupId, MEMBER_ID);
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.startAt.getTime()).toBeGreaterThanOrEqual(
        events[i - 1]!.startAt.getTime(),
      );
    }
  });

  // ── listByGroup: date range filtering ─────────────────────────────────

  it.skipIf(skipReason !== undefined)(
    'date range from filter excludes events before the range',
    async () => {
      const { events } = await query.listByGroup(groupId, MEMBER_ID, {
        from: new Date('2026-07-03T00:00:00Z'),
      });
      const ids = events.map((e) => e.eventId);
      // Only details event (July 3) and legacy event (July 4) should be returned.
      expect(ids).not.toContain(sharedPersonalBusyEventId); // July 1
      expect(ids).not.toContain(sharedPersonalTitleEventId); // July 2
      expect(ids).toContain(sharedPersonalDetailsEventId); // July 3
      expect(ids).toContain(legacyGroupEventId); // July 4
    },
  );

  it.skipIf(skipReason !== undefined)(
    'date range to filter excludes events after the range',
    async () => {
      const { events } = await query.listByGroup(groupId, MEMBER_ID, {
        to: new Date('2026-07-02T09:00:00Z'),
      });
      const ids = events.map((e) => e.eventId);
      // Only busy event (July 1) and title event (July 2) should be returned.
      expect(ids).toContain(sharedPersonalBusyEventId); // July 1
      expect(ids).toContain(sharedPersonalTitleEventId); // July 2
      expect(ids).not.toContain(sharedPersonalDetailsEventId); // July 3
      expect(ids).not.toContain(legacyGroupEventId); // July 4
    },
  );

  it.skipIf(skipReason !== undefined)(
    'date range from+to narrows results to the window',
    async () => {
      const { events, total } = await query.listByGroup(groupId, MEMBER_ID, {
        from: new Date('2026-07-02T00:00:00Z'),
        to: new Date('2026-07-03T09:00:00Z'),
      });
      const ids = events.map((e) => e.eventId);
      expect(ids).toContain(sharedPersonalTitleEventId); // July 2
      expect(ids).toContain(sharedPersonalDetailsEventId); // July 3
      expect(ids).not.toContain(sharedPersonalBusyEventId); // July 1
      expect(ids).not.toContain(legacyGroupEventId); // July 4
      expect(total).toBe(2);
    },
  );

  // ── listByGroup: pagination ───────────────────────────────────────────

  it.skipIf(skipReason !== undefined)('pagination limits results per page', async () => {
    const { events, total } = await query.listByGroup(groupId, MEMBER_ID, undefined, {
      page: 1,
      limit: 2,
    });
    expect(events).toHaveLength(2);
    expect(total).toBe(4);
  });

  it.skipIf(skipReason !== undefined)('pagination page 2 returns remaining results', async () => {
    const { events, total } = await query.listByGroup(groupId, MEMBER_ID, undefined, {
      page: 2,
      limit: 2,
    });
    expect(events).toHaveLength(2);
    expect(total).toBe(4);
  });

  it.skipIf(skipReason !== undefined)(
    'pagination beyond available results returns empty',
    async () => {
      const { events, total } = await query.listByGroup(groupId, MEMBER_ID, undefined, {
        page: 10,
        limit: 2,
      });
      expect(events).toHaveLength(0);
      expect(total).toBe(4);
    },
  );

  it.skipIf(skipReason !== undefined)(
    'paginated pages contain no overlapping events',
    async () => {
      const page1 = await query.listByGroup(groupId, MEMBER_ID, undefined, {
        page: 1,
        limit: 2,
      });
      const page2 = await query.listByGroup(groupId, MEMBER_ID, undefined, {
        page: 2,
        limit: 2,
      });
      const page1Ids = page1.events.map((e) => e.eventId);
      const page2Ids = page2.events.map((e) => e.eventId);
      const overlap = page1Ids.filter((id) => page2Ids.includes(id));
      expect(overlap).toHaveLength(0);
    },
  );

  // ── listByGroup: record shape ─────────────────────────────────────────

  it.skipIf(skipReason !== undefined)(
    'shared event records include all expected fields',
    async () => {
      const { events } = await query.listByGroup(groupId, MEMBER_ID);
      const detailsEvent = events.find((e) => e.eventId === sharedPersonalDetailsEventId);
      expect(detailsEvent).toBeDefined();
      expect(detailsEvent!.ownerId).toBe(OWNER_ID);
      expect(detailsEvent!.ownerDisplayName).toBe('Event Owner');
      expect(detailsEvent!.title).toBe('Details Event');
      expect(detailsEvent!.description).toBe('Full description available');
      expect(detailsEvent!.startAt).toBeInstanceOf(Date);
      expect(detailsEvent!.endAt).toBeInstanceOf(Date);
      expect(detailsEvent!.status).toBe('scheduled');
      expect(detailsEvent!.visibilityLevel).toBe('details');
    },
  );

  it.skipIf(skipReason !== undefined)(
    'legacy event records include all expected fields',
    async () => {
      const { events } = await query.listByGroup(groupId, MEMBER_ID);
      const legacy = events.find((e) => e.eventId === legacyGroupEventId);
      expect(legacy).toBeDefined();
      expect(legacy!.ownerId).toBe(OWNER_ID);
      expect(legacy!.ownerDisplayName).toBe('Event Owner');
      expect(legacy!.title).toBe('Legacy Group Event');
      expect(legacy!.description).toBe('Created the old way');
      expect(legacy!.startAt).toBeInstanceOf(Date);
      expect(legacy!.endAt).toBeInstanceOf(Date);
      expect(legacy!.status).toBe('scheduled');
      expect(legacy!.visibilityLevel).toBe('details');
    },
  );

  // ── findByGroupAndEvent ───────────────────────────────────────────────

  it.skipIf(skipReason !== undefined)(
    'findByGroupAndEvent returns a shared personal event',
    async () => {
      const record = await query.findByGroupAndEvent(groupId, sharedPersonalDetailsEventId);
      expect(record).not.toBeNull();
      expect(record!.eventId).toBe(sharedPersonalDetailsEventId);
      expect(record!.visibilityLevel).toBe('details');
      expect(record!.ownerDisplayName).toBe('Event Owner');
    },
  );

  it.skipIf(skipReason !== undefined)(
    'findByGroupAndEvent returns null for a legacy group-scoped event (event_shares only)',
    async () => {
      // findByGroupAndEvent only queries event_shares, not event_invitations.
      const record = await query.findByGroupAndEvent(groupId, legacyGroupEventId);
      expect(record).toBeNull();
    },
  );

  it.skipIf(skipReason !== undefined)(
    'findByGroupAndEvent returns null for a non-existent event',
    async () => {
      const record = await query.findByGroupAndEvent(
        groupId,
        '00000000-0000-4000-8000-000000000099',
      );
      expect(record).toBeNull();
    },
  );

  it.skipIf(skipReason !== undefined)(
    'findByGroupAndEvent returns null for an event shared to a different group',
    async () => {
      const record = await query.findByGroupAndEvent(otherGroupId, sharedPersonalDetailsEventId);
      expect(record).toBeNull();
    },
  );

  it.skipIf(skipReason !== undefined)(
    'findByGroupAndEvent returns null for an unshared personal event',
    async () => {
      const record = await query.findByGroupAndEvent(groupId, unsharedPersonalEventId);
      expect(record).toBeNull();
    },
  );
});
