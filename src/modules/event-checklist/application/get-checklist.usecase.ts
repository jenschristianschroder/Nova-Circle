import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../../event-management/domain/event-invitation.repository.port.js';
import type { EventChecklistRepositoryPort } from '../domain/event-checklist.repository.port.js';
import type { EventChecklist, EventChecklistItem } from '../domain/event-checklist.js';

export class GetChecklistUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly invitationRepo: EventInvitationRepositoryPort,
    private readonly checklistRepo: EventChecklistRepositoryPort,
  ) {}

  async execute(
    caller: IdentityContext,
    eventId: string,
  ): Promise<{ checklist: EventChecklist | null; items: EventChecklistItem[] }> {
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
      return { checklist: null, items: [] };
    }

    const items = await this.checklistRepo.listItems(checklist.id);
    return { checklist, items };
  }
}
