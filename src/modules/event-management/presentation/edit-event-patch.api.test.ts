import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Knex } from 'knex';
import type Express from 'express';
import { createTestDb } from '../../../infrastructure/test-db.js';
import { createApp } from '../../../app.js';
import { testAuthHeaders } from '../../../shared/test-helpers/test-auth.js';
import { FakeIdentity } from '../../../shared/test-helpers/fake-identity.js';
import { KnexUserProfileRepository } from '../../identity-profile/infrastructure/knex-user-profile.repository.js';

const skipReason = !process.env['TEST_DATABASE_URL']
  ? 'TEST_DATABASE_URL is not set – skipping API tests'
  : undefined;

describe('Events API – PATCH extended coverage', () => {
  let db: Knex;
  let app: Express.Application;

  const owner = FakeIdentity.random();
  const member = FakeIdentity.random();
  const outsider = FakeIdentity.random();

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

    const groupRes = await request(app)
      .post('/api/v1/groups')
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ name: 'PATCH Extended Test Group' });
    groupId = (groupRes.body as { id: string }).id;

    await request(app)
      .post(`/api/v1/groups/${groupId}/members`)
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ userId: member.userId, role: 'member' });
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/v1/groups/:groupId/events/:eventId – additional coverage
  // ---------------------------------------------------------------------------

  describe('PATCH /api/v1/groups/:groupId/events/:eventId', () => {
    it.skipIf(skipReason !== undefined)('creator can update startAt and endAt', async () => {
      const createRes = await request(app)
        .post(`/api/v1/groups/${groupId}/events`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: 'Time Update Event', startAt: '2027-02-01T10:00:00Z' });

      const eventId = (createRes.body as { id: string }).id;

      const res = await request(app)
        .patch(`/api/v1/groups/${groupId}/events/${eventId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ startAt: '2027-02-01T11:00:00Z', endAt: '2027-02-01T12:00:00Z' });

      expect(res.status).toBe(200);
      expect(new Date((res.body as { startAt: string }).startAt).toISOString()).toBe(
        '2027-02-01T11:00:00.000Z',
      );
    });

    it.skipIf(skipReason !== undefined)(
      'edit does not alter the existing invitation list',
      async () => {
        const createRes = await request(app)
          .post(`/api/v1/groups/${groupId}/events`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ title: 'Invite Stable Event', startAt: '2027-03-01T10:00:00Z' });
        const eventId = (createRes.body as { id: string }).id;

        // Member was auto-invited at creation.
        const beforeMemberRes = await request(app)
          .get(`/api/v1/groups/${groupId}/events/${eventId}`)
          .set(testAuthHeaders(member.userId, member.displayName));
        expect(beforeMemberRes.status).toBe(200);

        // Owner edits the event.
        await request(app)
          .patch(`/api/v1/groups/${groupId}/events/${eventId}`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ title: 'Invite Stable Event – Edited' });

        // Member still has access after edit.
        const afterMemberRes = await request(app)
          .get(`/api/v1/groups/${groupId}/events/${eventId}`)
          .set(testAuthHeaders(member.userId, member.displayName));
        expect(afterMemberRes.status).toBe(200);
      },
    );

    it.skipIf(skipReason !== undefined)('returns 400 for invalid startAt value', async () => {
      const createRes = await request(app)
        .post(`/api/v1/groups/${groupId}/events`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: 'Bad Date Event', startAt: '2027-06-01T10:00:00Z' });
      const eventId = (createRes.body as { id: string }).id;

      const res = await request(app)
        .patch(`/api/v1/groups/${groupId}/events/${eventId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ startAt: 'not-a-date' });

      expect(res.status).toBe(400);
      expect((res.body as { code: string }).code).toBe('VALIDATION_ERROR');
    });

    it.skipIf(skipReason !== undefined)('returns 404 for invalid UUID eventId', async () => {
      const res = await request(app)
        .patch(`/api/v1/groups/${groupId}/events/not-a-uuid`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: 'Whatever' });
      expect(res.status).toBe(404);
    });
  });
});
