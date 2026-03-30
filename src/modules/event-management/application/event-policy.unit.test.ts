import { describe, it, expect, vi } from 'vitest';
import { CreateEventUseCase } from './create-event.usecase.js';
import { GetEventUseCase } from './get-event.usecase.js';
import { ListGroupEventsUseCase, applyVisibilityFilter } from './list-group-events.usecase.js';
import { GetSharedGroupEventUseCase } from './get-shared-group-event.usecase.js';
import { CancelEventUseCase } from './cancel-event.usecase.js';
import { UpdateEventUseCase } from './update-event.usecase.js';
import { ListEventInviteesUseCase } from './list-event-invitees.usecase.js';
import { AddEventInviteeUseCase } from './add-event-invitee.usecase.js';
import { RemoveEventInviteeUseCase } from './remove-event-invitee.usecase.js';
import type { EventCreationPort } from '../domain/event-creation.port.js';
import type { EventRepositoryPort } from '../domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../domain/event-invitation.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { AuditLogPort } from '../../audit-security/index.js';
import type { Event } from '../domain/event.js';
import type { EventInvitation } from '../domain/event-invitation.js';
import type { GroupMember } from '../../group-membership/domain/group-member.js';
import type { SharedEventQueryPort, SharedEventRecord } from '../domain/shared-event-query.port.js';
import { isValidVisibilityLevel } from '../../event-sharing/domain/event-share.js';
import { FakeIdentity } from '../../../shared/test-helpers/fake-identity.js';

