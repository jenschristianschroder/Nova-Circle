import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../../event-management/domain/event-invitation.repository.port.js';
import type { EventChecklistRepositoryPort } from '../domain/event-checklist.repository.port.js';
import type { EventChecklistItem } from '../domain/event-checklist.js';

const MAX_ITEM_TEXT_LENGTH = 500;

export class AddChecklistItemUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly invitationRepo: EventInvitationRepositoryPort,
    private readonly checklistRepo: EventChecklistRepositoryPort,
  ) {}

  async execute(
    caller: IdentityContext,
    eventId: string,
    text: string,
    displayOrder?: number,
  ): Promise<EventChecklistItem> {
    const event = await this.eventRepo.findById(eventId);
    if (!event) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    const hasAccess = await this.invitationRepo.hasAccess(eventId, caller.userId);
    if (!hasAccess) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    if (!text || text.trim().length === 0) {
      throw Object.assign(new Error('text must not be empty'), { code: 'VALIDATION_ERROR' });
    }

    if (text.length > MAX_ITEM_TEXT_LENGTH) {
      throw Object.assign(new Error(`text must not exceed ${MAX_ITEM_TEXT_LENGTH} characters`), {
        code: 'VALIDATION_ERROR',
      });
    }

    const checklist = await this.checklistRepo.findOrCreateChecklist(eventId);
    return this.checklistRepo.addItem(
      checklist.id,
      { text: text.trim(), ...(displayOrder !== undefined ? { displayOrder } : {}) },
      caller.userId,
    );
  }
}
