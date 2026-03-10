import type { EventInvitation } from './event-invitation.js';

export interface EventInvitationRepositoryPort {
  findByEventAndUser(eventId: string, userId: string): Promise<EventInvitation | null>;
  hasAccess(eventId: string, userId: string): Promise<boolean>;
  /**
   * Adds a new invitee to an event.  If the user was previously removed their
   * invitation is reinstated (status set back to 'invited').
   */
  addInvitee(eventId: string, userId: string): Promise<EventInvitation>;
  /** Sets the invitation status to 'removed', immediately revoking access. */
  removeInvitee(eventId: string, userId: string): Promise<void>;
}
