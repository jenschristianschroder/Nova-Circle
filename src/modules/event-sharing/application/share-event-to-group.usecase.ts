import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { EventShareRepositoryPort } from '../domain/event-share.repository.port.js';
import type { EventShare, VisibilityLevel } from '../domain/event-share.js';
import { EventSharePolicy } from '../domain/event-share-policy.js';

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

    EventSharePolicy.assertOwnerOfPersonalEvent(event, caller, 'share events');

    const isMember = await this.memberRepo.isMember(groupId, caller.userId);
    EventSharePolicy.assertGroupMembership(isMember);

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
