import type { Event, CreateEventData } from './event.js';

/**
 * Port for atomically creating an event together with its initial invitation
 * records.  Implementations must guarantee that both the event row and all
 * invitation rows are persisted inside a single transaction.
 */
export interface EventCreationPort {
  createEventWithInvitations(data: CreateEventData): Promise<Event>;
}
