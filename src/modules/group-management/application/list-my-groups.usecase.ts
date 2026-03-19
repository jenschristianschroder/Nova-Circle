import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { GroupRepositoryPort } from '../domain/group.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { Group } from '../domain/group.js';

/**
 * Returns all groups where the authenticated user is a member (any role).
 *
 * Uses a two-step approach: first fetch the user's group memberships, then
 * resolve each group by ID. Groups that have been deleted between the two
 * queries are silently filtered out.
 */
export class ListMyGroupsUseCase {
  constructor(
    private readonly memberRepo: GroupMemberRepositoryPort,
    private readonly groupRepo: GroupRepositoryPort,
  ) {}

  async execute(identity: IdentityContext): Promise<Group[]> {
    const memberships = await this.memberRepo.listByUser(identity.userId);
    const groups = await Promise.all(memberships.map((m) => this.groupRepo.findById(m.groupId)));
    return groups.filter((g): g is Group => g !== null);
  }
}
