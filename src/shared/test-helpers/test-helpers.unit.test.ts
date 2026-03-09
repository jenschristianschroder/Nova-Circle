import { describe, it, expect } from 'vitest';
import { FakeClock } from './fake-clock.js';
import { FakeIdentity } from './fake-identity.js';

/**
 * Example unit test – validates the FakeClock and FakeIdentity test helpers.
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
