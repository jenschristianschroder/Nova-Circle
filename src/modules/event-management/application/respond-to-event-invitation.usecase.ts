import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../domain/event-invitation.repository.port.js';
import type { EventInvitation, InvitationStatus } from '../domain/event-invitation.js';

/** The RSVP statuses a user may set on their own invitation. */
export type RsvpStatus = Extract<InvitationStatus, 'accepted' | 'declined' | 'tentative'>;

/**
 * Allows the authenticated user to respond to their own event invitation.
 *
 * - Only the invited user can update their own RSVP (not admins on behalf of others).
 * - The event must not be cancelled.
 * - The user must have an active (non-removed) invitation.
 */
export class RespondToEventInvitationUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly invitationRepo: EventInvitationRepositoryPort,
  ) {}

  async execute(
    caller: IdentityContext,
    groupId: string,
    eventId: string,
    status: RsvpStatus,
  ): Promise<EventInvitation> {
    const event = await this.eventRepo.findById(eventId);
    if (!event || event.groupId !== groupId) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    if (event.status === 'cancelled') {
      throw Object.assign(new Error('Cannot RSVP to a cancelled event'), { code: 'CONFLICT' });
    }

    const updated = await this.invitationRepo.updateStatus(eventId, caller.userId, status);
    if (!updated) {
      throw Object.assign(new Error('No active invitation found'), { code: 'NOT_FOUND' });
    }

    return updated;
  }
}
