import { describe, it, expect, vi } from 'vitest';
import { AddChecklistItemUseCase } from './add-checklist-item.usecase.js';
import { GetChecklistUseCase } from './get-checklist.usecase.js';
import { DeleteChecklistItemUseCase } from './delete-checklist-item.usecase.js';
import { CompleteChecklistItemUseCase } from './complete-checklist-item.usecase.js';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../../event-management/domain/event-invitation.repository.port.js';
import type { EventChecklistRepositoryPort } from '../domain/event-checklist.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { Event } from '../../event-management/domain/event.js';
import type { EventChecklist, EventChecklistItem } from '../domain/event-checklist.js';
import { FakeIdentity } from '../../../shared/test-helpers/fake-identity.js';

function makeEvent(overrides?: Partial<Event>): Event {
  return {
    id: 'event-1',
    groupId: 'group-1',
    ownerId: 'creator-id',
    title: 'Test Event',
    description: null,
    startAt: new Date('2026-06-01T12:00:00Z'),
    endAt: null,
    createdBy: 'creator-id',
    status: 'scheduled',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeChecklist(): EventChecklist {
  return { id: 'cl-1', eventId: 'event-1', createdAt: new Date() };
}

function makeItem(overrides?: Partial<EventChecklistItem>): EventChecklistItem {
  return {
    id: 'item-1',
    checklistId: 'cl-1',
    createdByUserId: 'creator-id',
    text: 'Buy snacks',
    isDone: false,
    assignedToUserId: null,
    dueAt: null,
    displayOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    completedByUserId: null,
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

function makeInvitationRepo(
  overrides?: Partial<EventInvitationRepositoryPort>,
): EventInvitationRepositoryPort {
  return {
    findByEventAndUser: vi.fn().mockResolvedValue(null),
    hasAccess: vi.fn().mockResolvedValue(false),
    listByEvent: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue(null),
    remove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeChecklistRepo(
  overrides?: Partial<EventChecklistRepositoryPort>,
): EventChecklistRepositoryPort {
  return {
    findOrCreateChecklist: vi.fn().mockResolvedValue(makeChecklist()),
    findChecklistByEvent: vi.fn().mockResolvedValue(null),
    listItems: vi.fn().mockResolvedValue([]),
    addItem: vi.fn().mockResolvedValue(makeItem()),
    findItem: vi.fn().mockResolvedValue(null),
    updateItem: vi.fn().mockResolvedValue(null),
    markDone: vi.fn().mockResolvedValue(null),
    markUndone: vi.fn().mockResolvedValue(null),
    deleteItem: vi.fn().mockResolvedValue(undefined),
    reorderItems: vi.fn().mockResolvedValue(undefined),
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

describe('AddChecklistItemUseCase', () => {
  it('throws NOT_FOUND when event does not exist', async () => {
    const caller = FakeIdentity.random();
    const useCase = new AddChecklistItemUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(null) }),
      makeInvitationRepo(),
      makeChecklistRepo(),
    );
    await expect(useCase.execute(caller, 'event-1', 'Buy snacks')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when caller has no event access', async () => {
    const caller = FakeIdentity.random();
    const useCase = new AddChecklistItemUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(makeEvent()) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(false) }),
      makeChecklistRepo(),
    );
    await expect(useCase.execute(caller, 'event-1', 'Buy snacks')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws VALIDATION_ERROR for empty text', async () => {
    const caller = FakeIdentity.random();
    const useCase = new AddChecklistItemUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(makeEvent()) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) }),
      makeChecklistRepo(),
    );
    await expect(useCase.execute(caller, 'event-1', '')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR for text exceeding 500 chars', async () => {
    const caller = FakeIdentity.random();
    const useCase = new AddChecklistItemUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(makeEvent()) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) }),
      makeChecklistRepo(),
    );
    await expect(useCase.execute(caller, 'event-1', 'x'.repeat(501))).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});

describe('GetChecklistUseCase', () => {
  it('throws NOT_FOUND when caller has no event access', async () => {
    const caller = FakeIdentity.random();
    const useCase = new GetChecklistUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(makeEvent()) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(false) }),
      makeChecklistRepo(),
    );
    await expect(useCase.execute(caller, 'event-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('returns empty items when no checklist exists', async () => {
    const caller = FakeIdentity.random();
    const useCase = new GetChecklistUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(makeEvent()) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) }),
      makeChecklistRepo({ findChecklistByEvent: vi.fn().mockResolvedValue(null) }),
    );
    const result = await useCase.execute(caller, 'event-1');
    expect(result.checklist).toBeNull();
    expect(result.items).toEqual([]);
  });
});

