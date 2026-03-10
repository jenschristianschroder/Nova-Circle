import type { Knex } from 'knex';
import type { EventInvitationRepositoryPort } from '../domain/event-invitation.repository.port.js';
import type { EventInvitation, InvitationStatus } from '../domain/event-invitation.js';

interface EventInvitationRow {
  id: string;
  event_id: string;
  user_id: string;
  status: string;
  invited_at: Date;
  responded_at: Date | null;
}

function toEventInvitation(row: EventInvitationRow): EventInvitation {
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.user_id,
    status: row.status as InvitationStatus,
    invitedAt: new Date(row.invited_at),
    respondedAt: row.responded_at ? new Date(row.responded_at) : null,
  };
}

export class KnexEventInvitationRepository implements EventInvitationRepositoryPort {
  constructor(private readonly db: Knex) {}

  async findByEventAndUser(eventId: string, userId: string): Promise<EventInvitation | null> {
    const row = await this.db<EventInvitationRow>('event_invitations')
      .where({ event_id: eventId, user_id: userId })
      .first();
    return row ? toEventInvitation(row) : null;
  }

  /**
   * Returns true when the user has an active invitation for the event.
   * A status of 'removed' does NOT grant access.
   */
  async hasAccess(eventId: string, userId: string): Promise<boolean> {
    const row = await this.db<EventInvitationRow>('event_invitations')
      .where({ event_id: eventId, user_id: userId })
      .whereNot('status', 'removed')
      .first();
    return row !== undefined;
  }

  async addInvitee(eventId: string, userId: string): Promise<EventInvitation> {
    // Use a single atomic upsert to avoid race conditions from the UNIQUE(event_id,user_id) constraint.
    // On conflict, reinstate the invitation by resetting status, invited_at, and responded_at.
    const [row] = await this.db<EventInvitationRow>('event_invitations')
      .insert({
        event_id: eventId,
        user_id: userId,
        status: 'invited',
        invited_at: new Date(),
      })
      .onConflict(['event_id', 'user_id'])
      .merge({
        status: 'invited',
        invited_at: new Date(),
        responded_at: null,
      })
      .returning('*');

    if (!row) {
      throw new Error('Failed to upsert invitation');
    }

    return toEventInvitation(row);
  }

  async removeInvitee(eventId: string, userId: string): Promise<void> {
    const count = await this.db<EventInvitationRow>('event_invitations')
      .where({ event_id: eventId, user_id: userId })
      .update({ status: 'removed' });
    if (count === 0) {
      throw new Error('Failed to remove invitation: no matching record found');
    }
  }
}
