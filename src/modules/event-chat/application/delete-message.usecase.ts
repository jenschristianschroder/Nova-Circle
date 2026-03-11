import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../../event-management/domain/event-invitation.repository.port.js';
import type { EventChatRepositoryPort } from '../domain/event-chat.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { EventChatMessage } from '../domain/event-chat.js';

export class DeleteMessageUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly invitationRepo: EventInvitationRepositoryPort,
    private readonly chatRepo: EventChatRepositoryPort,
    private readonly memberRepo: GroupMemberRepositoryPort,
  ) {}

  async execute(
    caller: IdentityContext,
    eventId: string,
    messageId: string,
  ): Promise<EventChatMessage> {
    const event = await this.eventRepo.findById(eventId);
    if (!event) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    const hasAccess = await this.invitationRepo.hasAccess(eventId, caller.userId);
    if (!hasAccess) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    const message = await this.chatRepo.findMessage(messageId);
    if (!message) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    if (message.deletedAt !== null) {
      throw Object.assign(new Error('Message is already deleted'), { code: 'CONFLICT' });
    }

    const isAuthor = message.authorUserId === caller.userId;
    const isEventCreator = event.createdBy === caller.userId;

    if (!isAuthor && !isEventCreator) {
      const role = await this.memberRepo.getRole(event.groupId, caller.userId);
      const isAdminOrOwner = role === 'owner' || role === 'admin';
      if (!isAdminOrOwner) {
        throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
      }
    }

    const updated = await this.chatRepo.softDeleteMessage(messageId, caller.userId);
    if (!updated) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }
    return updated;
  }
}
