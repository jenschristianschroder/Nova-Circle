import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type {
  SharedEventQueryPort,
  SharedEventRecord,
  SharedEventDateRange,
  SharedEventPagination,
} from '../domain/shared-event-query.port.js';
import type { VisibilityLevel } from '../../event-sharing/domain/event-share.js';

/**
 * Visibility-filtered event as returned to clients.
 *
 * Fields are present or absent depending on the share's `visibilityLevel`:
 * - `busy`    → id, ownerId, ownerDisplayName, startAt, endAt, visibilityLevel
 * - `title`   → above + title, status
 * - `details` → above + description
 */
export interface SharedGroupEventDto {
  readonly id: string;
  readonly ownerId: string;
  readonly ownerDisplayName: string;
  readonly startAt: string;
  readonly endAt: string | null;
  readonly visibilityLevel: VisibilityLevel;
  readonly title?: string;
  readonly description?: string | null;
  readonly status?: SharedEventRecord['status'];
}

/** Apply visibility-level filtering to a raw shared-event record. */
export function applyVisibilityFilter(record: SharedEventRecord): SharedGroupEventDto {
  const base: SharedGroupEventDto = {
    id: record.eventId,
    ownerId: record.ownerId,
    ownerDisplayName: record.ownerDisplayName,
    startAt: record.startAt.toISOString(),
    endAt: record.endAt ? record.endAt.toISOString() : null,
    visibilityLevel: record.visibilityLevel,
  };

  if (record.visibilityLevel === 'busy') {
    return base;
  }

  if (record.visibilityLevel === 'title') {
    return { ...base, title: record.title, status: record.status };
  }

  // 'details' — full data
  return {
    ...base,
    title: record.title,
    description: record.description,
    status: record.status,
  };
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
