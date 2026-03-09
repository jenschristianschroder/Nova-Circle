import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { GroupRepositoryPort } from '../domain/group.repository.port.js';
import type { MembershipCheckerPort } from '../domain/membership-checker.port.js';
import type { Group } from '../domain/group.js';

export class GetGroupUseCase {
  constructor(
    private readonly groupRepo: GroupRepositoryPort,
    private readonly membership: MembershipCheckerPort,
  ) {}

  /**
   * Returns the group if the caller is a member, null if the group does not
   * exist or the caller is not a member (to prevent information disclosure).
   */
  async execute(identity: IdentityContext, groupId: string): Promise<Group | null> {
    const group = await this.groupRepo.findById(groupId);
    if (!group) return null;

    const member = await this.membership.isMember(groupId, identity.userId);
    if (!member) return null;

    return group;
  }
}
