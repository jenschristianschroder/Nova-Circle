import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../../event-management/domain/event-invitation.repository.port.js';
import type { EventChecklistRepositoryPort } from '../domain/event-checklist.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';

export class DeleteChecklistItemUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly invitationRepo: EventInvitationRepositoryPort,
    private readonly checklistRepo: EventChecklistRepositoryPort,
    private readonly memberRepo: GroupMemberRepositoryPort,
  ) {}

  async execute(caller: IdentityContext, eventId: string, itemId: string): Promise<void> {
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

    const isItemCreator = item.createdByUserId === caller.userId;
    const isEventCreator = event.createdBy === caller.userId;

    if (!isItemCreator && !isEventCreator) {
      if (!event.groupId) {
        throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
      }
      const role = await this.memberRepo.getRole(event.groupId, caller.userId);
      const isAdminOrOwner = role === 'owner' || role === 'admin';
      if (!isAdminOrOwner) {
        throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
      }
    }

    await this.checklistRepo.deleteItem(itemId);
  }
}
