/**
 * Base type for all domain events.
 *
 * Every domain event must carry a `type` discriminant and the time it occurred.
 * Additional payload fields are defined on concrete event types.
 */
export interface DomainEvent {
  /** Discriminant string identifying the event type (e.g. `'EventCreated'`). */
  readonly type: string;
  /** Wall-clock time at which the event occurred (injected via clock). */
  readonly occurredAt: Date;
}

/**
 * Port for publishing domain events to an event bus.
 *
 * Production implementations will forward events to Azure Service Bus
 * or another message broker. In tests, replace with `FakeEventBus`.
 */
export interface EventBusPort {
  /**
   * Publishes a single domain event.
   * Implementations must be idempotent where the broker supports deduplication.
   */
  publish(event: DomainEvent): Promise<void>;
}
