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

  /** Returns all non-removed invitations for an event, ordered by invite time. */
  async listByEvent(eventId: string): Promise<EventInvitation[]> {
    const rows = await this.db<EventInvitationRow>('event_invitations')
      .where({ event_id: eventId })
      .whereNot('status', 'removed')
      .orderBy('invited_at', 'asc');
    return rows.map(toEventInvitation);
  }

  /**
   * Creates a new invitation or reactivates a previously removed one.
   * The unique constraint on (event_id, user_id) is handled via upsert.
   */
  async add(eventId: string, userId: string): Promise<EventInvitation> {
    const now = new Date();

    const rows = await this.db<EventInvitationRow>('event_invitations')
      .insert({ event_id: eventId, user_id: userId, status: 'invited', invited_at: now })
      .onConflict(['event_id', 'user_id'])
      .merge({ status: 'invited', invited_at: now })
      .returning('*');

    const row = rows[0];
    if (!row) {
      throw new Error('Failed to add invitee: database returned no row');
    }
    return toEventInvitation(row);
  }

  /** Sets the invitation status to 'removed'. */
  async remove(eventId: string, userId: string): Promise<void> {
    await this.db<EventInvitationRow>('event_invitations')
      .where({ event_id: eventId, user_id: userId })
      .update({ status: 'removed' });
  }
}
