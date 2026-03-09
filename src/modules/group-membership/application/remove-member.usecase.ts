import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { GroupMemberRepositoryPort } from '../domain/group-member.repository.port.js';

export class RemoveMemberUseCase {
  constructor(private readonly memberRepo: GroupMemberRepositoryPort) {}

  async execute(caller: IdentityContext, groupId: string, targetUserId: string): Promise<void> {
    const targetMember = await this.memberRepo.findByGroupAndUser(groupId, targetUserId);
    if (!targetMember) {
      throw Object.assign(new Error('Member not found'), { code: 'NOT_FOUND' });
    }

    // Owner cannot be removed – ownership must be transferred first.
    if (targetMember.role === 'owner') {
      throw Object.assign(new Error('Cannot remove the group owner'), { code: 'FORBIDDEN' });
    }

    const isSelf = caller.userId === targetUserId;
    if (isSelf) {
      // Members can always remove themselves.
      await this.memberRepo.remove(groupId, targetUserId);
      return;
    }

    const callerRole = await this.memberRepo.getRole(groupId, caller.userId);
    if (callerRole !== 'owner' && callerRole !== 'admin') {
      throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    }

    await this.memberRepo.remove(groupId, targetUserId);
  }
}
