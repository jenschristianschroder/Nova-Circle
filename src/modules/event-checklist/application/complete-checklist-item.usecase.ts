import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../../event-management/domain/event-invitation.repository.port.js';
import type { EventChecklistRepositoryPort } from '../domain/event-checklist.repository.port.js';
import type { EventChecklistItem } from '../domain/event-checklist.js';

export class CompleteChecklistItemUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly invitationRepo: EventInvitationRepositoryPort,
    private readonly checklistRepo: EventChecklistRepositoryPort,
  ) {}

  async execute(
    caller: IdentityContext,
    eventId: string,
    itemId: string,
    isDone: boolean,
  ): Promise<EventChecklistItem> {
    const event = await this.eventRepo.findById(eventId);
    if (!event) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    const hasAccess = await this.invitationRepo.hasAccess(eventId, caller.userId);
    if (!hasAccess) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    // Scope the item lookup to this event's checklist to prevent cross-event IDOR.
    const checklist = await this.checklistRepo.findChecklistByEvent(eventId);
    if (!checklist) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    const item = await this.checklistRepo.findItem(itemId);
    if (!item || item.checklistId !== checklist.id) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    const updated = isDone
      ? await this.checklistRepo.markDone(itemId, caller.userId)
      : await this.checklistRepo.markUndone(itemId);

    if (!updated) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }
    return updated;
  }
}
