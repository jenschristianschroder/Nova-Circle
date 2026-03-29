import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { SharedEventQueryPort } from '../domain/shared-event-query.port.js';
import { applyVisibilityFilter, type SharedGroupEventDto } from './list-group-events.usecase.js';

export class GetSharedGroupEventUseCase {
  constructor(
    private readonly sharedEventQuery: SharedEventQueryPort,
    private readonly memberRepo: GroupMemberRepositoryPort,
  ) {}

  async execute(
    caller: IdentityContext,
    groupId: string,
    eventId: string,
  ): Promise<SharedGroupEventDto> {
    // Non-members receive NOT_FOUND to avoid disclosing group existence.
    const isMember = await this.memberRepo.isMember(groupId, caller.userId);
    if (!isMember) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    const record = await this.sharedEventQuery.findByGroupAndEvent(groupId, eventId);
    if (!record) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    return applyVisibilityFilter(record);
  }
}
