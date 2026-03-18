/**
 * Event-related API calls.
 *
 * All functions receive an `apiFetch` from useApiClient() so they can be
 * easily tested with a mock.
 */

export type EventStatus = 'scheduled' | 'cancelled';
export type InvitationState = 'invited' | 'accepted' | 'declined' | 'tentative' | 'removed';

export interface CalendarEvent {
  id: string;
  groupId: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string | null;
  status: EventStatus;
  createdByUserId: string;
  createdAt: string;
}

export interface EventInvitation {
  eventId: string;
  userId: string;
  displayName: string;
  state: InvitationState;
}

type ApiFetch = <T>(path: string, init?: RequestInit) => Promise<T>;

export async function listGroupEvents(
  apiFetch: ApiFetch,
  groupId: string,
): Promise<CalendarEvent[]> {
  return apiFetch<CalendarEvent[]>(`/api/v1/groups/${groupId}/events`);
}

export async function getEvent(apiFetch: ApiFetch, eventId: string): Promise<CalendarEvent> {
  return apiFetch<CalendarEvent>(`/api/v1/events/${eventId}`);
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

export async function rsvpEvent(
  apiFetch: ApiFetch,
  eventId: string,
  state: Extract<InvitationState, 'accepted' | 'declined' | 'tentative'>,
): Promise<EventInvitation> {
  return apiFetch<EventInvitation>(`/api/v1/events/${eventId}/invitations/me`, {
    method: 'PUT',
    body: JSON.stringify({ state }),
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

export async function captureEventFromText(
  apiFetch: ApiFetch,
  data: { groupId: string; text: string },
): Promise<CaptureResult> {
  const raw = await apiFetch<{ eventId?: string; draftId?: string; issues?: string[] }>(
    '/api/v1/capture',
    {
      method: 'POST',
      body: JSON.stringify({ type: 'text', groupId: data.groupId, text: data.text }),
    },
  );
  if (raw.eventId) {
    return { success: true, eventId: raw.eventId };
  }
  return { success: false, draftId: raw.draftId, issues: raw.issues ?? [] };
}
