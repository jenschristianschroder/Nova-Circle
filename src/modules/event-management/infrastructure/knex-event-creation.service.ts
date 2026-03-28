import type { Knex } from 'knex';
import type { EventCreationPort } from '../domain/event-creation.port.js';
import type { Event, CreateEventData } from '../domain/event.js';

interface EventRow {
  id: string;
  group_id: string | null;
  owner_id: string;
  title: string;
  description: string | null;
  start_at: Date;
  end_at: Date | null;
  created_by: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

function toEvent(row: EventRow): Event {
  return {
    id: row.id,
    groupId: row.group_id,
    ownerId: row.owner_id,
    title: row.title,
    description: row.description,
    startAt: new Date(row.start_at),
    endAt: row.end_at ? new Date(row.end_at) : null,
    createdBy: row.created_by,
    status: row.status as Event['status'],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Atomically creates an event row and all initial invitation rows inside a
 * single Knex transaction.
 */
export class KnexEventCreationService implements EventCreationPort {
  constructor(private readonly db: Knex) {}

  async createEventWithInvitations(data: CreateEventData): Promise<Event> {
    return this.db.transaction(async (trx) => {
      const now = new Date();

      const eventRows = await trx<EventRow>('events')
        .insert({
          group_id: data.groupId,
          owner_id: data.createdBy,
          title: data.title,
          description: data.description ?? null,
          start_at: data.startAt,
          end_at: data.endAt ?? null,
          created_by: data.createdBy,
          status: 'scheduled',
          created_at: now,
          updated_at: now,
        })
        .returning('*');

      const eventRow = eventRows[0];
      if (!eventRow) {
        throw new Error('Failed to retrieve inserted event: database returned no row after insert');
      }

      if (data.inviteeIds.length > 0) {
        const uniqueIds = [...new Set(data.inviteeIds)];
        await trx('event_invitations').insert(
          uniqueIds.map((userId) => ({
            event_id: eventRow.id,
            user_id: userId,
            status: 'invited',
            invited_at: now,
          })),
        );
      }

      return toEvent(eventRow);
    });
  }
}
