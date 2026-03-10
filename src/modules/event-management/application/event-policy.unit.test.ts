import { describe, it, expect, vi } from 'vitest';
import { CreateEventUseCase } from './create-event.usecase.js';
import { GetEventUseCase } from './get-event.usecase.js';
import { ListGroupEventsUseCase } from './list-group-events.usecase.js';
import { CancelEventUseCase } from './cancel-event.usecase.js';
import type { EventCreationPort } from '../domain/event-creation.port.js';
import type { EventRepositoryPort } from '../domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../domain/event-invitation.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { Event } from '../domain/event.js';
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
    const members = [
      makeMember(creator.userId, 'owner'),
      makeMember(memberUser.userId, 'member'),
    ];
    const memberRepo = makeMemberRepo({
      isMember: vi.fn().mockResolvedValue(true),
      listByGroup: vi.fn().mockResolvedValue(members),
    });
    const eventCreator = makeEventCreator();
    const useCase = new CreateEventUseCase(eventCreator, memberRepo);

    await useCase.execute(creator, validCommand);

    const call = (
      eventCreator.createEventWithInvitations as ReturnType<typeof vi.fn>
    ).mock.calls[0][0] as { inviteeIds: string[] };
    expect(call.inviteeIds).toContain(creator.userId);
    expect(call.inviteeIds).toContain(memberUser.userId);
  });

  it('allows creator to exclude members before save', async () => {
    const members = [
      makeMember(creator.userId, 'owner'),
      makeMember(memberUser.userId, 'member'),
    ];
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

    const call = (
      eventCreator.createEventWithInvitations as ReturnType<typeof vi.fn>
    ).mock.calls[0][0] as { inviteeIds: string[] };
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

    const call = (
      eventCreator.createEventWithInvitations as ReturnType<typeof vi.fn>
    ).mock.calls[0][0] as { inviteeIds: string[] };
    expect(call.inviteeIds).toContain(creator.userId);
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

    await expect(
      useCase.execute(creator, { ...validCommand, title: '   ' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
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
    const memberRepo = makeMemberRepo();
    const useCase = new CancelEventUseCase(eventRepo, invitationRepo, memberRepo);

    await useCase.execute(creator, 'event-1');
    expect(eventRepo.cancel).toHaveBeenCalledWith('event-1');
  });

  it('allows group owner to cancel any event', async () => {
    const event = makeEvent({ createdBy: creator.userId });
    const admin = FakeIdentity.user('admin');
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue('owner') });
    const useCase = new CancelEventUseCase(eventRepo, invitationRepo, memberRepo);

    await useCase.execute(admin, 'event-1');
    expect(eventRepo.cancel).toHaveBeenCalledWith('event-1');
  });

  it('throws FORBIDDEN for invited-but-not-creator non-admin', async () => {
    const event = makeEvent({ createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue('member') });
    const useCase = new CancelEventUseCase(eventRepo, invitationRepo, memberRepo);

    await expect(useCase.execute(memberUser, 'event-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('throws NOT_FOUND for non-invited user (no existence disclosure)', async () => {
    const event = makeEvent();
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(false) });
    const useCase = new CancelEventUseCase(eventRepo, invitationRepo, makeMemberRepo());

    await expect(useCase.execute(outsider, 'event-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws CONFLICT when event is already cancelled', async () => {
    const event = makeEvent({ status: 'cancelled', createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const useCase = new CancelEventUseCase(eventRepo, invitationRepo, makeMemberRepo());

    await expect(useCase.execute(creator, 'event-1')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('throws NOT_FOUND when event does not exist', async () => {
    const useCase = new CancelEventUseCase(
      makeEventRepo(),
      makeInvitationRepo(),
      makeMemberRepo(),
    );
    await expect(useCase.execute(creator, 'no-such-event')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
