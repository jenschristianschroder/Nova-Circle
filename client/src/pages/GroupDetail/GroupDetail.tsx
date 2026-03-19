/**
 * Group detail page — shows group info, the event list filtered to events
 * the user can access, and navigation to each event.
 *
 * The server enforces the event-access filter; this component simply
 * renders the events it receives without attempting to guess at hidden ones.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useApiClient } from '../../api/client';
import { getGroup, type Group } from '../../api/groups';
import { listGroupEvents, type CalendarEvent } from '../../api/events';
import { Button } from '../../components/Button';
import styles from './GroupDetail.module.css';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const { apiFetch } = useApiClient();
  const navigate = useNavigate();

  const [group, setGroup] = useState<Group | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!groupId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [groupData, eventsData] = await Promise.all([
        getGroup(apiFetch, groupId),
        listGroupEvents(apiFetch, groupId),
      ]);
      setGroup(groupData);
      setEvents(eventsData);
    } catch {
      setError('Failed to load group. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch, groupId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (isLoading) {
    return (
      <main id="main-content" className={styles.page}>
        <p className={styles.statusText} aria-live="polite">
          Loading group…
        </p>
      </main>
    );
  }

  if (error) {
    return (
      <main id="main-content" className={styles.page}>
        <p className={styles.errorText} role="alert">
          {error}
        </p>
        <Button variant="secondary" onClick={() => navigate('/groups')}>
          Back to groups
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
        <span aria-current="page">{group?.name}</span>
      </nav>

      <div className={styles.groupHeader}>
        <div>
          <h1 className={styles.heading}>{group?.name}</h1>
          {group?.description && <p className={styles.description}>{group.description}</p>}
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={() => navigate(`/groups/${groupId}/events/new`)}
        >
          + New Event
        </Button>
      </div>

      <section aria-labelledby="events-heading">
        <h2 id="events-heading" className={styles.subheading}>
          Events
        </h2>

        {events.length === 0 ? (
          <p className={styles.emptyText}>No events yet. Create one to get started.</p>
        ) : (
          <ul className={styles.list} role="list" aria-label="Group events">
            {events.map((event) => (
              <li key={event.id}>
                <button
                  type="button"
                  className={[
                    styles.eventCard,
                    event.status === 'cancelled' ? styles.eventCardCancelled : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => navigate(`/groups/${groupId}/events/${event.id}`)}
                  aria-label={`Open event ${event.title}`}
                >
                  <div className={styles.eventCardContent}>
                    <span className={styles.eventIcon} aria-hidden="true">
                      {event.status === 'cancelled' ? '🚫' : '🗓'}
                    </span>
                    <div className={styles.eventInfo}>
                      <span className={styles.eventTitle}>{event.title}</span>
                      <span className={styles.eventDate}>{formatDate(event.startAt)}</span>
                      {event.status === 'cancelled' && (
                        <span className={styles.cancelledBadge}>Cancelled</span>
                      )}
                    </div>
                  </div>
                  <span className={styles.eventChevron} aria-hidden="true">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
