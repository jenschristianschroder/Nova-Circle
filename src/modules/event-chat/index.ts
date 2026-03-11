/**
 * EventChat module – public API surface.
 *
 * Re-export only what other modules and the presentation layer are allowed to use.
 * Internal domain, application, and infrastructure details must not be exported here.
 */

export type { EventChatThread, EventChatMessage, PostMessageData } from './domain/event-chat.js';
export type {
  EventChatRepositoryPort,
  ListMessagesOptions,
} from './domain/event-chat.repository.port.js';
