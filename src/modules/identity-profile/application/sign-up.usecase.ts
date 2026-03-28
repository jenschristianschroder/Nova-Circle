import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { UserProfileRepositoryPort } from '../domain/user-profile.repository.port.js';
import type { UserProfile } from '../domain/user-profile.js';

export interface SignUpInput {
  readonly displayName: string;
  readonly avatarUrl?: string | null;
}

export class AlreadyRegisteredError extends Error {
  constructor() {
    super('User is already registered');
    this.name = 'AlreadyRegisteredError';
  }
}

export class SignUpUseCase {
  constructor(private readonly repo: UserProfileRepositoryPort) {}

  async execute(identity: IdentityContext, input: SignUpInput): Promise<UserProfile> {
    const trimmed = input.displayName.trim();
    if (trimmed.length === 0) {
      throw new Error('displayName must not be empty');
    }
    if (trimmed.length > 100) {
      throw new Error('displayName must not exceed 100 characters');
    }

    const existing = await this.repo.findById(identity.userId);
    if (existing) {
      throw new AlreadyRegisteredError();
    }

    return this.repo.create({
      userId: identity.userId,
      displayName: trimmed,
      avatarUrl: input.avatarUrl ?? null,
    });
  }
}
