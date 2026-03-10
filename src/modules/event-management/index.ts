/**
 * EventManagement module – public API surface.
 *
 * Re-export only what other modules and the presentation layer are allowed to use.
 * Internal domain, application, and infrastructure details must not be exported here.
 */

export type { Event, EventStatus, CreateEventData, UpdateEventData } from './domain/event.js';
export type { EventInvitation, InvitationStatus } from './domain/event-invitation.js';
export type { CreateEventCommand } from './application/create-event.usecase.js';
export type { EditEventCommand } from './application/edit-event.usecase.js';
