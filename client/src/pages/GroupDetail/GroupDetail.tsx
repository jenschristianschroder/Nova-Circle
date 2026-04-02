/**
 * Group detail page — shows group info, the event list filtered to events
 * the user can access, and navigation to each event.
 *
 * Mobile-first minimalist layout with card-based events and breadcrumbs.
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
import { listGroupEvents, type SharedGroupEvent } from '../../api/events';
import { getMyProfile, type UserProfile } from '../../api/profile';
import { Button } from '../../components/Button';
import { Card, Input, Label, Badge, EmptyState } from '../../components/ui';
import { ChevronRight, CalendarPlus, Pencil, Trash2, CalendarDays, Ban, Lock } from 'lucide-react';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const UNTITLED_EVENT_LABEL = 'Untitled';

export function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const { apiFetch } = useApiClient();
  const navigate = useNavigate();

  const [group, setGroup] = useState<Group | null>(null);
  const [events, setEvents] = useState<SharedGroupEvent[]>([]);
  const [myProfile, setMyProfile] = useState<UserProfile | null>(null);
  const [myMembership, setMyMembership] = useState<GroupMember | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!groupId) {
      setIsLoading(false);
      setError('Group not found.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [groupData, eventsResponse, membersData, profileData] = await Promise.all([
        getGroup(apiFetch, groupId),
        listGroupEvents(apiFetch, groupId),
        listGroupMembers(apiFetch, groupId),
        getMyProfile(apiFetch),
      ]);
      setGroup(groupData);
      setEvents(eventsResponse.events);
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
    myProfile !== null && (myMembership?.role === 'owner' || myMembership?.role === 'admin');
  const canDelete = myProfile !== null && group?.ownerId === myProfile.id;

  if (isLoading) {
    return (
      <main id="main-content" className="mx-auto max-w-2xl px-nc-md py-nc-2xl">
        <p className="text-nc-sm text-nc-content-secondary" aria-live="polite">
          Loading group…
        </p>
      </main>
    );
  }

  if (error) {
    return (
      <main id="main-content" className="mx-auto flex max-w-2xl flex-col gap-nc-lg px-nc-md py-nc-2xl">
        <p className="text-nc-sm text-nc-danger-default" role="alert">{error}</p>
        <Button variant="secondary" onClick={() => navigate('/groups')}>Back to groups</Button>
      </main>
    );
  }

  return (
    <main id="main-content" className="mx-auto flex max-w-2xl flex-col gap-nc-lg px-nc-md py-nc-xl md:py-nc-2xl">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-nc-xs text-nc-sm text-nc-content-secondary">
        <Link to="/groups" className="text-nc-accent-default no-underline hover:underline">Groups</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">{group?.name}</span>
      </nav>

      {/* Group header */}
      <div className="flex flex-wrap items-start justify-between gap-nc-md">
        <div>
          <h1 className="text-nc-2xl font-bold">{group?.name}</h1>
          {group?.description && !isEditing && (
            <p className="mt-nc-xs text-nc-content-secondary">{group.description}</p>
          )}
        </div>
        {!isEditing && !isConfirmingDelete && (
          <div className="flex flex-wrap items-center gap-nc-sm">
            <Button
              variant="primary"
              size="md"
              onClick={() => navigate(`/groups/${groupId}/events/new`)}
            >
              <CalendarPlus size={18} aria-hidden="true" />
              New Event
            </Button>
            {canEdit && (
              <Button variant="secondary" size="md" onClick={startEditing} aria-label="Edit group">
                <Pencil size={16} aria-hidden="true" />
                Edit
              </Button>
            )}
            {canDelete && (
              <Button variant="danger" size="md" onClick={startConfirmDelete} aria-label="Delete group">
                <Trash2 size={16} aria-hidden="true" />
                Delete
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Edit form */}
      {isEditing && (
        <Card>
          <h2 id="edit-group-heading" className="mb-nc-md text-nc-lg font-semibold">Edit group</h2>
          <form onSubmit={(e) => void handleSaveEdit(e)} noValidate>
            <div className="mb-nc-md flex flex-col gap-nc-xs">
              <Label htmlFor="edit-group-name">
                Name <span aria-hidden="true">*</span>
              </Label>
              <Input id="edit-group-name" type="text" value={editName} onChange={(e) => setEditName(e.target.value)} required aria-required="true" />
            </div>
            <div className="mb-nc-md flex flex-col gap-nc-xs">
              <Label htmlFor="edit-group-description">Description</Label>
              <Input id="edit-group-description" type="text" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Optional description" />
            </div>
            {saveError && <p className="text-nc-sm text-nc-danger-default" role="alert">{saveError}</p>}
            <div className="mt-nc-md flex justify-end gap-nc-sm">
              <Button type="button" variant="secondary" onClick={cancelEditing} disabled={isSaving}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={isSaving || !editName.trim()}>
                {isSaving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Delete confirmation */}
      {isConfirmingDelete && (
        <Card className="border-nc-danger-default">
          <h2 id="delete-confirm-heading" className="mb-nc-sm text-nc-lg font-semibold">
            Delete &ldquo;{group?.name}&rdquo;?
          </h2>
          <p className="text-nc-sm text-nc-content-secondary">
            This action cannot be undone. All events, memberships, and data for this group will be permanently deleted.
          </p>
          {deleteError && <p className="mt-nc-sm text-nc-sm text-nc-danger-default" role="alert">{deleteError}</p>}
          <div className="mt-nc-md flex justify-end gap-nc-sm">
            <Button type="button" variant="secondary" onClick={cancelDelete} disabled={isDeleting}>Cancel</Button>
            <Button type="button" variant="danger" onClick={() => void handleDelete()} disabled={isDeleting}>
              {isDeleting ? 'Deleting…' : 'Delete group'}
            </Button>
          </div>
        </Card>
      )}

      {/* Events list */}
      <section aria-labelledby="events-heading">
        <h2 id="events-heading" className="mb-nc-md text-nc-lg font-semibold">Events</h2>

        {events.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={40} />}
            title="No events yet"
            description="Create one to get started."
          />
        ) : (
          <ul className="flex flex-col gap-nc-sm" role="list" aria-label="Group events">
            {events.map((event) => {
              const isBusy = event.visibilityLevel === 'busy';
              const isClickable = event.visibilityLevel === 'details';

              return (
                <li key={event.id}>
                  <button
                    type="button"
                    className={[
                      'flex w-full items-center gap-nc-md rounded-nc-md border bg-nc-surface-card p-nc-md text-left transition-all duration-150',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nc-border-focus',
                      event.status === 'cancelled' ? 'opacity-60' : '',
                      isBusy
                        ? 'cursor-default border-dashed border-nc-border-default opacity-80'
                        : 'cursor-pointer border-nc-border-default hover:border-nc-accent-default hover:shadow-nc-sm',
                    ].join(' ')}
                    onClick={isClickable ? () => navigate(`/groups/${groupId}/events/${event.id}`) : undefined}
                    disabled={!isClickable}
                    aria-disabled={!isClickable}
                    aria-label={
                      isBusy
                        ? `${event.ownerDisplayName} is busy`
                        : !isClickable
                          ? `Limited event: ${event.title ?? UNTITLED_EVENT_LABEL}`
                          : `Open event ${event.title ?? UNTITLED_EVENT_LABEL}`
                    }
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-nc-md bg-nc-surface-subtle">
                      {isBusy ? (
                        <Lock size={18} className="text-nc-content-disabled" aria-hidden="true" />
                      ) : event.status === 'cancelled' ? (
                        <Ban size={18} className="text-nc-danger-default" aria-hidden="true" />
                      ) : (
                        <CalendarDays size={18} className="text-nc-accent-default" aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {isBusy ? (
                        <span className="block font-semibold">{event.ownerDisplayName} — Busy</span>
                      ) : (
                        <span className="block truncate font-semibold">
                          {event.title ?? UNTITLED_EVENT_LABEL}
                        </span>
                      )}
                      <span className="block text-nc-sm text-nc-content-secondary">{formatDate(event.startAt)}</span>
                      {!isBusy && event.ownerDisplayName && (
                        <span className="block text-nc-xs text-nc-content-secondary">{event.ownerDisplayName}</span>
                      )}
                      <div className="mt-nc-xs flex gap-nc-xs">
                        {event.status === 'cancelled' && <Badge variant="danger">Cancelled</Badge>}
                        {event.visibilityLevel === 'title' && <Badge>Limited</Badge>}
                      </div>
                    </div>
                    {isClickable && (
                      <ChevronRight size={20} className="shrink-0 text-nc-content-secondary" aria-hidden="true" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
