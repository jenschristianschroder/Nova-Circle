import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { CreateGroupWithOwnerPort } from '../domain/group-creation.port.js';
import type { Group } from '../domain/group.js';

export class CreateGroupUseCase {
  constructor(private readonly creator: CreateGroupWithOwnerPort) {}

  async execute(
    identity: IdentityContext,
    input: { name: string; description?: string | null },
  ): Promise<Group> {
    const trimmed = input.name.trim();
    if (trimmed.length === 0) {
      throw new Error('Group name must not be empty');
    }
    if (trimmed.length > 100) {
      throw new Error('Group name must not exceed 100 characters');
    }

    return this.creator.createGroupWithOwner({
      name: trimmed,
      description: input.description ?? null,
      ownerId: identity.userId,
    });
  }
}

