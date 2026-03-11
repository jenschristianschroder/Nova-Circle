import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../../event-management/domain/event-invitation.repository.port.js';
import type { EventLocationRepositoryPort } from '../domain/event-location.repository.port.js';
import type { EventLocation } from '../domain/event-location.js';

export class GetEventLocationUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly invitationRepo: EventInvitationRepositoryPort,
    private readonly locationRepo: EventLocationRepositoryPort,
  ) {}

  async execute(caller: IdentityContext, eventId: string): Promise<EventLocation | null> {
    const event = await this.eventRepo.findById(eventId);
    if (!event) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    // Group membership alone does NOT grant access; a valid invitation is required.
    const hasAccess = await this.invitationRepo.hasAccess(eventId, caller.userId);
    if (!hasAccess) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    return this.locationRepo.findByEvent(eventId);
  }
}
