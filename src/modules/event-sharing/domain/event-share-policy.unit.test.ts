import { describe, it, expect } from 'vitest';
import { EventSharePolicy } from './event-share-policy.js';
import type { Event } from '../../event-management/domain/event.js';
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

// ---------------------------------------------------------------------------
// assertOwnerOfPersonalEvent
// ---------------------------------------------------------------------------

describe('EventSharePolicy.assertOwnerOfPersonalEvent', () => {
  it('throws NOT_FOUND when event is null', () => {
    const caller = FakeIdentity.random();
    expect(() =>
      EventSharePolicy.assertOwnerOfPersonalEvent(null, caller, 'share events'),
    ).toThrow();
    try {
      EventSharePolicy.assertOwnerOfPersonalEvent(null, caller, 'share events');
    } catch (err: unknown) {
      expect((err as Error & { code: string }).code).toBe('NOT_FOUND');
    }
  });

  it('throws FORBIDDEN when event is group-scoped', () => {
    const caller = FakeIdentity.random();
    const event = makeEvent({ ownerId: caller.userId, groupId: 'some-group' });
    expect(() =>
      EventSharePolicy.assertOwnerOfPersonalEvent(event, caller, 'share events'),
    ).toThrow();
    try {
      EventSharePolicy.assertOwnerOfPersonalEvent(event, caller, 'share events');
    } catch (err: unknown) {
      expect((err as Error & { code: string }).code).toBe('FORBIDDEN');
      expect((err as Error).message).toBe('Only personal events can be shared to groups');
    }
  });

  it('throws FORBIDDEN when caller is not the event owner', () => {
    const caller = FakeIdentity.random();
    const event = makeEvent({ ownerId: 'someone-else' });
    expect(() =>
      EventSharePolicy.assertOwnerOfPersonalEvent(event, caller, 'share events'),
    ).toThrow();
    try {
      EventSharePolicy.assertOwnerOfPersonalEvent(event, caller, 'share events');
    } catch (err: unknown) {
      expect((err as Error & { code: string }).code).toBe('FORBIDDEN');
      expect((err as Error).message).toBe('Only the event owner can share events');
    }
  });

  it('includes the action verb in the FORBIDDEN message', () => {
    const caller = FakeIdentity.random();
    const event = makeEvent({ ownerId: 'someone-else' });
    try {
      EventSharePolicy.assertOwnerOfPersonalEvent(event, caller, 'revoke shares');
    } catch (err: unknown) {
      expect((err as Error).message).toBe('Only the event owner can revoke shares');
    }
  });

  it('does not throw when caller is the owner of a personal event', () => {
    const caller = FakeIdentity.random();
    const event = makeEvent({ ownerId: caller.userId, groupId: null });
    expect(() =>
      EventSharePolicy.assertOwnerOfPersonalEvent(event, caller, 'share events'),
    ).not.toThrow();
  });

  it('narrows the event type after assertion (type guard)', () => {
    const caller = FakeIdentity.random();
    const event: Event | null = makeEvent({ ownerId: caller.userId });
    EventSharePolicy.assertOwnerOfPersonalEvent(event, caller, 'share events');
    // After assertion, event is narrowed to Event (not null).
    expect(event.id).toBe('event-1');
  });
});

// ---------------------------------------------------------------------------
// assertGroupMembership
// ---------------------------------------------------------------------------

describe('EventSharePolicy.assertGroupMembership', () => {
  it('throws FORBIDDEN when isMember is false', () => {
    expect(() => EventSharePolicy.assertGroupMembership(false)).toThrow();
    try {
      EventSharePolicy.assertGroupMembership(false);
    } catch (err: unknown) {
      expect((err as Error & { code: string }).code).toBe('FORBIDDEN');
      expect((err as Error).message).toBe('You must be a member of the target group');
    }
  });

  it('does not throw when isMember is true', () => {
    expect(() => EventSharePolicy.assertGroupMembership(true)).not.toThrow();
  });
});
