import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { UserProfileRepositoryPort } from '../domain/user-profile.repository.port.js';
import type { UserProfile } from '../domain/user-profile.js';

export interface UpsertProfileInput {
  readonly displayName: string;
  readonly avatarUrl?: string | null;
}

export class UpsertMyProfileUseCase {
  constructor(private readonly repo: UserProfileRepositoryPort) {}

  async execute(identity: IdentityContext, input: UpsertProfileInput): Promise<UserProfile> {
    const trimmed = input.displayName.trim();
    if (trimmed.length === 0) {
      throw new Error('displayName must not be empty');
    }
    if (trimmed.length > 100) {
      throw new Error('displayName must not exceed 100 characters');
    }

    return this.repo.upsert({
      userId: identity.userId,
      displayName: trimmed,
      avatarUrl: input.avatarUrl ?? null,
    });
  }
}
