/**
 * Event-related API calls.
 *
 * All functions receive an `apiFetch` from useApiClient() so they can be
 * easily tested with a mock.
 */

export type EventStatus = 'scheduled' | 'cancelled';
/** Mirrors the backend `InvitationStatus` type. */
export type InvitationStatus = 'invited' | 'accepted' | 'declined' | 'tentative' | 'removed';

export interface CalendarEvent {
  id: string;
  groupId: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string | null;
  status: EventStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Mirrors the backend `EventInvitation` shape.
 * Note: the backend does not include `displayName` — show the userId only.
 */
export interface EventInvitation {
  id: string;
  eventId: string;
  userId: string;
  status: InvitationStatus;
  invitedAt: string;
  respondedAt: string | null;
}

type ApiFetch = <T>(path: string, init?: RequestInit) => Promise<T>;

export async function listGroupEvents(
  apiFetch: ApiFetch,
  groupId: string,
): Promise<CalendarEvent[]> {
  return apiFetch<CalendarEvent[]>(`/api/v1/groups/${groupId}/events`);
}

export async function getEvent(
  apiFetch: ApiFetch,
  groupId: string,
  eventId: string,
): Promise<CalendarEvent> {
  return apiFetch<CalendarEvent>(`/api/v1/groups/${groupId}/events/${eventId}`);
}

export async function createEvent(
  apiFetch: ApiFetch,
  groupId: string,
  data: { title: string; startAt: string; endAt?: string; description?: string },
): Promise<CalendarEvent> {
  return apiFetch<CalendarEvent>(`/api/v1/groups/${groupId}/events`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * RSVP to an event by updating the caller's own invitation status.
 * Calls PUT /api/v1/groups/:groupId/events/:eventId/invitations/me
 */
export async function rsvpEvent(
  apiFetch: ApiFetch,
  groupId: string,
  eventId: string,
  status: Extract<InvitationStatus, 'accepted' | 'declined' | 'tentative'>,
): Promise<EventInvitation> {
  return apiFetch<EventInvitation>(`/api/v1/groups/${groupId}/events/${eventId}/invitations/me`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

export async function listEventInvitations(
  apiFetch: ApiFetch,
  groupId: string,
  eventId: string,
): Promise<EventInvitation[]> {
  return apiFetch<EventInvitation[]>(`/api/v1/groups/${groupId}/events/${eventId}/invitations`);
}

export type CaptureResult =
  | { success: true; eventId: string }
  | { success: false; draftId?: string; issues: string[] };

/**
 * Calls POST /api/v1/capture/text with { text, groupId }.
 * Returns a discriminated union: success with eventId, or failure with issues.
 */
export async function captureEventFromText(
  apiFetch: ApiFetch,
  data: { groupId: string; text: string },
): Promise<CaptureResult> {
  const raw = await apiFetch<
    { type: 'event'; eventId: string } | { type: 'draft'; draft: { id: string }; issues?: string[] }
  >('/api/v1/capture/text', {
    method: 'POST',
    body: JSON.stringify({ text: data.text, groupId: data.groupId }),
  });
  if (raw.type === 'event') {
    return { success: true, eventId: raw.eventId };
  }
  return {
    success: false,
    draftId: raw.draft.id,
    issues: raw.issues ?? [],
  };
}
