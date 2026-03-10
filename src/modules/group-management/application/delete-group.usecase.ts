import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { GroupRepositoryPort } from '../domain/group.repository.port.js';
import type { MembershipCheckerPort } from '../domain/membership-checker.port.js';

export class DeleteGroupUseCase {
  constructor(
    private readonly groupRepo: GroupRepositoryPort,
    private readonly membership: MembershipCheckerPort,
  ) {}

  async execute(identity: IdentityContext, groupId: string): Promise<void> {
    const role = await this.membership.getRole(groupId, identity.userId);
    if (role !== 'owner') {
      throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    }

    await this.groupRepo.delete(groupId);
  }
}
