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

describe('Event Checklist API', () => {
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
      .send({ name: 'Checklist Test Group' });
    groupId = (groupRes.body as { id: string }).id;

    // Add member.
    await request(app)
      .post(`/api/v1/groups/${groupId}/members`)
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ userId: member.userId, role: 'member' });

    // Create event.
    const eventRes = await request(app)
      .post(`/api/v1/groups/${groupId}/events`)
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ title: 'Checklist Test Event', startAt: '2026-07-01T10:00:00Z' });
    eventId = (eventRes.body as { id: string }).id;
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  it.skipIf(skipReason !== undefined)('GET returns 401 without auth', async () => {
    const res = await request(app).get(`/api/v1/events/${eventId}/checklist`);
    expect(res.status).toBe(401);
  });

  it.skipIf(skipReason !== undefined)('GET returns 404 for non-invited user', async () => {
    const res = await request(app)
      .get(`/api/v1/events/${eventId}/checklist`)
      .set(testAuthHeaders(outsider.userId, outsider.displayName));
    expect(res.status).toBe(404);
  });

  it.skipIf(skipReason !== undefined)('GET returns empty checklist for invited user', async () => {
    const res = await request(app)
      .get(`/api/v1/events/${eventId}/checklist`)
      .set(testAuthHeaders(owner.userId, owner.displayName));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ checklist: null, items: [] });
  });

  it.skipIf(skipReason !== undefined)('POST adds a checklist item (201)', async () => {
    const res = await request(app)
      .post(`/api/v1/events/${eventId}/checklist/items`)
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ text: 'Buy snacks' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      text: 'Buy snacks',
      isDone: false,
      createdByUserId: owner.userId,
    });
  });

  it.skipIf(skipReason !== undefined)('POST returns 400 for empty text', async () => {
    const res = await request(app)
      .post(`/api/v1/events/${eventId}/checklist/items`)
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ text: '' });
    expect(res.status).toBe(400);
  });

  it.skipIf(skipReason !== undefined)('GET returns items after adding', async () => {
    const res = await request(app)
      .get(`/api/v1/events/${eventId}/checklist`)
      .set(testAuthHeaders(owner.userId, owner.displayName));
    expect(res.status).toBe(200);
    const body = res.body as { items: Record<string, unknown>[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ text: 'Buy snacks' });
  });

  it.skipIf(skipReason !== undefined)('invited member can also read checklist', async () => {
    const res = await request(app)
      .get(`/api/v1/events/${eventId}/checklist`)
      .set(testAuthHeaders(member.userId, member.displayName));
    expect(res.status).toBe(200);
    const body = res.body as { items: unknown[] };
    expect(body.items).toHaveLength(1);
  });

  it.skipIf(skipReason !== undefined)('POST mark item done', async () => {
    // First get item id.
    const listRes = await request(app)
      .get(`/api/v1/events/${eventId}/checklist`)
      .set(testAuthHeaders(owner.userId, owner.displayName));
    const listBody = listRes.body as { items: Array<{ id: string }> };
    const itemId = listBody.items[0]!.id;

    const res = await request(app)
      .post(`/api/v1/events/${eventId}/checklist/items/${itemId}/complete`)
      .set(testAuthHeaders(owner.userId, owner.displayName));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isDone: true });
    const doneBody = res.body as { completedByUserId: string };
    expect(doneBody.completedByUserId).toBe(owner.userId);
  });

  it.skipIf(skipReason !== undefined)('DELETE mark item undone', async () => {
    const listRes = await request(app)
      .get(`/api/v1/events/${eventId}/checklist`)
      .set(testAuthHeaders(owner.userId, owner.displayName));
    const listBody = listRes.body as { items: Array<{ id: string }> };
    const itemId = listBody.items[0]!.id;

    const res = await request(app)
      .delete(`/api/v1/events/${eventId}/checklist/items/${itemId}/complete`)
      .set(testAuthHeaders(owner.userId, owner.displayName));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isDone: false, completedAt: null });
  });

  it.skipIf(skipReason !== undefined)('DELETE item removes it (204)', async () => {
    const listRes = await request(app)
      .get(`/api/v1/events/${eventId}/checklist`)
      .set(testAuthHeaders(owner.userId, owner.displayName));
    const listBody = listRes.body as { items: Array<{ id: string }> };
    const itemId = listBody.items[0]!.id;

    const res = await request(app)
      .delete(`/api/v1/events/${eventId}/checklist/items/${itemId}`)
      .set(testAuthHeaders(owner.userId, owner.displayName));
    expect(res.status).toBe(204);

    const afterRes = await request(app)
      .get(`/api/v1/events/${eventId}/checklist`)
      .set(testAuthHeaders(owner.userId, owner.displayName));
    const afterBody = afterRes.body as { items: unknown[] };
    expect(afterBody.items).toHaveLength(0);
  });

  it.skipIf(skipReason !== undefined)(
    'group event list does not include checklist data',
    async () => {
      const res = await request(app)
        .get(`/api/v1/groups/${groupId}/events`)
        .set(testAuthHeaders(owner.userId, owner.displayName));
      expect(res.status).toBe(200);
      const events = (res.body as { events: unknown[] }).events;
      for (const ev of events) {
        expect(ev).not.toHaveProperty('checklist');
        expect(ev).not.toHaveProperty('items');
      }
    },
  );
});
