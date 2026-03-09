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

describe('Groups API', () => {
  let db: Knex;
  let app: Express.Application;
  const owner = FakeIdentity.random();
  const member = FakeIdentity.random();
  const outsider = FakeIdentity.random();

  beforeAll(async () => {
    if (skipReason) return;
    db = createTestDb();
    await db.migrate.latest();
    app = createApp({ db });

    // Seed user profiles so FK constraints are satisfied.
    const profileRepo = new KnexUserProfileRepository(db);
    await profileRepo.upsert({ userId: owner.userId, displayName: owner.displayName });
    await profileRepo.upsert({ userId: member.userId, displayName: member.displayName });
    await profileRepo.upsert({ userId: outsider.userId, displayName: outsider.displayName });
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  describe('POST /api/v1/groups', () => {
    it.skipIf(skipReason !== undefined)('returns 401 without auth', async () => {
      const res = await request(app).post('/api/v1/groups').send({ name: 'Test' });
      expect(res.status).toBe(401);
    });

    it.skipIf(skipReason !== undefined)('creates a group and adds owner as member', async () => {
      const res = await request(app)
        .post('/api/v1/groups')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ name: 'My Group', description: 'A test group' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'My Group', ownerId: owner.userId });
    });

    it.skipIf(skipReason !== undefined)('returns 400 for empty name', async () => {
      const res = await request(app)
        .post('/api/v1/groups')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ name: '' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/groups/:id', () => {
    it.skipIf(skipReason !== undefined)('returns 401 without auth', async () => {
      const res = await request(app).get('/api/v1/groups/some-id');
      expect(res.status).toBe(401);
    });

    it.skipIf(skipReason !== undefined)('returns 404 for non-member', async () => {
      // Create a group as owner.
      const createRes = await request(app)
        .post('/api/v1/groups')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ name: 'Private Group' });

      const groupId = (createRes.body as { id: string }).id;

      // Outsider cannot see it.
      const res = await request(app)
        .get(`/api/v1/groups/${groupId}`)
        .set(testAuthHeaders(outsider.userId, outsider.displayName));
      expect(res.status).toBe(404);
    });

    it.skipIf(skipReason !== undefined)('returns group for owner (member)', async () => {
      const createRes = await request(app)
        .post('/api/v1/groups')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ name: 'Owner Group' });

      const groupId = (createRes.body as { id: string }).id;

      const res = await request(app)
        .get(`/api/v1/groups/${groupId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: groupId, name: 'Owner Group' });
    });
  });

  describe('PUT /api/v1/groups/:id', () => {
    it.skipIf(skipReason !== undefined)('allows owner to update', async () => {
      const createRes = await request(app)
        .post('/api/v1/groups')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ name: 'Before Update' });

      const groupId = (createRes.body as { id: string }).id;

      const res = await request(app)
        .put(`/api/v1/groups/${groupId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ name: 'After Update' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'After Update' });
    });

    it.skipIf(skipReason !== undefined)('returns 403 for outsider', async () => {
      const createRes = await request(app)
        .post('/api/v1/groups')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ name: 'Protected Group' });

      const groupId = (createRes.body as { id: string }).id;

      const res = await request(app)
        .put(`/api/v1/groups/${groupId}`)
        .set(testAuthHeaders(outsider.userId, outsider.displayName))
        .send({ name: 'Hacked' });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/v1/groups/:id', () => {
    it.skipIf(skipReason !== undefined)('allows owner to delete', async () => {
      const createRes = await request(app)
        .post('/api/v1/groups')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ name: 'To Delete' });

      const groupId = (createRes.body as { id: string }).id;

      const res = await request(app)
        .delete(`/api/v1/groups/${groupId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName));

      expect(res.status).toBe(204);
    });

    it.skipIf(skipReason !== undefined)('returns 403 for non-owner', async () => {
      const createRes = await request(app)
        .post('/api/v1/groups')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ name: 'Cannot Delete' });

      const groupId = (createRes.body as { id: string }).id;

      const res = await request(app)
        .delete(`/api/v1/groups/${groupId}`)
        .set(testAuthHeaders(outsider.userId, outsider.displayName));

      expect(res.status).toBe(403);
    });
  });
});
