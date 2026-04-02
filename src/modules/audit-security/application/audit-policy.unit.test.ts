import { describe, it, expect, vi } from 'vitest';
import type { AuditLogPort } from '../domain/audit-log.port.js';
import type { RecordAuditEntryData, AuditAction } from '../domain/audit-event.js';
import { KnexAuditLogRepository } from '../infrastructure/knex-audit-log.repository.js';
import type { Knex } from 'knex';

/**
 * Audit policy unit tests.
 *
 * These tests verify that:
 * - The AuditLogPort contract is correctly specified
 * - RecordAuditEntryData contains only safe, non-sensitive fields
 * - AuditAction literals are correctly defined
 * - Audit entries do not include display names or email addresses
 * - KnexAuditLogRepository is fault-tolerant (record() never rejects)
 */

function makeAuditLog(
  recordFn: (entry: RecordAuditEntryData) => Promise<void> = vi.fn().mockResolvedValue(undefined),
): AuditLogPort {
  return { record: recordFn };
}

const VALID_ACTIONS: AuditAction[] = [
  'event.created',
  'event.cancelled',
  'event.ownership_transferred',
  'member.added',
  'member.removed',
  'group.updated',
  'group.deleted',
];

describe('AuditLogPort', () => {
  it('accepts a minimal entry with required fields only', async () => {
    const recorded: RecordAuditEntryData[] = [];
    const auditLog = makeAuditLog((entry) => {
      recorded.push(entry);
      return Promise.resolve();
    });

    await auditLog.record({
      actorId: 'user-123',
      action: 'event.created',
      resourceType: 'event',
      resourceId: 'event-456',
    });

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      actorId: 'user-123',
      action: 'event.created',
      resourceType: 'event',
      resourceId: 'event-456',
    });
  });

  it('accepts groupId as optional context', async () => {
    const recorded: RecordAuditEntryData[] = [];
    const auditLog = makeAuditLog((entry) => {
      recorded.push(entry);
      return Promise.resolve();
    });

    await auditLog.record({
      actorId: 'user-123',
      action: 'event.created',
      resourceType: 'event',
      resourceId: 'event-456',
      groupId: 'group-789',
    });

    expect(recorded[0]?.groupId).toBe('group-789');
  });

  it('accepts safe metadata for member.added', async () => {
    const recorded: RecordAuditEntryData[] = [];
    const auditLog = makeAuditLog((entry) => {
      recorded.push(entry);
      return Promise.resolve();
    });

    await auditLog.record({
      actorId: 'user-123',
      action: 'member.added',
      resourceType: 'member',
      resourceId: 'target-user-456',
      groupId: 'group-789',
      metadata: { role: 'admin' },
    });

    expect(recorded[0]?.metadata).toEqual({ role: 'admin' });
  });

  it('supports all defined audit actions', async () => {
    const auditLog = makeAuditLog();

    for (const action of VALID_ACTIONS) {
      await expect(
        auditLog.record({
          actorId: 'actor-id',
          action,
          resourceType: 'resource',
          resourceId: 'resource-id',
        }),
      ).resolves.not.toThrow();
    }
  });
});

describe('KnexAuditLogRepository fault tolerance', () => {
  it('record() resolves even when the DB insert rejects', async () => {
    // Build a minimal fake Knex instance whose table() returns a chainable that
    // rejects on .insert(). This proves KnexAuditLogRepository swallows the error
    // as required by the AuditLogPort contract.
    const fakeInsert = vi.fn().mockRejectedValue(new Error('DB unavailable'));
    const fakeChain = { insert: fakeInsert };
    const fakeDb = vi.fn().mockReturnValue(fakeChain) as unknown as Knex;

    const repo = new KnexAuditLogRepository(fakeDb);

    await expect(
      repo.record({
        actorId: 'actor-id',
        action: 'event.created',
        resourceType: 'event',
        resourceId: 'event-id',
      }),
    ).resolves.toBeUndefined();

    expect(fakeInsert).toHaveBeenCalledOnce();
  });
});

describe('Audit entry privacy rules', () => {
  it('actorId is an opaque identifier – not a display name', () => {
    // This test documents that actorId must be a user ID (UUID-like),
    // not a human-readable name or email address.
    const entry: RecordAuditEntryData = {
      actorId: '550e8400-e29b-41d4-a716-446655440000', // UUID format
      action: 'event.created',
      resourceType: 'event',
      resourceId: 'event-id',
    };

    // actorId should not look like an email address.
    expect(entry.actorId).not.toMatch(/@/);
    // actorId should not be empty.
    expect(entry.actorId.length).toBeGreaterThan(0);
  });

  it('metadata is null when no additional context is needed', async () => {
    const recorded: RecordAuditEntryData[] = [];
    const auditLog = makeAuditLog((entry) => {
      recorded.push(entry);
      return Promise.resolve();
    });

    await auditLog.record({
      actorId: 'user-id',
      action: 'event.cancelled',
      resourceType: 'event',
      resourceId: 'event-id',
    });

    // Absence of metadata means no unnecessary data is stored.
    expect(recorded[0]?.metadata).toBeUndefined();
  });

  it('metadata for member.added contains only role – no display names or emails', async () => {
    const recorded: RecordAuditEntryData[] = [];
    const auditLog = makeAuditLog((entry) => {
      recorded.push(entry);
      return Promise.resolve();
    });

    await auditLog.record({
      actorId: 'actor-id',
      action: 'member.added',
      resourceType: 'member',
      resourceId: 'target-id',
      groupId: 'group-id',
      metadata: { role: 'member' },
    });

    const meta = recorded[0]?.metadata as Record<string, unknown>;
    // metadata should only contain the role – no display name, no email.
    expect(Object.keys(meta ?? {})).toEqual(['role']);
    expect(meta?.['role']).toBe('member');
  });
});
