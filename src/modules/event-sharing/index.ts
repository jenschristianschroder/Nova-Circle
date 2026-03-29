/**
 * EventSharing module – public API surface.
 *
 * Re-export only what other modules and the presentation layer are allowed to use.
 * Internal domain, application, and infrastructure details must not be exported here.
 */

export type { EventShare, VisibilityLevel, ShareEventData } from './domain/event-share.js';
export type { EventShareRepositoryPort } from './domain/event-share.repository.port.js';
