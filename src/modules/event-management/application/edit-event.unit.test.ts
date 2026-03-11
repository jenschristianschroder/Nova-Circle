import { describe, it, expect, vi } from 'vitest';
import { EditEventUseCase } from './edit-event.usecase.js';
import type { EventRepositoryPort } from '../domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../domain/event-invitation.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { AuditLogPort } from '../../audit-security/index.js';
import type { Event } from '../domain/event.js';
import type { EventInvitation } from '../domain/event-invitation.js';
import { FakeIdentity } from '../../../shared/test-helpers/fake-identity.js';

function makeEvent(overrides?: Partial<Event>): Event {
  return {
    id: 'event-1',
    groupId: 'group-1',
    title: 'Team Lunch',
    description: null,
    startAt: new Date('2026-06-01T12:00:00Z'),
    endAt: new Date('2026-06-01T13:00:00Z'),
    createdBy: 'creator-id',
    status: 'scheduled',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeInvitation(overrides?: Partial<EventInvitation>): EventInvitation {
  return {
    id: 'inv-1',
    eventId: 'event-1',
    userId: 'creator-id',
    status: 'invited',
    invitedAt: new Date(),
    respondedAt: null,
    ...overrides,
  };
}

function makeEventRepo(overrides?: Partial<EventRepositoryPort>): EventRepositoryPort {
  return {
    findById: vi.fn().mockResolvedValue(null),
    listByGroupForUser: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(makeEvent()),
    cancel: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeInvitationRepo(
  overrides?: Partial<EventInvitationRepositoryPort>,
): EventInvitationRepositoryPort {
  return {
    findByEventAndUser: vi.fn().mockResolvedValue(null),
    hasAccess: vi.fn().mockResolvedValue(false),
    listByEvent: vi.fn().mockResolvedValue([makeInvitation()]),
    add: vi.fn().mockResolvedValue(makeInvitation()),
    remove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeMemberRepo(overrides?: Partial<GroupMemberRepositoryPort>): GroupMemberRepositoryPort {
  return {
    findByGroupAndUser: vi.fn().mockResolvedValue(null),
    listByGroup: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue(null),
    remove: vi.fn().mockResolvedValue(undefined),
    isMember: vi.fn().mockResolvedValue(false),
    getRole: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function makeAuditLog(overrides?: Partial<AuditLogPort>): AuditLogPort {
  return { record: vi.fn().mockResolvedValue(undefined), ...overrides };
}

const creator = FakeIdentity.user('creator');
const memberUser = FakeIdentity.user('member');
const outsider = FakeIdentity.user('outsider');

// ---------------------------------------------------------------------------
// EditEventUseCase
// ---------------------------------------------------------------------------

describe('EditEventUseCase', () => {
  const validCommand = { title: 'Updated Title' };

  it('allows creator to edit their own event', async () => {
    const event = makeEvent({ createdBy: creator.userId });
    const updated = makeEvent({ createdBy: creator.userId, title: 'Updated Title' });
    const eventRepo = makeEventRepo({
      findById: vi.fn().mockResolvedValue(event),
      update: vi.fn().mockResolvedValue(updated),
    });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue(null) });
    const auditLog = makeAuditLog();
    const useCase = new EditEventUseCase(eventRepo, invitationRepo, memberRepo, auditLog);

    const result = await useCase.execute(creator, 'group-1', 'event-1', validCommand);
    expect(result.title).toBe('Updated Title');
    expect(auditLog.record).toHaveBeenCalledOnce();
  });

  it('allows group admin to edit any event', async () => {
    const admin = FakeIdentity.user('admin');
    const event = makeEvent({ createdBy: creator.userId });
    const updated = makeEvent({ title: 'Admin Updated' });
    const eventRepo = makeEventRepo({
      findById: vi.fn().mockResolvedValue(event),
      update: vi.fn().mockResolvedValue(updated),
    });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(false) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue('admin') });
    const auditLog = makeAuditLog();
    const useCase = new EditEventUseCase(eventRepo, invitationRepo, memberRepo, auditLog);

    await useCase.execute(admin, 'group-1', 'event-1', { title: 'Admin Updated' });
    expect(eventRepo.update).toHaveBeenCalled();
    expect(auditLog.record).toHaveBeenCalledOnce();
  });

  it('throws FORBIDDEN for invited-but-not-creator non-admin', async () => {
    const event = makeEvent({ createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue('member') });
    const auditLog = makeAuditLog();
    const useCase = new EditEventUseCase(eventRepo, invitationRepo, memberRepo, auditLog);

    await expect(
      useCase.execute(memberUser, 'group-1', 'event-1', { title: 'Hacked' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws NOT_FOUND for non-invited non-admin (no existence disclosure)', async () => {
    const event = makeEvent({ createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(false) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue(null) });
    const auditLog = makeAuditLog();
    const useCase = new EditEventUseCase(eventRepo, invitationRepo, memberRepo, auditLog);

    await expect(
      useCase.execute(outsider, 'group-1', 'event-1', { title: 'Hacked' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws CONFLICT when trying to edit a cancelled event', async () => {
    const event = makeEvent({ status: 'cancelled', createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue(null) });
    const auditLog = makeAuditLog();
    const useCase = new EditEventUseCase(eventRepo, invitationRepo, memberRepo, auditLog);

    await expect(
      useCase.execute(creator, 'group-1', 'event-1', { title: 'Fixed' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('throws VALIDATION_ERROR for empty title', async () => {
    const event = makeEvent({ createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue(null) });
    const auditLog = makeAuditLog();
    const useCase = new EditEventUseCase(eventRepo, invitationRepo, memberRepo, auditLog);

    await expect(
      useCase.execute(creator, 'group-1', 'event-1', { title: '  ' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws VALIDATION_ERROR when endAt is before startAt', async () => {
    const event = makeEvent({ createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue(null) });
    const auditLog = makeAuditLog();
    const useCase = new EditEventUseCase(eventRepo, invitationRepo, memberRepo, auditLog);

    await expect(
      useCase.execute(creator, 'group-1', 'event-1', {
        endAt: new Date('2026-06-01T10:00:00Z'), // before current startAt
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws NOT_FOUND when event does not exist', async () => {
    const auditLog = makeAuditLog();
    const useCase = new EditEventUseCase(
      makeEventRepo(),
      makeInvitationRepo(),
      makeMemberRepo(),
      auditLog,
    );
    await expect(
      useCase.execute(creator, 'group-1', 'no-such-event', { title: 'X' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('succeeds even when audit logging fails (best-effort)', async () => {
    const event = makeEvent({ createdBy: creator.userId });
    const updated = makeEvent({ createdBy: creator.userId, title: 'Updated' });
    const eventRepo = makeEventRepo({
      findById: vi.fn().mockResolvedValue(event),
      update: vi.fn().mockResolvedValue(updated),
    });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue(null) });
    const auditLog = makeAuditLog({
      record: vi.fn().mockRejectedValue(new Error('audit DB down')),
    });
    const useCase = new EditEventUseCase(eventRepo, invitationRepo, memberRepo, auditLog);

    // Should resolve successfully even though audit logging throws.
    await expect(
      useCase.execute(creator, 'group-1', 'event-1', { title: 'Updated' }),
    ).resolves.toBeDefined();
  });
});
