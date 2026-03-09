import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { GroupMemberRepositoryPort } from '../domain/group-member.repository.port.js';
import type { GroupMember } from '../domain/group-member.js';

export class ListMembersUseCase {
  constructor(private readonly memberRepo: GroupMemberRepositoryPort) {}

  async execute(caller: IdentityContext, groupId: string): Promise<GroupMember[]> {
    const isMember = await this.memberRepo.isMember(groupId, caller.userId);
    if (!isMember) {
      throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    }

    return this.memberRepo.listByGroup(groupId);
  }
}
