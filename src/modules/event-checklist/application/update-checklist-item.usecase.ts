import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../../event-management/domain/event-invitation.repository.port.js';
import type { EventChecklistRepositoryPort } from '../domain/event-checklist.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { EventChecklistItem, UpdateChecklistItemData } from '../domain/event-checklist.js';

const MAX_ITEM_TEXT_LENGTH = 500;

export class UpdateChecklistItemUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly invitationRepo: EventInvitationRepositoryPort,
    private readonly checklistRepo: EventChecklistRepositoryPort,
    private readonly memberRepo: GroupMemberRepositoryPort,
  ) {}

  async execute(
    caller: IdentityContext,
    eventId: string,
    itemId: string,
    data: UpdateChecklistItemData,
  ): Promise<EventChecklistItem> {
    const event = await this.eventRepo.findById(eventId);
    if (!event) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    const hasAccess = await this.invitationRepo.hasAccess(eventId, caller.userId);
    if (!hasAccess) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    const item = await this.checklistRepo.findItem(itemId);
    if (!item) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    // Text changes require item creator, event creator, or admin/owner.
    if (data.text !== undefined) {
      if (data.text.trim().length === 0) {
        throw Object.assign(new Error('text must not be empty'), { code: 'VALIDATION_ERROR' });
      }
      if (data.text.length > MAX_ITEM_TEXT_LENGTH) {
        throw Object.assign(
          new Error(`text must not exceed ${MAX_ITEM_TEXT_LENGTH} characters`),
          { code: 'VALIDATION_ERROR' },
        );
      }
      const isItemCreator = item.createdByUserId === caller.userId;
      const isEventCreator = event.createdBy === caller.userId;
      if (!isItemCreator && !isEventCreator) {
        const role = await this.memberRepo.getRole(event.groupId, caller.userId);
        const isAdminOrOwner = role === 'owner' || role === 'admin';
        if (!isAdminOrOwner) {
          throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
        }
      }
    }

    const updated = await this.checklistRepo.updateItem(itemId, data);
    if (!updated) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }
    return updated;
  }
}
