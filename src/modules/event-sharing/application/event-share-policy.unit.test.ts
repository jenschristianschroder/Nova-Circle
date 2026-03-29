import { describe, it, expect, vi } from 'vitest';
import { ShareEventToGroupUseCase } from './share-event-to-group.usecase.js';
import { UpdateEventShareUseCase } from './update-event-share.usecase.js';
import { RevokeEventShareUseCase } from './revoke-event-share.usecase.js';
import { ListEventSharesUseCase } from './list-event-shares.usecase.js';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { EventShareRepositoryPort } from '../domain/event-share.repository.port.js';
import type { Event } from '../../event-management/domain/event.js';
import type { EventShare } from '../domain/event-share.js';
import { FakeIdentity } from '../../../shared/test-helpers/fake-identity.js';

function makeEvent(overrides?: Partial<Event>): Event {
  return {
    id: 'event-1',
    groupId: null,
    ownerId: 'owner-id',
    title: 'Test Event',
    description: null,
    startAt: new Date('2026-06-01T12:00:00Z'),
    endAt: null,
    createdBy: 'owner-id',
    status: 'scheduled',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeShare(overrides?: Partial<EventShare>): EventShare {
  return {
    id: 'share-1',
    eventId: 'event-1',
    groupId: 'group-1',
    visibilityLevel: 'title',
    sharedByUserId: 'owner-id',
    sharedAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeEventRepo(overrides?: Partial<EventRepositoryPort>): EventRepositoryPort {
  return {
    findById: vi.fn().mockResolvedValue(null),
    listByGroupForUser: vi.fn().mockResolvedValue([]),
    listByOwner: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(null),
    cancel: vi.fn().mockResolvedValue(undefined),
    deleteEvent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeMemberRepo(overrides?: Partial<GroupMemberRepositoryPort>): GroupMemberRepositoryPort {
  return {
    findByGroupAndUser: vi.fn().mockResolvedValue(null),
    listByGroup: vi.fn().mockResolvedValue([]),
    listByUser: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue(null),
    remove: vi.fn().mockResolvedValue(undefined),
    isMember: vi.fn().mockResolvedValue(false),
    getRole: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function makeShareRepo(overrides?: Partial<EventShareRepositoryPort>): EventShareRepositoryPort {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByEventAndGroup: vi.fn().mockResolvedValue(null),
    listByEvent: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(makeShare()),
    updateVisibility: vi.fn().mockResolvedValue(makeShare()),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ShareEventToGroupUseCase
// ---------------------------------------------------------------------------

describe('ShareEventToGroupUseCase', () => {
  it('throws NOT_FOUND when event does not exist', async () => {
    const useCase = new ShareEventToGroupUseCase(
      makeEventRepo(),
      makeMemberRepo(),
      makeShareRepo(),
    );
    const caller = FakeIdentity.random();
    await expect(useCase.execute(caller, 'event-1', 'group-1', 'title')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws FORBIDDEN when caller is not the event owner', async () => {
    const caller = FakeIdentity.random();
    const event = makeEvent({ ownerId: 'someone-else' });
    const useCase = new ShareEventToGroupUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(event) }),
      makeMemberRepo(),
      makeShareRepo(),
    );
    await expect(useCase.execute(caller, 'event-1', 'group-1', 'title')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('throws FORBIDDEN when caller is not a member of target group', async () => {
    const caller = FakeIdentity.random();
    const event = makeEvent({ ownerId: caller.userId });
    const useCase = new ShareEventToGroupUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(event) }),
      makeMemberRepo({ isMember: vi.fn().mockResolvedValue(false) }),
      makeShareRepo(),
    );
    await expect(useCase.execute(caller, 'event-1', 'group-1', 'title')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('throws CONFLICT when event is already shared to the group', async () => {
    const caller = FakeIdentity.random();
    const event = makeEvent({ ownerId: caller.userId });
    const useCase = new ShareEventToGroupUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(event) }),
      makeMemberRepo({ isMember: vi.fn().mockResolvedValue(true) }),
      makeShareRepo({ findByEventAndGroup: vi.fn().mockResolvedValue(makeShare()) }),
    );
    await expect(useCase.execute(caller, 'event-1', 'group-1', 'title')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('creates a share when caller is owner and member of target group', async () => {
    const caller = FakeIdentity.random();
    const event = makeEvent({ ownerId: caller.userId });
    const create = vi.fn().mockResolvedValue(makeShare());
    const useCase = new ShareEventToGroupUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(event) }),
      makeMemberRepo({ isMember: vi.fn().mockResolvedValue(true) }),
      makeShareRepo({ create }),
    );
    const result = await useCase.execute(caller, 'event-1', 'group-1', 'busy');
    expect(create).toHaveBeenCalledWith({
      eventId: 'event-1',
      groupId: 'group-1',
      visibilityLevel: 'busy',
      sharedByUserId: caller.userId,
    });
    expect(result).toBeDefined();
  });

  it('allows sharing to multiple groups with different visibility levels', async () => {
    const caller = FakeIdentity.random();
    const event = makeEvent({ ownerId: caller.userId });
    const create = vi.fn().mockResolvedValue(makeShare());
    const findByEventAndGroup = vi.fn().mockResolvedValue(null);
    const useCase = new ShareEventToGroupUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(event) }),
      makeMemberRepo({ isMember: vi.fn().mockResolvedValue(true) }),
      makeShareRepo({ create, findByEventAndGroup }),
    );

    await useCase.execute(caller, 'event-1', 'group-1', 'busy');
    await useCase.execute(caller, 'event-1', 'group-2', 'details');

    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'group-1', visibilityLevel: 'busy' }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'group-2', visibilityLevel: 'details' }),
    );
  });
});

