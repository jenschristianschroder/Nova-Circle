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

  describe('GET /api/v1/profile/me', () => {
    it.skipIf(skipReason !== undefined)('returns 401 when no identity is provided', async () => {
      const res = await request(app).get('/api/v1/profile/me');
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it.skipIf(skipReason !== undefined)(
      'returns 404 for authenticated user who has not signed up',
      async () => {
        const identity = FakeIdentity.random();
        const res = await request(app)
          .get('/api/v1/profile/me')
          .set(testAuthHeaders(identity.userId, identity.displayName));
        // Without auto-provisioning, an authenticated user with no profile row
        // should receive 404 to signal that sign-up is required.
        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
      },
    );

    it.skipIf(skipReason !== undefined)('returns profile after sign-up', async () => {
      const identity = FakeIdentity.random();
      await request(app)
        .post('/api/v1/signup')
        .set(testAuthHeaders(identity.userId, identity.displayName))
        .send({ displayName: 'Test User' });

      const res = await request(app)
        .get('/api/v1/profile/me')
        .set(testAuthHeaders(identity.userId, identity.displayName));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ displayName: 'Test User' });
    });
  });

  describe('PUT /api/v1/profile/me', () => {
    it.skipIf(skipReason !== undefined)('returns 401 when no identity is provided', async () => {
      const res = await request(app).put('/api/v1/profile/me').send({ displayName: 'Alice' });
      expect(res.status).toBe(401);
    });

    it.skipIf(skipReason !== undefined)(
      'returns 403 REGISTRATION_REQUIRED for unregistered user',
      async () => {
        const identity = FakeIdentity.random();
        const res = await request(app)
          .put('/api/v1/profile/me')
          .set(testAuthHeaders(identity.userId, identity.displayName))
          .send({ displayName: 'Alice' });

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: 'REGISTRATION_REQUIRED' });
      },
    );

    it.skipIf(skipReason !== undefined)('updates profile for registered user', async () => {
      const identity = FakeIdentity.random();
      // Sign up first
      await request(app)
        .post('/api/v1/signup')
        .set(testAuthHeaders(identity.userId, identity.displayName))
        .send({ displayName: 'Old Name' });

      const res = await request(app)
        .put('/api/v1/profile/me')
        .set(testAuthHeaders(identity.userId, identity.displayName))
        .send({ displayName: 'New Name' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ displayName: 'New Name' });
    });

    it.skipIf(skipReason !== undefined)('returns 400 when displayName is empty', async () => {
      const identity = FakeIdentity.random();
      // Sign up first
      await request(app)
        .post('/api/v1/signup')
        .set(testAuthHeaders(identity.userId, identity.displayName))
        .send({ displayName: 'Initial Name' });

      const res = await request(app)
        .put('/api/v1/profile/me')
        .set(testAuthHeaders(identity.userId, identity.displayName))
        .send({ displayName: '   ' });

      expect(res.status).toBe(400);
    });

    it.skipIf(skipReason !== undefined)('returns 400 when displayName is missing', async () => {
      const identity = FakeIdentity.random();
      // Sign up first
      await request(app)
        .post('/api/v1/signup')
        .set(testAuthHeaders(identity.userId, identity.displayName))
        .send({ displayName: 'Initial Name' });

      const res = await request(app)
        .put('/api/v1/profile/me')
        .set(testAuthHeaders(identity.userId, identity.displayName))
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/signup', () => {
    it.skipIf(skipReason !== undefined)('returns 401 when no identity is provided', async () => {
      const res = await request(app).post('/api/v1/signup').send({ displayName: 'Alice' });
      expect(res.status).toBe(401);
    });

    it.skipIf(skipReason !== undefined)('creates profile with valid data', async () => {
      const identity = FakeIdentity.random();
      const res = await request(app)
        .post('/api/v1/signup')
        .set(testAuthHeaders(identity.userId, identity.displayName))
        .send({ displayName: 'Alice' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: identity.userId, displayName: 'Alice' });
    });

    it.skipIf(skipReason !== undefined)('returns 409 when user is already registered', async () => {
      const identity = FakeIdentity.random();
      await request(app)
        .post('/api/v1/signup')
        .set(testAuthHeaders(identity.userId, identity.displayName))
        .send({ displayName: 'Alice' });

      const res = await request(app)
        .post('/api/v1/signup')
        .set(testAuthHeaders(identity.userId, identity.displayName))
        .send({ displayName: 'Alice Again' });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'ALREADY_REGISTERED' });
    });

    it.skipIf(skipReason !== undefined)('returns 400 when displayName is missing', async () => {
      const identity = FakeIdentity.random();
      const res = await request(app)
        .post('/api/v1/signup')
        .set(testAuthHeaders(identity.userId, identity.displayName))
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it.skipIf(skipReason !== undefined)('returns 400 when displayName is empty', async () => {
      const identity = FakeIdentity.random();
      const res = await request(app)
        .post('/api/v1/signup')
        .set(testAuthHeaders(identity.userId, identity.displayName))
        .send({ displayName: '   ' });

      expect(res.status).toBe(400);
    });

    it.skipIf(skipReason !== undefined)(
      'accessible to authenticated but unregistered users',
      async () => {
        const identity = FakeIdentity.random();
        // Before signup, the user should be able to reach the signup endpoint
        const res = await request(app)
          .post('/api/v1/signup')
          .set(testAuthHeaders(identity.userId, identity.displayName))
          .send({ displayName: 'NewUser' });

        expect(res.status).toBe(201);
      },
    );
  });

  describe('Registration gate', () => {
    it.skipIf(skipReason !== undefined)(
      'returns 403 REGISTRATION_REQUIRED for unregistered user on protected endpoints',
      async () => {
        const identity = FakeIdentity.random();
        const res = await request(app)
          .get('/api/v1/groups')
          .set(testAuthHeaders(identity.userId, identity.displayName));

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: 'REGISTRATION_REQUIRED' });
      },
    );

    it.skipIf(skipReason !== undefined)(
      'allows registered user to access protected endpoints',
      async () => {
        const identity = FakeIdentity.random();
        // Sign up first
        await request(app)
          .post('/api/v1/signup')
          .set(testAuthHeaders(identity.userId, identity.displayName))
          .send({ displayName: 'RegisteredUser' });

        const res = await request(app)
          .get('/api/v1/groups')
          .set(testAuthHeaders(identity.userId, identity.displayName));

        // Should pass registration gate (may still return 200 with empty list)
        expect(res.status).toBe(200);
      },
    );
  });
});
