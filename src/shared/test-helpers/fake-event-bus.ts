import type { DomainEvent, EventBusPort } from '../event-bus.js';

/**
 * FakeEventBus – in-process event bus for tests.
 *
 * Captures all published domain events so that tests can assert on them
 * without requiring a real message broker.
 *
 * Never use FakeEventBus outside of test code.
 *
 * @example
 * const bus = new FakeEventBus();
 * await service.createEvent(command, bus);
 * const published = bus.published<EventCreated>('EventCreated');
 * expect(published).toHaveLength(1);
 * expect(published[0].groupId).toBe(groupId);
 */
export class FakeEventBus implements EventBusPort {
  private readonly events: DomainEvent[] = [];

  /** Captures a deep-frozen snapshot of the event so mutations after publish cannot affect assertions. */
  publish(event: DomainEvent): Promise<void> {
    this.events.push(structuredClone(event));
    return Promise.resolve();
  }

  /**
   * Returns all captured events of the given type as `T`.
   *
   * The `type` parameter is tied to `T['type']` so callers cannot request a
   * mismatched combination of event type and generic (e.g. `published<GroupCreated>('MemberAdded')`
   * will not compile).
   */
  published<T extends DomainEvent>(type: T['type']): T[] {
    return this.events.filter((event): event is T => event.type === type);
  }

  /** Returns a shallow copy of all captured events regardless of type. */
  all(): DomainEvent[] {
    return [...this.events];
  }

  /** Returns the total number of captured events. */
  count(): number {
    return this.events.length;
  }

  /** Clears all captured events. Useful between test cases that share one instance. */
  clear(): void {
    this.events.length = 0;
  }
}
