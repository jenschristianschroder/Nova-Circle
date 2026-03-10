import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../domain/event-invitation.repository.port.js';
import type { EventInvitation } from '../domain/event-invitation.js';

export class ListEventInviteesUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly invitationRepo: EventInvitationRepositoryPort,
  ) {}

  async execute(
    caller: IdentityContext,
    groupId: string,
    eventId: string,
  ): Promise<EventInvitation[]> {
    const event = await this.eventRepo.findById(eventId);
    if (!event || event.groupId !== groupId) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    // Only callers with active event access may list the invitee set.
    const hasAccess = await this.invitationRepo.hasAccess(eventId, caller.userId);
    if (!hasAccess) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    return this.invitationRepo.listByEvent(eventId);
  }
}
