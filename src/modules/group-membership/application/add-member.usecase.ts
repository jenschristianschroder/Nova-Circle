import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { GroupMemberRepositoryPort } from '../domain/group-member.repository.port.js';
import type { GroupMember } from '../domain/group-member.js';

export class AddMemberUseCase {
  constructor(private readonly memberRepo: GroupMemberRepositoryPort) {}

  async execute(
    caller: IdentityContext,
    groupId: string,
    targetUserId: string,
    role: 'admin' | 'member' = 'member',
  ): Promise<GroupMember> {
    const callerRole = await this.memberRepo.getRole(groupId, caller.userId);
    if (callerRole !== 'owner' && callerRole !== 'admin') {
      throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    }

    const existing = await this.memberRepo.findByGroupAndUser(groupId, targetUserId);
    if (existing) {
      throw Object.assign(new Error('User is already a member of this group'), {
        code: 'CONFLICT',
      });
    }

    return this.memberRepo.add({ groupId, userId: targetUserId, role });
  }
}
