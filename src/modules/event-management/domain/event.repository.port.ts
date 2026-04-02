import type { Event, UpdateEventData } from './event.js';

export interface DateRangeFilter {
  readonly from?: Date;
  readonly to?: Date;
}

export interface EventRepositoryPort {
  findById(eventId: string): Promise<Event | null>;
  listByGroupForUser(groupId: string, userId: string): Promise<Event[]>;
  listByOwner(userId: string, dateRange?: DateRangeFilter): Promise<Event[]>;
  update(eventId: string, data: UpdateEventData): Promise<Event | null>;
  transferOwnership(
    eventId: string,
    newOwnerId: string,
    expectedOwnerId: string,
  ): Promise<Event | null>;
  cancel(eventId: string): Promise<void>;
  deleteEvent(eventId: string): Promise<void>;
}
