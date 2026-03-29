import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Knex } from 'knex';
import { createTestDb } from '../../../infrastructure/test-db.js';
import { KnexEventShareRepository } from './knex-event-share.repository.js';
import { KnexUserProfileRepository } from '../../identity-profile/infrastructure/knex-user-profile.repository.js';
import { KnexGroupCreationService } from '../../group-management/infrastructure/knex-group-creation.service.js';
import { KnexEventCreationService } from '../../event-management/infrastructure/knex-event-creation.service.js';

const skipReason = !process.env['TEST_DATABASE_URL']
  ? 'TEST_DATABASE_URL is not set – skipping database integration tests'
  : undefined;

const CREATOR_ID = 'dddddddd-0000-4000-8000-000000000001';

describe('KnexEventShareRepository integration', () => {
  let db: Knex;
  let shareRepo: KnexEventShareRepository;
  let eventId: string;
  let groupId: string;
  let secondGroupId: string;

  beforeAll(async () => {
    if (skipReason) return;
    db = createTestDb();
    await db.migrate.latest();

    const profileRepo = new KnexUserProfileRepository(db);
    await profileRepo.upsert({ userId: CREATOR_ID, displayName: 'Share Creator' });

    const groupCreator = new KnexGroupCreationService(db);
    const group = await groupCreator.createGroupWithOwner({
      name: 'Share Repo Test Group',
      description: null,
      ownerId: CREATOR_ID,
    });
    groupId = group.id;

    const secondGroup = await groupCreator.createGroupWithOwner({
      name: 'Share Repo Second Group',
      description: null,
      ownerId: CREATOR_ID,
    });
    secondGroupId = secondGroup.id;

    // Create a personal event (groupId: null).
    const eventCreator = new KnexEventCreationService(db);
    const event = await eventCreator.createEventWithInvitations({
      groupId: null,
      title: 'Share Repo Test Event',
      description: null,
      startAt: new Date('2026-09-01T10:00:00Z'),
      endAt: null,
      createdBy: CREATOR_ID,
      inviteeIds: [CREATOR_ID],
    });
    eventId = event.id;

    shareRepo = new KnexEventShareRepository(db);
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  // ── create ──────────────────────────────────────────────────────────────

  it.skipIf(skipReason !== undefined)('create() persists a share and returns it', async () => {
    const share = await shareRepo.create({
      eventId,
      groupId,
      visibilityLevel: 'title',
      sharedByUserId: CREATOR_ID,
    });

    expect(share.id).toBeTruthy();
    expect(share.eventId).toBe(eventId);
    expect(share.groupId).toBe(groupId);
    expect(share.visibilityLevel).toBe('title');
    expect(share.sharedByUserId).toBe(CREATOR_ID);
    expect(share.sharedAt).toBeInstanceOf(Date);
    expect(share.updatedAt).toBeInstanceOf(Date);
  });

  it.skipIf(skipReason !== undefined)(
    'create() rejects duplicate (event_id, group_id) pair',
    async () => {
      await expect(
        shareRepo.create({
          eventId,
          groupId,
          visibilityLevel: 'busy',
          sharedByUserId: CREATOR_ID,
        }),
      ).rejects.toThrow();
    },
  );

  it.skipIf(skipReason !== undefined)(
    'create() allows same event shared to a different group',
    async () => {
      const share = await shareRepo.create({
        eventId,
        groupId: secondGroupId,
        visibilityLevel: 'details',
        sharedByUserId: CREATOR_ID,
      });

      expect(share.id).toBeTruthy();
      expect(share.groupId).toBe(secondGroupId);
      expect(share.visibilityLevel).toBe('details');
    },
  );

  // ── findById ────────────────────────────────────────────────────────────

  it.skipIf(skipReason !== undefined)('findById() returns the share for a valid id', async () => {
    const created = await shareRepo.findByEventAndGroup(eventId, groupId);
    expect(created).not.toBeNull();

    const found = await shareRepo.findById(created!.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created!.id);
    expect(found!.eventId).toBe(eventId);
  });

  it.skipIf(skipReason !== undefined)('findById() returns null for non-existent id', async () => {
    const found = await shareRepo.findById('00000000-0000-4000-8000-000000000099');
    expect(found).toBeNull();
  });

  // ── findByEventAndGroup ─────────────────────────────────────────────────

  it.skipIf(skipReason !== undefined)(
    'findByEventAndGroup() returns the share for a valid pair',
    async () => {
      const found = await shareRepo.findByEventAndGroup(eventId, groupId);
      expect(found).not.toBeNull();
      expect(found!.eventId).toBe(eventId);
      expect(found!.groupId).toBe(groupId);
    },
  );

  it.skipIf(skipReason !== undefined)(
    'findByEventAndGroup() returns null for non-existent pair',
    async () => {
      const found = await shareRepo.findByEventAndGroup(
        eventId,
        '00000000-0000-4000-8000-000000000099',
      );
      expect(found).toBeNull();
    },
  );

  // ── listByEvent ─────────────────────────────────────────────────────────

  it.skipIf(skipReason !== undefined)(
    'listByEvent() returns all shares for the event ordered by shared_at',
    async () => {
      const shares = await shareRepo.listByEvent(eventId);
      expect(shares.length).toBeGreaterThanOrEqual(2);
      expect(shares.every((s) => s.eventId === eventId)).toBe(true);

      // Verify ascending order.
      for (let i = 1; i < shares.length; i++) {
        expect(shares[i]!.sharedAt.getTime()).toBeGreaterThanOrEqual(
          shares[i - 1]!.sharedAt.getTime(),
        );
      }
    },
  );

  it.skipIf(skipReason !== undefined)(
    'listByEvent() returns empty array for event with no shares',
    async () => {
      const shares = await shareRepo.listByEvent('00000000-0000-4000-8000-000000000099');
      expect(shares).toEqual([]);
    },
  );

  // ── updateVisibility ────────────────────────────────────────────────────

  it.skipIf(skipReason !== undefined)(
    'updateVisibility() changes visibility and returns updated share',
    async () => {
      const existing = await shareRepo.findByEventAndGroup(eventId, groupId);
      expect(existing).not.toBeNull();
      expect(existing!.visibilityLevel).toBe('title');

      const updated = await shareRepo.updateVisibility(existing!.id, 'busy');
      expect(updated).not.toBeNull();
      expect(updated!.visibilityLevel).toBe('busy');
      expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(existing!.updatedAt.getTime());
    },
  );

  it.skipIf(skipReason !== undefined)(
    'updateVisibility() returns null for non-existent share',
    async () => {
      const updated = await shareRepo.updateVisibility(
        '00000000-0000-4000-8000-000000000099',
        'details',
      );
      expect(updated).toBeNull();
    },
  );

  // ── delete ──────────────────────────────────────────────────────────────

  it.skipIf(skipReason !== undefined)(
    'delete() removes the share and findById returns null afterwards',
    async () => {
      const existing = await shareRepo.findByEventAndGroup(eventId, secondGroupId);
      expect(existing).not.toBeNull();

      await shareRepo.delete(existing!.id);

      const after = await shareRepo.findById(existing!.id);
      expect(after).toBeNull();
    },
  );

  it.skipIf(skipReason !== undefined)('delete() is idempotent for non-existent share', async () => {
    await expect(shareRepo.delete('00000000-0000-4000-8000-000000000099')).resolves.toBeUndefined();
  });
});
