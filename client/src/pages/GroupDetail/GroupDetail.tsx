/**
 * Group detail page — shows group info, the event list filtered to events
 * the user can access, and navigation to each event.
 *
 * Owners and admins can edit the group name/description inline.
 * Only the owner can delete the group.
 *
 * The server enforces the event-access filter; this component simply
 * renders the events it receives without attempting to guess at hidden ones.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useApiClient } from '../../api/client';
import {
  getGroup,
  listGroupMembers,
  updateGroup,
  deleteGroup,
  type Group,
  type GroupMember,
} from '../../api/groups';
import { listGroupEvents, type CalendarEvent } from '../../api/events';
import { getMyProfile, type UserProfile } from '../../api/profile';
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
  const [myProfile, setMyProfile] = useState<UserProfile | null>(null);
  const [myMembership, setMyMembership] = useState<GroupMember | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Delete state
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!groupId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [groupData, eventsData, membersData, profileData] = await Promise.all([
        getGroup(apiFetch, groupId),
        listGroupEvents(apiFetch, groupId),
        listGroupMembers(apiFetch, groupId),
        getMyProfile(apiFetch),
      ]);
      setGroup(groupData);
      setEvents(eventsData);
      setMyProfile(profileData);
      const membership = membersData.find((m) => m.userId === profileData.id) ?? null;
      setMyMembership(membership);
    } catch {
      setError('Failed to load group. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch, groupId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function startEditing() {
    if (!group) return;
    setEditName(group.name);
    setEditDescription(group.description ?? '');
    setSaveError(null);
    setIsEditing(true);
    setIsConfirmingDelete(false);
  }

  function cancelEditing() {
    setIsEditing(false);
    setSaveError(null);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId || !editName.trim()) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const updated = await updateGroup(apiFetch, groupId, {
        name: editName.trim(),
        description: editDescription.trim() || null,
      });
      setGroup(updated);
      setIsEditing(false);
    } catch {
      setSaveError('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  function startConfirmDelete() {
    setIsConfirmingDelete(true);
    setDeleteError(null);
    setIsEditing(false);
  }

  function cancelDelete() {
    setIsConfirmingDelete(false);
    setDeleteError(null);
  }

  async function handleDelete() {
    if (!groupId) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteGroup(apiFetch, groupId);
      navigate('/groups');
    } catch {
      setDeleteError('Failed to delete group. Please try again.');
      setIsDeleting(false);
    }
  }

  const canEdit =
    myProfile !== null &&
    (myMembership?.role === 'owner' ||
      myMembership?.role === 'admin' ||
      group?.ownerId === myProfile.id);

  const canDelete = myProfile !== null && group?.ownerId === myProfile.id;

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

      {isEditing ? (
        <section className={styles.editForm} aria-labelledby="edit-group-heading">
          <h2 id="edit-group-heading" className={styles.subheading}>
            Edit group
          </h2>
          <form onSubmit={(e) => void handleSaveEdit(e)} noValidate>
            <div className={styles.field}>
              <label htmlFor="edit-group-name" className={styles.label}>
                Name <span aria-hidden="true">*</span>
              </label>
              <input
                id="edit-group-name"
                type="text"
                className={styles.input}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                aria-required="true"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="edit-group-description" className={styles.label}>
                Description
              </label>
              <input
                id="edit-group-description"
                type="text"
                className={styles.input}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
            {saveError && (
              <p className={styles.errorText} role="alert">
                {saveError}
              </p>
            )}
            <div className={styles.formActions}>
              <Button type="button" variant="secondary" onClick={cancelEditing} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSaving || !editName.trim()}>
                {isSaving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </form>
        </section>
      ) : isConfirmingDelete ? (
        <section className={styles.deleteConfirm} aria-labelledby="delete-confirm-heading">
          <h2 id="delete-confirm-heading" className={styles.subheading}>
            Delete &ldquo;{group?.name}&rdquo;?
          </h2>
          <p className={styles.deleteWarning}>
            This action cannot be undone. All events, memberships, and data for this group will be
            permanently deleted.
          </p>
          {deleteError && (
            <p className={styles.errorText} role="alert">
              {deleteError}
            </p>
          )}
          <div className={styles.formActions}>
            <Button
              type="button"
              variant="secondary"
              onClick={cancelDelete}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => void handleDelete()}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting…' : 'Delete group'}
            </Button>
          </div>
        </section>
      ) : (
        <div className={styles.groupHeader}>
          <div>
            <h1 className={styles.heading}>{group?.name}</h1>
            {group?.description && <p className={styles.description}>{group.description}</p>}
          </div>
          <div className={styles.groupActions}>
            <Button
              variant="primary"
              size="md"
              onClick={() => navigate(`/groups/${groupId}/events/new`)}
            >
              + New Event
            </Button>
            {canEdit && (
              <Button variant="secondary" size="md" onClick={startEditing} aria-label="Edit group">
                Edit
              </Button>
            )}
            {canDelete && (
              <Button
                variant="danger"
                size="md"
                onClick={startConfirmDelete}
                aria-label="Delete group"
              >
                Delete
              </Button>
            )}
          </div>
        </div>
      )}

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
