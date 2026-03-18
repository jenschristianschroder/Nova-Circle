import type { EventInvitation, InvitationStatus } from './event-invitation.js';

export interface EventInvitationRepositoryPort {
  findByEventAndUser(eventId: string, userId: string): Promise<EventInvitation | null>;
  hasAccess(eventId: string, userId: string): Promise<boolean>;
  listByEvent(eventId: string): Promise<EventInvitation[]>;
  add(eventId: string, userId: string): Promise<EventInvitation>;
  remove(eventId: string, userId: string): Promise<void>;
  updateStatus(
    eventId: string,
    userId: string,
    status: InvitationStatus,
  ): Promise<EventInvitation | null>;
}
