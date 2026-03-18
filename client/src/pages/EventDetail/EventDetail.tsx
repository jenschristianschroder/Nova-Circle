/**
 * Event detail page — shows event information, RSVP controls, and the list
 * of invitees. Provides navigation to event-scoped collaboration features
 * (chat, checklist, location) once they are implemented.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useApiClient } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import {
  getEvent,
  rsvpEvent,
  listEventInvitations,
  type CalendarEvent,
  type EventInvitation,
  type InvitationStatus,
} from '../../api/events';
import { Button } from '../../components/Button';
import styles from './EventDetail.module.css';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Maps known invitation statuses to their attendee badge CSS class name. */
const INVITATION_STATUS_CLASS: Partial<Record<InvitationStatus, string>> = {
  accepted: styles['attendeeState_accepted'] ?? '',
  declined: styles['attendeeState_declined'] ?? '',
  tentative: styles['attendeeState_tentative'] ?? '',
};

const RSVP_LABELS: Record<string, string> = {
  accepted: 'Going',
  tentative: 'Maybe',
  declined: 'Not going',
  invited: 'Awaiting response',
  removed: 'Removed',
};

export function EventDetail() {
  const { groupId, eventId } = useParams<{ groupId: string; eventId: string }>();
  const { apiFetch } = useApiClient();
  const { account } = useAuth();
  const navigate = useNavigate();

  // Extract the stable primitive so it can be used as a useCallback dependency
  // without triggering re-renders when the account object reference changes.
  const callerUserId = account?.localAccountId;

  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [invitations, setInvitations] = useState<EventInvitation[]>([]);
  const [myInvitation, setMyInvitation] = useState<EventInvitation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRsvping, setIsRsvping] = useState(false);
  const [rsvpError, setRsvpError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!groupId || !eventId) return;
    setIsLoading(true);
    setError(null);
    // Clear stale invitation data so a previously viewed event's attendees
    // are not shown while the new event's invitations load.
    setInvitations([]);
    setMyInvitation(null);
    try {
      const eventData = await getEvent(apiFetch, groupId, eventId);
      setEvent(eventData);
      try {
        const invitationData = await listEventInvitations(apiFetch, groupId, eventId);
        setInvitations(invitationData);
        // Match the caller's invitation by the MSAL account's localAccountId,
        // which corresponds to the Azure AD `oid` claim used as userId in the backend.
        const mine = callerUserId
          ? (invitationData.find((i) => i.userId === callerUserId) ?? null)
          : null;
        setMyInvitation(mine);
      } catch {
        // Invitation list is supplemental — don't fail the whole page.
      }
    } catch {
      setError('Failed to load event. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch, groupId, eventId, callerUserId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleRsvp(
    status: Extract<InvitationStatus, 'accepted' | 'declined' | 'tentative'>,
  ) {
    if (!groupId || !eventId) return;
    setIsRsvping(true);
    setRsvpError(null);
    try {
      const updated = await rsvpEvent(apiFetch, groupId, eventId, status);
      setMyInvitation(updated);
      setInvitations((prev) => prev.map((i) => (i.userId === updated.userId ? updated : i)));
    } catch {
      setRsvpError('Failed to update your RSVP. Please try again.');
    } finally {
      setIsRsvping(false);
    }
  }

  if (isLoading) {
    return (
      <main id="main-content" className={styles.page}>
        <p className={styles.statusText} aria-live="polite">
          Loading event…
        </p>
      </main>
    );
  }

  if (error || !event) {
    return (
      <main id="main-content" className={styles.page}>
        <p className={styles.errorText} role="alert">
          {error ?? 'Event not found.'}
        </p>
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Go back
        </Button>
      </main>
    );
  }

  return (
    <main id="main-content" className={styles.page}>
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
        <Link to="/groups" className={styles.breadcrumbLink}>
          Groups
        </Link>
        <span aria-hidden="true" className={styles.breadcrumbSep}>
          ›
        </span>
        <Link to={`/groups/${event.groupId}`} className={styles.breadcrumbLink}>
          Group
        </Link>
        <span aria-hidden="true" className={styles.breadcrumbSep}>
          ›
        </span>
        <span aria-current="page">{event.title}</span>
      </nav>

      <div className={styles.eventHeader}>
        <div>
          <h1 className={styles.heading}>{event.title}</h1>
          {event.status === 'cancelled' && <span className={styles.cancelledBadge}>Cancelled</span>}
        </div>
      </div>

      <div className={styles.meta}>
        <div className={styles.metaItem}>
          <span className={styles.metaIcon} aria-hidden="true">
            🗓
          </span>
          <div>
            <strong>Starts</strong>
            <p>{formatDate(event.startAt)}</p>
          </div>
        </div>
        {event.endAt && (
          <div className={styles.metaItem}>
            <span className={styles.metaIcon} aria-hidden="true">
              🏁
            </span>
            <div>
              <strong>Ends</strong>
              <p>{formatDate(event.endAt)}</p>
            </div>
          </div>
        )}
        {event.description && (
          <div className={styles.metaItem}>
            <span className={styles.metaIcon} aria-hidden="true">
              📝
            </span>
            <div>
              <strong>Description</strong>
              <p>{event.description}</p>
            </div>
          </div>
        )}
      </div>

      {/* RSVP controls — only show when the event is not cancelled */}
      {event.status !== 'cancelled' && (
        <section aria-labelledby="rsvp-heading" className={styles.rsvpSection}>
          <h2 id="rsvp-heading" className={styles.subheading}>
            Your RSVP
          </h2>
          {myInvitation && (
            <p className={styles.currentRsvp}>
              Current status:{' '}
              <strong>{RSVP_LABELS[myInvitation.status] ?? myInvitation.status}</strong>
            </p>
          )}
          {rsvpError && (
            <p className={styles.errorText} role="alert">
              {rsvpError}
            </p>
          )}
          <div className={styles.rsvpButtons}>
            <Button
              variant="primary"
              size="md"
              disabled={isRsvping || myInvitation?.status === 'accepted'}
              onClick={() => void handleRsvp('accepted')}
            >
              Going
            </Button>
            <Button
              variant="secondary"
              size="md"
              disabled={isRsvping || myInvitation?.status === 'tentative'}
              onClick={() => void handleRsvp('tentative')}
            >
              Maybe
            </Button>
            <Button
              variant="danger"
              size="md"
              disabled={isRsvping || myInvitation?.status === 'declined'}
              onClick={() => void handleRsvp('declined')}
            >
              Not going
            </Button>
          </div>
        </section>
      )}

      {/* Attendee list */}
      {invitations.length > 0 && (
        <section aria-labelledby="attendees-heading" className={styles.attendeesSection}>
          <h2 id="attendees-heading" className={styles.subheading}>
            Attendees ({invitations.filter((i) => i.status !== 'removed').length})
          </h2>
          <ul className={styles.attendeeList} role="list">
            {invitations
              .filter((i) => i.status !== 'removed')
              .map((inv) => (
                <li key={inv.userId} className={styles.attendeeItem}>
                  <span className={styles.attendeeAvatar} aria-hidden="true">
                    👤
                  </span>
                  <span className={styles.attendeeName} title={inv.userId}>
                    Member ({inv.userId.slice(0, 8)}…)
                  </span>
                  <span
                    className={[styles.attendeeState, INVITATION_STATUS_CLASS[inv.status] ?? '']
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {RSVP_LABELS[inv.status] ?? inv.status}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}
    </main>
  );
}
