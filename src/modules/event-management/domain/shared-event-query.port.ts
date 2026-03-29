import type { EventStatus } from './event.js';
import type { VisibilityLevel } from '../../event-sharing/domain/event-share.js';

/**
 * Raw record returned by the shared-event query.
 *
 * Contains the full event data plus sharing metadata.  Visibility-level
 * filtering is applied in the use-case layer, not in the query itself.
 */
export interface SharedEventRecord {
  readonly eventId: string;
  readonly ownerId: string;
  readonly ownerDisplayName: string;
  readonly title: string;
  readonly description: string | null;
  readonly startAt: Date;
  readonly endAt: Date | null;
  readonly status: EventStatus;
  readonly visibilityLevel: VisibilityLevel;
}

export interface SharedEventDateRange {
  readonly from?: Date;
  readonly to?: Date;
}

export interface SharedEventPagination {
  readonly page: number;
  readonly limit: number;
}

/**
 * Read-model port for querying events visible in a group context.
 *
 * Results include:
 * 1. Events shared to the group via `event_shares` (with visibility filtering). This
 *    typically covers personal events, but may also include group-scoped events where
 *    ownership data has been back-filled (for example by the `personal_event_ownership`
 *    migration).
 * 2. Legacy group-scoped events the user is invited to (shown with `details` visibility),
 *    for cases not already covered by `event_shares`.
 *
 * Implementations MUST ensure that a given logical event is not returned twice when
 * combining these sources (for example by restricting the `event_shares` source to
 * personal events, or by deduplicating on `eventId`).
 */
export interface SharedEventQueryPort {
  listByGroup(
    groupId: string,
    userId: string,
    dateRange?: SharedEventDateRange,
    pagination?: SharedEventPagination,
  ): Promise<{ events: SharedEventRecord[]; total: number }>;

  findByGroupAndEvent(groupId: string, eventId: string): Promise<SharedEventRecord | null>;
}
