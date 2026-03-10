import { describe, it, expect, vi } from 'vitest';
import { CreateEventUseCase } from './create-event.usecase.js';
import { GetEventUseCase } from './get-event.usecase.js';
import { ListGroupEventsUseCase } from './list-group-events.usecase.js';
import { CancelEventUseCase } from './cancel-event.usecase.js';
import { AddInviteeUseCase } from './add-invitee.usecase.js';
import { RemoveInviteeUseCase } from './remove-invitee.usecase.js';
import type { EventCreationPort } from '../domain/event-creation.port.js';
import type { EventRepositoryPort } from '../domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../domain/event-invitation.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { AuditLogPort } from '../../audit-security/domain/audit-log.port.js';
import type { Event } from '../domain/event.js';
import type { EventInvitation } from '../domain/event-invitation.js';
import type { GroupMember } from '../../group-membership/domain/group-member.js';
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

function makeMember(userId: string, role: GroupMember['role'] = 'member'): GroupMember {
  return {
    id: `member-${userId}`,
    groupId: 'group-1',
    userId,
    role,
    joinedAt: new Date(),
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

function makeEventCreator(event: Event = makeEvent()): EventCreationPort {
  return { createEventWithInvitations: vi.fn().mockResolvedValue(event) };
}

function makeEventRepo(overrides?: Partial<EventRepositoryPort>): EventRepositoryPort {
  return {
    findById: vi.fn().mockResolvedValue(null),
    listByGroupForUser: vi.fn().mockResolvedValue([]),
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
    addInvitee: vi.fn().mockResolvedValue(makeInvitation()),
    removeInvitee: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeAuditLog(): AuditLogPort {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

function makeInvitation(overrides?: Partial<EventInvitation>): EventInvitation {
  return {
    id: 'inv-1',
    eventId: 'event-1',
    userId: 'target-id',
    status: 'invited',
    invitedAt: new Date(),
    respondedAt: null,
    ...overrides,
  };
}

const creator = FakeIdentity.user('creator');
const memberUser = FakeIdentity.user('member');
const outsider = FakeIdentity.user('outsider');

// ---------------------------------------------------------------------------
// CreateEventUseCase
// ---------------------------------------------------------------------------

describe('CreateEventUseCase', () => {
  const validCommand = {
    groupId: 'group-1',
    title: 'Team Lunch',
    startAt: new Date('2026-06-01T12:00:00Z'),
  };

  it('creates event when caller is a group member', async () => {
    const memberRepo = makeMemberRepo({
      isMember: vi.fn().mockResolvedValue(true),
      listByGroup: vi.fn().mockResolvedValue([makeMember(creator.userId, 'owner')]),
    });
    const eventCreator = makeEventCreator();
    const useCase = new CreateEventUseCase(eventCreator, memberRepo);

    await useCase.execute(creator, validCommand);

    expect(eventCreator.createEventWithInvitations).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Team Lunch', createdBy: creator.userId }),
    );
  });

  it('seeds all current group members as invitees', async () => {
    const members = [makeMember(creator.userId, 'owner'), makeMember(memberUser.userId, 'member')];
    const memberRepo = makeMemberRepo({
      isMember: vi.fn().mockResolvedValue(true),
      listByGroup: vi.fn().mockResolvedValue(members),
    });
    const eventCreator = makeEventCreator();
    const useCase = new CreateEventUseCase(eventCreator, memberRepo);

    await useCase.execute(creator, validCommand);

    const call = (eventCreator.createEventWithInvitations as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { inviteeIds: string[] };
    expect(call.inviteeIds).toContain(creator.userId);
    expect(call.inviteeIds).toContain(memberUser.userId);
  });

  it('allows creator to exclude members before save', async () => {
    const members = [makeMember(creator.userId, 'owner'), makeMember(memberUser.userId, 'member')];
    const memberRepo = makeMemberRepo({
      isMember: vi.fn().mockResolvedValue(true),
      listByGroup: vi.fn().mockResolvedValue(members),
    });
    const eventCreator = makeEventCreator();
    const useCase = new CreateEventUseCase(eventCreator, memberRepo);

    await useCase.execute(creator, {
      ...validCommand,
      excludeUserIds: [memberUser.userId],
    });

    const call = (eventCreator.createEventWithInvitations as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { inviteeIds: string[] };
    expect(call.inviteeIds).toContain(creator.userId);
    expect(call.inviteeIds).not.toContain(memberUser.userId);
  });

  it('creator cannot exclude themselves', async () => {
    const members = [makeMember(creator.userId, 'owner')];
    const memberRepo = makeMemberRepo({
      isMember: vi.fn().mockResolvedValue(true),
      listByGroup: vi.fn().mockResolvedValue(members),
    });
    const eventCreator = makeEventCreator();
    const useCase = new CreateEventUseCase(eventCreator, memberRepo);

    await useCase.execute(creator, {
      ...validCommand,
      excludeUserIds: [creator.userId],
    });

    const call = (eventCreator.createEventWithInvitations as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { inviteeIds: string[] };
    expect(call.inviteeIds).toContain(creator.userId);
  });

  it('snapshot is a point-in-time capture – listByGroup called exactly once at creation', async () => {
    const members = [makeMember(creator.userId, 'owner'), makeMember(memberUser.userId, 'member')];
    const memberRepo = makeMemberRepo({
      isMember: vi.fn().mockResolvedValue(true),
      listByGroup: vi.fn().mockResolvedValue(members),
    });
    const eventCreator = makeEventCreator();
    const useCase = new CreateEventUseCase(eventCreator, memberRepo);

    await useCase.execute(creator, validCommand);

    expect(memberRepo.listByGroup).toHaveBeenCalledOnce();
  });

  it('does not invite a user who was not a member at snapshot time', async () => {
    // Only the creator is in the snapshot – memberUser and outsider are not current members.
    const members = [makeMember(creator.userId, 'owner')];
    const memberRepo = makeMemberRepo({
      isMember: vi.fn().mockResolvedValue(true),
      listByGroup: vi.fn().mockResolvedValue(members),
    });
    const eventCreator = makeEventCreator();
    const useCase = new CreateEventUseCase(eventCreator, memberRepo);

    await useCase.execute(creator, validCommand);

    const call = (eventCreator.createEventWithInvitations as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { inviteeIds: string[] };
    expect(call.inviteeIds).not.toContain(memberUser.userId);
    expect(call.inviteeIds).not.toContain(outsider.userId);
  });

  it('throws NOT_FOUND when caller is not a group member', async () => {
    const memberRepo = makeMemberRepo({ isMember: vi.fn().mockResolvedValue(false) });
    const useCase = new CreateEventUseCase(makeEventCreator(), memberRepo);

    await expect(useCase.execute(outsider, validCommand)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws VALIDATION_ERROR for empty title', async () => {
    const memberRepo = makeMemberRepo({ isMember: vi.fn().mockResolvedValue(true) });
    const useCase = new CreateEventUseCase(makeEventCreator(), memberRepo);

    await expect(useCase.execute(creator, { ...validCommand, title: '   ' })).rejects.toMatchObject(
      { code: 'VALIDATION_ERROR' },
    );
  });

  it('throws VALIDATION_ERROR when end time is before start time', async () => {
    const memberRepo = makeMemberRepo({ isMember: vi.fn().mockResolvedValue(true) });
    const useCase = new CreateEventUseCase(makeEventCreator(), memberRepo);

    await expect(
      useCase.execute(creator, {
        ...validCommand,
        endAt: new Date('2026-05-01T12:00:00Z'),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

// ---------------------------------------------------------------------------
// GetEventUseCase
// ---------------------------------------------------------------------------

describe('GetEventUseCase', () => {
  it('returns event for an invited user', async () => {
    const event = makeEvent();
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const useCase = new GetEventUseCase(eventRepo, invitationRepo);

    const result = await useCase.execute(creator, 'event-1');
    expect(result).toEqual(event);
  });

  it('throws NOT_FOUND for non-invited user (no existence disclosure)', async () => {
    const event = makeEvent();
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(false) });
    const useCase = new GetEventUseCase(eventRepo, invitationRepo);

    await expect(useCase.execute(outsider, 'event-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND for former member with removed invitation (no existence disclosure)', async () => {
    // hasAccess returns false when invitation status is 'removed', so former members
    // are treated identically to non-invited users: they receive NOT_FOUND.
    const event = makeEvent();
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(false) });
    const useCase = new GetEventUseCase(eventRepo, invitationRepo);

    await expect(useCase.execute(memberUser, 'event-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when event does not exist', async () => {
    const useCase = new GetEventUseCase(makeEventRepo(), makeInvitationRepo());
    await expect(useCase.execute(creator, 'no-such-event')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

// ---------------------------------------------------------------------------
// ListGroupEventsUseCase
// ---------------------------------------------------------------------------

describe('ListGroupEventsUseCase', () => {
  it('returns only invited events for a group member', async () => {
    const events = [makeEvent()];
    const eventRepo = makeEventRepo({ listByGroupForUser: vi.fn().mockResolvedValue(events) });
    const memberRepo = makeMemberRepo({ isMember: vi.fn().mockResolvedValue(true) });
    const useCase = new ListGroupEventsUseCase(eventRepo, memberRepo);

    const result = await useCase.execute(memberUser, 'group-1');
    expect(result).toEqual(events);
  });

  it('throws NOT_FOUND for non-member (no disclosure of group or events)', async () => {
    const memberRepo = makeMemberRepo({ isMember: vi.fn().mockResolvedValue(false) });
    const useCase = new ListGroupEventsUseCase(makeEventRepo(), memberRepo);

    await expect(useCase.execute(outsider, 'group-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('returns empty list when member has no event invitations', async () => {
    const memberRepo = makeMemberRepo({ isMember: vi.fn().mockResolvedValue(true) });
    const eventRepo = makeEventRepo({ listByGroupForUser: vi.fn().mockResolvedValue([]) });
    const useCase = new ListGroupEventsUseCase(eventRepo, memberRepo);

    const result = await useCase.execute(memberUser, 'group-1');
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// CancelEventUseCase
// ---------------------------------------------------------------------------

describe('CancelEventUseCase', () => {
  it('allows creator to cancel their own event', async () => {
    const event = makeEvent({ createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue(null) });
    const useCase = new CancelEventUseCase(eventRepo, invitationRepo, memberRepo);

    await useCase.execute(creator, 'group-1', 'event-1');
    expect(eventRepo.cancel).toHaveBeenCalledWith('event-1');
  });

  it('allows group owner to cancel any event', async () => {
    const event = makeEvent({ createdBy: creator.userId });
    const admin = FakeIdentity.user('admin');
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue('owner') });
    const useCase = new CancelEventUseCase(eventRepo, invitationRepo, memberRepo);

    await useCase.execute(admin, 'group-1', 'event-1');
    expect(eventRepo.cancel).toHaveBeenCalledWith('event-1');
  });

  it('allows admin to cancel even without an invitation', async () => {
    const event = makeEvent({ createdBy: creator.userId });
    const admin = FakeIdentity.user('admin');
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(false) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue('admin') });
    const useCase = new CancelEventUseCase(eventRepo, invitationRepo, memberRepo);

    await useCase.execute(admin, 'group-1', 'event-1');
    expect(eventRepo.cancel).toHaveBeenCalledWith('event-1');
  });

  it('throws FORBIDDEN for invited-but-not-creator non-admin', async () => {
    const event = makeEvent({ createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue('member') });
    const useCase = new CancelEventUseCase(eventRepo, invitationRepo, memberRepo);

    await expect(useCase.execute(memberUser, 'group-1', 'event-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('throws NOT_FOUND for non-invited non-admin (no existence disclosure)', async () => {
    const event = makeEvent();
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(false) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue('member') });
    const useCase = new CancelEventUseCase(eventRepo, invitationRepo, memberRepo);

    await expect(useCase.execute(outsider, 'group-1', 'event-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws CONFLICT when event is already cancelled', async () => {
    const event = makeEvent({ status: 'cancelled', createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue(null) });
    const useCase = new CancelEventUseCase(eventRepo, invitationRepo, memberRepo);

    await expect(useCase.execute(creator, 'group-1', 'event-1')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('throws NOT_FOUND when event does not exist', async () => {
    const useCase = new CancelEventUseCase(makeEventRepo(), makeInvitationRepo(), makeMemberRepo());
    await expect(useCase.execute(creator, 'group-1', 'no-such-event')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when eventId is from a different group', async () => {
    const event = makeEvent({ groupId: 'group-2' });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const useCase = new CancelEventUseCase(eventRepo, makeInvitationRepo(), makeMemberRepo());

    await expect(useCase.execute(creator, 'group-1', 'event-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

const target = FakeIdentity.user('target');

// ---------------------------------------------------------------------------
// AddInviteeUseCase
// ---------------------------------------------------------------------------

describe('AddInviteeUseCase', () => {
  it('allows creator to add a new group member as invitee', async () => {
    const event = makeEvent({ createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({
      hasAccess: vi.fn().mockResolvedValue(true),
      findByEventAndUser: vi.fn().mockResolvedValue(null),
    });
    const memberRepo = makeMemberRepo({
      getRole: vi.fn().mockResolvedValue('member'),
      isMember: vi.fn().mockResolvedValue(true),
    });
    const auditLog = makeAuditLog();
    const useCase = new AddInviteeUseCase(eventRepo, invitationRepo, memberRepo, auditLog);

    const invitation = await useCase.execute(creator, 'group-1', 'event-1', target.userId);

    expect(invitation).toMatchObject({ status: 'invited' });
    expect(invitationRepo.addInvitee).toHaveBeenCalledWith('event-1', target.userId);
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'event_invitation.added' }),
    );
  });

  it('allows group admin to add invitee without holding an invitation', async () => {
    const admin = FakeIdentity.user('admin');
    const event = makeEvent({ createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({
      hasAccess: vi.fn().mockResolvedValue(false),
      findByEventAndUser: vi.fn().mockResolvedValue(null),
    });
    const memberRepo = makeMemberRepo({
      getRole: vi.fn().mockResolvedValue('admin'),
      isMember: vi.fn().mockResolvedValue(true),
    });
    const auditLog = makeAuditLog();
    const useCase = new AddInviteeUseCase(eventRepo, invitationRepo, memberRepo, auditLog);

    await useCase.execute(admin, 'group-1', 'event-1', target.userId);

    expect(invitationRepo.addInvitee).toHaveBeenCalledWith('event-1', target.userId);
  });

  it('reinstates a previously removed invitation', async () => {
    const removedInvitation = makeInvitation({ userId: target.userId, status: 'removed' });
    const event = makeEvent({ createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({
      hasAccess: vi.fn().mockResolvedValue(true),
      findByEventAndUser: vi.fn().mockResolvedValue(removedInvitation),
    });
    const memberRepo = makeMemberRepo({
      getRole: vi.fn().mockResolvedValue('member'),
      isMember: vi.fn().mockResolvedValue(true),
    });
    const auditLog = makeAuditLog();
    const useCase = new AddInviteeUseCase(eventRepo, invitationRepo, memberRepo, auditLog);

    await useCase.execute(creator, 'group-1', 'event-1', target.userId);

    expect(invitationRepo.addInvitee).toHaveBeenCalledWith('event-1', target.userId);
  });

  it('throws CONFLICT when user is already actively invited', async () => {
    const activeInvitation = makeInvitation({ userId: target.userId, status: 'invited' });
    const event = makeEvent({ createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({
      hasAccess: vi.fn().mockResolvedValue(true),
      findByEventAndUser: vi.fn().mockResolvedValue(activeInvitation),
    });
    const memberRepo = makeMemberRepo({
      getRole: vi.fn().mockResolvedValue('member'),
      isMember: vi.fn().mockResolvedValue(true),
    });
    const useCase = new AddInviteeUseCase(eventRepo, invitationRepo, memberRepo, makeAuditLog());

    await expect(
      useCase.execute(creator, 'group-1', 'event-1', target.userId),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('throws VALIDATION_ERROR when target is not a group member', async () => {
    const event = makeEvent({ createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const memberRepo = makeMemberRepo({
      getRole: vi.fn().mockResolvedValue('member'),
      isMember: vi.fn().mockResolvedValue(false),
    });
    const useCase = new AddInviteeUseCase(eventRepo, invitationRepo, memberRepo, makeAuditLog());

    await expect(
      useCase.execute(creator, 'group-1', 'event-1', target.userId),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws FORBIDDEN for invited non-creator non-admin', async () => {
    const event = makeEvent({ createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue('member') });
    const useCase = new AddInviteeUseCase(eventRepo, invitationRepo, memberRepo, makeAuditLog());

    await expect(
      useCase.execute(memberUser, 'group-1', 'event-1', target.userId),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws NOT_FOUND for non-invited non-admin (no existence disclosure)', async () => {
    const event = makeEvent({ createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(false) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue('member') });
    const useCase = new AddInviteeUseCase(eventRepo, invitationRepo, memberRepo, makeAuditLog());

    await expect(
      useCase.execute(outsider, 'group-1', 'event-1', target.userId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws NOT_FOUND when event does not exist', async () => {
    const useCase = new AddInviteeUseCase(
      makeEventRepo(),
      makeInvitationRepo(),
      makeMemberRepo(),
      makeAuditLog(),
    );

    await expect(
      useCase.execute(creator, 'group-1', 'no-such-event', target.userId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws NOT_FOUND when event belongs to a different group', async () => {
    const event = makeEvent({ groupId: 'group-2' });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const useCase = new AddInviteeUseCase(
      eventRepo,
      makeInvitationRepo(),
      makeMemberRepo(),
      makeAuditLog(),
    );

    await expect(
      useCase.execute(creator, 'group-1', 'event-1', target.userId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// ---------------------------------------------------------------------------
// RemoveInviteeUseCase
// ---------------------------------------------------------------------------

describe('RemoveInviteeUseCase', () => {
  it('allows creator to remove an invitee', async () => {
    const activeInvitation = makeInvitation({ userId: target.userId, status: 'accepted' });
    const event = makeEvent({ createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({
      hasAccess: vi.fn().mockResolvedValue(true),
      findByEventAndUser: vi.fn().mockResolvedValue(activeInvitation),
    });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue('member') });
    const auditLog = makeAuditLog();
    const useCase = new RemoveInviteeUseCase(eventRepo, invitationRepo, memberRepo, auditLog);

    await useCase.execute(creator, 'group-1', 'event-1', target.userId);

    expect(invitationRepo.removeInvitee).toHaveBeenCalledWith('event-1', target.userId);
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'event_invitation.removed' }),
    );
  });

  it('allows group admin to remove invitee without holding an invitation', async () => {
    const admin = FakeIdentity.user('admin');
    const activeInvitation = makeInvitation({ userId: target.userId, status: 'invited' });
    const event = makeEvent({ createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({
      hasAccess: vi.fn().mockResolvedValue(false),
      findByEventAndUser: vi.fn().mockResolvedValue(activeInvitation),
    });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue('admin') });
    const useCase = new RemoveInviteeUseCase(
      eventRepo,
      invitationRepo,
      memberRepo,
      makeAuditLog(),
    );

    await useCase.execute(admin, 'group-1', 'event-1', target.userId);

    expect(invitationRepo.removeInvitee).toHaveBeenCalledWith('event-1', target.userId);
  });

  it('throws NOT_FOUND when target has no active invitation', async () => {
    const event = makeEvent({ createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({
      hasAccess: vi.fn().mockResolvedValue(true),
      findByEventAndUser: vi.fn().mockResolvedValue(null),
    });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue('member') });
    const useCase = new RemoveInviteeUseCase(
      eventRepo,
      invitationRepo,
      memberRepo,
      makeAuditLog(),
    );

    await expect(
      useCase.execute(creator, 'group-1', 'event-1', target.userId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws NOT_FOUND when target invitation is already removed', async () => {
    const removedInvitation = makeInvitation({ userId: target.userId, status: 'removed' });
    const event = makeEvent({ createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({
      hasAccess: vi.fn().mockResolvedValue(true),
      findByEventAndUser: vi.fn().mockResolvedValue(removedInvitation),
    });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue('member') });
    const useCase = new RemoveInviteeUseCase(
      eventRepo,
      invitationRepo,
      memberRepo,
      makeAuditLog(),
    );

    await expect(
      useCase.execute(creator, 'group-1', 'event-1', target.userId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws FORBIDDEN for invited non-creator non-admin', async () => {
    const event = makeEvent({ createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue('member') });
    const useCase = new RemoveInviteeUseCase(
      eventRepo,
      invitationRepo,
      memberRepo,
      makeAuditLog(),
    );

    await expect(
      useCase.execute(memberUser, 'group-1', 'event-1', target.userId),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws NOT_FOUND for non-invited non-admin (no existence disclosure)', async () => {
    const event = makeEvent({ createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(false) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue('member') });
    const useCase = new RemoveInviteeUseCase(
      eventRepo,
      invitationRepo,
      memberRepo,
      makeAuditLog(),
    );

    await expect(
      useCase.execute(outsider, 'group-1', 'event-1', target.userId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws NOT_FOUND when event does not exist', async () => {
    const useCase = new RemoveInviteeUseCase(
      makeEventRepo(),
      makeInvitationRepo(),
      makeMemberRepo(),
      makeAuditLog(),
    );

    await expect(
      useCase.execute(creator, 'group-1', 'no-such-event', target.userId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws NOT_FOUND when event belongs to a different group', async () => {
    const event = makeEvent({ groupId: 'group-2' });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const useCase = new RemoveInviteeUseCase(
      eventRepo,
      makeInvitationRepo(),
      makeMemberRepo(),
      makeAuditLog(),
    );

    await expect(
      useCase.execute(creator, 'group-1', 'event-1', target.userId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws FORBIDDEN when attempting to remove the event creator', async () => {
    // The creator's invitation must not be removable: they would lose access to
    // their own event, breaking the invariant enforced at creation time.
    const activeInvitation = makeInvitation({ userId: creator.userId, status: 'invited' });
    const event = makeEvent({ createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({
      hasAccess: vi.fn().mockResolvedValue(true),
      findByEventAndUser: vi.fn().mockResolvedValue(activeInvitation),
    });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue('owner') });
    const useCase = new RemoveInviteeUseCase(eventRepo, invitationRepo, memberRepo, makeAuditLog());

    // Even a group owner cannot remove the creator.
    await expect(
      useCase.execute(FakeIdentity.user('admin'), 'group-1', 'event-1', creator.userId),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
