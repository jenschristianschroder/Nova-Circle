import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../../event-management/domain/event-invitation.repository.port.js';
import type { EventChatRepositoryPort } from '../domain/event-chat.repository.port.js';
import type { EventChatMessage } from '../domain/event-chat.js';

const MAX_CONTENT_LENGTH = 4000;

export class EditMessageUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly invitationRepo: EventInvitationRepositoryPort,
    private readonly chatRepo: EventChatRepositoryPort,
  ) {}

  async execute(
    caller: IdentityContext,
    eventId: string,
    messageId: string,
    content: string,
  ): Promise<EventChatMessage> {
    const event = await this.eventRepo.findById(eventId);
    if (!event) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    const hasAccess = await this.invitationRepo.hasAccess(eventId, caller.userId);
    if (!hasAccess) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    // Resolve the chat thread for this event to enforce event-scoped message edits.
    // Do not create a thread as part of an edit.
    const thread = await this.chatRepo.findThreadByEvent(eventId);
    if (!thread) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    const message = await this.chatRepo.findMessage(messageId);
    if (!message) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    // Ensure the message actually belongs to the authorized event's thread.
    if (message.threadId !== thread.id) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    if (message.deletedAt !== null) {
      throw Object.assign(new Error('Message has been deleted'), { code: 'CONFLICT' });
    }

    if (message.authorUserId !== caller.userId) {
      throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    }

    if (!content || content.trim().length === 0) {
      throw Object.assign(new Error('content must not be empty'), { code: 'VALIDATION_ERROR' });
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      throw Object.assign(
        new Error(`content must not exceed ${MAX_CONTENT_LENGTH} characters`),
        { code: 'VALIDATION_ERROR' },
      );
    }

    const updated = await this.chatRepo.editMessage(messageId, content);
    if (!updated) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }
    return updated;
  }
}
