import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../../event-management/domain/event-invitation.repository.port.js';
import type {
  EventChatRepositoryPort,
  ListMessagesOptions,
} from '../domain/event-chat.repository.port.js';
import type { EventChatMessage } from '../domain/event-chat.js';

export class ListMessagesUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly invitationRepo: EventInvitationRepositoryPort,
    private readonly chatRepo: EventChatRepositoryPort,
  ) {}

  async execute(
    caller: IdentityContext,
    eventId: string,
    options?: ListMessagesOptions,
  ): Promise<EventChatMessage[]> {
    const event = await this.eventRepo.findById(eventId);
    if (!event) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    const hasAccess = await this.invitationRepo.hasAccess(eventId, caller.userId);
    if (!hasAccess) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    // Use findThreadByEvent to avoid creating empty threads on read.
    const thread = await this.chatRepo.findThreadByEvent(eventId);
    if (!thread) {
      return [];
    }
    return this.chatRepo.listMessages(thread.id, options);
  }
}
