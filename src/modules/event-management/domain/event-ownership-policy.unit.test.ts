import { describe, it, expect } from 'vitest';
import { EventOwnershipPolicy } from './event-ownership-policy.js';
import type { Event, UpdateEventData } from './event.js';
import { FakeIdentity } from '../../../shared/test-helpers/fake-identity.js';

function makeEvent(overrides?: Partial<Event>): Event {
  return {
    id: 'event-1',
    groupId: null,
    ownerId: FakeIdentity.user('owner').userId,
    title: 'Test Event',
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

// ---------------------------------------------------------------------------
// assertCallerIsOwner
// ---------------------------------------------------------------------------

describe('EventOwnershipPolicy.assertCallerIsOwner', () => {
  it('throws NOT_FOUND when event is null', () => {
    const caller = FakeIdentity.random();
    let caughtError: (Error & { code?: string }) | undefined;
    try {
      EventOwnershipPolicy.assertCallerIsOwner(null, caller);
    } catch (err: unknown) {
      caughtError = err as Error & { code?: string };
    }
    expect(caughtError).toBeDefined();
    expect(caughtError!.code).toBe('NOT_FOUND');
  });

  it('throws NOT_FOUND when caller is not the owner', () => {
    const event = makeEvent();
    const nonOwner = FakeIdentity.user('non-owner');
    let caughtError: (Error & { code?: string }) | undefined;
    try {
      EventOwnershipPolicy.assertCallerIsOwner(event, nonOwner);
    } catch (err: unknown) {
      caughtError = err as Error & { code?: string };
    }
    expect(caughtError).toBeDefined();
    expect(caughtError!.code).toBe('NOT_FOUND');
  });

  it('does not throw when caller is the owner', () => {
    const event = makeEvent();
    const ownerCaller = FakeIdentity.user('owner');
    expect(() => {
      EventOwnershipPolicy.assertCallerIsOwner(event, ownerCaller);
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// sanitizeUpdateData
// ---------------------------------------------------------------------------

describe('EventOwnershipPolicy.sanitizeUpdateData', () => {
  it('preserves allowed fields', () => {
    const data: UpdateEventData = {
      title: 'New Title',
      description: 'New Description',
      startAt: new Date('2026-07-01T12:00:00Z'),
      endAt: new Date('2026-07-01T13:00:00Z'),
    };

    const result = EventOwnershipPolicy.sanitizeUpdateData(data);
    expect(result).toEqual(data);
  });

  it('preserves endAt when explicitly set to null', () => {
    const data: UpdateEventData = {
      title: 'New Title',
      endAt: null,
    };

    const result = EventOwnershipPolicy.sanitizeUpdateData(data);
    expect(result).toEqual({ title: 'New Title', endAt: null });
    expect('endAt' in result).toBe(true);
  });

  it('does not include endAt when not provided', () => {
    const data: UpdateEventData = { title: 'New Title' };

    const result = EventOwnershipPolicy.sanitizeUpdateData(data);
    expect(result).toEqual({ title: 'New Title' });
    expect('endAt' in result).toBe(false);
  });

  it('strips ownerId injected at runtime', () => {
    // At runtime, TypeScript types are erased. A malicious caller could
    // attach extra properties via type coercion or plain JavaScript.
    const data = {
      title: 'New Title',
      ownerId: 'attacker-id',
    } as unknown as UpdateEventData;

    const result = EventOwnershipPolicy.sanitizeUpdateData(data);
    expect(result).toEqual({ title: 'New Title' });
    expect('ownerId' in result).toBe(false);
  });

  it('strips owner_id (snake_case) injected at runtime', () => {
    const data = {
      title: 'New Title',
      owner_id: 'attacker-id',
    } as unknown as UpdateEventData;

    const result = EventOwnershipPolicy.sanitizeUpdateData(data);
    expect(result).toEqual({ title: 'New Title' });
    expect('owner_id' in result).toBe(false);
  });

  it('strips arbitrary extra fields injected at runtime', () => {
    const data = {
      title: 'New Title',
      ownerId: 'attacker-id',
      groupId: 'sneaky-group-id',
      createdBy: 'someone-else',
    } as unknown as UpdateEventData;

    const result = EventOwnershipPolicy.sanitizeUpdateData(data);
    expect(result).toEqual({ title: 'New Title' });
    expect('ownerId' in result).toBe(false);
    expect('groupId' in result).toBe(false);
    expect('createdBy' in result).toBe(false);
  });

  it('returns empty object when no allowed fields are provided', () => {
    const data = {
      ownerId: 'attacker-id',
    } as unknown as UpdateEventData;

    const result = EventOwnershipPolicy.sanitizeUpdateData(data);
    expect(result).toEqual({});
  });
});
