import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Knex } from 'knex';
import { createTestDb } from '../../../infrastructure/test-db.js';
import { createApp } from '../../../app.js';
import { testAuthHeaders } from '../../../shared/test-helpers/test-auth.js';
import { FakeIdentity } from '../../../shared/test-helpers/fake-identity.js';
import { KnexUserProfileRepository } from '../../identity-profile/infrastructure/knex-user-profile.repository.js';
import { KnexGroupMemberRepository } from '../../group-membership/infrastructure/knex-group-member.repository.js';

const skipReason = !process.env['TEST_DATABASE_URL']
  ? 'TEST_DATABASE_URL is not set – skipping API tests'
  : undefined;

describe('Events API', () => {
  let db: Knex;
  let app: Express.Application;

  const owner = FakeIdentity.random();
  const member = FakeIdentity.random();
  const outsider = FakeIdentity.random();
  const newMember = FakeIdentity.random();

  let groupId: string;

  beforeAll(async () => {
    if (skipReason) return;
    db = createTestDb();
    await db.migrate.latest();
    app = createApp({ db });

    const profileRepo = new KnexUserProfileRepository(db);
    await profileRepo.upsert({ userId: owner.userId, displayName: owner.displayName });
    await profileRepo.upsert({ userId: member.userId, displayName: member.displayName });
    await profileRepo.upsert({ userId: outsider.userId, displayName: outsider.displayName });
    await profileRepo.upsert({ userId: newMember.userId, displayName: newMember.displayName });

    // Create a group with owner as creator (seeded as member automatically).
    const groupRes = await request(app)
      .post('/api/v1/groups')
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ name: 'Event Test Group' });
    groupId = (groupRes.body as { id: string }).id;

    // Add member to the group.
    await request(app)
      .post(`/api/v1/groups/${groupId}/members`)
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ userId: member.userId, role: 'member' });
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/groups/:groupId/events
  // ---------------------------------------------------------------------------

  describe('POST /api/v1/groups/:groupId/events', () => {
    it.skipIf(skipReason !== undefined)('returns 401 without auth', async () => {
      const res = await request(app)
        .post(`/api/v1/groups/${groupId}/events`)
        .send({ title: 'Event', startAt: '2026-06-01T10:00:00Z' });
      expect(res.status).toBe(401);
    });

    it.skipIf(skipReason !== undefined)('creates event and returns 201', async () => {
      const res = await request(app)
        .post(`/api/v1/groups/${groupId}/events`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: 'Team Lunch', startAt: '2026-06-01T12:00:00Z' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        title: 'Team Lunch',
        groupId,
        createdBy: owner.userId,
        status: 'scheduled',
      });
    });

    it.skipIf(skipReason !== undefined)('returns 404 for non-member', async () => {
      const res = await request(app)
        .post(`/api/v1/groups/${groupId}/events`)
        .set(testAuthHeaders(outsider.userId, outsider.displayName))
        .send({ title: 'Sneaky Event', startAt: '2026-06-01T12:00:00Z' });

      expect(res.status).toBe(404);
    });

    it.skipIf(skipReason !== undefined)('returns 400 for empty title', async () => {
      const res = await request(app)
        .post(`/api/v1/groups/${groupId}/events`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: '', startAt: '2026-06-01T12:00:00Z' });

      expect(res.status).toBe(400);
    });

    it.skipIf(skipReason !== undefined)('returns 400 when startAt is missing', async () => {
      const res = await request(app)
        .post(`/api/v1/groups/${groupId}/events`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: 'No Start' });

      expect(res.status).toBe(400);
    });

    it.skipIf(skipReason !== undefined)(
      'allows creator to exclude members from invite list',
      async () => {
        const res = await request(app)
          .post(`/api/v1/groups/${groupId}/events`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({
            title: 'Private Event',
            startAt: '2026-07-01T12:00:00Z',
            excludeUserIds: [member.userId],
          });

        expect(res.status).toBe(201);
        const eventId = (res.body as { id: string }).id;

        // Member was excluded – they cannot see the event.
        const memberGetRes = await request(app)
          .get(`/api/v1/groups/${groupId}/events/${eventId}`)
          .set(testAuthHeaders(member.userId, member.displayName));
        expect(memberGetRes.status).toBe(404);

        // Owner can see it.
        const ownerGetRes = await request(app)
          .get(`/api/v1/groups/${groupId}/events/${eventId}`)
          .set(testAuthHeaders(owner.userId, owner.displayName));
        expect(ownerGetRes.status).toBe(200);
      },
    );
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/groups/:groupId/events
  // ---------------------------------------------------------------------------

  describe('GET /api/v1/groups/:groupId/events', () => {
    it.skipIf(skipReason !== undefined)('returns 401 without auth', async () => {
      const res = await request(app).get(`/api/v1/groups/${groupId}/events`);
      expect(res.status).toBe(401);
    });

    it.skipIf(skipReason !== undefined)('returns 404 for non-member', async () => {
      const res = await request(app)
        .get(`/api/v1/groups/${groupId}/events`)
        .set(testAuthHeaders(outsider.userId, outsider.displayName));
      expect(res.status).toBe(404);
    });

    it.skipIf(skipReason !== undefined)(
      'returns only invited events for group member',
      async () => {
        // Create an event inviting both owner and member.
        const createRes = await request(app)
          .post(`/api/v1/groups/${groupId}/events`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ title: 'Shared Event', startAt: '2026-08-01T12:00:00Z' });
        const sharedEventId = (createRes.body as { id: string }).id;

        // Create an event that excludes member.
        const privateRes = await request(app)
          .post(`/api/v1/groups/${groupId}/events`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({
            title: 'Owner Only Event',
            startAt: '2026-08-02T12:00:00Z',
            excludeUserIds: [member.userId],
          });
        const privateEventId = (privateRes.body as { id: string }).id;

        // Member sees shared event but not owner-only event.
        const memberRes = await request(app)
          .get(`/api/v1/groups/${groupId}/events`)
          .set(testAuthHeaders(member.userId, member.displayName));
        expect(memberRes.status).toBe(200);
        const memberEventIds = (memberRes.body as { id: string }[]).map((e) => e.id);
        expect(memberEventIds).toContain(sharedEventId);
        expect(memberEventIds).not.toContain(privateEventId);

        // Owner sees both.
        const ownerRes = await request(app)
          .get(`/api/v1/groups/${groupId}/events`)
          .set(testAuthHeaders(owner.userId, owner.displayName));
        const ownerEventIds = (ownerRes.body as { id: string }[]).map((e) => e.id);
        expect(ownerEventIds).toContain(sharedEventId);
        expect(ownerEventIds).toContain(privateEventId);
      },
    );

    it.skipIf(skipReason !== undefined)(
      'new group member cannot see historic events they were not invited to',
      async () => {
        // Create an event BEFORE newMember joins the group.
        const historicRes = await request(app)
          .post(`/api/v1/groups/${groupId}/events`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ title: 'Historic Event', startAt: '2026-09-01T12:00:00Z' });
        const historicEventId = (historicRes.body as { id: string }).id;

        // Add newMember to the group AFTER the event was created.
        const memberRepo = new KnexGroupMemberRepository(db);
        await memberRepo.add({ groupId, userId: newMember.userId, role: 'member' });

        // newMember cannot see the historic event.
        const eventsRes = await request(app)
          .get(`/api/v1/groups/${groupId}/events`)
          .set(testAuthHeaders(newMember.userId, newMember.displayName));
        expect(eventsRes.status).toBe(200);
        const eventIds = (eventsRes.body as { id: string }[]).map((e) => e.id);
        expect(eventIds).not.toContain(historicEventId);

        // Direct GET also returns 404 for newMember.
        const directRes = await request(app)
          .get(`/api/v1/groups/${groupId}/events/${historicEventId}`)
          .set(testAuthHeaders(newMember.userId, newMember.displayName));
        expect(directRes.status).toBe(404);
      },
    );
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/groups/:groupId/events/:eventId
  // ---------------------------------------------------------------------------

  describe('GET /api/v1/groups/:groupId/events/:eventId', () => {
    it.skipIf(skipReason !== undefined)('returns 401 without auth', async () => {
      const res = await request(app).get(`/api/v1/groups/${groupId}/events/some-id`);
      expect(res.status).toBe(401);
    });

    it.skipIf(skipReason !== undefined)('returns event detail for invited user', async () => {
      const createRes = await request(app)
        .post(`/api/v1/groups/${groupId}/events`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: 'Detail Test Event', startAt: '2026-10-01T12:00:00Z' });
      const eventId = (createRes.body as { id: string }).id;

      const res = await request(app)
        .get(`/api/v1/groups/${groupId}/events/${eventId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: eventId, title: 'Detail Test Event' });
    });

    it.skipIf(skipReason !== undefined)(
      'returns 404 for non-invited user (no existence disclosure)',
      async () => {
        const createRes = await request(app)
          .post(`/api/v1/groups/${groupId}/events`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ title: 'Secret Event', startAt: '2026-10-02T12:00:00Z' });
        const eventId = (createRes.body as { id: string }).id;

        // Outsider gets 404 (not 403).
        const res = await request(app)
          .get(`/api/v1/groups/${groupId}/events/${eventId}`)
          .set(testAuthHeaders(outsider.userId, outsider.displayName));
        expect(res.status).toBe(404);
      },
    );

    it.skipIf(skipReason !== undefined)('returns 404 for invalid UUID', async () => {
      const res = await request(app)
        .get(`/api/v1/groups/${groupId}/events/not-a-uuid`)
        .set(testAuthHeaders(owner.userId, owner.displayName));
      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/v1/groups/:groupId/events/:eventId
  // ---------------------------------------------------------------------------

  describe('DELETE /api/v1/groups/:groupId/events/:eventId', () => {
    it.skipIf(skipReason !== undefined)('returns 401 without auth', async () => {
      const res = await request(app).delete(`/api/v1/groups/${groupId}/events/some-id`);
      expect(res.status).toBe(401);
    });

    it.skipIf(skipReason !== undefined)('creator can cancel their own event', async () => {
      const createRes = await request(app)
        .post(`/api/v1/groups/${groupId}/events`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: 'To Cancel', startAt: '2026-11-01T12:00:00Z' });
      const eventId = (createRes.body as { id: string }).id;

      const res = await request(app)
        .delete(`/api/v1/groups/${groupId}/events/${eventId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName));
      expect(res.status).toBe(204);

      // Event still visible but with cancelled status.
      const getRes = await request(app)
        .get(`/api/v1/groups/${groupId}/events/${eventId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName));
      expect(getRes.body).toMatchObject({ status: 'cancelled' });
    });

    it.skipIf(skipReason !== undefined)(
      'returns 403 for invited member who is not creator or admin',
      async () => {
        const createRes = await request(app)
          .post(`/api/v1/groups/${groupId}/events`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ title: 'No Cancel', startAt: '2026-11-02T12:00:00Z' });
        const eventId = (createRes.body as { id: string }).id;

        const res = await request(app)
          .delete(`/api/v1/groups/${groupId}/events/${eventId}`)
          .set(testAuthHeaders(member.userId, member.displayName));
        expect(res.status).toBe(403);
      },
    );

    it.skipIf(skipReason !== undefined)(
      'returns 404 for non-invited user (no existence disclosure)',
      async () => {
        const createRes = await request(app)
          .post(`/api/v1/groups/${groupId}/events`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ title: 'Secret Cancel', startAt: '2026-11-03T12:00:00Z' });
        const eventId = (createRes.body as { id: string }).id;

        const res = await request(app)
          .delete(`/api/v1/groups/${groupId}/events/${eventId}`)
          .set(testAuthHeaders(outsider.userId, outsider.displayName));
        expect(res.status).toBe(404);
      },
    );
  });
});
