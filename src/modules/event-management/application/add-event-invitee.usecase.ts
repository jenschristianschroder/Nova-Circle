import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../domain/event-invitation.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { EventInvitation } from '../domain/event-invitation.js';

export class AddEventInviteeUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly invitationRepo: EventInvitationRepositoryPort,
    private readonly memberRepo: GroupMemberRepositoryPort,
  ) {}

  async execute(
    caller: IdentityContext,
    groupId: string,
    eventId: string,
    targetUserId: string,
  ): Promise<EventInvitation> {
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

    // Only the creator or a group admin/owner can add invitees.
    const isCreator = event.createdBy === caller.userId;
    if (!isCreator && !isAdminOrOwner) {
      throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    }

    if (event.status === 'cancelled') {
      throw Object.assign(new Error('Cannot add invitees to a cancelled event'), {
        code: 'CONFLICT',
      });
    }

    // The target user must be a current group member.
    const isMember = await this.memberRepo.isMember(groupId, targetUserId);
    if (!isMember) {
      throw Object.assign(new Error('Target user is not a member of the group'), {
        code: 'VALIDATION_ERROR',
      });
    }

    // If the user already has an active invitation, return a conflict.
    const existing = await this.invitationRepo.findByEventAndUser(eventId, targetUserId);
    if (existing && existing.status !== 'removed') {
      throw Object.assign(new Error('User is already invited to this event'), { code: 'CONFLICT' });
    }

    return this.invitationRepo.add(eventId, targetUserId);
  }
}
