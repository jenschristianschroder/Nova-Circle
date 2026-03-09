import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { GroupRepositoryPort } from '../domain/group.repository.port.js';
import type { MembershipCheckerPort } from '../domain/membership-checker.port.js';
import type { Group } from '../domain/group.js';

/**
 * The MemberAdderPort allows CreateGroupUseCase to add the owner as a member
 * without depending directly on the group-membership module.
 */
export interface MemberAdderPort {
  addOwner(groupId: string, userId: string): Promise<void>;
}

export class CreateGroupUseCase {
  constructor(
    private readonly groupRepo: GroupRepositoryPort,
    private readonly memberAdder: MemberAdderPort,
  ) {}

  async execute(identity: IdentityContext, input: { name: string; description?: string | null }): Promise<Group> {
    const trimmed = input.name.trim();
    if (trimmed.length === 0) {
      throw new Error('Group name must not be empty');
    }
    if (trimmed.length > 100) {
      throw new Error('Group name must not exceed 100 characters');
    }

    const group = await this.groupRepo.create({
      name: trimmed,
      description: input.description ?? null,
      ownerId: identity.userId,
    });

    // Seed the creator as the group owner in the membership table.
    await this.memberAdder.addOwner(group.id, identity.userId);

    return group;
  }
}

// MembershipCheckerPort is re-exported here to avoid circular imports in tests.
export type { MembershipCheckerPort };

