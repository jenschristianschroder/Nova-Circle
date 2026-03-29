import type { EventShare, ShareEventData, VisibilityLevel } from './event-share.js';

export interface EventShareRepositoryPort {
  findById(shareId: string): Promise<EventShare | null>;
  findByEventAndGroup(eventId: string, groupId: string): Promise<EventShare | null>;
  listByEvent(eventId: string): Promise<EventShare[]>;
  create(data: ShareEventData): Promise<EventShare>;
  updateVisibility(shareId: string, visibilityLevel: VisibilityLevel): Promise<EventShare | null>;
  delete(shareId: string): Promise<void>;
}
