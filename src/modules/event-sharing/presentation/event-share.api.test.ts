import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Knex } from 'knex';
import { createTestDb } from '../../../infrastructure/test-db.js';
import { createApp } from '../../../app.js';
import { testAuthHeaders } from '../../../shared/test-helpers/test-auth.js';
import { FakeIdentity } from '../../../shared/test-helpers/fake-identity.js';
import { KnexUserProfileRepository } from '../../identity-profile/infrastructure/knex-user-profile.repository.js';

const skipReason = !process.env['TEST_DATABASE_URL']
  ? 'TEST_DATABASE_URL is not set – skipping API tests'
  : undefined;

interface ShareBody {
  id: string;
  eventId: string;
  groupId: string;
  visibilityLevel: string;
  sharedByUserId: string;
  sharedAt: string;
  updatedAt: string;
}

describe('Event Share API', () => {
  let db: Knex;
  let app: Express.Application;

  const owner = FakeIdentity.random();
  const member = FakeIdentity.random();
  const outsider = FakeIdentity.random();

  let groupId: string;
  let secondGroupId: string;
  let personalEventId: string;
  let groupEventId: string;

  beforeAll(async () => {
    if (skipReason) return;
    db = createTestDb();
    await db.migrate.latest();
    app = createApp({ db });

    const profileRepo = new KnexUserProfileRepository(db);
    await profileRepo.upsert({ userId: owner.userId, displayName: owner.displayName });
    await profileRepo.upsert({ userId: member.userId, displayName: member.displayName });
    await profileRepo.upsert({ userId: outsider.userId, displayName: outsider.displayName });

    // Create group with owner as creator (auto-added as member).
    const groupRes = await request(app)
      .post('/api/v1/groups')
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ name: 'Event Share Test Group' });
    groupId = (groupRes.body as { id: string }).id;

    // Add member to the group.
    await request(app)
      .post(`/api/v1/groups/${groupId}/members`)
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ userId: member.userId, role: 'member' });

    // Create a second group (owner is also its creator/member).
    const secondGroupRes = await request(app)
      .post('/api/v1/groups')
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ name: 'Second Share Test Group' });
    secondGroupId = (secondGroupRes.body as { id: string }).id;

    // Create a personal event (groupId = null).
    const personalRes = await request(app)
      .post('/api/v1/events')
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ title: 'Share Test Personal Event', startAt: '2026-07-01T10:00:00Z' });
    personalEventId = (personalRes.body as { id: string }).id;

    // Create a group-scoped event (groupId != null).
    const groupEventRes = await request(app)
      .post(`/api/v1/groups/${groupId}/events`)
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ title: 'Group Scoped Event', startAt: '2026-07-01T10:00:00Z' });
    groupEventId = (groupEventRes.body as { id: string }).id;
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // POST /api/v1/events/:eventId/shares
  // ═══════════════════════════════════════════════════════════════════════

  describe('POST /api/v1/events/:eventId/shares', () => {
    it.skipIf(skipReason !== undefined)('returns 401 without auth', async () => {
      const res = await request(app)
        .post(`/api/v1/events/${personalEventId}/shares`)
        .send({ groupId, visibilityLevel: 'title' });
      expect(res.status).toBe(401);
    });

    it.skipIf(skipReason !== undefined)('returns 400 when groupId is missing', async () => {
      const res = await request(app)
        .post(`/api/v1/events/${personalEventId}/shares`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ visibilityLevel: 'title' });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it.skipIf(skipReason !== undefined)(
      'returns 400 when groupId is not a valid UUID',
      async () => {
        const res = await request(app)
          .post(`/api/v1/events/${personalEventId}/shares`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ groupId: 'not-a-uuid', visibilityLevel: 'title' });
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
      },
    );

    it.skipIf(skipReason !== undefined)('returns 400 when visibilityLevel is missing', async () => {
      const res = await request(app)
        .post(`/api/v1/events/${personalEventId}/shares`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ groupId });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it.skipIf(skipReason !== undefined)('returns 400 when visibilityLevel is invalid', async () => {
      const res = await request(app)
        .post(`/api/v1/events/${personalEventId}/shares`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ groupId, visibilityLevel: 'public' });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it.skipIf(skipReason !== undefined)('returns 404 for non-existent event', async () => {
      const res = await request(app)
        .post('/api/v1/events/00000000-0000-4000-8000-ffffffffffff/shares')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ groupId, visibilityLevel: 'title' });
      expect(res.status).toBe(404);
    });

    it.skipIf(skipReason !== undefined)('returns 404 for invalid eventId format', async () => {
      const res = await request(app)
        .post('/api/v1/events/not-a-uuid/shares')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ groupId, visibilityLevel: 'title' });
      expect(res.status).toBe(404);
    });

    it.skipIf(skipReason !== undefined)('rejects sharing a group-scoped event (403)', async () => {
      const res = await request(app)
        .post(`/api/v1/events/${groupEventId}/shares`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ groupId, visibilityLevel: 'title' });
      expect(res.status).toBe(403);
    });

    it.skipIf(skipReason !== undefined)(
      'rejects non-owner sharing attempt (403 FORBIDDEN)',
      async () => {
        const res = await request(app)
          .post(`/api/v1/events/${personalEventId}/shares`)
          .set(testAuthHeaders(member.userId, member.displayName))
          .send({ groupId, visibilityLevel: 'title' });
        // Non-owners get FORBIDDEN; the use case throws FORBIDDEN for non-owner attempts.
        expect(res.status).toBe(403);
      },
    );

    it.skipIf(skipReason !== undefined)(
      'rejects sharing to a group where caller is not a member (403)',
      async () => {
        // Outsider is not a member of any group.
        // First, outsider needs to own the personal event — but they don't own this event.
        // The use case first checks ownership (FORBIDDEN), so this returns 403 as well.
        // Let's create a personal event for the outsider and try to share it.
        const outsiderEventRes = await request(app)
          .post('/api/v1/events')
          .set(testAuthHeaders(outsider.userId, outsider.displayName))
          .send({ title: 'Outsider Personal Event', startAt: '2026-07-15T10:00:00Z' });
        const outsiderEventId = (outsiderEventRes.body as { id: string }).id;

        const res = await request(app)
          .post(`/api/v1/events/${outsiderEventId}/shares`)
          .set(testAuthHeaders(outsider.userId, outsider.displayName))
          .send({ groupId, visibilityLevel: 'title' });
        expect(res.status).toBe(403);
      },
    );

    it.skipIf(skipReason !== undefined)(
      'creates share with visibility level "title" (201)',
      async () => {
        const res = await request(app)
          .post(`/api/v1/events/${personalEventId}/shares`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ groupId, visibilityLevel: 'title' });

        expect(res.status).toBe(201);
        const body = res.body as ShareBody;
        expect(body).toMatchObject({
          eventId: personalEventId,
          groupId,
          visibilityLevel: 'title',
          sharedByUserId: owner.userId,
        });
        expect(body.id).toBeTruthy();
        expect(body.sharedAt).toBeTruthy();
      },
    );

    it.skipIf(skipReason !== undefined)(
      'returns 409 Conflict on duplicate share to same group',
      async () => {
        const res = await request(app)
          .post(`/api/v1/events/${personalEventId}/shares`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ groupId, visibilityLevel: 'busy' });
        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({ code: 'CONFLICT' });
      },
    );

    it.skipIf(skipReason !== undefined)(
      'allows sharing same event to a different group',
      async () => {
        const res = await request(app)
          .post(`/api/v1/events/${personalEventId}/shares`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ groupId: secondGroupId, visibilityLevel: 'details' });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({
          eventId: personalEventId,
          groupId: secondGroupId,
          visibilityLevel: 'details',
        });
      },
    );
  });

  // ═══════════════════════════════════════════════════════════════════════
  // GET /api/v1/events/:eventId/shares
  // ═══════════════════════════════════════════════════════════════════════

  describe('GET /api/v1/events/:eventId/shares', () => {
    it.skipIf(skipReason !== undefined)('returns 401 without auth', async () => {
      const res = await request(app).get(`/api/v1/events/${personalEventId}/shares`);
      expect(res.status).toBe(401);
    });

    it.skipIf(skipReason !== undefined)('returns 404 for invalid eventId format', async () => {
      const res = await request(app)
        .get('/api/v1/events/bad-id/shares')
        .set(testAuthHeaders(owner.userId, owner.displayName));
      expect(res.status).toBe(404);
    });

    it.skipIf(skipReason !== undefined)('returns shares list for event owner', async () => {
      const res = await request(app)
        .get(`/api/v1/events/${personalEventId}/shares`)
        .set(testAuthHeaders(owner.userId, owner.displayName));

      expect(res.status).toBe(200);
      const body = res.body as { shares: ShareBody[] };
      expect(Array.isArray(body.shares)).toBe(true);
      expect(body.shares.length).toBeGreaterThanOrEqual(2);
      expect(body.shares.every((s) => s.eventId === personalEventId)).toBe(true);
    });

    it.skipIf(skipReason !== undefined)('returns 403 for non-owner', async () => {
      const res = await request(app)
        .get(`/api/v1/events/${personalEventId}/shares`)
        .set(testAuthHeaders(member.userId, member.displayName));
      expect(res.status).toBe(403);
    });

    it.skipIf(skipReason !== undefined)('returns 403 for group-scoped event', async () => {
      const res = await request(app)
        .get(`/api/v1/events/${groupEventId}/shares`)
        .set(testAuthHeaders(owner.userId, owner.displayName));
      expect(res.status).toBe(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // PATCH /api/v1/events/:eventId/shares/:shareId
  // ═══════════════════════════════════════════════════════════════════════

  describe('PATCH /api/v1/events/:eventId/shares/:shareId', () => {
    let patchEventId: string;
    let patchShareId: string;

    beforeAll(async () => {
      if (skipReason) return;
      // Create a dedicated personal event and share for PATCH tests.
      const eventRes = await request(app)
        .post('/api/v1/events')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: 'Patch Test Event', startAt: '2026-08-01T10:00:00Z' });
      patchEventId = (eventRes.body as { id: string }).id;

      const shareRes = await request(app)
        .post(`/api/v1/events/${patchEventId}/shares`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ groupId, visibilityLevel: 'title' });
      patchShareId = (shareRes.body as ShareBody).id;
    });

    it.skipIf(skipReason !== undefined)('returns 401 without auth', async () => {
      const res = await request(app)
        .patch(`/api/v1/events/${patchEventId}/shares/${patchShareId}`)
        .send({ visibilityLevel: 'busy' });
      expect(res.status).toBe(401);
    });

    it.skipIf(skipReason !== undefined)('returns 400 when visibilityLevel is invalid', async () => {
      const res = await request(app)
        .patch(`/api/v1/events/${patchEventId}/shares/${patchShareId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ visibilityLevel: 'public' });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it.skipIf(skipReason !== undefined)('returns 400 when visibilityLevel is missing', async () => {
      const res = await request(app)
        .patch(`/api/v1/events/${patchEventId}/shares/${patchShareId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({});
      expect(res.status).toBe(400);
    });

    it.skipIf(skipReason !== undefined)('returns 404 for invalid UUID in shareId', async () => {
      const res = await request(app)
        .patch(`/api/v1/events/${patchEventId}/shares/bad-id`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ visibilityLevel: 'busy' });
      expect(res.status).toBe(404);
    });

    it.skipIf(skipReason !== undefined)('returns 404 for non-existent shareId', async () => {
      const res = await request(app)
        .patch(`/api/v1/events/${patchEventId}/shares/00000000-0000-4000-8000-ffffffffffff`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ visibilityLevel: 'busy' });
      expect(res.status).toBe(404);
    });

    it.skipIf(skipReason !== undefined)('returns 403 for non-owner', async () => {
      const res = await request(app)
        .patch(`/api/v1/events/${patchEventId}/shares/${patchShareId}`)
        .set(testAuthHeaders(member.userId, member.displayName))
        .send({ visibilityLevel: 'busy' });
      expect(res.status).toBe(403);
    });

    it.skipIf(skipReason !== undefined)('updates visibility level for owner (200)', async () => {
      const res = await request(app)
        .patch(`/api/v1/events/${patchEventId}/shares/${patchShareId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ visibilityLevel: 'busy' });

      expect(res.status).toBe(200);
      const body = res.body as ShareBody;
      expect(body).toMatchObject({
        id: patchShareId,
        eventId: patchEventId,
        groupId,
        visibilityLevel: 'busy',
      });
    });

    it.skipIf(skipReason !== undefined)('updated visibility is persisted', async () => {
      const res = await request(app)
        .get(`/api/v1/events/${patchEventId}/shares`)
        .set(testAuthHeaders(owner.userId, owner.displayName));

      expect(res.status).toBe(200);
      const shares = (res.body as { shares: ShareBody[] }).shares;
      const updated = shares.find((s) => s.id === patchShareId);
      expect(updated).toBeDefined();
      expect(updated!.visibilityLevel).toBe('busy');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // DELETE /api/v1/events/:eventId/shares/:shareId
  // ═══════════════════════════════════════════════════════════════════════

  describe('DELETE /api/v1/events/:eventId/shares/:shareId', () => {
    let deleteEventId: string;
    let deleteShareId: string;

    beforeAll(async () => {
      if (skipReason) return;
      // Create a dedicated personal event and share for DELETE tests.
      const eventRes = await request(app)
        .post('/api/v1/events')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: 'Delete Test Event', startAt: '2026-09-01T10:00:00Z' });
      deleteEventId = (eventRes.body as { id: string }).id;

      const shareRes = await request(app)
        .post(`/api/v1/events/${deleteEventId}/shares`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ groupId, visibilityLevel: 'title' });
      deleteShareId = (shareRes.body as ShareBody).id;
    });

    it.skipIf(skipReason !== undefined)('returns 401 without auth', async () => {
      const res = await request(app).delete(
        `/api/v1/events/${deleteEventId}/shares/${deleteShareId}`,
      );
      expect(res.status).toBe(401);
    });

    it.skipIf(skipReason !== undefined)('returns 404 for invalid UUID in shareId', async () => {
      const res = await request(app)
        .delete(`/api/v1/events/${deleteEventId}/shares/bad-id`)
        .set(testAuthHeaders(owner.userId, owner.displayName));
      expect(res.status).toBe(404);
    });

    it.skipIf(skipReason !== undefined)('returns 403 for non-owner', async () => {
      const res = await request(app)
        .delete(`/api/v1/events/${deleteEventId}/shares/${deleteShareId}`)
        .set(testAuthHeaders(member.userId, member.displayName));
      expect(res.status).toBe(403);
    });

    it.skipIf(skipReason !== undefined)('revokes share for owner (204)', async () => {
      const res = await request(app)
        .delete(`/api/v1/events/${deleteEventId}/shares/${deleteShareId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName));
      expect(res.status).toBe(204);
    });

    it.skipIf(skipReason !== undefined)(
      'share no longer appears in list after revocation',
      async () => {
        const res = await request(app)
          .get(`/api/v1/events/${deleteEventId}/shares`)
          .set(testAuthHeaders(owner.userId, owner.displayName));

        expect(res.status).toBe(200);
        const shares = (res.body as { shares: ShareBody[] }).shares;
        expect(shares.find((s) => s.id === deleteShareId)).toBeUndefined();
      },
    );

    it.skipIf(skipReason !== undefined)(
      'returns 404 when revoking an already-deleted share',
      async () => {
        const res = await request(app)
          .delete(`/api/v1/events/${deleteEventId}/shares/${deleteShareId}`)
          .set(testAuthHeaders(owner.userId, owner.displayName));
        expect(res.status).toBe(404);
      },
    );
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Audit trail verification
  // ═══════════════════════════════════════════════════════════════════════

  describe('Audit trail', () => {
    it.skipIf(skipReason !== undefined)(
      'records audit events for share creation, update, and revocation',
      async () => {
        // Create a dedicated personal event and share for audit verification.
        const eventRes = await request(app)
          .post('/api/v1/events')
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ title: 'Audit Test Event', startAt: '2026-10-01T10:00:00Z' });
        const auditEventId = (eventRes.body as { id: string }).id;

        const createRes = await request(app)
          .post(`/api/v1/events/${auditEventId}/shares`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ groupId, visibilityLevel: 'title' });
        expect(createRes.status).toBe(201);
        const newShareId = (createRes.body as ShareBody).id;

        // Update it.
        const updateRes = await request(app)
          .patch(`/api/v1/events/${auditEventId}/shares/${newShareId}`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ visibilityLevel: 'details' });
        expect(updateRes.status).toBe(200);

        // Revoke it.
        const revokeRes = await request(app)
          .delete(`/api/v1/events/${auditEventId}/shares/${newShareId}`)
          .set(testAuthHeaders(owner.userId, owner.displayName));
        expect(revokeRes.status).toBe(204);

        // Verify audit log entries exist.
        const auditRows = await db('audit_log')
          .where({ resource_type: 'event_share', resource_id: newShareId })
          .orderBy('occurred_at', 'asc');

        const actions = auditRows.map((r: { action: string }) => r.action);
        expect(actions).toContain('event_share.created');
        expect(actions).toContain('event_share.updated');
        expect(actions).toContain('event_share.revoked');
      },
    );
  });
});
