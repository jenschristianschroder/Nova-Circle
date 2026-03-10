import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../domain/event.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { Event } from '../domain/event.js';

export class ListGroupEventsUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly memberRepo: GroupMemberRepositoryPort,
  ) {}

  async execute(caller: IdentityContext, groupId: string): Promise<Event[]> {
    // Non-members receive NOT_FOUND to avoid disclosing group existence.
    const isMember = await this.memberRepo.isMember(groupId, caller.userId);
    if (!isMember) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    // Only returns events the caller has an active invitation for.
    return this.eventRepo.listByGroupForUser(groupId, caller.userId);
  }
}
