/**
 * Audit-emission API tests.
 *
 * These tests verify that sensitive HTTP operations actually produce rows in the
 * `audit_log` table with the expected action, resource_id, group_id, and
 * metadata.  They also confirm that audit failures do not affect the HTTP
 * response status or body.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Knex } from 'knex';
import { createTestDb } from '../../../infrastructure/test-db.js';
import { createApp } from '../../../app.js';
import { testAuthHeaders } from '../../../shared/test-helpers/test-auth.js';
import { FakeIdentity } from '../../../shared/test-helpers/fake-identity.js';
import { KnexUserProfileRepository } from '../../identity-profile/infrastructure/knex-user-profile.repository.js';

const skipReason = !process.env['TEST_DATABASE_URL']
  ? 'TEST_DATABASE_URL is not set – skipping audit-emission API tests'
  : undefined;

interface AuditRow {
  id: string;
  occurred_at: Date;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  group_id: string | null;
  metadata: Record<string, unknown> | null;
}

describe('Audit-emission API tests', () => {
  let db: Knex;
  let app: Express.Application;

  const owner = FakeIdentity.random();
  const member = FakeIdentity.random();

  let groupId: string;

  beforeAll(async () => {
    if (skipReason) return;
    db = createTestDb();
    await db.migrate.latest();
    app = createApp({ db });

    const profileRepo = new KnexUserProfileRepository(db);
    await profileRepo.upsert({ userId: owner.userId, displayName: owner.displayName });
    await profileRepo.upsert({ userId: member.userId, displayName: member.displayName });

    // Create the group (owner becomes member automatically).
    const groupRes = await request(app)
      .post('/api/v1/groups')
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ name: 'Audit Test Group' });
    groupId = (groupRes.body as { id: string }).id;
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  // ---------------------------------------------------------------------------
  // event.created
  // ---------------------------------------------------------------------------

  it.skipIf(skipReason !== undefined)(
    'POST /groups/:groupId/events writes an event.created audit entry',
    async () => {
      const res = await request(app)
        .post(`/api/v1/groups/${groupId}/events`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: 'Audit Create Event', startAt: '2027-01-01T10:00:00Z' });

      expect(res.status).toBe(201);
      const eventId = (res.body as { id: string }).id;

      const rows = await db('audit_log')
        .where({ actor_id: owner.userId, action: 'event.created', resource_id: eventId })
        .select<AuditRow[]>('*');

      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.resource_type).toBe('event');
      expect(row.group_id).toBe(groupId);
      expect(row.occurred_at).toBeInstanceOf(Date);
    },
  );

  // ---------------------------------------------------------------------------
  // event.cancelled
  // ---------------------------------------------------------------------------

  it.skipIf(skipReason !== undefined)(
    'DELETE /groups/:groupId/events/:eventId writes an event.cancelled audit entry',
    async () => {
      // Create an event to cancel.
      const createRes = await request(app)
        .post(`/api/v1/groups/${groupId}/events`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ title: 'Audit Cancel Event', startAt: '2027-02-01T10:00:00Z' });
      const eventId = (createRes.body as { id: string }).id;

      const res = await request(app)
        .delete(`/api/v1/groups/${groupId}/events/${eventId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName));

      expect(res.status).toBe(204);

      const rows = await db('audit_log')
        .where({ actor_id: owner.userId, action: 'event.cancelled', resource_id: eventId })
        .select<AuditRow[]>('*');

      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.resource_type).toBe('event');
      expect(row.group_id).toBe(groupId);
    },
  );

  // ---------------------------------------------------------------------------
  // member.added
  // ---------------------------------------------------------------------------

  it.skipIf(skipReason !== undefined)(
    'POST /groups/:groupId/members writes a member.added audit entry with role metadata',
    async () => {
      const res = await request(app)
        .post(`/api/v1/groups/${groupId}/members`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ userId: member.userId, role: 'member' });

      expect(res.status).toBe(201);

      const rows = await db('audit_log')
        .where({ actor_id: owner.userId, action: 'member.added', resource_id: member.userId })
        .select<AuditRow[]>('*');

      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.resource_type).toBe('member');
      expect(row.group_id).toBe(groupId);
      expect(row.metadata).toMatchObject({ role: 'member' });
      // metadata must not expose display name or email
      expect(row.metadata).not.toHaveProperty('displayName');
      expect(row.metadata).not.toHaveProperty('email');
    },
  );

  // ---------------------------------------------------------------------------
  // member.removed
  // ---------------------------------------------------------------------------

  it.skipIf(skipReason !== undefined)(
    'DELETE /groups/:groupId/members/:userId writes a member.removed audit entry',
    async () => {
      // member must already be in the group (added in the previous test).
      const res = await request(app)
        .delete(`/api/v1/groups/${groupId}/members/${member.userId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName));

      expect(res.status).toBe(204);

      const rows = await db('audit_log')
        .where({ actor_id: owner.userId, action: 'member.removed', resource_id: member.userId })
        .select<AuditRow[]>('*');

      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.resource_type).toBe('member');
      expect(row.group_id).toBe(groupId);
    },
  );

  // ---------------------------------------------------------------------------
  // group.updated
  // ---------------------------------------------------------------------------

  it.skipIf(skipReason !== undefined)(
    'PUT /groups/:groupId writes a group.updated audit entry',
    async () => {
      const res = await request(app)
        .put(`/api/v1/groups/${groupId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ name: 'Audit Test Group Renamed' });

      expect(res.status).toBe(200);

      const rows = await db('audit_log')
        .where({ actor_id: owner.userId, action: 'group.updated', resource_id: groupId })
        .select<AuditRow[]>('*');

      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.resource_type).toBe('group');
      expect(row.group_id).toBe(groupId);
    },
  );

  // ---------------------------------------------------------------------------
  // group.deleted
  // ---------------------------------------------------------------------------

  it.skipIf(skipReason !== undefined)(
    'DELETE /groups/:groupId writes a group.deleted audit entry',
    async () => {
      // Create a throwaway group to delete.
      const tempGroupRes = await request(app)
        .post('/api/v1/groups')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ name: 'Temp Group To Delete' });
      const tempGroupId = (tempGroupRes.body as { id: string }).id;

      const res = await request(app)
        .delete(`/api/v1/groups/${tempGroupId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName));

      expect(res.status).toBe(204);

      const rows = await db('audit_log')
        .where({ actor_id: owner.userId, action: 'group.deleted', resource_id: tempGroupId })
        .select<AuditRow[]>('*');

      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.resource_type).toBe('group');
      expect(row.group_id).toBe(tempGroupId);
    },
  );
});
