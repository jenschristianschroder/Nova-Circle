import { describe, it, expect, vi } from 'vitest';
import { PostMessageUseCase } from './post-message.usecase.js';
import { EditMessageUseCase } from './edit-message.usecase.js';
import { DeleteMessageUseCase } from './delete-message.usecase.js';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../../event-management/domain/event-invitation.repository.port.js';
import type { EventChatRepositoryPort } from '../domain/event-chat.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { Event } from '../../event-management/domain/event.js';
import type { EventChatThread, EventChatMessage } from '../domain/event-chat.js';
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

function makeThread(): EventChatThread {
  return { id: 'thread-1', eventId: 'event-1', createdAt: new Date() };
}

function makeMessage(overrides?: Partial<EventChatMessage>): EventChatMessage {
  return {
    id: 'msg-1',
    threadId: 'thread-1',
    authorUserId: 'author-id',
    content: 'Hello!',
    postedAt: new Date(),
    editedAt: null,
    deletedAt: null,
    deletedByUserId: null,
    ...overrides,
  };
}

function makeEventRepo(overrides?: Partial<EventRepositoryPort>): EventRepositoryPort {
  return {
    findById: vi.fn().mockResolvedValue(null),
    listByGroupForUser: vi.fn().mockResolvedValue([]),
    listByOwner: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(null),
    transferOwnership: vi.fn().mockResolvedValue(null),
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

function makeChatRepo(overrides?: Partial<EventChatRepositoryPort>): EventChatRepositoryPort {
  return {
    findOrCreateThread: vi.fn().mockResolvedValue(makeThread()),
    findThreadByEvent: vi.fn().mockResolvedValue(null),
    listMessages: vi.fn().mockResolvedValue([]),
    postMessage: vi.fn().mockResolvedValue(makeMessage()),
    findMessage: vi.fn().mockResolvedValue(null),
    editMessage: vi.fn().mockResolvedValue(null),
    softDeleteMessage: vi.fn().mockResolvedValue(null),
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

describe('PostMessageUseCase', () => {
  it('throws NOT_FOUND when caller has no event access', async () => {
    const caller = FakeIdentity.random();
    const useCase = new PostMessageUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(makeEvent()) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(false) }),
      makeChatRepo(),
    );
    await expect(useCase.execute(caller, 'event-1', 'Hello!')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws VALIDATION_ERROR for empty content', async () => {
    const caller = FakeIdentity.random();
    const useCase = new PostMessageUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(makeEvent()) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) }),
      makeChatRepo(),
    );
    await expect(useCase.execute(caller, 'event-1', '')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR for content exceeding 4000 chars', async () => {
    const caller = FakeIdentity.random();
    const useCase = new PostMessageUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(makeEvent()) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) }),
      makeChatRepo(),
    );
    await expect(useCase.execute(caller, 'event-1', 'x'.repeat(4001))).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});

