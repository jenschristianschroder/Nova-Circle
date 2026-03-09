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

  /** Captures the event in memory. Never throws. */
  publish(event: DomainEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }

  /**
   * Returns all captured events of the given type, cast to `T`.
   * Pass the event's `type` discriminant string (e.g. `'EventCreated'`).
   */
  published<T extends DomainEvent>(type: string): T[] {
    return this.events.filter((e) => e.type === type) as T[];
  }

  /** Returns every captured event regardless of type. */
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
