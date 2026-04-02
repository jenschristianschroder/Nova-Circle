import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../domain/event.repository.port.js';
import type { EventShareRepositoryPort } from '../../event-sharing/domain/event-share.repository.port.js';

export class DeletePersonalEventUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly shareRepo: EventShareRepositoryPort,
  ) {}

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

    // Revoke all shares before deleting the event so the RESTRICT FK
    // constraint is satisfied and share removal is auditable at the
    // application layer rather than silently cascaded by the database.
    await this.shareRepo.deleteByEvent(eventId);

    await this.eventRepo.deleteEvent(eventId);
  }
}
