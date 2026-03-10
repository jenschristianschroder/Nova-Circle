import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../domain/event-invitation.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';

export class CancelEventUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly invitationRepo: EventInvitationRepositoryPort,
    private readonly memberRepo: GroupMemberRepositoryPort,
  ) {}

  async execute(caller: IdentityContext, eventId: string): Promise<void> {
    const event = await this.eventRepo.findById(eventId);
    if (!event) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    // Caller must have an invitation to know the event exists.
    const hasAccess = await this.invitationRepo.hasAccess(eventId, caller.userId);
    if (!hasAccess) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    if (event.status === 'cancelled') {
      throw Object.assign(new Error('Event is already cancelled'), { code: 'CONFLICT' });
    }

    // Only the creator or a group admin/owner can cancel.
    const isCreator = event.createdBy === caller.userId;
    if (!isCreator) {
      const role = await this.memberRepo.getRole(event.groupId, caller.userId);
      if (role !== 'owner' && role !== 'admin') {
        throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
      }
    }

    await this.eventRepo.cancel(eventId);
  }
}
