import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Knex } from 'knex';
import { createTestDb } from '../../../infrastructure/test-db.js';
import { KnexAuditLogRepository } from './knex-audit-log.repository.js';

const skipReason = !process.env['TEST_DATABASE_URL']
  ? 'TEST_DATABASE_URL is not set – skipping audit log integration tests'
  : undefined;

describe('KnexAuditLogRepository', () => {
  let db: Knex;
  let repo: KnexAuditLogRepository;

  beforeAll(async () => {
    if (skipReason) return;
    db = createTestDb();
    await db.migrate.latest();
    repo = new KnexAuditLogRepository(db);
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  it.skipIf(skipReason !== undefined)('records an audit entry in the database', async () => {
    await repo.record({
      actorId: 'user-audit-test-1',
      action: 'event.created',
      resourceType: 'event',
      resourceId: 'event-audit-test-1',
      groupId: 'group-audit-test-1',
    });

    const rows = await db('audit_log')
      .where({ actor_id: 'user-audit-test-1', resource_id: 'event-audit-test-1' })
      .select('*');

    expect(rows).toHaveLength(1);
    const row = rows[0] as Record<string, unknown>;
    expect(row['action']).toBe('event.created');
    expect(row['resource_type']).toBe('event');
    expect(row['group_id']).toBe('group-audit-test-1');
    expect(row['metadata']).toBeNull();
    expect(row['occurred_at']).toBeInstanceOf(Date);
  });

  it.skipIf(skipReason !== undefined)('records an audit entry with safe metadata', async () => {
    await repo.record({
      actorId: 'user-audit-test-2',
      action: 'member.added',
      resourceType: 'member',
      resourceId: 'target-user-audit-2',
      groupId: 'group-audit-test-2',
      metadata: { role: 'admin' },
    });

    const rows = await db('audit_log')
      .where({ actor_id: 'user-audit-test-2', resource_id: 'target-user-audit-2' })
      .select('*');

    expect(rows).toHaveLength(1);
    const row = rows[0] as Record<string, unknown>;
    expect(row['action']).toBe('member.added');
    // Metadata should be stored and not contain sensitive fields.
    const meta = row['metadata'] as Record<string, unknown> | null;
    expect(meta).not.toBeNull();
    expect(meta?.['role']).toBe('admin');
    // No display name or email in metadata.
    expect(meta).not.toHaveProperty('displayName');
    expect(meta).not.toHaveProperty('email');
  });

  it.skipIf(skipReason !== undefined)(
    'records a group.deleted audit entry without metadata',
    async () => {
      await repo.record({
        actorId: 'user-audit-test-3',
        action: 'group.deleted',
        resourceType: 'group',
        resourceId: 'group-audit-test-3',
        groupId: 'group-audit-test-3',
      });

      const rows = await db('audit_log')
        .where({ actor_id: 'user-audit-test-3', resource_id: 'group-audit-test-3' })
        .select('*');

      expect(rows).toHaveLength(1);
      const row = rows[0] as Record<string, unknown>;
      expect(row['action']).toBe('group.deleted');
      expect(row['metadata']).toBeNull();
    },
  );

  it.skipIf(skipReason !== undefined)(
    'stores occurred_at with a timestamp close to now',
    async () => {
      const before = new Date();
      await repo.record({
        actorId: 'user-audit-test-4',
        action: 'event.cancelled',
        resourceType: 'event',
        resourceId: 'event-audit-test-4',
      });
      const after = new Date();

      const rows = await db('audit_log')
        .where({ actor_id: 'user-audit-test-4', resource_id: 'event-audit-test-4' })
        .select('occurred_at');

      const row = rows[0] as { occurred_at: Date };
      expect(row.occurred_at.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(row.occurred_at.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
    },
  );

  it.skipIf(skipReason !== undefined)('allows null groupId for non-group-scoped entries', async () => {
    await repo.record({
      actorId: 'user-audit-test-5',
      action: 'event.created',
      resourceType: 'event',
      resourceId: 'event-audit-test-5',
      groupId: null,
    });

    const rows = await db('audit_log')
      .where({ actor_id: 'user-audit-test-5', resource_id: 'event-audit-test-5' })
      .select('group_id');

    expect((rows[0] as { group_id: string | null }).group_id).toBeNull();
  });
});
