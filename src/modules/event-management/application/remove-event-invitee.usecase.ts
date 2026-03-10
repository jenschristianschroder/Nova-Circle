import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../domain/event-invitation.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { AuditLogPort } from '../../audit-security/domain/audit-log.port.js';

export class RemoveEventInviteeUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly invitationRepo: EventInvitationRepositoryPort,
    private readonly memberRepo: GroupMemberRepositoryPort,
    private readonly auditLog: AuditLogPort,
  ) {}

  async execute(
    caller: IdentityContext,
    groupId: string,
    eventId: string,
    targetUserId: string,
  ): Promise<void> {
    const event = await this.eventRepo.findById(eventId);
    if (!event || event.groupId !== groupId) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    // Group owners and admins can manage invitations without needing their own
    // invitation.  All others need an active invitation for existence checks.
    const role = await this.memberRepo.getRole(groupId, caller.userId);
    const isAdminOrOwner = role === 'owner' || role === 'admin';

    if (!isAdminOrOwner) {
      const hasAccess = await this.invitationRepo.hasAccess(eventId, caller.userId);
      if (!hasAccess) {
        throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
      }
    }

    // Only the creator or a group admin/owner can remove invitees.
    const isCreator = event.createdBy === caller.userId;
    if (!isCreator && !isAdminOrOwner) {
      throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    }

    // The event creator cannot be removed from their own event.
    if (targetUserId === event.createdBy) {
      throw Object.assign(new Error('Cannot remove the event creator from their own event'), {
        code: 'VALIDATION_ERROR',
      });
    }

    // The target must have an active invitation.
    const existing = await this.invitationRepo.findByEventAndUser(eventId, targetUserId);
    if (!existing || existing.status === 'removed') {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    await this.invitationRepo.remove(eventId, targetUserId);

    await this.auditLog.log({
      action: 'event_invitation.removed',
      actorId: caller.userId,
      resourceType: 'event_invitation',
      resourceId: eventId,
      groupId,
      metadata: { targetUserId },
    });
  }
}
