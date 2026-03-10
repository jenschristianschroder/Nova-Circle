import type { Knex } from 'knex';
import type { EventRepositoryPort } from '../domain/event.repository.port.js';
import type { Event, UpdateEventData } from '../domain/event.js';

interface EventRow {
  id: string;
  group_id: string;
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

export class KnexEventRepository implements EventRepositoryPort {
  constructor(private readonly db: Knex) {}

  async findById(eventId: string): Promise<Event | null> {
    const row = await this.db<EventRow>('events').where({ id: eventId }).first();
    return row ? toEvent(row) : null;
  }

  /**
   * Returns all events in a group for which the given user has an active
   * invitation (status is not 'removed').  Group membership alone is not
   * enough – an explicit invitation record is required.
   */
  async listByGroupForUser(groupId: string, userId: string): Promise<Event[]> {
    const rows = await this.db<EventRow>('events')
      .join('event_invitations', 'events.id', 'event_invitations.event_id')
      .where('events.group_id', groupId)
      .where('event_invitations.user_id', userId)
      .whereNot('event_invitations.status', 'removed')
      .select('events.*')
      .orderBy('events.start_at', 'asc');

    return rows.map(toEvent);
  }

  async cancel(eventId: string): Promise<void> {
    await this.db('events')
      .where({ id: eventId })
      .update({ status: 'cancelled', updated_at: new Date() });
  }

  async update(eventId: string, data: UpdateEventData): Promise<Event> {
    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (data.title !== undefined) patch['title'] = data.title;
    if (data.description !== undefined) patch['description'] = data.description;
    if (data.startAt !== undefined) patch['start_at'] = data.startAt;
    if (data.endAt !== undefined) patch['end_at'] = data.endAt;

    const rows = await this.db<EventRow>('events')
      .where({ id: eventId })
      .update(patch)
      .returning('*');

    const row = rows[0];
    if (!row) {
      throw Object.assign(new Error('No event was updated: event not found with the provided ID'), {
        code: 'NOT_FOUND',
      });
    }
    return toEvent(row);
  }
}
