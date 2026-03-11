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

describe('Event Chat API', () => {
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
      .send({ name: 'Chat Test Group' });
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
      .send({ title: 'Chat Test Event', startAt: '2026-07-01T10:00:00Z' });
    eventId = (eventRes.body as { id: string }).id;
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  it.skipIf(skipReason !== undefined)('GET messages returns 401 without auth', async () => {
    const res = await request(app).get(`/api/v1/events/${eventId}/chat/messages`);
    expect(res.status).toBe(401);
  });

  it.skipIf(skipReason !== undefined)('GET returns 404 for non-invited user', async () => {
    const res = await request(app)
      .get(`/api/v1/events/${eventId}/chat/messages`)
      .set(testAuthHeaders(outsider.userId, outsider.displayName));
    expect(res.status).toBe(404);
  });

  it.skipIf(skipReason !== undefined)('GET returns empty messages for invited user', async () => {
    const res = await request(app)
      .get(`/api/v1/events/${eventId}/chat/messages`)
      .set(testAuthHeaders(owner.userId, owner.displayName));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ messages: [] });
  });

  it.skipIf(skipReason !== undefined)('POST returns 400 for missing content', async () => {
    const res = await request(app)
      .post(`/api/v1/events/${eventId}/chat/messages`)
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({});
    expect(res.status).toBe(400);
  });

  it.skipIf(skipReason !== undefined)('POST returns 404 for non-invited user', async () => {
    const res = await request(app)
      .post(`/api/v1/events/${eventId}/chat/messages`)
      .set(testAuthHeaders(outsider.userId, outsider.displayName))
      .send({ content: 'Hello!' });
    expect(res.status).toBe(404);
  });

  it.skipIf(skipReason !== undefined)('POST creates message (201)', async () => {
    const res = await request(app)
      .post(`/api/v1/events/${eventId}/chat/messages`)
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ content: 'Hello everyone!' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      content: 'Hello everyone!',
      authorUserId: owner.userId,
      deletedAt: null,
    });
  });

  it.skipIf(skipReason !== undefined)('invited member can also post and read', async () => {
    const postRes = await request(app)
      .post(`/api/v1/events/${eventId}/chat/messages`)
      .set(testAuthHeaders(member.userId, member.displayName))
      .send({ content: 'Hi from member!' });
    expect(postRes.status).toBe(201);

    const getRes = await request(app)
      .get(`/api/v1/events/${eventId}/chat/messages`)
      .set(testAuthHeaders(member.userId, member.displayName));
    expect(getRes.status).toBe(200);
    const getBody = getRes.body as { messages: unknown[] };
    expect(getBody.messages.length).toBeGreaterThanOrEqual(2);
  });

  it.skipIf(skipReason !== undefined)('PUT edits own message', async () => {
    // Post a message to edit.
    const postRes = await request(app)
      .post(`/api/v1/events/${eventId}/chat/messages`)
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ content: 'Original content' });
    const msgId = (postRes.body as { id: string }).id;

    const editRes = await request(app)
      .put(`/api/v1/events/${eventId}/chat/messages/${msgId}`)
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ content: 'Edited content' });
    expect(editRes.status).toBe(200);
    expect(editRes.body).toMatchObject({ content: 'Edited content' });
    const editBody = editRes.body as { editedAt: string | null };
    expect(editBody.editedAt).not.toBeNull();
  });

  it.skipIf(skipReason !== undefined)('PUT returns 403 when editing another user message', async () => {
    const postRes = await request(app)
      .post(`/api/v1/events/${eventId}/chat/messages`)
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ content: 'Owner message' });
    const msgId = (postRes.body as { id: string }).id;

    const editRes = await request(app)
      .put(`/api/v1/events/${eventId}/chat/messages/${msgId}`)
      .set(testAuthHeaders(member.userId, member.displayName))
      .send({ content: 'Hacked content' });
    expect(editRes.status).toBe(403);
  });

  it.skipIf(skipReason !== undefined)('DELETE soft-deletes own message', async () => {
    const postRes = await request(app)
      .post(`/api/v1/events/${eventId}/chat/messages`)
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ content: 'To be deleted' });
    const msgId = (postRes.body as { id: string }).id;

    const delRes = await request(app)
      .delete(`/api/v1/events/${eventId}/chat/messages/${msgId}`)
      .set(testAuthHeaders(owner.userId, owner.displayName));
    expect(delRes.status).toBe(200);
    const delBody = delRes.body as { deletedAt: string | null };
    expect(delBody.deletedAt).not.toBeNull();

    // Deleted message should not appear in list.
    const listRes = await request(app)
      .get(`/api/v1/events/${eventId}/chat/messages`)
      .set(testAuthHeaders(owner.userId, owner.displayName));
    const messages = (listRes.body as { messages: Array<{ id: string }> }).messages;
    expect(messages.find((m) => m.id === msgId)).toBeUndefined();
  });

  it.skipIf(skipReason !== undefined)(
    'group event list does not include chat data',
    async () => {
      const res = await request(app)
        .get(`/api/v1/groups/${groupId}/events`)
        .set(testAuthHeaders(owner.userId, owner.displayName));
      expect(res.status).toBe(200);
      const events = res.body as unknown[];
      for (const ev of events) {
        expect(ev).not.toHaveProperty('messages');
        expect(ev).not.toHaveProperty('chat');
      }
    },
  );
});
