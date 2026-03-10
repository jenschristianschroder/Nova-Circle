import type { Event } from './event.js';

export interface EventRepositoryPort {
  findById(eventId: string): Promise<Event | null>;
  listByGroupForUser(groupId: string, userId: string): Promise<Event[]>;
  cancel(eventId: string): Promise<void>;
}