describe('EditMessageUseCase', () => {
  it('throws FORBIDDEN when caller is not the message author', async () => {
    const caller = FakeIdentity.random();
    const message = makeMessage({ authorUserId: 'someone-else' });
    const useCase = new EditMessageUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(makeEvent()) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) }),
      makeChatRepo({
        findThreadByEvent: vi.fn().mockResolvedValue(makeThread()),
        findMessage: vi.fn().mockResolvedValue(message),
      }),
    );
    await expect(
      useCase.execute(caller, 'event-1', 'msg-1', 'Updated content'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws CONFLICT when message is already deleted', async () => {
    const caller = FakeIdentity.random();
    const message = makeMessage({
      authorUserId: caller.userId,
      deletedAt: new Date(),
    });
    const useCase = new EditMessageUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(makeEvent()) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) }),
      makeChatRepo({
        findThreadByEvent: vi.fn().mockResolvedValue(makeThread()),
        findMessage: vi.fn().mockResolvedValue(message),
      }),
    );
    await expect(
      useCase.execute(caller, 'event-1', 'msg-1', 'Updated content'),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('throws NOT_FOUND when message belongs to a different event (cross-event IDOR)', async () => {
    const caller = FakeIdentity.random();
    // thread-1 belongs to event-1; message has threadId 'thread-other' (different event)
    const message = makeMessage({ threadId: 'thread-other', authorUserId: caller.userId });
    const useCase = new EditMessageUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(makeEvent()) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) }),
      makeChatRepo({
        findThreadByEvent: vi.fn().mockResolvedValue(makeThread()),
        findMessage: vi.fn().mockResolvedValue(message),
      }),
    );
    await expect(
      useCase.execute(caller, 'event-1', 'msg-1', 'Updated content'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('DeleteMessageUseCase', () => {
  it('throws CONFLICT when message is already soft-deleted', async () => {
    const caller = FakeIdentity.random();
    const message = makeMessage({
      authorUserId: caller.userId,
      deletedAt: new Date(),
    });
    const useCase = new DeleteMessageUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(makeEvent()) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) }),
      makeChatRepo({
        findThreadByEvent: vi.fn().mockResolvedValue(makeThread()),
        findMessage: vi.fn().mockResolvedValue(message),
      }),
      makeMemberRepo(),
    );
    await expect(useCase.execute(caller, 'event-1', 'msg-1')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('throws FORBIDDEN when non-author non-creator non-admin tries to delete', async () => {
    const caller = FakeIdentity.random();
    const message = makeMessage({ authorUserId: 'other-user' });
    const event = makeEvent({ createdBy: 'event-creator' });
    const useCase = new DeleteMessageUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(event) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) }),
      makeChatRepo({
        findThreadByEvent: vi.fn().mockResolvedValue(makeThread()),
        findMessage: vi.fn().mockResolvedValue(message),
      }),
      makeMemberRepo({ getRole: vi.fn().mockResolvedValue('member') }),
    );
    await expect(useCase.execute(caller, 'event-1', 'msg-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('event creator can delete any message', async () => {
    const caller = FakeIdentity.random();
    const event = makeEvent({ createdBy: caller.userId });
    const message = makeMessage({ authorUserId: 'other-user' });
    const deletedMsg = makeMessage({ deletedAt: new Date(), deletedByUserId: caller.userId });
    const softDeleteFn = vi.fn().mockResolvedValue(deletedMsg);
    const useCase = new DeleteMessageUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(event) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) }),
      makeChatRepo({
        findThreadByEvent: vi.fn().mockResolvedValue(makeThread()),
        findMessage: vi.fn().mockResolvedValue(message),
        softDeleteMessage: softDeleteFn,
      }),
      makeMemberRepo(),
    );
    await useCase.execute(caller, 'event-1', 'msg-1');
    expect(softDeleteFn).toHaveBeenCalledWith('msg-1', caller.userId);
  });

  it('group admin with event access can delete any message', async () => {
    const caller = FakeIdentity.random();
    const event = makeEvent({ createdBy: 'event-creator' });
    const message = makeMessage({ authorUserId: 'other-user' });
    const deletedMsg = makeMessage({ deletedAt: new Date(), deletedByUserId: caller.userId });
    const softDeleteFn = vi.fn().mockResolvedValue(deletedMsg);
    const useCase = new DeleteMessageUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(event) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) }),
      makeChatRepo({
        findThreadByEvent: vi.fn().mockResolvedValue(makeThread()),
        findMessage: vi.fn().mockResolvedValue(message),
        softDeleteMessage: softDeleteFn,
      }),
      makeMemberRepo({ getRole: vi.fn().mockResolvedValue('admin') }),
    );
    await useCase.execute(caller, 'event-1', 'msg-1');
    expect(softDeleteFn).toHaveBeenCalledWith('msg-1', caller.userId);
  });

  it('throws NOT_FOUND when message belongs to a different event (cross-event IDOR)', async () => {
    const caller = FakeIdentity.random();
    // thread-1 belongs to event-1; message has threadId 'thread-other' (different event)
    const message = makeMessage({ threadId: 'thread-other', authorUserId: caller.userId });
    const useCase = new DeleteMessageUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(makeEvent()) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) }),
      makeChatRepo({
        findThreadByEvent: vi.fn().mockResolvedValue(makeThread()),
        findMessage: vi.fn().mockResolvedValue(message),
      }),
      makeMemberRepo(),
    );
    await expect(useCase.execute(caller, 'event-1', 'msg-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