describe('DeleteChecklistItemUseCase', () => {
  it('throws FORBIDDEN when caller is not item creator, event creator, or admin', async () => {
    const caller = FakeIdentity.random();
    const item = makeItem({ createdByUserId: 'someone-else' });
    const event = makeEvent({ createdBy: 'also-someone-else' });
    const useCase = new DeleteChecklistItemUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(event) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) }),
      makeChecklistRepo({
        findChecklistByEvent: vi.fn().mockResolvedValue(makeChecklist()),
        findItem: vi.fn().mockResolvedValue(item),
      }),
      makeMemberRepo({ getRole: vi.fn().mockResolvedValue('member') }),
    );
    await expect(useCase.execute(caller, 'event-1', 'item-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('succeeds when caller is the item creator', async () => {
    const caller = FakeIdentity.random();
    const item = makeItem({ createdByUserId: caller.userId });
    const deleteItemFn = vi.fn().mockResolvedValue(undefined);
    const useCase = new DeleteChecklistItemUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(makeEvent()) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) }),
      makeChecklistRepo({
        findChecklistByEvent: vi.fn().mockResolvedValue(makeChecklist()),
        findItem: vi.fn().mockResolvedValue(item),
        deleteItem: deleteItemFn,
      }),
      makeMemberRepo(),
    );
    await useCase.execute(caller, 'event-1', 'item-1');
    expect(deleteItemFn).toHaveBeenCalledWith('item-1');
  });

  it('throws NOT_FOUND when item belongs to a different event (cross-event IDOR)', async () => {
    const caller = FakeIdentity.random();
    // item has checklistId 'cl-other', but the event's checklist is 'cl-1'
    const item = makeItem({ checklistId: 'cl-other', createdByUserId: caller.userId });
    const useCase = new DeleteChecklistItemUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(makeEvent()) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) }),
      makeChecklistRepo({
        findChecklistByEvent: vi.fn().mockResolvedValue(makeChecklist()),
        findItem: vi.fn().mockResolvedValue(item),
      }),
      makeMemberRepo(),
    );
    await expect(useCase.execute(caller, 'event-1', 'item-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('CompleteChecklistItemUseCase', () => {
  it('markDone sets isDone, completedAt, completedByUserId', async () => {
    const caller = FakeIdentity.random();
    const doneItem = makeItem({
      isDone: true,
      completedAt: new Date(),
      completedByUserId: caller.userId,
    });
    const markDoneFn = vi.fn().mockResolvedValue(doneItem);
    const useCase = new CompleteChecklistItemUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(makeEvent()) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) }),
      makeChecklistRepo({
        findChecklistByEvent: vi.fn().mockResolvedValue(makeChecklist()),
        findItem: vi.fn().mockResolvedValue(makeItem()),
        markDone: markDoneFn,
      }),
    );
    const result = await useCase.execute(caller, 'event-1', 'item-1', true);
    expect(markDoneFn).toHaveBeenCalledWith('item-1', caller.userId);
    expect(result.isDone).toBe(true);
    expect(result.completedByUserId).toBe(caller.userId);
  });

  it('markUndone clears isDone, completedAt, completedByUserId', async () => {
    const caller = FakeIdentity.random();
    const undoneItem = makeItem({ isDone: false, completedAt: null, completedByUserId: null });
    const markUndoneFn = vi.fn().mockResolvedValue(undoneItem);
    const useCase = new CompleteChecklistItemUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(makeEvent()) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) }),
      makeChecklistRepo({
        findChecklistByEvent: vi.fn().mockResolvedValue(makeChecklist()),
        findItem: vi.fn().mockResolvedValue(makeItem({ isDone: true })),
        markUndone: markUndoneFn,
      }),
    );
    const result = await useCase.execute(caller, 'event-1', 'item-1', false);
    expect(markUndoneFn).toHaveBeenCalledWith('item-1');
    expect(result.isDone).toBe(false);
    expect(result.completedAt).toBeNull();
  });

  it('throws NOT_FOUND when item belongs to a different event (cross-event IDOR)', async () => {
    const caller = FakeIdentity.random();
    // item has checklistId 'cl-other', but the event's checklist is 'cl-1'
    const item = makeItem({ checklistId: 'cl-other' });
    const useCase = new CompleteChecklistItemUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(makeEvent()) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) }),
      makeChecklistRepo({
        findChecklistByEvent: vi.fn().mockResolvedValue(makeChecklist()),
        findItem: vi.fn().mockResolvedValue(item),
      }),
    );
    await expect(useCase.execute(caller, 'event-1', 'item-1', true)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
