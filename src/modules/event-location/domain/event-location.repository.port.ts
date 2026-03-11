import type { EventLocation, SetLocationData } from './event-location.js';

export interface EventLocationRepositoryPort {
  findByEvent(eventId: string): Promise<EventLocation | null>;
  upsert(eventId: string, data: SetLocationData, userId: string): Promise<EventLocation>;
  delete(eventId: string): Promise<void>;
}
