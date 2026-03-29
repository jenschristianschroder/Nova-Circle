import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../../event-management/domain/event-invitation.repository.port.js';
import type { EventLocationRepositoryPort } from '../domain/event-location.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { EventLocation, SetLocationData } from '../domain/event-location.js';
import { validateSetLocationData } from '../domain/event-location-validation.js';

export class SetEventLocationUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly invitationRepo: EventInvitationRepositoryPort,
    private readonly locationRepo: EventLocationRepositoryPort,
    private readonly memberRepo: GroupMemberRepositoryPort,
  ) {}

  async execute(
    caller: IdentityContext,
    eventId: string,
    data: SetLocationData,
  ): Promise<EventLocation> {
    const event = await this.eventRepo.findById(eventId);
    if (!event) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    const hasAccess = await this.invitationRepo.hasAccess(eventId, caller.userId);
    if (!hasAccess) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    // Only event creator or group admin/owner may set/update the location.
    const isCreator = event.createdBy === caller.userId;
    if (!isCreator) {
      if (!event.groupId) {
        throw Object.assign(new Error('Only the event owner can perform this action on a personal event'), { code: 'FORBIDDEN' });
      }
      const role = await this.memberRepo.getRole(event.groupId, caller.userId);
      const isAdminOrOwner = role === 'owner' || role === 'admin';
      if (!isAdminOrOwner) {
        throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
      }
    }

    validateSetLocationData(data);

    return this.locationRepo.upsert(eventId, data, caller.userId);
  }
}
