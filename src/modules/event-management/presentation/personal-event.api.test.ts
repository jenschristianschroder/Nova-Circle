/**
 * Personal Event API tests.
 *
 * Tests all five personal event CRUD endpoints at the HTTP level:
 *   POST   /api/v1/events
 *   GET    /api/v1/events
 *   GET    /api/v1/events/:eventId
 *   PATCH  /api/v1/events/:eventId
 *   DELETE /api/v1/events/:eventId
 *
 * Covers: happy paths, input validation, authorization (owner-only),
 * non-owner access returns 404 (not 403), and owner auto-invite.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Knex } from 'knex';
import type Express from 'express';
import { createTestDb } from '../../../infrastructure/test-db.js';
import { createApp } from '../../../app.js';
import { testAuthHeaders } from '../../../shared/test-helpers/test-auth.js';
import { FakeIdentity } from '../../../shared/test-helpers/fake-identity.js';
import { KnexUserProfileRepository } from '../../identity-profile/infrastructure/knex-user-profile.repository.js';

interface EventBody {
  id: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string | null;
  groupId: string | null;
  ownerId: string;
  status: string;
}

interface ErrorBody {
  error: string;
  code: string;
}

const skipReason = !process.env['TEST_DATABASE_URL']
  ? 'TEST_DATABASE_URL is not set – skipping personal event API tests'
  : undefined;

describe('Personal Events API', () => {
  let db: Knex;
  let app: Express.Application;

  const owner = FakeIdentity.random();
  const otherUser = FakeIdentity.random();

  beforeAll(async () => {
    if (skipReason) return;
    db = createTestDb();
    await db.migrate.latest();
    app = createApp({ db });

    const profileRepo = new KnexUserProfileRepository(db);
    await profileRepo.upsert({ userId: owner.userId, displayName: owner.displayName });
    await profileRepo.upsert({ userId: otherUser.userId, displayName: otherUser.displayName });
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/events — Create personal event
  // ---------------------------------------------------------------------------

  describe('POST /api/v1/events', () => {
    it.skipIf(skipReason !== undefined)('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/api/v1/events')
        .send({ title: 'Unauthenticated Event', startAt: '2026-06-01T10:00:00Z' });
      expect(res.status).toBe(401);
    });

    it.skipIf(skipReason !== undefined)(
      'creates personal event with correct ownership',
      async () => {
        const res = await request(app)
          .post('/api/v1/events')
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ title: 'My Event', startAt: '2026-06-01T10:00:00Z' });

        expect(res.status).toBe(201);
        const body = res.body as EventBody;
        expect(body).toMatchObject({
          title: 'My Event',
          ownerId: owner.userId,
          status: 'scheduled',
        });
        expect(body.groupId).toBeNull();
      },
    );

    it.skipIf(skipReason !== undefined)('creates event with description and endAt', async () => {
      const res = await request(app)
        .post('/api/v1/events')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({
          title: 'Full Event',
          description: 'A description',
          startAt: '2026-06-01T10:00:00Z',
          endAt: '2026-06-01T12:00:00Z',
        });

      expect(res.status).toBe(201);
      const body = res.body as EventBody;
      expect(body.description).toBe('A description');
      expect(body.endAt).toBeTruthy();
    });

    it.skipIf(skipReason !== undefined)('returns 400 when title is missing', async () => {
      const res = await request(app)
        .post('/api/v1/events')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ startAt: '2026-06-01T10:00:00Z' });

      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).code).toBe('VALIDATION_ERROR');
    });

    it.skipIf(skipReason !== undefined)('returns 400 for empty title', async () => {
      const res = await request(app)
        .post('/api/v1/events')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: '', startAt: '2026-06-01T10:00:00Z' });

      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).code).toBe('VALIDATION_ERROR');
    });

    it.skipIf(skipReason !== undefined)(
      'returns 400 for title exceeding 200 characters',
      async () => {
        const longTitle = 'x'.repeat(201);
        const res = await request(app)
          .post('/api/v1/events')
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ title: longTitle, startAt: '2026-06-01T10:00:00Z' });

        expect(res.status).toBe(400);
        expect((res.body as ErrorBody).code).toBe('VALIDATION_ERROR');
      },
    );

    it.skipIf(skipReason !== undefined)('returns 400 when startAt is missing', async () => {
      const res = await request(app)
        .post('/api/v1/events')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: 'No Start' });

      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).code).toBe('VALIDATION_ERROR');
    });

    it.skipIf(skipReason !== undefined)('returns 400 when startAt is invalid', async () => {
      const res = await request(app)
        .post('/api/v1/events')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: 'Bad Start', startAt: 'not-a-date' });

      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).code).toBe('VALIDATION_ERROR');
    });

    it.skipIf(skipReason !== undefined)('returns 400 when endAt is before startAt', async () => {
      const res = await request(app)
        .post('/api/v1/events')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({
          title: 'Bad Dates',
          startAt: '2026-06-01T12:00:00Z',
          endAt: '2026-06-01T10:00:00Z',
        });

      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).code).toBe('VALIDATION_ERROR');
    });

    it.skipIf(skipReason !== undefined)('returns 400 when endAt is invalid', async () => {
      const res = await request(app)
        .post('/api/v1/events')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: 'Bad End', startAt: '2026-06-01T10:00:00Z', endAt: 'not-a-date' });

      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).code).toBe('VALIDATION_ERROR');
    });

    it.skipIf(skipReason !== undefined)('trims title whitespace', async () => {
      const res = await request(app)
        .post('/api/v1/events')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: '  Trimmed Title  ', startAt: '2026-06-01T10:00:00Z' });

      expect(res.status).toBe(201);
      expect((res.body as EventBody).title).toBe('Trimmed Title');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/events — List personal events
  // ---------------------------------------------------------------------------

  describe('GET /api/v1/events', () => {
    it.skipIf(skipReason !== undefined)('returns 401 without auth', async () => {
      const res = await request(app).get('/api/v1/events');
      expect(res.status).toBe(401);
    });

    it.skipIf(skipReason !== undefined)("returns only the caller's personal events", async () => {
      // Create events for both users
      await request(app)
        .post('/api/v1/events')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: 'Owner List Event', startAt: '2026-07-01T10:00:00Z' });

      await request(app)
        .post('/api/v1/events')
        .set(testAuthHeaders(otherUser.userId, otherUser.displayName))
        .send({ title: 'Other User Event', startAt: '2026-07-01T10:00:00Z' });

      const ownerRes = await request(app)
        .get('/api/v1/events')
        .set(testAuthHeaders(owner.userId, owner.displayName));

      expect(ownerRes.status).toBe(200);
      expect(Array.isArray(ownerRes.body)).toBe(true);

      const ownerEvents = ownerRes.body as EventBody[];
      for (const evt of ownerEvents) {
        expect(evt.ownerId).toBe(owner.userId);
      }
      // Other user's event should not appear
      expect(ownerEvents.some((e) => e.title === 'Other User Event')).toBe(false);
    });

    it.skipIf(skipReason !== undefined)('supports from/to date range filtering', async () => {
      // Create events at different times
      await request(app)
        .post('/api/v1/events')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: 'January Event', startAt: '2027-01-15T10:00:00Z' });

      await request(app)
        .post('/api/v1/events')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: 'March Event', startAt: '2027-03-15T10:00:00Z' });

      // Filter to February–April range (should include March but not January)
      const res = await request(app)
        .get('/api/v1/events')
        .query({ from: '2027-02-01T00:00:00Z', to: '2027-04-01T00:00:00Z' })
        .set(testAuthHeaders(owner.userId, owner.displayName));

      expect(res.status).toBe(200);
      const events = res.body as EventBody[];
      expect(events.some((e) => e.title === 'March Event')).toBe(true);
      expect(events.some((e) => e.title === 'January Event')).toBe(false);
    });

    it.skipIf(skipReason !== undefined)('returns empty array when no events exist', async () => {
      const freshUser = FakeIdentity.random();
      const profileRepo = new KnexUserProfileRepository(db);
      await profileRepo.upsert({
        userId: freshUser.userId,
        displayName: freshUser.displayName,
      });

      const res = await request(app)
        .get('/api/v1/events')
        .set(testAuthHeaders(freshUser.userId, freshUser.displayName));

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/events/:eventId — Get personal event detail
  // ---------------------------------------------------------------------------

  describe('GET /api/v1/events/:eventId', () => {
    let eventId: string;

    beforeAll(async () => {
      if (skipReason) return;
      const res = await request(app)
        .post('/api/v1/events')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: 'Get Detail Event', startAt: '2026-08-01T10:00:00Z' });
      eventId = (res.body as EventBody).id;
    });

    it.skipIf(skipReason !== undefined)('returns 401 without auth', async () => {
      const res = await request(app).get(`/api/v1/events/${eventId}`);
      expect(res.status).toBe(401);
    });

    it.skipIf(skipReason !== undefined)('returns event for owner', async () => {
      const res = await request(app)
        .get(`/api/v1/events/${eventId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName));

      expect(res.status).toBe(200);
      const body = res.body as EventBody;
      expect(body).toMatchObject({
        id: eventId,
        title: 'Get Detail Event',
        ownerId: owner.userId,
      });
      expect(body.groupId).toBeNull();
    });

    it.skipIf(skipReason !== undefined)(
      'returns 404 for non-owner (no information disclosure)',
      async () => {
        const res = await request(app)
          .get(`/api/v1/events/${eventId}`)
          .set(testAuthHeaders(otherUser.userId, otherUser.displayName));

        expect(res.status).toBe(404);
        expect(res.body as ErrorBody).toEqual({ error: 'Not found', code: 'NOT_FOUND' });
      },
    );

    it.skipIf(skipReason !== undefined)('returns 404 for non-existent event', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000000';
      const res = await request(app)
        .get(`/api/v1/events/${fakeId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName));

      expect(res.status).toBe(404);
    });

    it.skipIf(skipReason !== undefined)('returns 404 for invalid UUID', async () => {
      const res = await request(app)
        .get('/api/v1/events/not-a-uuid')
        .set(testAuthHeaders(owner.userId, owner.displayName));

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/v1/events/:eventId — Update personal event
  // ---------------------------------------------------------------------------

  describe('PATCH /api/v1/events/:eventId', () => {
    let eventId: string;

    beforeAll(async () => {
      if (skipReason) return;
      const res = await request(app)
        .post('/api/v1/events')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: 'Updatable Event', startAt: '2026-09-01T10:00:00Z' });
      eventId = (res.body as EventBody).id;
    });

    it.skipIf(skipReason !== undefined)('returns 401 without auth', async () => {
      const res = await request(app).patch(`/api/v1/events/${eventId}`).send({ title: 'Updated' });
      expect(res.status).toBe(401);
    });

    it.skipIf(skipReason !== undefined)('updates title for owner', async () => {
      const res = await request(app)
        .patch(`/api/v1/events/${eventId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(200);
      expect((res.body as EventBody).title).toBe('Updated Title');
    });

    it.skipIf(skipReason !== undefined)('updates description for owner', async () => {
      const res = await request(app)
        .patch(`/api/v1/events/${eventId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ description: 'New description' });

      expect(res.status).toBe(200);
      expect((res.body as EventBody).description).toBe('New description');
    });

    it.skipIf(skipReason !== undefined)('updates startAt and endAt for owner', async () => {
      const res = await request(app)
        .patch(`/api/v1/events/${eventId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ startAt: '2026-09-01T11:00:00Z', endAt: '2026-09-01T13:00:00Z' });

      expect(res.status).toBe(200);
      const body = res.body as EventBody;
      expect(new Date(body.startAt).toISOString()).toBe('2026-09-01T11:00:00.000Z');
      expect(new Date(body.endAt as string).toISOString()).toBe('2026-09-01T13:00:00.000Z');
    });

    it.skipIf(skipReason !== undefined)(
      'returns 404 for non-owner (no information disclosure)',
      async () => {
        const res = await request(app)
          .patch(`/api/v1/events/${eventId}`)
          .set(testAuthHeaders(otherUser.userId, otherUser.displayName))
          .send({ title: 'Hijacked' });

        expect(res.status).toBe(404);
        expect(res.body as ErrorBody).toEqual({ error: 'Not found', code: 'NOT_FOUND' });
      },
    );

    it.skipIf(skipReason !== undefined)('returns 400 for empty title', async () => {
      const res = await request(app)
        .patch(`/api/v1/events/${eventId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: '' });

      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).code).toBe('VALIDATION_ERROR');
    });

    it.skipIf(skipReason !== undefined)(
      'returns 400 for title exceeding 200 characters',
      async () => {
        const longTitle = 'x'.repeat(201);
        const res = await request(app)
          .patch(`/api/v1/events/${eventId}`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ title: longTitle });

        expect(res.status).toBe(400);
        expect((res.body as ErrorBody).code).toBe('VALIDATION_ERROR');
      },
    );

    it.skipIf(skipReason !== undefined)('returns 400 for invalid startAt', async () => {
      const res = await request(app)
        .patch(`/api/v1/events/${eventId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ startAt: 'not-a-date' });

      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).code).toBe('VALIDATION_ERROR');
    });

    it.skipIf(skipReason !== undefined)('returns 400 when endAt is before startAt', async () => {
      const res = await request(app)
        .patch(`/api/v1/events/${eventId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ startAt: '2026-09-01T14:00:00Z', endAt: '2026-09-01T10:00:00Z' });

      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).code).toBe('VALIDATION_ERROR');
    });

    it.skipIf(skipReason !== undefined)('returns 404 for non-existent event', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000000';
      const res = await request(app)
        .patch(`/api/v1/events/${fakeId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: 'Ghost' });

      expect(res.status).toBe(404);
    });

    it.skipIf(skipReason !== undefined)('returns 404 for invalid UUID', async () => {
      const res = await request(app)
        .patch('/api/v1/events/not-a-uuid')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: 'Whatever' });

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/v1/events/:eventId — Delete personal event
  // ---------------------------------------------------------------------------

  describe('DELETE /api/v1/events/:eventId', () => {
    it.skipIf(skipReason !== undefined)('returns 401 without auth', async () => {
      // Create an event first to have a valid ID
      const createRes = await request(app)
        .post('/api/v1/events')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: 'Delete Auth Test', startAt: '2026-10-01T10:00:00Z' });
      const eventId = (createRes.body as EventBody).id;

      const res = await request(app).delete(`/api/v1/events/${eventId}`);
      expect(res.status).toBe(401);
    });

    it.skipIf(skipReason !== undefined)('deletes event for owner and returns 204', async () => {
      const createRes = await request(app)
        .post('/api/v1/events')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: 'To Be Deleted', startAt: '2026-10-02T10:00:00Z' });
      const eventId = (createRes.body as EventBody).id;

      const deleteRes = await request(app)
        .delete(`/api/v1/events/${eventId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName));

      expect(deleteRes.status).toBe(204);

      // Event should no longer be accessible
      const getRes = await request(app)
        .get(`/api/v1/events/${eventId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName));
      expect(getRes.status).toBe(404);
    });

    it.skipIf(skipReason !== undefined)(
      'returns 404 for non-owner (no information disclosure)',
      async () => {
        const createRes = await request(app)
          .post('/api/v1/events')
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ title: 'Owner Only Delete', startAt: '2026-10-03T10:00:00Z' });
        const eventId = (createRes.body as EventBody).id;

        const res = await request(app)
          .delete(`/api/v1/events/${eventId}`)
          .set(testAuthHeaders(otherUser.userId, otherUser.displayName));

        expect(res.status).toBe(404);
        expect(res.body as ErrorBody).toEqual({ error: 'Not found', code: 'NOT_FOUND' });

        // Event should still exist for the owner
        const getRes = await request(app)
          .get(`/api/v1/events/${eventId}`)
          .set(testAuthHeaders(owner.userId, owner.displayName));
        expect(getRes.status).toBe(200);
      },
    );

    it.skipIf(skipReason !== undefined)('returns 404 for non-existent event', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000000';
      const res = await request(app)
        .delete(`/api/v1/events/${fakeId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName));

      expect(res.status).toBe(404);
    });

    it.skipIf(skipReason !== undefined)('returns 404 for invalid UUID', async () => {
      const res = await request(app)
        .delete('/api/v1/events/not-a-uuid')
        .set(testAuthHeaders(owner.userId, owner.displayName));

      expect(res.status).toBe(404);
    });

    it.skipIf(skipReason !== undefined)(
      'deleting a shared personal event succeeds — shares are revoked automatically',
      async () => {
        // Create a group and a personal event
        const groupRes = await request(app)
          .post('/api/v1/groups')
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ name: 'Share-Delete Test Group' });
        const groupId = (groupRes.body as { id: string }).id;

        const createRes = await request(app)
          .post('/api/v1/events')
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ title: 'Shared Event To Delete', startAt: '2026-12-15T10:00:00Z' });
        const eventId = (createRes.body as EventBody).id;

        // Share the event to the group
        const shareRes = await request(app)
          .post(`/api/v1/events/${eventId}/shares`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ groupId, visibilityLevel: 'details' });
        expect(shareRes.status).toBe(201);

        // Now delete the event — should succeed (shares revoked first)
        const deleteRes = await request(app)
          .delete(`/api/v1/events/${eventId}`)
          .set(testAuthHeaders(owner.userId, owner.displayName));
        expect(deleteRes.status).toBe(204);

        // Event should no longer be accessible
        const getRes = await request(app)
          .get(`/api/v1/events/${eventId}`)
          .set(testAuthHeaders(owner.userId, owner.displayName));
        expect(getRes.status).toBe(404);
      },
    );
  });

  // ---------------------------------------------------------------------------
  // Owner auto-invite verification
  // ---------------------------------------------------------------------------

  describe('Owner auto-invite', () => {
    it.skipIf(skipReason !== undefined)(
      'owner is auto-invited when creating a personal event',
      async () => {
        const createRes = await request(app)
          .post('/api/v1/events')
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ title: 'Auto-Invite Check', startAt: '2026-11-01T10:00:00Z' });

        expect(createRes.status).toBe(201);
        const eventId = (createRes.body as EventBody).id;

        // Verify via the invitation table that the owner has access
        const rows = await db('event_invitations')
          .where({ event_id: eventId, user_id: owner.userId })
          .whereNot('status', 'removed');
        expect(rows.length).toBe(1);
        expect((rows[0] as { status: string }).status).toBe('invited');
      },
    );
  });

  // ---------------------------------------------------------------------------
  // Personal events do not appear in group listings
  // ---------------------------------------------------------------------------

  describe('Group isolation', () => {
    it.skipIf(skipReason !== undefined)(
      'personal events do not appear in group event listings',
      async () => {
        // Create a group
        const groupRes = await request(app)
          .post('/api/v1/groups')
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ name: 'Isolation Test Group' });
        const groupId = (groupRes.body as { id: string }).id;

        // Create a personal event
        const personalRes = await request(app)
          .post('/api/v1/events')
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ title: 'Personal Only', startAt: '2026-12-01T10:00:00Z' });
        const personalEventId = (personalRes.body as EventBody).id;

        // List group events
        const listRes = await request(app)
          .get(`/api/v1/groups/${groupId}/events`)
          .set(testAuthHeaders(owner.userId, owner.displayName));

        expect(listRes.status).toBe(200);
        const listBody = listRes.body as { events: { id: string }[] };
        expect(Array.isArray(listBody.events)).toBe(true);
        expect(listBody.events.map((e) => e.id)).not.toContain(personalEventId);
      },
    );
  });

  // ---------------------------------------------------------------------------
  // Transfer event ownership
  // ---------------------------------------------------------------------------

  describe('POST /api/v1/events/:eventId/transfer-ownership', () => {
    it.skipIf(skipReason !== undefined)(
      'transfers ownership to another user and records audit entry',
      async () => {
        // Create event owned by `owner`
        const createRes = await request(app)
          .post('/api/v1/events')
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ title: 'Transfer Me', startAt: '2026-11-01T10:00:00Z' });
        expect(createRes.status).toBe(201);
        const eventId = (createRes.body as EventBody).id;

        // Transfer to otherUser
        const transferRes = await request(app)
          .post(`/api/v1/events/${eventId}/transfer-ownership`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ newOwnerId: otherUser.userId });
        expect(transferRes.status).toBe(200);
        expect((transferRes.body as EventBody).ownerId).toBe(otherUser.userId);

        // Verify audit trail
        interface AuditRow {
          actor_id: string;
          metadata: { previousOwnerId: string; newOwnerId: string };
        }
        const auditRows = await db('audit_log')
          .where({ action: 'event.ownership_transferred', resource_id: eventId })
          .select('*');
        expect(auditRows.length).toBe(1);
        const auditRow = auditRows[0] as AuditRow;
        expect(auditRow.actor_id).toBe(owner.userId);
        expect(auditRow.metadata.previousOwnerId).toBe(owner.userId);
        expect(auditRow.metadata.newOwnerId).toBe(otherUser.userId);
      },
    );

    it.skipIf(skipReason !== undefined)(
      'returns 404 for non-owner',
      async () => {
        const createRes = await request(app)
          .post('/api/v1/events')
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ title: 'Not Yours', startAt: '2026-11-01T10:00:00Z' });
        const eventId = (createRes.body as EventBody).id;

        const transferRes = await request(app)
          .post(`/api/v1/events/${eventId}/transfer-ownership`)
          .set(testAuthHeaders(otherUser.userId, otherUser.displayName))
          .send({ newOwnerId: otherUser.userId });
        expect(transferRes.status).toBe(404);
      },
    );

    it.skipIf(skipReason !== undefined)(
      'returns 400 when newOwnerId is missing or invalid',
      async () => {
        const createRes = await request(app)
          .post('/api/v1/events')
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ title: 'Bad Transfer', startAt: '2026-11-01T10:00:00Z' });
        const eventId = (createRes.body as EventBody).id;

        const missingRes = await request(app)
          .post(`/api/v1/events/${eventId}/transfer-ownership`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({});
        expect(missingRes.status).toBe(400);
        expect((missingRes.body as ErrorBody).code).toBe('VALIDATION_ERROR');

        const invalidRes = await request(app)
          .post(`/api/v1/events/${eventId}/transfer-ownership`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ newOwnerId: 'not-a-uuid' });
        expect(invalidRes.status).toBe(400);
      },
    );

    it.skipIf(skipReason !== undefined)(
      'returns 400 when transferring to the same owner',
      async () => {
        const createRes = await request(app)
          .post('/api/v1/events')
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ title: 'Same Owner', startAt: '2026-11-01T10:00:00Z' });
        const eventId = (createRes.body as EventBody).id;

        const transferRes = await request(app)
          .post(`/api/v1/events/${eventId}/transfer-ownership`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ newOwnerId: owner.userId });
        expect(transferRes.status).toBe(400);
        expect((transferRes.body as ErrorBody).code).toBe('VALIDATION_ERROR');
      },
    );

    it.skipIf(skipReason !== undefined)(
      'returns 404 for non-existent event',
      async () => {
        const fakeId = '00000000-0000-4000-8000-000000000099';
        const transferRes = await request(app)
          .post(`/api/v1/events/${fakeId}/transfer-ownership`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ newOwnerId: otherUser.userId });
        expect(transferRes.status).toBe(404);
      },
    );

    it.skipIf(skipReason !== undefined)(
      'returns 404 for invalid UUID in path',
      async () => {
        const transferRes = await request(app)
          .post('/api/v1/events/not-a-uuid/transfer-ownership')
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ newOwnerId: otherUser.userId });
        expect(transferRes.status).toBe(404);
      },
    );
  });
});
