import { describe, it, expect } from 'vitest';
import { FakeClock } from './fake-clock.js';
import { FakeIdentity } from './fake-identity.js';
import { FakeEventBus } from './fake-event-bus.js';
import { FakeStorage } from './fake-storage.js';
import type { DomainEvent } from '../event-bus.js';

/**
 * Example unit test – validates the shared test helpers.
 *
 * These helpers will be used throughout all module unit tests.
 * This file also serves as a smoke test that the test infrastructure itself is working.
 */
describe('FakeClock', () => {
  it('starts at the configured initial time', () => {
    const clock = new FakeClock(new Date('2026-01-01T12:00:00.000Z'));
    expect(clock.now()).toEqual(new Date('2026-01-01T12:00:00.000Z'));
  });

  it('returns a copy so mutations do not affect internal state', () => {
    const clock = new FakeClock(new Date('2026-01-01T12:00:00.000Z'));
    const snapshot = clock.now();
    snapshot.setFullYear(2000);
    expect(clock.now().getFullYear()).toBe(2026);
  });

  it('advances by the given number of milliseconds', () => {
    const clock = new FakeClock(new Date('2026-01-01T12:00:00.000Z'));
    clock.advance(60_000); // 1 minute
    expect(clock.now()).toEqual(new Date('2026-01-01T12:01:00.000Z'));
  });

  it('accumulates multiple advances', () => {
    const clock = new FakeClock(new Date('2026-01-01T00:00:00.000Z'));
    clock.advance(3_600_000); // +1 hour
    clock.advance(1_800_000); // +30 minutes
    expect(clock.now()).toEqual(new Date('2026-01-01T01:30:00.000Z'));
  });

  it('can be set to a specific time', () => {
    const clock = new FakeClock();
    clock.setTo(new Date('2030-06-15T09:00:00.000Z'));
    expect(clock.now()).toEqual(new Date('2030-06-15T09:00:00.000Z'));
  });

  it('provides the current time as a millisecond timestamp', () => {
    const fixed = new Date('2026-03-09T12:00:00.000Z');
    const clock = new FakeClock(fixed);
    expect(clock.nowMs()).toBe(fixed.getTime());
  });
});

describe('FakeIdentity', () => {
  it('produces a deterministic userId for the same name', () => {
    const a = FakeIdentity.user('alice');
    const b = FakeIdentity.user('alice');
    expect(a.userId).toBe(b.userId);
  });

  it('produces different userIds for different names', () => {
    const alice = FakeIdentity.user('alice');
    const bob = FakeIdentity.user('bob');
    expect(alice.userId).not.toBe(bob.userId);
  });

  it('preserves the display name', () => {
    const identity = FakeIdentity.user('charlie');
    expect(identity.displayName).toBe('charlie');
  });

  it('random() generates a unique userId each call', () => {
    const a = FakeIdentity.random();
    const b = FakeIdentity.random();
    expect(a.userId).not.toBe(b.userId);
  });
});

describe('FakeEventBus', () => {
  interface GroupCreated extends DomainEvent {
    type: 'GroupCreated';
    groupId: string;
  }

  interface MemberAdded extends DomainEvent {
    type: 'MemberAdded';
    groupId: string;
    userId: string;
  }

  it('starts with no captured events', () => {
    const bus = new FakeEventBus();
    expect(bus.count()).toBe(0);
    expect(bus.all()).toEqual([]);
  });

  it('captures a published event', async () => {
    const bus = new FakeEventBus();
    const event: GroupCreated = {
      type: 'GroupCreated',
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      groupId: 'g-1',
    };
    await bus.publish(event);
    expect(bus.count()).toBe(1);
  });

  it('returns all events of the given type via published()', async () => {
    const bus = new FakeEventBus();
    const groupCreated: GroupCreated = {
      type: 'GroupCreated',
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      groupId: 'g-1',
    };
    const memberAdded: MemberAdded = {
      type: 'MemberAdded',
      occurredAt: new Date('2026-01-01T00:01:00.000Z'),
      groupId: 'g-1',
      userId: 'u-1',
    };
    await bus.publish(groupCreated);
    await bus.publish(memberAdded);

    expect(bus.published<GroupCreated>('GroupCreated')).toHaveLength(1);
    expect(bus.published<GroupCreated>('GroupCreated')[0]?.groupId).toBe('g-1');
    expect(bus.published<MemberAdded>('MemberAdded')).toHaveLength(1);
  });

  it('all() returns every captured event regardless of type', async () => {
    const bus = new FakeEventBus();
    await bus.publish({ type: 'A', occurredAt: new Date() });
    await bus.publish({ type: 'B', occurredAt: new Date() });
    expect(bus.all()).toHaveLength(2);
  });

  it('clear() removes all captured events', async () => {
    const bus = new FakeEventBus();
    await bus.publish({ type: 'A', occurredAt: new Date() });
    bus.clear();
    expect(bus.count()).toBe(0);
  });
});

describe('FakeStorage', () => {
  it('starts empty', () => {
    const storage = new FakeStorage();
    expect(storage.count()).toBe(0);
    expect(storage.keys()).toEqual([]);
  });

  it('stores a blob and makes it retrievable', async () => {
    const storage = new FakeStorage();
    const data = Buffer.from('hello world');
    await storage.put('uploads/test.txt', data, 'text/plain');

    expect(storage.has('uploads/test.txt')).toBe(true);
    const retrieved = await storage.get('uploads/test.txt');
    expect(retrieved).toEqual(data);
  });

  it('returns null when the key does not exist', async () => {
    const storage = new FakeStorage();
    const result = await storage.get('nonexistent');
    expect(result).toBeNull();
  });

  it('overwrites an existing blob on put()', async () => {
    const storage = new FakeStorage();
    await storage.put('key', Buffer.from('v1'), 'text/plain');
    await storage.put('key', Buffer.from('v2'), 'text/plain');
    const result = await storage.get('key');
    expect(result?.toString()).toBe('v2');
  });

  it('tracks the content-type of stored blobs', async () => {
    const storage = new FakeStorage();
    await storage.put('img.jpg', Buffer.from('...'), 'image/jpeg');
    expect(storage.contentType('img.jpg')).toBe('image/jpeg');
  });

  it('delete() removes the blob', async () => {
    const storage = new FakeStorage();
    await storage.put('to-delete', Buffer.from('x'), 'application/octet-stream');
    await storage.delete('to-delete');
    expect(storage.has('to-delete')).toBe(false);
  });

  it('delete() resolves without error when key is absent', async () => {
    const storage = new FakeStorage();
    await expect(storage.delete('not-there')).resolves.toBeUndefined();
  });

  it('returns a copy from get() so callers cannot mutate internal state', async () => {
    const storage = new FakeStorage();
    const original = Buffer.from('original');
    await storage.put('key', original, 'text/plain');
    const copy = await storage.get('key');
    copy![0] = 0xff;
    const refetch = await storage.get('key');
    expect(refetch?.toString()).toBe('original');
  });

  it('clear() removes all stored blobs', async () => {
    const storage = new FakeStorage();
    await storage.put('a', Buffer.from('1'), 'text/plain');
    await storage.put('b', Buffer.from('2'), 'text/plain');
    storage.clear();
    expect(storage.count()).toBe(0);
  });

  it('keys() returns all stored keys', async () => {
    const storage = new FakeStorage();
    await storage.put('x', Buffer.from(''), 'text/plain');
    await storage.put('y', Buffer.from(''), 'text/plain');
    expect(storage.keys().sort()).toEqual(['x', 'y']);
  });
});
