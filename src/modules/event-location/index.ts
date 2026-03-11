/**
 * EventLocation module – public API surface.
 *
 * Re-export only what other modules and the presentation layer are allowed to use.
 * Internal domain, application, and infrastructure details must not be exported here.
 */

export type { EventLocation, SetLocationData, LocationType } from './domain/event-location.js';
export type { EventLocationRepositoryPort } from './domain/event-location.repository.port.js';
