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

    try {
      return await this.repo.create({
        userId: identity.userId,
        displayName: trimmed,
        avatarUrl: input.avatarUrl ?? null,
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new AlreadyRegisteredError();
      }
      throw error;
    }
  }
}

/**
 * Detects a PostgreSQL unique-constraint violation (error code 23505).
 * This keeps sign-up atomic: the insert is the single source of truth,
 * so concurrent requests for the same user cannot both succeed.
 */
function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { code?: string }).code === '23505';
}
