import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../domain/event.repository.port.js';

export class DeletePersonalEventUseCase {
  constructor(private readonly eventRepo: EventRepositoryPort) {}

  async execute(caller: IdentityContext, eventId: string): Promise<void> {
    const event = await this.eventRepo.findById(eventId);
    if (!event) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    // Only the owner can delete their personal event.
    if (event.ownerId !== caller.userId) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    // This use case is for personal (non-group) events only.
    // Group-scoped events must be managed through the group event endpoints.
    if (event.groupId !== null) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    await this.eventRepo.deleteEvent(eventId);
  }
}
