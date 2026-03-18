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
   * The ON CONFLICT DO UPDATE only fires when the existing status is 'removed',
   * so an active invitation (invited/accepted/declined/tentative) is never
   * silently clobbered.  If the conflict row is not removed the query returns
   * no rows, which the caller treats as a conflict.
   */
  async add(eventId: string, userId: string): Promise<EventInvitation> {
    const now = new Date();

    // Positional params map to the three `?` placeholders in order: eventId, userId, now.
    const result = await this.db.raw<{ rows: EventInvitationRow[] }>(
      `INSERT INTO event_invitations (event_id, user_id, status, invited_at, responded_at)
       VALUES (?, ?, 'invited', ?, NULL)
       ON CONFLICT (event_id, user_id) DO UPDATE
         SET status = 'invited', invited_at = EXCLUDED.invited_at, responded_at = NULL
         WHERE event_invitations.status = 'removed'
       RETURNING *`,
      [eventId, userId, now],
    );

    const row = result.rows[0];
    if (!row) {
      // A non-removed invitation already exists — the caller's use case should
      // have caught this, but guard here as a safety net.
      throw new Error('Active invitation already exists for this event and user');
    }
    return toEventInvitation(row);
  }

  /** Sets the invitation status to 'removed'. */
  async remove(eventId: string, userId: string): Promise<void> {
    await this.db<EventInvitationRow>('event_invitations')
      .where({ event_id: eventId, user_id: userId })
      .update({ status: 'removed' });
  }

  /**
   * Updates the invitation status for an active (non-removed) invitation.
   * Used for RSVP responses (accepted / declined / tentative).
   * Returns null when no active invitation exists for the user.
   */
  async updateStatus(
    eventId: string,
    userId: string,
    status: InvitationStatus,
  ): Promise<EventInvitation | null> {
    const rows = await this.db<EventInvitationRow>('event_invitations')
      .where({ event_id: eventId, user_id: userId })
      .whereNot('status', 'removed')
      .update({ status, responded_at: new Date() })
      .returning('*');
    const row = rows[0];
    return row ? toEventInvitation(row) : null;
  }
}
