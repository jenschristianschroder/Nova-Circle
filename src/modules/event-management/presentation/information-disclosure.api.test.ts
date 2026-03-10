/**
 * Information-disclosure regression tests.
 *
 * These tests verify that the API never leaks event existence, content, or
 * counts to unauthorized callers – regardless of their relationship to the
 * group.  Every scenario that could hint at a hidden event is covered here
 * as a dedicated regression suite.
 *
 * Privacy rules enforced:
 * - Non-invited users receive NOT_FOUND (404), never FORBIDDEN (403)
 * - Error response bodies contain no event IDs, titles, or private content
 * - List endpoints never expose counts or summaries of inaccessible events
 * - Newly joined members do not gain access to historic events
 * - Former invitees with 'removed' status receive NOT_FOUND
 * - Events from one group are not accessible via another group's URL
 * - All error responses follow the { error, code } shape with no extra fields
 */
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
  ? 'TEST_DATABASE_URL is not set – skipping information-disclosure regression tests'
  : undefined;

describe('Information-disclosure regression tests', () => {
  let db: Knex;
  let app: Express.Application;

  const owner = FakeIdentity.random();
  const member = FakeIdentity.random();
  const outsider = FakeIdentity.random();
  const lateJoiner = FakeIdentity.random();

  let groupId: string;
  let otherGroupId: string;

  beforeAll(async () => {
    if (skipReason) return;
    db = createTestDb();
    await db.migrate.latest();
    app = createApp({ db });

    const profileRepo = new KnexUserProfileRepository(db);
    await profileRepo.upsert({ userId: owner.userId, displayName: owner.displayName });
    await profileRepo.upsert({ userId: member.userId, displayName: member.displayName });
    await profileRepo.upsert({ userId: outsider.userId, displayName: outsider.displayName });
    await profileRepo.upsert({ userId: lateJoiner.userId, displayName: lateJoiner.displayName });

    // Create the primary group with owner + member.
    const groupRes = await request(app)
      .post('/api/v1/groups')
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ name: 'Disclosure Test Group' });
    groupId = (groupRes.body as { id: string }).id;

    await request(app)
      .post(`/api/v1/groups/${groupId}/members`)
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ userId: member.userId, role: 'member' });

    // Create a second group owned by owner (for cross-group tests).
    const otherGroupRes = await request(app)
      .post('/api/v1/groups')
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ name: 'Other Group' });
    otherGroupId = (otherGroupRes.body as { id: string }).id;
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Error response shape – no private data leaked
  // ─────────────────────────────────────────────────────────────────────────

  describe('Error response shape', () => {
    it.skipIf(skipReason !== undefined)(
      '404 response body contains only { error, code } – no event content',
      async () => {
        const secretEventRes = await request(app)
          .post(`/api/v1/groups/${groupId}/events`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({
            title: 'Top Secret Event Title',
            startAt: '2026-12-01T10:00:00Z',
            excludeUserIds: [member.userId],
          });
        const secretEventId = (secretEventRes.body as { id: string }).id;

        // member has no invitation – should receive NOT_FOUND
        const res = await request(app)
          .get(`/api/v1/groups/${groupId}/events/${secretEventId}`)
          .set(testAuthHeaders(member.userId, member.displayName));

        expect(res.status).toBe(404);

        // Response body must only have { error, code } – no event data
        expect(Object.keys(res.body as object).sort()).toEqual(['code', 'error']);
        expect((res.body as { code: string }).code).toBe('NOT_FOUND');
        expect((res.body as { error: string }).error).toBe('Not found');

        // The response must not contain the event title, ID, or any content
        const bodyStr = JSON.stringify(res.body);
        expect(bodyStr).not.toContain('Top Secret Event Title');
        expect(bodyStr).not.toContain(secretEventId);
      },
    );

    it.skipIf(skipReason !== undefined)(
      '404 for outsider contains no event content',
      async () => {
        const eventRes = await request(app)
          .post(`/api/v1/groups/${groupId}/events`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ title: 'Owner Only Event', startAt: '2026-12-02T10:00:00Z' });
        const eventId = (eventRes.body as { id: string }).id;

        const res = await request(app)
          .get(`/api/v1/groups/${groupId}/events/${eventId}`)
          .set(testAuthHeaders(outsider.userId, outsider.displayName));

        expect(res.status).toBe(404);
        expect(Object.keys(res.body as object).sort()).toEqual(['code', 'error']);
        const bodyStr = JSON.stringify(res.body);
        expect(bodyStr).not.toContain(eventId);
        expect(bodyStr).not.toContain('Owner Only Event');
      },
    );

    it.skipIf(skipReason !== undefined)(
      '403 on cancel does not include event content',
      async () => {
        const eventRes = await request(app)
          .post(`/api/v1/groups/${groupId}/events`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ title: 'Not Yours To Cancel', startAt: '2026-12-03T10:00:00Z' });
        const eventId = (eventRes.body as { id: string }).id;

        // member is invited so gets 403 (Forbidden) not 404
        const res = await request(app)
          .delete(`/api/v1/groups/${groupId}/events/${eventId}`)
          .set(testAuthHeaders(member.userId, member.displayName));

        expect(res.status).toBe(403);
        expect(Object.keys(res.body as object).sort()).toEqual(['code', 'error']);
        const bodyStr = JSON.stringify(res.body);
        expect(bodyStr).not.toContain(eventId);
        expect(bodyStr).not.toContain('Not Yours To Cancel');
      },
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Hidden event non-disclosure: list endpoint
  // ─────────────────────────────────────────────────────────────────────────

  describe('List endpoint non-disclosure', () => {
    it.skipIf(skipReason !== undefined)(
      'non-member receives 404 – not an empty list that hints the group exists',
      async () => {
        const res = await request(app)
          .get(`/api/v1/groups/${groupId}/events`)
          .set(testAuthHeaders(outsider.userId, outsider.displayName));

        // MUST be 404, not 200 with [] (which would confirm group existence)
        expect(res.status).toBe(404);
        expect((res.body as { code: string }).code).toBe('NOT_FOUND');
      },
    );

    it.skipIf(skipReason !== undefined)(
      'invited member sees their events but not hidden events – no count hints',
      async () => {
        // Create an event accessible to member and one that is not.
        const sharedRes = await request(app)
          .post(`/api/v1/groups/${groupId}/events`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ title: 'Shared Event For List', startAt: '2026-12-10T10:00:00Z' });
        const sharedId = (sharedRes.body as { id: string }).id;

        const hiddenRes = await request(app)
          .post(`/api/v1/groups/${groupId}/events`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({
            title: 'Hidden Event',
            startAt: '2026-12-11T10:00:00Z',
            excludeUserIds: [member.userId],
          });
        const hiddenId = (hiddenRes.body as { id: string }).id;

        const res = await request(app)
          .get(`/api/v1/groups/${groupId}/events`)
          .set(testAuthHeaders(member.userId, member.displayName));

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);

        const ids = (res.body as { id: string }[]).map((e) => e.id);
        expect(ids).toContain(sharedId);
        // Hidden event ID must not appear in the list
        expect(ids).not.toContain(hiddenId);

        // Response body must not contain anything about the hidden event
        const bodyStr = JSON.stringify(res.body);
        expect(bodyStr).not.toContain(hiddenId);
        expect(bodyStr).not.toContain('Hidden Event');
      },
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Newly joined member – snapshot semantics
  // ─────────────────────────────────────────────────────────────────────────

  describe('Late joiner non-disclosure', () => {
    it.skipIf(skipReason !== undefined)(
      'member who joined after event creation cannot see the event in the list',
      async () => {
        // Create event before lateJoiner joins.
        const eventRes = await request(app)
          .post(`/api/v1/groups/${groupId}/events`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ title: 'Historic Event', startAt: '2026-12-20T10:00:00Z' });
        const historicId = (eventRes.body as { id: string }).id;

        // lateJoiner joins the group AFTER the event was created.
        const memberRepo = new KnexGroupMemberRepository(db);
        await memberRepo.add({ groupId, userId: lateJoiner.userId, role: 'member' });

        // List endpoint for lateJoiner must NOT include the historic event.
        const listRes = await request(app)
          .get(`/api/v1/groups/${groupId}/events`)
          .set(testAuthHeaders(lateJoiner.userId, lateJoiner.displayName));

        expect(listRes.status).toBe(200);
        const ids = (listRes.body as { id: string }[]).map((e) => e.id);
        expect(ids).not.toContain(historicId);

        // Direct GET also returns 404 for lateJoiner.
        const getRes = await request(app)
          .get(`/api/v1/groups/${groupId}/events/${historicId}`)
          .set(testAuthHeaders(lateJoiner.userId, lateJoiner.displayName));

        expect(getRes.status).toBe(404);
        expect((getRes.body as { code: string }).code).toBe('NOT_FOUND');
      },
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Removed invitation – former invitee non-disclosure
  // ─────────────────────────────────────────────────────────────────────────

  describe('Removed invitation non-disclosure', () => {
    it.skipIf(skipReason !== undefined)(
      'member whose invitation was removed receives 404 – not 403',
      async () => {
        const eventRes = await request(app)
          .post(`/api/v1/groups/${groupId}/events`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ title: 'Access Revoked Event', startAt: '2026-12-25T10:00:00Z' });
        const eventId = (eventRes.body as { id: string }).id;

        // Confirm member can initially access the event.
        const beforeRes = await request(app)
          .get(`/api/v1/groups/${groupId}/events/${eventId}`)
          .set(testAuthHeaders(member.userId, member.displayName));
        expect(beforeRes.status).toBe(200);

        // Remove the invitation directly.
        await db('event_invitations')
          .where({ event_id: eventId, user_id: member.userId })
          .update({ status: 'removed' });

        // After removal, member must receive NOT_FOUND (not FORBIDDEN).
        const afterGetRes = await request(app)
          .get(`/api/v1/groups/${groupId}/events/${eventId}`)
          .set(testAuthHeaders(member.userId, member.displayName));
        expect(afterGetRes.status).toBe(404);
        expect((afterGetRes.body as { code: string }).code).toBe('NOT_FOUND');

        // Event must no longer appear in member's list.
        const listRes = await request(app)
          .get(`/api/v1/groups/${groupId}/events`)
          .set(testAuthHeaders(member.userId, member.displayName));
        const ids = (listRes.body as { id: string }[]).map((e) => e.id);
        expect(ids).not.toContain(eventId);
      },
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Cross-group event access prevention
  // ─────────────────────────────────────────────────────────────────────────

  describe('Cross-group event isolation', () => {
    it.skipIf(skipReason !== undefined)(
      'event from group A cannot be accessed via group B URL',
      async () => {
        // Create event in the primary group.
        const eventRes = await request(app)
          .post(`/api/v1/groups/${groupId}/events`)
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ title: 'Group A Event', startAt: '2026-12-28T10:00:00Z' });
        const eventId = (eventRes.body as { id: string }).id;

        // Owner is also the owner of otherGroup. Accessing event via wrong group ID
        // must return 404 – even if the caller is a valid member of the other group.
        const res = await request(app)
          .get(`/api/v1/groups/${otherGroupId}/events/${eventId}`)
          .set(testAuthHeaders(owner.userId, owner.displayName));

        expect(res.status).toBe(404);
        expect((res.body as { code: string }).code).toBe('NOT_FOUND');
      },
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Group-level routes must never expose event-scoped data
  // ─────────────────────────────────────────────────────────────────────────

  describe('No group-level exposure of event-scoped data', () => {
    it.skipIf(skipReason !== undefined)(
      'GET /groups/:id does not include event data',
      async () => {
        const res = await request(app)
          .get(`/api/v1/groups/${groupId}`)
          .set(testAuthHeaders(owner.userId, owner.displayName));

        expect(res.status).toBe(200);

        // Group response must only contain group-level fields.
        const body = res.body as Record<string, unknown>;
        expect(body).not.toHaveProperty('events');
        expect(body).not.toHaveProperty('eventCount');
        expect(body).not.toHaveProperty('recentEvents');
        expect(body).not.toHaveProperty('chat');
        expect(body).not.toHaveProperty('checklist');
        expect(body).not.toHaveProperty('location');
      },
    );

    it.skipIf(skipReason !== undefined)(
      'GET /groups/:id/members does not include event data',
      async () => {
        const res = await request(app)
          .get(`/api/v1/groups/${groupId}/members`)
          .set(testAuthHeaders(owner.userId, owner.displayName));

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);

        // Members list must not leak event membership or invitation status.
        for (const member of res.body as Record<string, unknown>[]) {
          expect(member).not.toHaveProperty('events');
          expect(member).not.toHaveProperty('invitations');
          expect(member).not.toHaveProperty('eventAccess');
        }
      },
    );
  });
});
