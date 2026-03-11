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
    const existingItemIds = existingItems.map((item) => item.id);
    const existingIdSet = new Set(existingItemIds);

    // orderedItemIds must be an exact permutation of existing checklist item IDs:
    // same count, all IDs belong to this checklist, and no duplicates.
    if (orderedItemIds.length !== existingItemIds.length) {
      throw Object.assign(
        new Error('orderedItemIds must include all existing checklist items exactly once'),
        { code: 'VALIDATION_ERROR' },
      );
    }

    const seenIds = new Set<string>();
    for (const id of orderedItemIds) {
      if (!existingIdSet.has(id)) {
        throw Object.assign(
          new Error('orderedItemIds must only contain IDs of existing checklist items'),
          { code: 'VALIDATION_ERROR' },
        );
      }

      if (seenIds.has(id)) {
        throw Object.assign(
          new Error('orderedItemIds must not contain duplicate item IDs'),
          { code: 'VALIDATION_ERROR' },
        );
      }

      seenIds.add(id);
    }

    await this.checklistRepo.reorderItems(checklist.id, orderedItemIds);
  }
}