// ---------------------------------------------------------------------------
// UpdateEventShareUseCase
// ---------------------------------------------------------------------------

describe('UpdateEventShareUseCase', () => {
  it('throws NOT_FOUND when event does not exist', async () => {
    const useCase = new UpdateEventShareUseCase(makeEventRepo(), makeShareRepo());
    const caller = FakeIdentity.random();
    await expect(useCase.execute(caller, 'event-1', 'share-1', 'busy')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws FORBIDDEN when caller is not the event owner', async () => {
    const caller = FakeIdentity.random();
    const event = makeEvent({ ownerId: 'someone-else' });
    const useCase = new UpdateEventShareUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(event) }),
      makeShareRepo(),
    );
    await expect(useCase.execute(caller, 'event-1', 'share-1', 'busy')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('throws NOT_FOUND when share does not exist', async () => {
    const caller = FakeIdentity.random();
    const event = makeEvent({ ownerId: caller.userId });
    const useCase = new UpdateEventShareUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(event) }),
      makeShareRepo({ findById: vi.fn().mockResolvedValue(null) }),
    );
    await expect(useCase.execute(caller, 'event-1', 'share-1', 'busy')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when share belongs to different event', async () => {
    const caller = FakeIdentity.random();
    const event = makeEvent({ ownerId: caller.userId });
    const share = makeShare({ eventId: 'other-event' });
    const useCase = new UpdateEventShareUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(event) }),
      makeShareRepo({ findById: vi.fn().mockResolvedValue(share) }),
    );
    await expect(useCase.execute(caller, 'event-1', 'share-1', 'busy')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('updates visibility level when caller is the owner', async () => {
    const caller = FakeIdentity.random();
    const event = makeEvent({ ownerId: caller.userId });
    const share = makeShare({ eventId: 'event-1' });
    const updatedShare = makeShare({ visibilityLevel: 'details' });
    const updateVisibility = vi.fn().mockResolvedValue(updatedShare);
    const useCase = new UpdateEventShareUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(event) }),
      makeShareRepo({ findById: vi.fn().mockResolvedValue(share), updateVisibility }),
    );
    const result = await useCase.execute(caller, 'event-1', 'share-1', 'details');
    expect(updateVisibility).toHaveBeenCalledWith('share-1', 'details');
    expect(result.visibilityLevel).toBe('details');
  });
});

// ---------------------------------------------------------------------------
// RevokeEventShareUseCase
// ---------------------------------------------------------------------------

describe('RevokeEventShareUseCase', () => {
  it('throws NOT_FOUND when event does not exist', async () => {
    const useCase = new RevokeEventShareUseCase(makeEventRepo(), makeShareRepo());
    const caller = FakeIdentity.random();
    await expect(useCase.execute(caller, 'event-1', 'share-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws FORBIDDEN when caller is not the event owner', async () => {
    const caller = FakeIdentity.random();
    const event = makeEvent({ ownerId: 'someone-else' });
    const useCase = new RevokeEventShareUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(event) }),
      makeShareRepo(),
    );
    await expect(useCase.execute(caller, 'event-1', 'share-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('throws NOT_FOUND when share does not exist', async () => {
    const caller = FakeIdentity.random();
    const event = makeEvent({ ownerId: caller.userId });
    const useCase = new RevokeEventShareUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(event) }),
      makeShareRepo({ findById: vi.fn().mockResolvedValue(null) }),
    );
    await expect(useCase.execute(caller, 'event-1', 'share-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('deletes the share when caller is the owner', async () => {
    const caller = FakeIdentity.random();
    const event = makeEvent({ ownerId: caller.userId });
    const share = makeShare({ eventId: 'event-1' });
    const deleteFn = vi.fn().mockResolvedValue(undefined);
    const useCase = new RevokeEventShareUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(event) }),
      makeShareRepo({ findById: vi.fn().mockResolvedValue(share), delete: deleteFn }),
    );
    await useCase.execute(caller, 'event-1', 'share-1');
    expect(deleteFn).toHaveBeenCalledWith('share-1');
  });
});

// ---------------------------------------------------------------------------
// ListEventSharesUseCase
// ---------------------------------------------------------------------------

describe('ListEventSharesUseCase', () => {
  it('throws NOT_FOUND when event does not exist', async () => {
    const useCase = new ListEventSharesUseCase(makeEventRepo(), makeShareRepo());
    const caller = FakeIdentity.random();
    await expect(useCase.execute(caller, 'event-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws FORBIDDEN when caller is not the event owner', async () => {
    const caller = FakeIdentity.random();
    const event = makeEvent({ ownerId: 'someone-else' });
    const useCase = new ListEventSharesUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(event) }),
      makeShareRepo(),
    );
    await expect(useCase.execute(caller, 'event-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('returns shares when caller is the event owner', async () => {
    const caller = FakeIdentity.random();
    const event = makeEvent({ ownerId: caller.userId });
    const shares = [
      makeShare({ groupId: 'group-1', visibilityLevel: 'busy' }),
      makeShare({ groupId: 'group-2', visibilityLevel: 'details' }),
    ];
    const useCase = new ListEventSharesUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(event) }),
      makeShareRepo({ listByEvent: vi.fn().mockResolvedValue(shares) }),
    );
    const result = await useCase.execute(caller, 'event-1');
    expect(result).toHaveLength(2);
    expect(result[0].groupId).toBe('group-1');
    expect(result[1].groupId).toBe('group-2');
  });
});
