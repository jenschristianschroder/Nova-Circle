import type { EventInvitation } from './event-invitation.js';

export interface EventInvitationRepositoryPort {
  findByEventAndUser(eventId: string, userId: string): Promise<EventInvitation | null>;
  hasAccess(eventId: string, userId: string): Promise<boolean>;
}
