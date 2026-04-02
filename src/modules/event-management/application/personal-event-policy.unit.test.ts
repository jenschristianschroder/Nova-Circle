import { describe, it, expect, vi } from 'vitest';
import { CreatePersonalEventUseCase } from './create-personal-event.usecase.js';
import { GetPersonalEventUseCase } from './get-personal-event.usecase.js';
import { ListMyEventsUseCase } from './list-my-events.usecase.js';
import { UpdatePersonalEventUseCase } from './update-personal-event.usecase.js';
import { DeletePersonalEventUseCase } from './delete-personal-event.usecase.js';
import type { EventCreationPort } from '../domain/event-creation.port.js';
import type { EventRepositoryPort } from '../domain/event.repository.port.js';
import type { EventShareRepositoryPort } from '../../event-sharing/domain/event-share.repository.port.js';
import type { Event } from '../domain/event.js';
import { FakeIdentity } from '../../../shared/test-helpers/fake-identity.js';

function makePersonalEvent(overrides?: Partial<Event>): Event {
  return {
    id: 'personal-event-1',
    groupId: null,
    ownerId: FakeIdentity.user('owner').userId,
    title: 'My Personal Event',
    description: null,
    startAt: new Date('2026-06-01T12:00:00Z'),
    endAt: new Date('2026-06-01T13:00:00Z'),
    createdBy: FakeIdentity.user('owner').userId,
    status: 'scheduled',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeGroupEvent(overrides?: Partial<Event>): Event {
  return {
    id: 'group-event-1',
    groupId: 'group-1',
    ownerId: FakeIdentity.user('owner').userId,
    title: 'Group Event',
    description: null,
    startAt: new Date('2026-06-01T12:00:00Z'),
    endAt: null,
    createdBy: FakeIdentity.user('owner').userId,
    status: 'scheduled',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeEventCreator(event: Event = makePersonalEvent()): EventCreationPort {
  return { createEventWithInvitations: vi.fn().mockResolvedValue(event) };
}

function makeEventRepo(overrides?: Partial<EventRepositoryPort>): EventRepositoryPort {
  return {
    findById: vi.fn().mockResolvedValue(null),
    listByGroupForUser: vi.fn().mockResolvedValue([]),
    listByOwner: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(makePersonalEvent()),
    cancel: vi.fn().mockResolvedValue(undefined),
    deleteEvent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeShareRepo(
  overrides?: Partial<EventShareRepositoryPort>,
): EventShareRepositoryPort {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByEventAndGroup: vi.fn().mockResolvedValue(null),
    listByEvent: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(null),
    updateVisibility: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    deleteByEvent: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

const owner = FakeIdentity.user('owner');
const otherUser = FakeIdentity.user('other');

// ---------------------------------------------------------------------------
// CreatePersonalEventUseCase
// ---------------------------------------------------------------------------

describe('CreatePersonalEventUseCase', () => {
  const validCommand = {
    title: 'My Personal Event',
    startAt: new Date('2026-06-01T12:00:00Z'),
  };

  it('creates a personal event with null groupId and owner as invitee', async () => {
    const eventCreator = makeEventCreator();
    const useCase = new CreatePersonalEventUseCase(eventCreator);

    await useCase.execute(owner, validCommand);

    expect(eventCreator.createEventWithInvitations).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: null,
        title: 'My Personal Event',
        createdBy: owner.userId,
        inviteeIds: [owner.userId],
      }),
    );
  });

  it('returns the created event', async () => {
    const useCase = new CreatePersonalEventUseCase(makeEventCreator());
    const result = await useCase.execute(owner, validCommand);
    expect(result.id).toBe('personal-event-1');
    expect(result.groupId).toBeNull();
  });

  it('trims the title', async () => {
    const eventCreator = makeEventCreator();
    const useCase = new CreatePersonalEventUseCase(eventCreator);

    await useCase.execute(owner, { ...validCommand, title: '  Trimmed Title  ' });

    expect(eventCreator.createEventWithInvitations).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Trimmed Title' }),
    );
  });

  it('rejects empty title', async () => {
    const useCase = new CreatePersonalEventUseCase(makeEventCreator());

    await expect(useCase.execute(owner, { ...validCommand, title: '   ' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects title exceeding 200 characters', async () => {
    const useCase = new CreatePersonalEventUseCase(makeEventCreator());
    const longTitle = 'A'.repeat(201);

    await expect(
      useCase.execute(owner, { ...validCommand, title: longTitle }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects endAt before startAt', async () => {
    const useCase = new CreatePersonalEventUseCase(makeEventCreator());

    await expect(
      useCase.execute(owner, {
        ...validCommand,
        endAt: new Date('2026-05-01T12:00:00Z'),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('accepts event with optional description', async () => {
    const eventCreator = makeEventCreator();
    const useCase = new CreatePersonalEventUseCase(eventCreator);

    await useCase.execute(owner, { ...validCommand, description: 'A description' });

    expect(eventCreator.createEventWithInvitations).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'A description' }),
    );
  });
});

// ---------------------------------------------------------------------------
// GetPersonalEventUseCase
// ---------------------------------------------------------------------------

describe('GetPersonalEventUseCase', () => {
  it('returns personal event for the owner', async () => {
    const event = makePersonalEvent();
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const useCase = new GetPersonalEventUseCase(eventRepo);

    const result = await useCase.execute(owner, 'personal-event-1');
    expect(result).toEqual(event);
  });

  it('throws NOT_FOUND when event does not exist', async () => {
    const useCase = new GetPersonalEventUseCase(makeEventRepo());

    await expect(useCase.execute(owner, 'non-existent')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND for non-owner (no existence disclosure)', async () => {
    const event = makePersonalEvent();
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const useCase = new GetPersonalEventUseCase(eventRepo);

    await expect(useCase.execute(otherUser, 'personal-event-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND for group-scoped events (personal endpoint only)', async () => {
    const groupEvent = makeGroupEvent();
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(groupEvent) });
    const useCase = new GetPersonalEventUseCase(eventRepo);

    await expect(useCase.execute(owner, 'group-event-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

// ---------------------------------------------------------------------------
// ListMyEventsUseCase
// ---------------------------------------------------------------------------

describe('ListMyEventsUseCase', () => {
  it('returns personal events for the owner', async () => {
    const events = [makePersonalEvent()];
    const eventRepo = makeEventRepo({ listByOwner: vi.fn().mockResolvedValue(events) });
    const useCase = new ListMyEventsUseCase(eventRepo);

    const result = await useCase.execute(owner);
    expect(result).toEqual(events);
  });

  it('calls listByOwner with the caller userId', async () => {
    const listByOwner = vi.fn().mockResolvedValue([]);
    const eventRepo = makeEventRepo({ listByOwner });
    const useCase = new ListMyEventsUseCase(eventRepo);

    await useCase.execute(owner);
    expect(listByOwner).toHaveBeenCalledWith(owner.userId, undefined);
  });

  it('passes date range filter to the repository', async () => {
    const listByOwner = vi.fn().mockResolvedValue([]);
    const eventRepo = makeEventRepo({ listByOwner });
    const useCase = new ListMyEventsUseCase(eventRepo);

    const from = new Date('2026-01-01');
    const to = new Date('2026-12-31');
    await useCase.execute(owner, { from, to });
    expect(listByOwner).toHaveBeenCalledWith(owner.userId, { from, to });
  });

  it('returns empty array when user has no personal events', async () => {
    const useCase = new ListMyEventsUseCase(makeEventRepo());
    const result = await useCase.execute(otherUser);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// UpdatePersonalEventUseCase
// ---------------------------------------------------------------------------

describe('UpdatePersonalEventUseCase', () => {
  it('updates a personal event for the owner', async () => {
    const event = makePersonalEvent();
    const updated = { ...event, title: 'Updated Title' };
    const eventRepo = makeEventRepo({
      findById: vi.fn().mockResolvedValue(event),
      update: vi.fn().mockResolvedValue(updated),
    });
    const useCase = new UpdatePersonalEventUseCase(eventRepo);

    const result = await useCase.execute(owner, 'personal-event-1', { title: 'Updated Title' });
    expect(result.title).toBe('Updated Title');
  });

  it('throws NOT_FOUND when event does not exist', async () => {
    const useCase = new UpdatePersonalEventUseCase(makeEventRepo());

    await expect(useCase.execute(owner, 'non-existent', { title: 'Test' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND for non-owner (no existence disclosure)', async () => {
    const event = makePersonalEvent();
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const useCase = new UpdatePersonalEventUseCase(eventRepo);

    await expect(
      useCase.execute(otherUser, 'personal-event-1', { title: 'Hack' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws NOT_FOUND for group-scoped events', async () => {
    const groupEvent = makeGroupEvent();
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(groupEvent) });
    const useCase = new UpdatePersonalEventUseCase(eventRepo);

    await expect(
      useCase.execute(owner, 'group-event-1', { title: 'Update' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws CONFLICT for cancelled events', async () => {
    const event = makePersonalEvent({ status: 'cancelled' });
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const useCase = new UpdatePersonalEventUseCase(eventRepo);

    await expect(
      useCase.execute(owner, 'personal-event-1', { title: 'Update' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects empty title', async () => {
    const event = makePersonalEvent();
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const useCase = new UpdatePersonalEventUseCase(eventRepo);

    await expect(useCase.execute(owner, 'personal-event-1', { title: '  ' })).rejects.toMatchObject(
      { code: 'VALIDATION_ERROR' },
    );
  });

  it('rejects title exceeding 200 characters', async () => {
    const event = makePersonalEvent();
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const useCase = new UpdatePersonalEventUseCase(eventRepo);

    await expect(
      useCase.execute(owner, 'personal-event-1', { title: 'A'.repeat(201) }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects endAt before startAt', async () => {
    const event = makePersonalEvent();
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const useCase = new UpdatePersonalEventUseCase(eventRepo);

    await expect(
      useCase.execute(owner, 'personal-event-1', {
        endAt: new Date('2026-01-01T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

// ---------------------------------------------------------------------------
// DeletePersonalEventUseCase
// ---------------------------------------------------------------------------

describe('DeletePersonalEventUseCase', () => {
  it('deletes a personal event for the owner', async () => {
    const event = makePersonalEvent();
    const deleteEvent = vi.fn().mockResolvedValue(undefined);
    const eventRepo = makeEventRepo({
      findById: vi.fn().mockResolvedValue(event),
      deleteEvent,
    });
    const useCase = new DeletePersonalEventUseCase(eventRepo, makeShareRepo());

    await useCase.execute(owner, 'personal-event-1');
    expect(deleteEvent).toHaveBeenCalledWith('personal-event-1');
  });

  it('revokes all shares before deleting the event', async () => {
    const event = makePersonalEvent();
    const deleteByEvent = vi.fn().mockResolvedValue(2);
    const deleteEvent = vi.fn().mockResolvedValue(undefined);
    const eventRepo = makeEventRepo({
      findById: vi.fn().mockResolvedValue(event),
      deleteEvent,
    });
    const useCase = new DeletePersonalEventUseCase(
      eventRepo,
      makeShareRepo({ deleteByEvent }),
    );

    await useCase.execute(owner, 'personal-event-1');
    expect(deleteByEvent).toHaveBeenCalledWith('personal-event-1');
    expect(deleteEvent).toHaveBeenCalledWith('personal-event-1');
  });

  it('throws NOT_FOUND when event does not exist', async () => {
    const useCase = new DeletePersonalEventUseCase(makeEventRepo(), makeShareRepo());

    await expect(useCase.execute(owner, 'non-existent')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND for non-owner (no existence disclosure)', async () => {
    const event = makePersonalEvent();
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(event) });
    const useCase = new DeletePersonalEventUseCase(eventRepo, makeShareRepo());

    await expect(useCase.execute(otherUser, 'personal-event-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND for group-scoped events', async () => {
    const groupEvent = makeGroupEvent();
    const eventRepo = makeEventRepo({ findById: vi.fn().mockResolvedValue(groupEvent) });
    const useCase = new DeletePersonalEventUseCase(eventRepo, makeShareRepo());

    await expect(useCase.execute(owner, 'group-event-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
