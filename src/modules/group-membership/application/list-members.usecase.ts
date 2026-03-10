import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { GroupMemberRepositoryPort } from '../domain/group-member.repository.port.js';
import type { GroupMember } from '../domain/group-member.js';

export class ListMembersUseCase {
  constructor(private readonly memberRepo: GroupMemberRepositoryPort) {}

  async execute(caller: IdentityContext, groupId: string): Promise<GroupMember[]> {
    const isMember = await this.memberRepo.isMember(groupId, caller.userId);
    if (!isMember) {
      // Return NOT_FOUND so non-members cannot distinguish "not a member" from
      // "group does not exist" (no existence disclosure).
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    return this.memberRepo.listByGroup(groupId);
  }
}
