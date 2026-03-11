import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../../event-management/domain/event-invitation.repository.port.js';
import type { EventChatRepositoryPort } from '../domain/event-chat.repository.port.js';
import type { EventChatMessage } from '../domain/event-chat.js';

const MAX_CONTENT_LENGTH = 4000;

export class PostMessageUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly invitationRepo: EventInvitationRepositoryPort,
    private readonly chatRepo: EventChatRepositoryPort,
  ) {}

  async execute(
    caller: IdentityContext,
    eventId: string,
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

    if (!content || content.trim().length === 0) {
      throw Object.assign(new Error('content must not be empty'), { code: 'VALIDATION_ERROR' });
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      throw Object.assign(new Error(`content must not exceed ${MAX_CONTENT_LENGTH} characters`), {
        code: 'VALIDATION_ERROR',
      });
    }

    const thread = await this.chatRepo.findOrCreateThread(eventId);
    return this.chatRepo.postMessage(thread.id, content, caller.userId);
  }
}
