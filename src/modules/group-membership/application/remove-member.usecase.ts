import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { GroupMemberRepositoryPort } from '../domain/group-member.repository.port.js';

export class RemoveMemberUseCase {
  constructor(private readonly memberRepo: GroupMemberRepositoryPort) {}

  async execute(caller: IdentityContext, groupId: string, targetUserId: string): Promise<void> {
    const isSelf = caller.userId === targetUserId;

    if (isSelf) {
      // Self-removal: check target exists and is not the owner, then remove.
      const targetMember = await this.memberRepo.findByGroupAndUser(groupId, targetUserId);
      if (!targetMember) {
        throw Object.assign(new Error('Member not found'), { code: 'NOT_FOUND' });
      }
      if (targetMember.role === 'owner') {
        throw Object.assign(new Error('Cannot remove the group owner'), { code: 'FORBIDDEN' });
      }
      await this.memberRepo.remove(groupId, targetUserId);
      return;
    }

    // Non-self removal: authorize caller first to prevent membership probing.
    const callerRole = await this.memberRepo.getRole(groupId, caller.userId);
    if (!callerRole) {
      // Return NOT_FOUND so non-members cannot probe group membership.
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }
    if (callerRole !== 'owner' && callerRole !== 'admin') {
      throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    }

    const targetMember = await this.memberRepo.findByGroupAndUser(groupId, targetUserId);
    if (!targetMember) {
      throw Object.assign(new Error('Member not found'), { code: 'NOT_FOUND' });
    }
    if (targetMember.role === 'owner') {
      throw Object.assign(new Error('Cannot remove the group owner'), { code: 'FORBIDDEN' });
    }

    await this.memberRepo.remove(groupId, targetUserId);
  }
}
