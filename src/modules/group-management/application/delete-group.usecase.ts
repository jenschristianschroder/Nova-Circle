import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { GroupRepositoryPort } from '../domain/group.repository.port.js';
import type { MembershipCheckerPort } from '../domain/membership-checker.port.js';

/** Type guard for PostgreSQL FK violation errors (SQLSTATE 23503). */
function isForeignKeyViolation(err: unknown): boolean {
  return (
    err instanceof Error && (err as Error & { code?: string }).code === '23503'
  );
}

export class DeleteGroupUseCase {
  constructor(
    private readonly groupRepo: GroupRepositoryPort,
    private readonly membership: MembershipCheckerPort,
  ) {}

  async execute(identity: IdentityContext, groupId: string): Promise<void> {
    const role = await this.membership.getRole(groupId, identity.userId);
    if (role !== 'owner') {
      throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    }

    try {
      await this.groupRepo.delete(groupId);
    } catch (err: unknown) {
      if (isForeignKeyViolation(err)) {
        throw Object.assign(
          new Error(
            'Cannot delete group: active event shares reference this group. ' +
            'Revoke all shares first.',
          ),
          { code: 'HAS_ACTIVE_SHARES' },
        );
      }
      throw err;
    }
  }
}
