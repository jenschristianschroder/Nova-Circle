import type { EventChatThread, EventChatMessage } from './event-chat.js';

export interface ListMessagesOptions {
  readonly limit?: number;
  readonly before?: string;
  readonly after?: string;
}

export interface EventChatRepositoryPort {
  findOrCreateThread(eventId: string): Promise<EventChatThread>;
  findThreadByEvent(eventId: string): Promise<EventChatThread | null>;
  listMessages(threadId: string, options?: ListMessagesOptions): Promise<EventChatMessage[]>;
  postMessage(threadId: string, content: string, authorUserId: string): Promise<EventChatMessage>;
  findMessage(messageId: string): Promise<EventChatMessage | null>;
  editMessage(messageId: string, content: string): Promise<EventChatMessage | null>;
  softDeleteMessage(messageId: string, deletedByUserId: string): Promise<EventChatMessage | null>;
}