function makeEvent(overrides?: Partial<Event>): Event {
  return {
    id: 'event-1',
    groupId: 'group-1',
    ownerId: 'creator-id',
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

function makeAuditLog(): AuditLogPort {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

function makeEventCreator(event: Event = makeEvent()): EventCreationPort {
  return { createEventWithInvitations: vi.fn().mockResolvedValue(event) };
}

function makeEventRepo(overrides?: Partial<EventRepositoryPort>): EventRepositoryPort {
  return {
    findById: vi.fn().mockResolvedValue(null),
    listByGroupForUser: vi.fn().mockResolvedValue([]),
    listByOwner: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(makeEvent()),
    cancel: vi.fn().mockResolvedValue(undefined),
    deleteEvent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeInvitationRepo(
  overrides?: Partial<EventInvitationRepositoryPort>,
): EventInvitationRepositoryPort {
  return {
    findByEventAndUser: vi.fn().mockResolvedValue(null),
    hasAccess: vi.fn().mockResolvedValue(false),
    listByEvent: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue(makeInvitation()),
    remove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeSharedEventRecord(overrides?: Partial<SharedEventRecord>): SharedEventRecord {
  return {
    eventId: 'event-1',
    ownerId: 'creator-id',
    ownerDisplayName: 'Test User',
    title: 'Team Lunch',
    description: null,
    startAt: new Date('2026-06-01T12:00:00Z'),
    endAt: new Date('2026-06-01T13:00:00Z'),
    status: 'scheduled',
    visibilityLevel: 'details',
    ...overrides,
  };
}

function makeSharedEventQuery(overrides?: Partial<SharedEventQueryPort>): SharedEventQueryPort {
  return {
    listByGroup: vi.fn().mockResolvedValue({ events: [], total: 0 }),
    findByGroupAndEvent: vi.fn().mockResolvedValue(null),
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
  it('returns shared events for a group member with visibility filtering', async () => {
    const records = [makeSharedEventRecord({ visibilityLevel: 'details' })];
    const sharedEventQuery = makeSharedEventQuery({
      listByGroup: vi.fn().mockResolvedValue({ events: records, total: 1 }),
    });
    const memberRepo = makeMemberRepo({ isMember: vi.fn().mockResolvedValue(true) });
    const useCase = new ListGroupEventsUseCase(sharedEventQuery, memberRepo);

    const result = await useCase.execute(memberUser, 'group-1');
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      id: 'event-1',
      ownerId: 'creator-id',
      ownerDisplayName: 'Test User',
      visibilityLevel: 'details',
      title: 'Team Lunch',
    });
    expect(result.total).toBe(1);
  });

  it('throws NOT_FOUND for non-member (no disclosure of group or events)', async () => {
    const memberRepo = makeMemberRepo({ isMember: vi.fn().mockResolvedValue(false) });
    const useCase = new ListGroupEventsUseCase(makeSharedEventQuery(), memberRepo);

    await expect(useCase.execute(outsider, 'group-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('returns empty list when no events are shared to the group', async () => {
    const memberRepo = makeMemberRepo({ isMember: vi.fn().mockResolvedValue(true) });
    const sharedEventQuery = makeSharedEventQuery({
      listByGroup: vi.fn().mockResolvedValue({ events: [], total: 0 }),
    });
    const useCase = new ListGroupEventsUseCase(sharedEventQuery, memberRepo);

    const result = await useCase.execute(memberUser, 'group-1');
    expect(result.events).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('busy visibility returns only id, owner, times — no title or description', async () => {
    const records = [makeSharedEventRecord({ visibilityLevel: 'busy', title: 'Secret Meeting' })];
    const sharedEventQuery = makeSharedEventQuery({
      listByGroup: vi.fn().mockResolvedValue({ events: records, total: 1 }),
    });
    const memberRepo = makeMemberRepo({ isMember: vi.fn().mockResolvedValue(true) });
    const useCase = new ListGroupEventsUseCase(sharedEventQuery, memberRepo);

    const result = await useCase.execute(memberUser, 'group-1');
    const dto = result.events[0]!;
    expect(dto.visibilityLevel).toBe('busy');
    expect(dto.id).toBe('event-1');
    expect(dto.ownerId).toBe('creator-id');
    expect(dto.ownerDisplayName).toBe('Test User');
    expect(dto).not.toHaveProperty('title');
    expect(dto).not.toHaveProperty('description');
    expect(dto).not.toHaveProperty('status');
  });

  it('title visibility returns title and status but no description', async () => {
    const records = [
      makeSharedEventRecord({
        visibilityLevel: 'title',
        title: 'Team Standup',
        description: 'Weekly sync',
      }),
    ];
    const sharedEventQuery = makeSharedEventQuery({
      listByGroup: vi.fn().mockResolvedValue({ events: records, total: 1 }),
    });
    const memberRepo = makeMemberRepo({ isMember: vi.fn().mockResolvedValue(true) });
    const useCase = new ListGroupEventsUseCase(sharedEventQuery, memberRepo);

    const result = await useCase.execute(memberUser, 'group-1');
    const dto = result.events[0]!;
    expect(dto.visibilityLevel).toBe('title');
    expect(dto.title).toBe('Team Standup');
    expect(dto.status).toBe('scheduled');
    expect(dto).not.toHaveProperty('description');
  });

  it('details visibility returns full event data', async () => {
    const records = [
      makeSharedEventRecord({
        visibilityLevel: 'details',
        title: 'Team Standup',
        description: 'Weekly sync with the team',
      }),
    ];
    const sharedEventQuery = makeSharedEventQuery({
      listByGroup: vi.fn().mockResolvedValue({ events: records, total: 1 }),
    });
    const memberRepo = makeMemberRepo({ isMember: vi.fn().mockResolvedValue(true) });
    const useCase = new ListGroupEventsUseCase(sharedEventQuery, memberRepo);

    const result = await useCase.execute(memberUser, 'group-1');
    const dto = result.events[0]!;
    expect(dto.visibilityLevel).toBe('details');
    expect(dto.title).toBe('Team Standup');
    expect(dto.description).toBe('Weekly sync with the team');
    expect(dto.status).toBe('scheduled');
  });

  it('passes date range and pagination to the query port', async () => {
    const listByGroup = vi.fn().mockResolvedValue({ events: [], total: 0 });
    const sharedEventQuery = makeSharedEventQuery({ listByGroup });
    const memberRepo = makeMemberRepo({ isMember: vi.fn().mockResolvedValue(true) });
    const useCase = new ListGroupEventsUseCase(sharedEventQuery, memberRepo);

    const dateRange = { from: new Date('2026-01-01'), to: new Date('2026-12-31') };
    const pagination = { page: 2, limit: 10 };
    await useCase.execute(memberUser, 'group-1', dateRange, pagination);

    expect(listByGroup).toHaveBeenCalledWith('group-1', memberUser.userId, dateRange, pagination);
  });
});

// ---------------------------------------------------------------------------
// GetSharedGroupEventUseCase
// ---------------------------------------------------------------------------

describe('GetSharedGroupEventUseCase', () => {
  it('returns visibility-filtered event for a group member', async () => {
    const record = makeSharedEventRecord({ visibilityLevel: 'details' });
    const sharedEventQuery = makeSharedEventQuery({
      findByGroupAndEvent: vi.fn().mockResolvedValue(record),
    });
    const memberRepo = makeMemberRepo({ isMember: vi.fn().mockResolvedValue(true) });
    const useCase = new GetSharedGroupEventUseCase(sharedEventQuery, memberRepo);

    const result = await useCase.execute(memberUser, 'group-1', 'event-1');
    expect(result.id).toBe('event-1');
    expect(result.visibilityLevel).toBe('details');
    expect(result.title).toBe('Team Lunch');
  });

  it('throws NOT_FOUND for non-member (no disclosure of group existence)', async () => {
    const memberRepo = makeMemberRepo({ isMember: vi.fn().mockResolvedValue(false) });
    const useCase = new GetSharedGroupEventUseCase(makeSharedEventQuery(), memberRepo);

    await expect(useCase.execute(outsider, 'group-1', 'event-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when event is not shared to the group', async () => {
    const sharedEventQuery = makeSharedEventQuery({
      findByGroupAndEvent: vi.fn().mockResolvedValue(null),
    });
    const memberRepo = makeMemberRepo({ isMember: vi.fn().mockResolvedValue(true) });
    const useCase = new GetSharedGroupEventUseCase(sharedEventQuery, memberRepo);

    await expect(useCase.execute(memberUser, 'group-1', 'event-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('busy visibility returns only id, owner, times — no title or description', async () => {
    const record = makeSharedEventRecord({
      visibilityLevel: 'busy',
      title: 'Secret Meeting',
      description: 'Top secret',
    });
    const sharedEventQuery = makeSharedEventQuery({
      findByGroupAndEvent: vi.fn().mockResolvedValue(record),
    });
    const memberRepo = makeMemberRepo({ isMember: vi.fn().mockResolvedValue(true) });
    const useCase = new GetSharedGroupEventUseCase(sharedEventQuery, memberRepo);

    const dto = await useCase.execute(memberUser, 'group-1', 'event-1');
    expect(dto.visibilityLevel).toBe('busy');
    expect(dto.id).toBe('event-1');
    expect(dto.ownerId).toBe('creator-id');
    expect(dto).not.toHaveProperty('title');
    expect(dto).not.toHaveProperty('description');
    expect(dto).not.toHaveProperty('status');
  });

  it('title visibility returns title and status but no description', async () => {
    const record = makeSharedEventRecord({
      visibilityLevel: 'title',
      title: 'Team Standup',
      description: 'Weekly sync',
    });
    const sharedEventQuery = makeSharedEventQuery({
      findByGroupAndEvent: vi.fn().mockResolvedValue(record),
    });
    const memberRepo = makeMemberRepo({ isMember: vi.fn().mockResolvedValue(true) });
    const useCase = new GetSharedGroupEventUseCase(sharedEventQuery, memberRepo);

    const dto = await useCase.execute(memberUser, 'group-1', 'event-1');
    expect(dto.visibilityLevel).toBe('title');
    expect(dto.title).toBe('Team Standup');
    expect(dto.status).toBe('scheduled');
    expect(dto).not.toHaveProperty('description');
  });

  it('details visibility returns full event data including description', async () => {
    const record = makeSharedEventRecord({
      visibilityLevel: 'details',
      title: 'Full Event',
      description: 'Complete description',
    });
    const sharedEventQuery = makeSharedEventQuery({
      findByGroupAndEvent: vi.fn().mockResolvedValue(record),
    });
    const memberRepo = makeMemberRepo({ isMember: vi.fn().mockResolvedValue(true) });
    const useCase = new GetSharedGroupEventUseCase(sharedEventQuery, memberRepo);

    const dto = await useCase.execute(memberUser, 'group-1', 'event-1');
    expect(dto.visibilityLevel).toBe('details');
    expect(dto.title).toBe('Full Event');
    expect(dto.description).toBe('Complete description');
    expect(dto.status).toBe('scheduled');
  });
});

// ---------------------------------------------------------------------------
// applyVisibilityFilter — fail-closed behaviour
// ---------------------------------------------------------------------------

describe('applyVisibilityFilter — fail-closed behaviour', () => {
  it('unknown visibility level is treated as busy (no title, description, or status)', () => {
    const record = makeSharedEventRecord({
      visibilityLevel: 'unknown_level' as SharedEventRecord['visibilityLevel'],
      title: 'Secret Title',
      description: 'Secret description',
    });

    const dto = applyVisibilityFilter(record);
    expect(dto.id).toBe('event-1');
    expect(dto.ownerId).toBe('creator-id');
    expect(dto.ownerDisplayName).toBe('Test User');
    expect(dto).not.toHaveProperty('title');
    expect(dto).not.toHaveProperty('description');
    expect(dto).not.toHaveProperty('status');
  });

  it('empty string visibility level is treated as busy', () => {
    const record = makeSharedEventRecord({
      visibilityLevel: '' as SharedEventRecord['visibilityLevel'],
      title: 'Should Be Hidden',
      description: 'Also hidden',
    });

    const dto = applyVisibilityFilter(record);
    expect(dto).not.toHaveProperty('title');
    expect(dto).not.toHaveProperty('description');
    expect(dto).not.toHaveProperty('status');
  });
});

// ---------------------------------------------------------------------------
// isValidVisibilityLevel guard
// ---------------------------------------------------------------------------

describe('isValidVisibilityLevel', () => {
  it.each(['busy', 'title', 'details'])('returns true for valid level "%s"', (level) => {
    expect(isValidVisibilityLevel(level)).toBe(true);
  });

  it.each([
    'unknown',
    '',
    'BUSY',
    'Title',
    'DETAILS',
    null,
    undefined,
    42,
    true,
    {},
  ])('returns false for invalid value %j', (value) => {
    expect(isValidVisibilityLevel(value)).toBe(false);
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

// ---------------------------------------------------------------------------
// UpdateEventUseCase
// ---------------------------------------------------------------------------

describe('UpdateEventUseCase', () => {
  it('allows creator to update their own event', async () => {
    const event = makeEvent({ createdBy: creator.userId });
    const updated = makeEvent({ createdBy: creator.userId, title: 'Updated' });
    const eventRepo = makeEventRepo({
      findById: vi.fn().mockResolvedValue(event),
      update: vi.fn().mockResolvedValue(updated),
    });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue(null) });
    const useCase = new UpdateEventUseCase(eventRepo, invitationRepo, memberRepo);

    const result = await useCase.execute(creator, 'group-1', 'event-1', { title: 'Updated' });
    expect(result.title).toBe('Updated');
    expect(eventRepo.update).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({ title: 'Updated' }),
    );
  });

  it('allows group admin to update any event', async () => {
    const admin = FakeIdentity.user('admin');
    const event = makeEvent({ createdBy: creator.userId });
    const updated = makeEvent({ title: 'Admin Updated' });
    const eventRepo = makeEventRepo({
      findById: vi.fn().mockResolvedValue(event),
      update: vi.fn().mockResolvedValue(updated),
    });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(false) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue('admin') });
    const useCase = new UpdateEventUseCase(eventRepo, invitationRepo, memberRepo);

    await useCase.execute(admin, 'group-1', 'event-1', { title: 'Admin Updated' });
    expect(eventRepo.update).toHaveBeenCalled();
  });

  it('throws FORBIDDEN for invited-but-not-creator non-admin', async () => {
    const event = makeEvent({ createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue('member') });
    const useCase = new UpdateEventUseCase(eventRepo, invitationRepo, memberRepo);

    await expect(
      useCase.execute(memberUser, 'group-1', 'event-1', { title: 'Hacked' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws NOT_FOUND for non-invited non-admin (no existence disclosure)', async () => {
    const event = makeEvent({ createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(false) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue(null) });
    const useCase = new UpdateEventUseCase(eventRepo, invitationRepo, memberRepo);

    await expect(
      useCase.execute(outsider, 'group-1', 'event-1', { title: 'Hacked' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws CONFLICT when trying to edit a cancelled event', async () => {
    const event = makeEvent({ status: 'cancelled', createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue(null) });
    const useCase = new UpdateEventUseCase(eventRepo, invitationRepo, memberRepo);

    await expect(
      useCase.execute(creator, 'group-1', 'event-1', { title: 'Fixed' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('throws VALIDATION_ERROR for empty title', async () => {
    const event = makeEvent({ createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue(null) });
    const useCase = new UpdateEventUseCase(eventRepo, invitationRepo, memberRepo);

    await expect(
      useCase.execute(creator, 'group-1', 'event-1', { title: '  ' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws VALIDATION_ERROR when endAt is before startAt', async () => {
    const event = makeEvent({ createdBy: creator.userId });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue(null) });
    const useCase = new UpdateEventUseCase(eventRepo, invitationRepo, memberRepo);

    await expect(
      useCase.execute(creator, 'group-1', 'event-1', {
        endAt: new Date('2026-06-01T10:00:00Z'), // before current startAt
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws NOT_FOUND when event does not exist', async () => {
    const useCase = new UpdateEventUseCase(makeEventRepo(), makeInvitationRepo(), makeMemberRepo());
    await expect(
      useCase.execute(creator, 'group-1', 'no-such-event', { title: 'X' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// ---------------------------------------------------------------------------
// ListEventInviteesUseCase
// ---------------------------------------------------------------------------

describe('ListEventInviteesUseCase', () => {
  it('returns invitations for a user with active access', async () => {
    const invitations = [makeInvitation()];
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(makeEvent()) });
    const invitationRepo = makeInvitationRepo({
      hasAccess: vi.fn().mockResolvedValue(true),
      listByEvent: vi.fn().mockResolvedValue(invitations),
    });
    const useCase = new ListEventInviteesUseCase(eventRepo, invitationRepo);

    const result = await useCase.execute(creator, 'group-1', 'event-1');
    expect(result).toEqual(invitations);
  });

  it('throws NOT_FOUND for non-invited caller (no existence disclosure)', async () => {
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(makeEvent()) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(false) });
    const useCase = new ListEventInviteesUseCase(eventRepo, invitationRepo);

    await expect(useCase.execute(outsider, 'group-1', 'event-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when event does not exist', async () => {
    const useCase = new ListEventInviteesUseCase(makeEventRepo(), makeInvitationRepo());
    await expect(useCase.execute(creator, 'group-1', 'no-such-event')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

// ---------------------------------------------------------------------------
// AddEventInviteeUseCase
// ---------------------------------------------------------------------------

describe('AddEventInviteeUseCase', () => {
  it('allows creator to add a group member as invitee', async () => {
    const invitation = makeInvitation({ userId: memberUser.userId });
    const eventRepo = makeEventRepo({
      findById: vi.fn().mockResolvedValue(makeEvent({ createdBy: creator.userId })),
    });
    const invitationRepo = makeInvitationRepo({
      hasAccess: vi.fn().mockResolvedValue(true),
      findByEventAndUser: vi.fn().mockResolvedValue(null),
      add: vi.fn().mockResolvedValue(invitation),
    });
    const memberRepo = makeMemberRepo({
      getRole: vi.fn().mockResolvedValue(null),
      isMember: vi.fn().mockResolvedValue(true),
    });
    const auditLog = makeAuditLog();
    const useCase = new AddEventInviteeUseCase(eventRepo, invitationRepo, memberRepo, auditLog);

    const result = await useCase.execute(creator, 'group-1', 'event-1', memberUser.userId);
    expect(result.userId).toBe(memberUser.userId);
    expect(invitationRepo.add).toHaveBeenCalledWith('event-1', memberUser.userId);
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'event_invitation.added' }),
    );
  });

  it('allows group admin to add invitee without their own invitation', async () => {
    const admin = FakeIdentity.user('admin');
    const invitation = makeInvitation({ userId: memberUser.userId });
    const eventRepo = makeEventRepo({
      findById: vi.fn().mockResolvedValue(makeEvent({ createdBy: creator.userId })),
    });
    const invitationRepo = makeInvitationRepo({
      hasAccess: vi.fn().mockResolvedValue(false),
      findByEventAndUser: vi.fn().mockResolvedValue(null),
      add: vi.fn().mockResolvedValue(invitation),
    });
    const memberRepo = makeMemberRepo({
      getRole: vi.fn().mockResolvedValue('admin'),
      isMember: vi.fn().mockResolvedValue(true),
    });
    const useCase = new AddEventInviteeUseCase(
      eventRepo,
      invitationRepo,
      memberRepo,
      makeAuditLog(),
    );

    await useCase.execute(admin, 'group-1', 'event-1', memberUser.userId);
    expect(invitationRepo.add).toHaveBeenCalled();
  });

  it('throws FORBIDDEN for invited-but-not-creator non-admin', async () => {
    const eventRepo = makeEventRepo({
      findById: vi.fn().mockResolvedValue(makeEvent({ createdBy: creator.userId })),
    });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue('member') });
    const useCase = new AddEventInviteeUseCase(
      eventRepo,
      invitationRepo,
      memberRepo,
      makeAuditLog(),
    );

    await expect(
      useCase.execute(memberUser, 'group-1', 'event-1', outsider.userId),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws VALIDATION_ERROR when target is not a group member', async () => {
    const eventRepo = makeEventRepo({
      findById: vi.fn().mockResolvedValue(makeEvent({ createdBy: creator.userId })),
    });
    const invitationRepo = makeInvitationRepo({
      hasAccess: vi.fn().mockResolvedValue(true),
      findByEventAndUser: vi.fn().mockResolvedValue(null),
    });
    const memberRepo = makeMemberRepo({
      getRole: vi.fn().mockResolvedValue(null),
      isMember: vi.fn().mockResolvedValue(false),
    });
    const useCase = new AddEventInviteeUseCase(
      eventRepo,
      invitationRepo,
      memberRepo,
      makeAuditLog(),
    );

    await expect(
      useCase.execute(creator, 'group-1', 'event-1', outsider.userId),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws CONFLICT when user already has an active invitation', async () => {
    const existing = makeInvitation({ userId: memberUser.userId, status: 'accepted' });
    const eventRepo = makeEventRepo({
      findById: vi.fn().mockResolvedValue(makeEvent({ createdBy: creator.userId })),
    });
    const invitationRepo = makeInvitationRepo({
      hasAccess: vi.fn().mockResolvedValue(true),
      findByEventAndUser: vi.fn().mockResolvedValue(existing),
    });
    const memberRepo = makeMemberRepo({
      getRole: vi.fn().mockResolvedValue(null),
      isMember: vi.fn().mockResolvedValue(true),
    });
    const useCase = new AddEventInviteeUseCase(
      eventRepo,
      invitationRepo,
      memberRepo,
      makeAuditLog(),
    );

    await expect(
      useCase.execute(creator, 'group-1', 'event-1', memberUser.userId),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('reactivates a previously removed invitation', async () => {
    const removed = makeInvitation({ userId: memberUser.userId, status: 'removed' });
    const reactivated = makeInvitation({ userId: memberUser.userId, status: 'invited' });
    const eventRepo = makeEventRepo({
      findById: vi.fn().mockResolvedValue(makeEvent({ createdBy: creator.userId })),
    });
    const invitationRepo = makeInvitationRepo({
      hasAccess: vi.fn().mockResolvedValue(true),
      findByEventAndUser: vi.fn().mockResolvedValue(removed),
      add: vi.fn().mockResolvedValue(reactivated),
    });
    const memberRepo = makeMemberRepo({
      getRole: vi.fn().mockResolvedValue(null),
      isMember: vi.fn().mockResolvedValue(true),
    });
    const useCase = new AddEventInviteeUseCase(
      eventRepo,
      invitationRepo,
      memberRepo,
      makeAuditLog(),
    );

    const result = await useCase.execute(creator, 'group-1', 'event-1', memberUser.userId);
    expect(result.status).toBe('invited');
    expect(invitationRepo.add).toHaveBeenCalledWith('event-1', memberUser.userId);
  });

  it('throws CONFLICT when trying to add invitee to a cancelled event', async () => {
    const eventRepo = makeEventRepo({
      findById: vi
        .fn()
        .mockResolvedValue(makeEvent({ status: 'cancelled', createdBy: creator.userId })),
    });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const memberRepo = makeMemberRepo({
      getRole: vi.fn().mockResolvedValue(null),
      isMember: vi.fn().mockResolvedValue(true),
    });
    const useCase = new AddEventInviteeUseCase(
      eventRepo,
      invitationRepo,
      memberRepo,
      makeAuditLog(),
    );

    await expect(
      useCase.execute(creator, 'group-1', 'event-1', memberUser.userId),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

// ---------------------------------------------------------------------------
// RemoveEventInviteeUseCase
// ---------------------------------------------------------------------------

describe('RemoveEventInviteeUseCase', () => {
  it('allows creator to remove an invitee', async () => {
    const invitation = makeInvitation({ userId: memberUser.userId, status: 'invited' });
    const eventRepo = makeEventRepo({
      findById: vi.fn().mockResolvedValue(makeEvent({ createdBy: creator.userId })),
    });
    const invitationRepo = makeInvitationRepo({
      hasAccess: vi.fn().mockResolvedValue(true),
      findByEventAndUser: vi.fn().mockResolvedValue(invitation),
      remove: vi.fn().mockResolvedValue(undefined),
    });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue(null) });
    const useCase = new RemoveEventInviteeUseCase(
      eventRepo,
      invitationRepo,
      memberRepo,
      makeAuditLog(),
    );

    await useCase.execute(creator, 'group-1', 'event-1', memberUser.userId);
    expect(invitationRepo.remove).toHaveBeenCalledWith('event-1', memberUser.userId);
  });

  it('allows admin to remove an invitee', async () => {
    const admin = FakeIdentity.user('admin');
    const invitation = makeInvitation({ userId: memberUser.userId, status: 'invited' });
    const eventRepo = makeEventRepo({
      findById: vi.fn().mockResolvedValue(makeEvent({ createdBy: creator.userId })),
    });
    const invitationRepo = makeInvitationRepo({
      hasAccess: vi.fn().mockResolvedValue(false),
      findByEventAndUser: vi.fn().mockResolvedValue(invitation),
      remove: vi.fn().mockResolvedValue(undefined),
    });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue('admin') });
    const useCase = new RemoveEventInviteeUseCase(
      eventRepo,
      invitationRepo,
      memberRepo,
      makeAuditLog(),
    );

    await useCase.execute(admin, 'group-1', 'event-1', memberUser.userId);
    expect(invitationRepo.remove).toHaveBeenCalled();
  });

  it('throws FORBIDDEN for invited-but-not-creator non-admin', async () => {
    const eventRepo = makeEventRepo({
      findById: vi.fn().mockResolvedValue(makeEvent({ createdBy: creator.userId })),
    });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue('member') });
    const useCase = new RemoveEventInviteeUseCase(
      eventRepo,
      invitationRepo,
      memberRepo,
      makeAuditLog(),
    );

    await expect(
      useCase.execute(memberUser, 'group-1', 'event-1', outsider.userId),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws VALIDATION_ERROR when trying to remove the event creator', async () => {
    const eventRepo = makeEventRepo({
      findById: vi.fn().mockResolvedValue(makeEvent({ createdBy: creator.userId })),
    });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue(null) });
    const useCase = new RemoveEventInviteeUseCase(
      eventRepo,
      invitationRepo,
      memberRepo,
      makeAuditLog(),
    );

    await expect(
      useCase.execute(creator, 'group-1', 'event-1', creator.userId),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws NOT_FOUND when target has no active invitation', async () => {
    const eventRepo = makeEventRepo({
      findById: vi.fn().mockResolvedValue(makeEvent({ createdBy: creator.userId })),
    });
    const invitationRepo = makeInvitationRepo({
      hasAccess: vi.fn().mockResolvedValue(true),
      findByEventAndUser: vi.fn().mockResolvedValue(null),
    });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue(null) });
    const useCase = new RemoveEventInviteeUseCase(
      eventRepo,
      invitationRepo,
      memberRepo,
      makeAuditLog(),
    );

    await expect(
      useCase.execute(creator, 'group-1', 'event-1', outsider.userId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws NOT_FOUND when target invitation is already removed', async () => {
    const removed = makeInvitation({ userId: memberUser.userId, status: 'removed' });
    const eventRepo = makeEventRepo({
      findById: vi.fn().mockResolvedValue(makeEvent({ createdBy: creator.userId })),
    });
    const invitationRepo = makeInvitationRepo({
      hasAccess: vi.fn().mockResolvedValue(true),
      findByEventAndUser: vi.fn().mockResolvedValue(removed),
    });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue(null) });
    const useCase = new RemoveEventInviteeUseCase(
      eventRepo,
      invitationRepo,
      memberRepo,
      makeAuditLog(),
    );

    await expect(
      useCase.execute(creator, 'group-1', 'event-1', memberUser.userId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws NOT_FOUND for non-invited non-admin (no existence disclosure)', async () => {
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(makeEvent()) });
    const invitationRepo = makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(false) });
    const memberRepo = makeMemberRepo({ getRole: vi.fn().mockResolvedValue(null) });
    const useCase = new RemoveEventInviteeUseCase(
      eventRepo,
      invitationRepo,
      memberRepo,
      makeAuditLog(),
    );

    await expect(
      useCase.execute(outsider, 'group-1', 'event-1', memberUser.userId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
