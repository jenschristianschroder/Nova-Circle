import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../domain/event-invitation.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { AuditLogPort } from '../../audit-security/domain/audit-log.port.js';

export class CancelEventUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly invitationRepo: EventInvitationRepositoryPort,
    private readonly memberRepo: GroupMemberRepositoryPort,
    private readonly auditLog: AuditLogPort,
  ) {}

  async execute(caller: IdentityContext, groupId: string, eventId: string): Promise<void> {
    const event = await this.eventRepo.findById(eventId);
    if (!event || event.groupId !== groupId) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    // Group owners and admins can cancel any event in their group even without
    // an invitation.  For everyone else an active invitation is required so
    // that the event's existence is not disclosed to non-invited callers.
    const role = await this.memberRepo.getRole(groupId, caller.userId);
    const isAdminOrOwner = role === 'owner' || role === 'admin';

    if (!isAdminOrOwner) {
      const hasAccess = await this.invitationRepo.hasAccess(eventId, caller.userId);
      if (!hasAccess) {
        throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
      }
    }

    if (event.status === 'cancelled') {
      throw Object.assign(new Error('Event is already cancelled'), { code: 'CONFLICT' });
    }

    // Only the creator or a group admin/owner can cancel.
    const isCreator = event.createdBy === caller.userId;
    if (!isCreator && !isAdminOrOwner) {
      throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    }

    await this.eventRepo.cancel(eventId);

    await this.auditLog.write({
      action: 'event.cancelled',
      actorId: caller.userId,
      resourceType: 'event',
      resourceId: eventId,
      groupId,
    });
  }
}
