import type { Event, UpdateEventData } from './event.js';

export interface EventRepositoryPort {
  findById(eventId: string): Promise<Event | null>;
  listByGroupForUser(groupId: string, userId: string): Promise<Event[]>;
  update(eventId: string, data: UpdateEventData): Promise<Event | null>;
  cancel(eventId: string): Promise<void>;
}
