import type { Knex } from 'knex';
import type { EventShareRepositoryPort } from '../domain/event-share.repository.port.js';
import type { EventShare, ShareEventData, VisibilityLevel } from '../domain/event-share.js';

interface EventShareRow {
  id: string;
  event_id: string;
  group_id: string;
  visibility_level: string;
  shared_by_user_id: string;
  shared_at: Date;
  updated_at: Date;
}

function toEventShare(row: EventShareRow): EventShare {
  return {
    id: row.id,
    eventId: row.event_id,
    groupId: row.group_id,
    visibilityLevel: row.visibility_level as VisibilityLevel,
    sharedByUserId: row.shared_by_user_id,
    sharedAt: new Date(row.shared_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class KnexEventShareRepository implements EventShareRepositoryPort {
  constructor(private readonly db: Knex) {}

  async findById(shareId: string): Promise<EventShare | null> {
    const row = await this.db<EventShareRow>('event_shares').where({ id: shareId }).first();
    return row ? toEventShare(row) : null;
  }

  async findByEventAndGroup(eventId: string, groupId: string): Promise<EventShare | null> {
    const row = await this.db<EventShareRow>('event_shares')
      .where({ event_id: eventId, group_id: groupId })
      .first();
    return row ? toEventShare(row) : null;
  }

  async listByEvent(eventId: string): Promise<EventShare[]> {
    const rows = await this.db<EventShareRow>('event_shares')
      .where({ event_id: eventId })
      .orderBy('shared_at', 'asc');
    return rows.map(toEventShare);
  }

  async create(data: ShareEventData): Promise<EventShare> {
    const now = new Date();
    const rows = await this.db<EventShareRow>('event_shares')
      .insert({
        event_id: data.eventId,
        group_id: data.groupId,
        visibility_level: data.visibilityLevel,
        shared_by_user_id: data.sharedByUserId,
        shared_at: now,
        updated_at: now,
      })
      .returning('*');

    const row = rows[0];
    if (!row) {
      throw new Error('Failed to create event share: database returned no row');
    }
    return toEventShare(row);
  }

  async updateVisibility(
    shareId: string,
    visibilityLevel: VisibilityLevel,
  ): Promise<EventShare | null> {
    const rows = await this.db<EventShareRow>('event_shares')
      .where({ id: shareId })
      .update({ visibility_level: visibilityLevel, updated_at: new Date() })
      .returning('*');

    const row = rows[0];
    return row ? toEventShare(row) : null;
  }

  async delete(shareId: string): Promise<void> {
    await this.db('event_shares').where({ id: shareId }).delete();
  }

  async deleteByEvent(eventId: string): Promise<number> {
    return this.db('event_shares').where({ event_id: eventId }).delete();
  }
}
