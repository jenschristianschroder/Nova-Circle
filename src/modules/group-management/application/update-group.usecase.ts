import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { GroupRepositoryPort } from '../domain/group.repository.port.js';
import type { MembershipCheckerPort } from '../domain/membership-checker.port.js';
import type { Group, UpdateGroupData } from '../domain/group.js';

export class UpdateGroupUseCase {
  constructor(
    private readonly groupRepo: GroupRepositoryPort,
    private readonly membership: MembershipCheckerPort,
  ) {}

  async execute(
    identity: IdentityContext,
    groupId: string,
    data: UpdateGroupData,
  ): Promise<Group> {
    const role = await this.membership.getRole(groupId, identity.userId);
    if (role !== 'owner' && role !== 'admin') {
      throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    }

    if (data.name !== undefined) {
      const trimmed = data.name.trim();
      if (trimmed.length === 0) throw new Error('Group name must not be empty');
      if (trimmed.length > 100) throw new Error('Group name must not exceed 100 characters');
    }

    const updated = await this.groupRepo.update(groupId, data);
    if (!updated) {
      throw Object.assign(new Error('Group not found'), { code: 'NOT_FOUND' });
    }
    return updated;
  }
}
