import type { Knex } from 'knex';
import type {
  SharedEventQueryPort,
  SharedEventRecord,
  SharedEventDateRange,
  SharedEventPagination,
} from '../domain/shared-event-query.port.js';
import type { EventStatus } from '../domain/event.js';
import type { VisibilityLevel } from '../../event-sharing/domain/event-share.js';

interface SharedEventRow {
  event_id: string;
  owner_id: string;
  display_name: string;
  title: string;
  description: string | null;
  start_at: Date;
  end_at: Date | null;
  status: string;
  visibility_level: string;
}

function toSharedEventRecord(row: SharedEventRow): SharedEventRecord {
  return {
    eventId: row.event_id,
    ownerId: row.owner_id,
    ownerDisplayName: row.display_name,
    title: row.title,
    description: row.description,
    startAt: new Date(row.start_at),
    endAt: row.end_at ? new Date(row.end_at) : null,
    status: row.status as EventStatus,
    visibilityLevel: row.visibility_level as VisibilityLevel,
  };
}

/**
 * Knex implementation that merges two disjoint sources:
 *
 * 1. Personal events shared to the group via `event_shares`.
 * 2. Legacy group-scoped events the user is invited to (treated as `details` visibility).
 */
export class KnexSharedEventQuery implements SharedEventQueryPort {
  constructor(private readonly db: Knex) {}

  async listByGroup(
    groupId: string,
    userId: string,
    dateRange?: SharedEventDateRange,
    pagination?: SharedEventPagination,
  ): Promise<{ events: SharedEventRecord[]; total: number }> {
    // ── Source 1: personal events shared to the group via event_shares ──
    const sharedQuery = this.db('event_shares')
      .join('events', 'event_shares.event_id', 'events.id')
      .join('user_profiles', 'events.owner_id', 'user_profiles.id')
      .where('event_shares.group_id', groupId)
      .whereNull('events.group_id')
      .select(
        'events.id as event_id',
        'events.owner_id',
        'user_profiles.display_name',
        'events.title',
        'events.description',
        'events.start_at',
        'events.end_at',
        'events.status',
        'event_shares.visibility_level',
      );

    // ── Source 2: legacy group-scoped events with active invitations ──
    const legacyQuery = this.db('events')
      .join('event_invitations', 'events.id', 'event_invitations.event_id')
      .join('user_profiles', 'events.owner_id', 'user_profiles.id')
      .where('events.group_id', groupId)
      .where('event_invitations.user_id', userId)
      .whereNot('event_invitations.status', 'removed')
      .select(
        'events.id as event_id',
        'events.owner_id',
        'user_profiles.display_name',
        'events.title',
        'events.description',
        'events.start_at',
        'events.end_at',
        'events.status',
        this.db.raw("'details' as visibility_level"),
      );

    // Apply date range filters to both queries.
    if (dateRange?.from) {
      sharedQuery.where('events.start_at', '>=', dateRange.from);
      legacyQuery.where('events.start_at', '>=', dateRange.from);
    }
    if (dateRange?.to) {
      sharedQuery.where('events.start_at', '<=', dateRange.to);
      legacyQuery.where('events.start_at', '<=', dateRange.to);
    }

    // Use UNION ALL to combine both disjoint result sets.
    const unionQuery = sharedQuery.unionAll(legacyQuery);

    // Count total matching records.
    const countResult = await this.db
      .count({ total: '*' })
      .from(unionQuery.as('combined'))
      .first<{ total: number | string }>();
    const total = Number(countResult?.total ?? 0);

    // Fetch the sorted, paginated page — explicit column selection for data minimization.
    let pageQuery = this.db
      .select(
        'event_id',
        'owner_id',
        'display_name',
        'title',
        'description',
        'start_at',
        'end_at',
        'status',
        'visibility_level',
      )
      .from(unionQuery.clone().as('combined'))
      .orderBy('start_at', 'asc');

    if (pagination) {
      const offset = (pagination.page - 1) * pagination.limit;
      pageQuery = pageQuery.limit(pagination.limit).offset(offset);
    }

    const rows = (await pageQuery) as SharedEventRow[];
    return { events: rows.map(toSharedEventRecord), total };
  }

  async findByGroupAndEvent(
    groupId: string,
    eventId: string,
  ): Promise<SharedEventRecord | null> {
    const row = (await this.db('event_shares')
      .join('events', 'event_shares.event_id', 'events.id')
      .join('user_profiles', 'events.owner_id', 'user_profiles.id')
      .where('event_shares.group_id', groupId)
      .where('event_shares.event_id', eventId)
      .whereNull('events.group_id')
      .select(
        'events.id as event_id',
        'events.owner_id',
        'user_profiles.display_name',
        'events.title',
        'events.description',
        'events.start_at',
        'events.end_at',
        'events.status',
        'event_shares.visibility_level',
      )
      .first()) as SharedEventRow | undefined;

    return row ? toSharedEventRecord(row) : null;
  }
}
