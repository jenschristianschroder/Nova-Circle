import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { EventShareRepositoryPort } from '../domain/event-share.repository.port.js';
import type { EventShare, VisibilityLevel } from '../domain/event-share.js';

export class ShareEventToGroupUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly memberRepo: GroupMemberRepositoryPort,
    private readonly shareRepo: EventShareRepositoryPort,
  ) {}

  async execute(
    caller: IdentityContext,
    eventId: string,
    groupId: string,
    visibilityLevel: VisibilityLevel,
  ): Promise<EventShare> {
    const event = await this.eventRepo.findById(eventId);
    if (!event) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    // Sharing is only supported for personal events (groupId === null).
    if (event.groupId !== null) {
      throw Object.assign(new Error('Only personal events can be shared to groups'), {
        code: 'FORBIDDEN',
      });
    }

    if (event.ownerId !== caller.userId) {
      throw Object.assign(new Error('Only the event owner can share events'), {
        code: 'FORBIDDEN',
      });
    }

    const isMember = await this.memberRepo.isMember(groupId, caller.userId);
    if (!isMember) {
      throw Object.assign(new Error('You must be a member of the target group'), {
        code: 'FORBIDDEN',
      });
    }

    const existing = await this.shareRepo.findByEventAndGroup(eventId, groupId);
    if (existing) {
      throw Object.assign(new Error('Event is already shared to this group'), {
        code: 'CONFLICT',
      });
    }

    return this.shareRepo.create({
      eventId,
      groupId,
      visibilityLevel,
      sharedByUserId: caller.userId,
    });
  }
}
