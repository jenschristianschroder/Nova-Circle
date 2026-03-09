import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { UserProfileRepositoryPort } from '../domain/user-profile.repository.port.js';
import type { UserProfile } from '../domain/user-profile.js';

export class GetMyProfileUseCase {
  constructor(private readonly repo: UserProfileRepositoryPort) {}

  async execute(identity: IdentityContext): Promise<UserProfile | null> {
    return this.repo.findById(identity.userId);
  }
}
