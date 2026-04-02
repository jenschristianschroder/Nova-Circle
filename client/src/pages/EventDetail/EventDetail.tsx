/**
 * Event detail page — shows event information, RSVP controls, and the list
 * of invitees. Mobile-first with hero section and card-based sections.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useApiClient } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import {
  getEvent,
  rsvpEvent,
  listEventInvitations,
  listEventShares,
  type CalendarEvent,
  type EventInvitation,
  type InvitationStatus,
  type EventShareDto,
} from '../../api/events';
import { Button } from '../../components/Button';
import { ShareDialog } from '../../components/ShareDialog';
import { Card, Badge } from '../../components/ui';
import { CalendarDays, Flag, FileText, Share2, UserCircle } from 'lucide-react';

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

const RSVP_LABELS: Record<string, string> = {
  accepted: 'Going',
  tentative: 'Maybe',
  declined: 'Not going',
  invited: 'Awaiting response',
  removed: 'Removed',
};

const RSVP_BADGE_VARIANT: Record<string, 'success' | 'danger' | 'accent' | 'default'> = {
  accepted: 'success',
  declined: 'danger',
  tentative: 'accent',
};

export function EventDetail() {
  const { groupId, eventId } = useParams<{ groupId: string; eventId: string }>();
  const { apiFetch } = useApiClient();
  const { account } = useAuth();
  const navigate = useNavigate();

  const callerUserId = account?.localAccountId;

  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [invitations, setInvitations] = useState<EventInvitation[]>([]);
  const [myInvitation, setMyInvitation] = useState<EventInvitation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRsvping, setIsRsvping] = useState(false);
  const [rsvpError, setRsvpError] = useState<string | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [shareCount, setShareCount] = useState(0);

  const loadData = useCallback(async () => {
    if (!groupId || !eventId) return;
    setIsLoading(true);
    setError(null);
    setInvitations([]);
    setMyInvitation(null);
    try {
      const eventData = await getEvent(apiFetch, groupId, eventId);
      setEvent(eventData);
      try {
        const invitationData = await listEventInvitations(apiFetch, groupId, eventId);
        setInvitations(invitationData);
        const mine = callerUserId
          ? (invitationData.find((i) => i.userId === callerUserId) ?? null)
          : null;
        setMyInvitation(mine);
      } catch {
        // Invitation list is supplemental
      }
      if (eventData.groupId === null && callerUserId === eventData.ownerId) {
        try {
          const shares = await listEventShares(apiFetch, eventData.id);
          setShareCount(shares.length);
        } catch {
          // Share count is supplemental
        }
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
      <main id="main-content" className="mx-auto max-w-2xl px-nc-md py-nc-2xl">
        <p className="text-nc-sm text-nc-content-secondary" aria-live="polite">
          Loading event…
        </p>
      </main>
    );
  }

  if (error || !event) {
    return (
      <main
        id="main-content"
        className="mx-auto flex max-w-2xl flex-col gap-nc-lg px-nc-md py-nc-2xl"
      >
        <p className="text-nc-sm text-nc-danger-default" role="alert">
          {error ?? 'Event not found.'}
        </p>
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Go back
        </Button>
      </main>
    );
  }

  return (
    <main
      id="main-content"
      className="mx-auto flex max-w-2xl flex-col gap-nc-lg px-nc-md py-nc-xl md:py-nc-2xl"
    >
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-nc-xs text-nc-sm text-nc-content-secondary"
      >
        <Link to="/groups" className="text-nc-accent-default no-underline hover:underline">
          Groups
        </Link>
        <span aria-hidden="true">›</span>
        <Link
          to={`/groups/${event.groupId}`}
          className="text-nc-accent-default no-underline hover:underline"
        >
          Group
        </Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">{event.title}</span>
      </nav>

      {/* Event header */}
      <div className="flex items-start gap-nc-md">
        <div className="flex-1">
          <h1 className="text-nc-2xl font-bold">{event.title}</h1>
          {event.status === 'cancelled' && (
            <Badge variant="danger" className="mt-nc-xs">
              Cancelled
            </Badge>
          )}
        </div>
        {event.groupId === null && callerUserId === event.ownerId && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsShareDialogOpen(true)}
            aria-label="Share event to groups"
          >
            <Share2 size={16} aria-hidden="true" />
            Share{shareCount > 0 ? ` (${shareCount})` : ''}
          </Button>
        )}
      </div>

      {/* Event meta */}
      <Card>
        <div className="flex flex-col gap-nc-md">
          <div className="flex items-start gap-nc-md">
            <CalendarDays
              size={20}
              className="mt-0.5 shrink-0 text-nc-accent-default"
              aria-hidden="true"
            />
            <div>
              <strong className="block text-nc-sm font-medium text-nc-content-secondary">
                Starts
              </strong>
              <p className="mt-nc-xs">{formatDate(event.startAt)}</p>
            </div>
          </div>
          {event.endAt && (
            <div className="flex items-start gap-nc-md">
              <Flag
                size={20}
                className="mt-0.5 shrink-0 text-nc-accent-default"
                aria-hidden="true"
              />
              <div>
                <strong className="block text-nc-sm font-medium text-nc-content-secondary">
                  Ends
                </strong>
                <p className="mt-nc-xs">{formatDate(event.endAt)}</p>
              </div>
            </div>
          )}
          {event.description && (
            <div className="flex items-start gap-nc-md">
              <FileText
                size={20}
                className="mt-0.5 shrink-0 text-nc-accent-default"
                aria-hidden="true"
              />
              <div>
                <strong className="block text-nc-sm font-medium text-nc-content-secondary">
                  Description
                </strong>
                <p className="mt-nc-xs">{event.description}</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* RSVP */}
      {event.status !== 'cancelled' && (
        <Card>
          <h2 id="rsvp-heading" className="mb-nc-md text-nc-lg font-semibold">
            Your RSVP
          </h2>
          {myInvitation && (
            <p className="mb-nc-md text-nc-sm text-nc-content-secondary">
              Current status:{' '}
              <strong>{RSVP_LABELS[myInvitation.status] ?? myInvitation.status}</strong>
            </p>
          )}
          {rsvpError && (
            <p className="mb-nc-md text-nc-sm text-nc-danger-default" role="alert">
              {rsvpError}
            </p>
          )}
          <div className="flex flex-wrap gap-nc-sm">
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
        </Card>
      )}

      {/* Attendees */}
      {invitations.length > 0 && (
        <Card>
          <h2 id="attendees-heading" className="mb-nc-md text-nc-lg font-semibold">
            Attendees ({invitations.filter((i) => i.status !== 'removed').length})
          </h2>
          <ul className="flex flex-col gap-nc-sm" role="list">
            {invitations
              .filter((i) => i.status !== 'removed')
              .map((inv) => (
                <li
                  key={inv.userId}
                  className="flex items-center gap-nc-md border-b border-nc-border-default py-nc-sm last:border-b-0"
                >
                  <UserCircle
                    size={24}
                    className="shrink-0 text-nc-content-secondary"
                    aria-hidden="true"
                  />
                  <span className="flex-1 font-medium" title={inv.userId}>
                    Member ({inv.userId.slice(0, 8)}…)
                  </span>
                  <Badge variant={RSVP_BADGE_VARIANT[inv.status] ?? 'default'}>
                    {RSVP_LABELS[inv.status] ?? inv.status}
                  </Badge>
                </li>
              ))}
          </ul>
        </Card>
      )}

      <ShareDialog
        eventId={event.id}
        isOpen={isShareDialogOpen}
        onClose={() => {
          setIsShareDialogOpen(false);
          void listEventShares(apiFetch, event.id)
            .then((shares: EventShareDto[]) => setShareCount(shares.length))
            .catch(() => {});
        }}
      />
    </main>
  );
}
