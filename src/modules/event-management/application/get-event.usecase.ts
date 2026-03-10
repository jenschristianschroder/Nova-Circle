import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../domain/event-invitation.repository.port.js';
import type { Event } from '../domain/event.js';

export class GetEventUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly invitationRepo: EventInvitationRepositoryPort,
  ) {}

  async execute(caller: IdentityContext, eventId: string): Promise<Event> {
    const event = await this.eventRepo.findById(eventId);
    if (!event) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    // Group membership alone does NOT grant access; a valid invitation is required.
    const hasAccess = await this.invitationRepo.hasAccess(eventId, caller.userId);
    if (!hasAccess) {
      // Return NOT_FOUND to avoid disclosing the event's existence.
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    return event;
  }
}
