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

describe('Membership API', () => {
  let db: Knex;
  let app: Express.Application;
  const owner = FakeIdentity.random();
  const outsider = FakeIdentity.random();
  const invitee = FakeIdentity.random();

  beforeAll(async () => {
    if (skipReason) return;
    db = createTestDb();
    await db.migrate.latest();
    app = createApp({ db });

    const profileRepo = new KnexUserProfileRepository(db);
    await profileRepo.upsert({ userId: owner.userId, displayName: owner.displayName });
    await profileRepo.upsert({ userId: outsider.userId, displayName: outsider.displayName });
    await profileRepo.upsert({ userId: invitee.userId, displayName: invitee.displayName });
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  async function createGroup(creatorId: string, creatorName: string): Promise<string> {
    const res = await request(app)
      .post('/api/v1/groups')
      .set(testAuthHeaders(creatorId, creatorName))
      .send({ name: 'Test Group' });
    return (res.body as { id: string }).id;
  }

  describe('GET /api/v1/groups/:id/members', () => {
    it.skipIf(skipReason !== undefined)('returns 401 without auth', async () => {
      const res = await request(app).get('/api/v1/groups/some-id/members');
      expect(res.status).toBe(401);
    });

    it.skipIf(skipReason !== undefined)('returns 404 for non-member', async () => {
      const groupId = await createGroup(owner.userId, owner.displayName);
      const res = await request(app)
        .get(`/api/v1/groups/${groupId}/members`)
        .set(testAuthHeaders(outsider.userId, outsider.displayName));
      expect(res.status).toBe(404);
    });

    it.skipIf(skipReason !== undefined)('returns members list for member', async () => {
      const groupId = await createGroup(owner.userId, owner.displayName);
      const res = await request(app)
        .get(`/api/v1/groups/${groupId}/members`)
        .set(testAuthHeaders(owner.userId, owner.displayName));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/v1/groups/:id/members', () => {
    it.skipIf(skipReason !== undefined)('returns 401 without auth', async () => {
      const res = await request(app).post('/api/v1/groups/some-id/members').send({ userId: 'x' });
      expect(res.status).toBe(401);
    });

    it.skipIf(skipReason !== undefined)('allows owner to add a member', async () => {
      const groupId = await createGroup(owner.userId, owner.displayName);
      const res = await request(app)
        .post(`/api/v1/groups/${groupId}/members`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ userId: invitee.userId, role: 'member' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ userId: invitee.userId, role: 'member' });
    });

    it.skipIf(skipReason !== undefined)('returns 403 for outsider', async () => {
      const groupId = await createGroup(owner.userId, owner.displayName);
      const res = await request(app)
        .post(`/api/v1/groups/${groupId}/members`)
        .set(testAuthHeaders(outsider.userId, outsider.displayName))
        .send({ userId: invitee.userId });
      expect(res.status).toBe(403);
    });

    it.skipIf(skipReason !== undefined)('returns 409 for duplicate member', async () => {
      const groupId = await createGroup(owner.userId, owner.displayName);
      await request(app)
        .post(`/api/v1/groups/${groupId}/members`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ userId: invitee.userId });

      const res = await request(app)
        .post(`/api/v1/groups/${groupId}/members`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ userId: invitee.userId });
      expect(res.status).toBe(409);
    });
  });

  describe('DELETE /api/v1/groups/:id/members/:userId', () => {
    it.skipIf(skipReason !== undefined)('allows owner to remove a member', async () => {
      const groupId = await createGroup(owner.userId, owner.displayName);
      await request(app)
        .post(`/api/v1/groups/${groupId}/members`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ userId: invitee.userId });

      const res = await request(app)
        .delete(`/api/v1/groups/${groupId}/members/${invitee.userId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName));
      expect(res.status).toBe(204);
    });

    it.skipIf(skipReason !== undefined)('prevents removing the owner', async () => {
      const groupId = await createGroup(owner.userId, owner.displayName);
      const res = await request(app)
        .delete(`/api/v1/groups/${groupId}/members/${owner.userId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName));
      expect(res.status).toBe(403);
    });

    it.skipIf(skipReason !== undefined)('returns 404 for non-member target', async () => {
      const groupId = await createGroup(owner.userId, owner.displayName);
      const res = await request(app)
        .delete(`/api/v1/groups/${groupId}/members/${outsider.userId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName));
      expect(res.status).toBe(404);
    });
  });
});
