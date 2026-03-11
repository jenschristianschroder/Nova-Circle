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

describe('Event Location API', () => {
  let db: Knex;
  let app: Express.Application;

  const owner = FakeIdentity.random();
  const member = FakeIdentity.random();
  const outsider = FakeIdentity.random();

  let groupId: string;
  let eventId: string;

  beforeAll(async () => {
    if (skipReason) return;
    db = createTestDb();
    await db.migrate.latest();
    app = createApp({ db });

    const profileRepo = new KnexUserProfileRepository(db);
    await profileRepo.upsert({ userId: owner.userId, displayName: owner.displayName });
    await profileRepo.upsert({ userId: member.userId, displayName: member.displayName });
    await profileRepo.upsert({ userId: outsider.userId, displayName: outsider.displayName });

    // Create group.
    const groupRes = await request(app)
      .post('/api/v1/groups')
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ name: 'Location Test Group' });
    groupId = (groupRes.body as { id: string }).id;

    // Add member.
    await request(app)
      .post(`/api/v1/groups/${groupId}/members`)
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ userId: member.userId, role: 'member' });

    // Create event (owner + member are invited by default).
    const eventRes = await request(app)
      .post(`/api/v1/groups/${groupId}/events`)
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ title: 'Location Test Event', startAt: '2026-07-01T10:00:00Z' });
    eventId = (eventRes.body as { id: string }).id;
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  it.skipIf(skipReason !== undefined)('GET returns 401 without auth', async () => {
    const res = await request(app).get(`/api/v1/events/${eventId}/location`);
    expect(res.status).toBe(401);
  });

  it.skipIf(skipReason !== undefined)('GET returns 404 for non-invited user', async () => {
    const res = await request(app)
      .get(`/api/v1/events/${eventId}/location`)
      .set(testAuthHeaders(outsider.userId, outsider.displayName));
    expect(res.status).toBe(404);
  });

  it.skipIf(skipReason !== undefined)(
    'GET returns { location: null } when no location set',
    async () => {
      const res = await request(app)
        .get(`/api/v1/events/${eventId}/location`)
        .set(testAuthHeaders(owner.userId, owner.displayName));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ location: null });
    },
  );

  it.skipIf(skipReason !== undefined)('PUT returns 400 for invalid data', async () => {
    const res = await request(app)
      .put(`/api/v1/events/${eventId}/location`)
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ locationType: 'virtual' }); // missing virtualMeetingUrl
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it.skipIf(skipReason !== undefined)('PUT returns 403 for non-creator non-admin invitee', async () => {
    const res = await request(app)
      .put(`/api/v1/events/${eventId}/location`)
      .set(testAuthHeaders(member.userId, member.displayName))
      .send({ locationType: 'physical', displayText: 'Test Hall' });
    expect(res.status).toBe(403);
  });

  it.skipIf(skipReason !== undefined)('PUT sets location for event creator', async () => {
    const res = await request(app)
      .put(`/api/v1/events/${eventId}/location`)
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({
        locationType: 'physical',
        displayText: 'Main Conference Room',
        city: 'Copenhagen',
        countryCode: 'DK',
      });
    expect(res.status).toBe(200);
    const putBody = res.body as { location: Record<string, unknown> };
    expect(putBody.location).toMatchObject({
      locationType: 'physical',
      displayText: 'Main Conference Room',
      city: 'Copenhagen',
      countryCode: 'DK',
      eventId,
    });
  });

  it.skipIf(skipReason !== undefined)('GET returns location after PUT', async () => {
    const res = await request(app)
      .get(`/api/v1/events/${eventId}/location`)
      .set(testAuthHeaders(owner.userId, owner.displayName));
    expect(res.status).toBe(200);
    const body = res.body as { location: Record<string, unknown> };
    expect(body.location).toMatchObject({
      locationType: 'physical',
      displayText: 'Main Conference Room',
    });
  });

  it.skipIf(skipReason !== undefined)('invited member can read location', async () => {
    const res = await request(app)
      .get(`/api/v1/events/${eventId}/location`)
      .set(testAuthHeaders(member.userId, member.displayName));
    expect(res.status).toBe(200);
    const body = res.body as { location: unknown };
    expect(body.location).not.toBeNull();
  });

  it.skipIf(skipReason !== undefined)('DELETE removes location (204)', async () => {
    const res = await request(app)
      .delete(`/api/v1/events/${eventId}/location`)
      .set(testAuthHeaders(owner.userId, owner.displayName));
    expect(res.status).toBe(204);
  });

  it.skipIf(skipReason !== undefined)('GET returns null after DELETE', async () => {
    const res = await request(app)
      .get(`/api/v1/events/${eventId}/location`)
      .set(testAuthHeaders(owner.userId, owner.displayName));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ location: null });
  });

  it.skipIf(skipReason !== undefined)(
    'group event list does not include location data',
    async () => {
      const res = await request(app)
        .get(`/api/v1/groups/${groupId}/events`)
        .set(testAuthHeaders(owner.userId, owner.displayName));
      expect(res.status).toBe(200);
      const events = res.body as unknown[];
      for (const ev of events) {
        expect(ev).not.toHaveProperty('location');
      }
    },
  );
});
