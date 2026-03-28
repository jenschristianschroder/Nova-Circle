import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Knex } from 'knex';
import { createTestDb } from '../../../infrastructure/test-db.js';
import { createApp } from '../../../app.js';
import { testAuthHeaders } from '../../../shared/test-helpers/test-auth.js';
import { FakeIdentity } from '../../../shared/test-helpers/fake-identity.js';

const skipReason = !process.env['TEST_DATABASE_URL']
  ? 'TEST_DATABASE_URL is not set – skipping API tests'
  : undefined;

describe('Profile API', () => {
  let db: Knex;
  let app: Express.Application;

  beforeAll(async () => {
    if (skipReason) return;
    db = createTestDb();
    await db.migrate.latest();
    app = createApp({ db });
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  describe('GET /api/v1/me', () => {
    it.skipIf(skipReason !== undefined)('returns 401 when no identity is provided', async () => {
      const res = await request(app).get('/api/v1/me');
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it.skipIf(skipReason !== undefined)(
      'returns auto-provisioned profile when no explicit profile exists',
      async () => {
        const identity = FakeIdentity.random();
        const res = await request(app)
          .get('/api/v1/me')
          .set(testAuthHeaders(identity.userId, identity.displayName));
        // ensure-profile middleware auto-creates a minimal profile on the first
        // authenticated request, so GET /me always returns 200.
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
          id: identity.userId,
          displayName: identity.displayName,
        });
      },
    );

    it.skipIf(skipReason !== undefined)('returns profile after it is created', async () => {
      const identity = FakeIdentity.random();
      await request(app)
        .put('/api/v1/me')
        .set(testAuthHeaders(identity.userId, identity.displayName))
        .send({ displayName: 'Test User' });

      const res = await request(app)
        .get('/api/v1/me')
        .set(testAuthHeaders(identity.userId, identity.displayName));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ displayName: 'Test User' });
    });
  });

  describe('PUT /api/v1/me', () => {
    it.skipIf(skipReason !== undefined)('returns 401 when no identity is provided', async () => {
      const res = await request(app).put('/api/v1/me').send({ displayName: 'Alice' });
      expect(res.status).toBe(401);
    });

    it.skipIf(skipReason !== undefined)('creates profile with valid data', async () => {
      const identity = FakeIdentity.random();
      const res = await request(app)
        .put('/api/v1/me')
        .set(testAuthHeaders(identity.userId, identity.displayName))
        .send({ displayName: 'Alice' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: identity.userId, displayName: 'Alice' });
    });

    it.skipIf(skipReason !== undefined)('updates existing profile', async () => {
      const identity = FakeIdentity.random();
      await request(app)
        .put('/api/v1/me')
        .set(testAuthHeaders(identity.userId, identity.displayName))
        .send({ displayName: 'Old Name' });

      const res = await request(app)
        .put('/api/v1/me')
        .set(testAuthHeaders(identity.userId, identity.displayName))
        .send({ displayName: 'New Name' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ displayName: 'New Name' });
    });

    it.skipIf(skipReason !== undefined)('returns 400 when displayName is empty', async () => {
      const identity = FakeIdentity.random();
      const res = await request(app)
        .put('/api/v1/me')
        .set(testAuthHeaders(identity.userId, identity.displayName))
        .send({ displayName: '   ' });

      expect(res.status).toBe(400);
    });

    it.skipIf(skipReason !== undefined)('returns 400 when displayName is missing', async () => {
      const identity = FakeIdentity.random();
      const res = await request(app)
        .put('/api/v1/me')
        .set(testAuthHeaders(identity.userId, identity.displayName))
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
