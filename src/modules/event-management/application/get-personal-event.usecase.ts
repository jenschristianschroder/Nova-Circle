import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../domain/event.repository.port.js';
import type { Event } from '../domain/event.js';

export class GetPersonalEventUseCase {
  constructor(private readonly eventRepo: EventRepositoryPort) {}

  async execute(caller: IdentityContext, eventId: string): Promise<Event> {
    const event = await this.eventRepo.findById(eventId);
    if (!event) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    // Personal events are only accessible by their owner.
    // Return NOT_FOUND to avoid disclosing event existence to non-owners.
    if (event.ownerId !== caller.userId) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    // This use case is for personal (non-group) events only.
    if (event.groupId !== null) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    return event;
  }
}
