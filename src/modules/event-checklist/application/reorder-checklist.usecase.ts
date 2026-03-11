import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../../event-management/domain/event-invitation.repository.port.js';
import type { EventChecklistRepositoryPort } from '../domain/event-checklist.repository.port.js';

export class ReorderChecklistUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly invitationRepo: EventInvitationRepositoryPort,
    private readonly checklistRepo: EventChecklistRepositoryPort,
  ) {}

  async execute(
    caller: IdentityContext,
    eventId: string,
    orderedItemIds: string[],
  ): Promise<void> {
    const event = await this.eventRepo.findById(eventId);
    if (!event) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    const hasAccess = await this.invitationRepo.hasAccess(eventId, caller.userId);
    if (!hasAccess) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    const checklist = await this.checklistRepo.findChecklistByEvent(eventId);
    if (!checklist) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    const existingItems = await this.checklistRepo.listItems(checklist.id);
    const existingIds = new Set(existingItems.map((i) => i.id));
    const providedIds = new Set(orderedItemIds);

    // All existing item IDs must be present in the provided order list.
    for (const id of existingIds) {
      if (!providedIds.has(id)) {
        throw Object.assign(
          new Error('orderedItemIds must include all existing checklist items'),
          { code: 'VALIDATION_ERROR' },
        );
      }
    }

    await this.checklistRepo.reorderItems(checklist.id, orderedItemIds);
  }
}
