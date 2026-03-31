import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type {
  SharedEventQueryPort,
  SharedEventRecord,
  SharedEventDateRange,
  SharedEventPagination,
} from '../domain/shared-event-query.port.js';
import {
  EventVisibilityPolicy,
  type VisibilityFilteredEvent,
} from '../domain/event-visibility-policy.js';

/**
 * Visibility-filtered event as returned to clients.
 *
 * Fields are present or absent depending on the share's `visibilityLevel`:
 * - `busy`    → id, ownerId, ownerDisplayName, startAt, endAt, visibilityLevel
 * - `title`   → above + title, status
 * - `details` → above + title, status, description
 *
 * Filtering rules are enforced by {@link EventVisibilityPolicy}.
 */
export type SharedGroupEventDto = VisibilityFilteredEvent;

/**
 * Apply visibility-level filtering to a raw shared-event record.
 *
 * Delegates to {@link EventVisibilityPolicy.filterRecord} which is
 * **fail-closed**: unrecognised visibility levels are treated as `busy`
 * (most restrictive) to prevent accidental data exposure.
 */
export function applyVisibilityFilter(record: SharedEventRecord): SharedGroupEventDto {
  return EventVisibilityPolicy.filterRecord(record);
}

export interface ListGroupEventsResult {
  readonly events: SharedGroupEventDto[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

export class ListGroupEventsUseCase {
  constructor(
    private readonly sharedEventQuery: SharedEventQueryPort,
    private readonly memberRepo: GroupMemberRepositoryPort,
  ) {}

  async execute(
    caller: IdentityContext,
    groupId: string,
    dateRange?: SharedEventDateRange,
    pagination?: SharedEventPagination,
  ): Promise<ListGroupEventsResult> {
    // Non-members receive NOT_FOUND to avoid disclosing group existence.
    const isMember = await this.memberRepo.isMember(groupId, caller.userId);
    if (!isMember) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    const resolvedPagination = pagination ?? { page: 1, limit: 50 };

    const { events: records, total } = await this.sharedEventQuery.listByGroup(
      groupId,
      caller.userId,
      dateRange,
      resolvedPagination,
    );

    const events = records.map(applyVisibilityFilter);

    return {
      events,
      total,
      page: resolvedPagination.page,
      limit: resolvedPagination.limit,
    };
  }
}
