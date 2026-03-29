/**
 * ShareDialog — allows an event owner to share their event to groups.
 *
 * Shows a list of groups the user belongs to, with a visibility level
 * selector for each. Already-shared groups show their current level
 * with options to change or revoke.
 */

import { useState, useEffect, useCallback } from 'react';
import { useApiClient } from '../../api/client';
import {
  listEventShares,
  shareEventToGroup,
  updateEventShare,
  revokeEventShare,
  type EventShareDto,
  type VisibilityLevel,
} from '../../api/events';
import { listMyGroups, type Group } from '../../api/groups';
import { Button } from '../Button';
import styles from './ShareDialog.module.css';

interface ShareDialogProps {
  eventId: string;
  isOpen: boolean;
  onClose: () => void;
}

const VISIBILITY_OPTIONS: { value: VisibilityLevel; label: string; description: string }[] = [
  { value: 'busy', label: 'Busy', description: 'Only show that you are busy' },
  { value: 'title', label: 'Title', description: 'Show title and times' },
  { value: 'details', label: 'Full details', description: 'Show full event information' },
];

export function ShareDialog({ eventId, isOpen, onClose }: ShareDialogProps) {
  const { apiFetch } = useApiClient();
  const [groups, setGroups] = useState<Group[]>([]);
  const [shares, setShares] = useState<EventShareDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [groupData, shareData] = await Promise.all([
        listMyGroups(apiFetch),
        listEventShares(apiFetch, eventId),
      ]);
      setGroups(groupData);
      setShares(shareData);
    } catch {
      setError('Failed to load sharing data.');
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch, eventId]);

  useEffect(() => {
    if (isOpen) {
      void loadData();
    }
  }, [isOpen, loadData]);

  function getShareForGroup(groupId: string): EventShareDto | undefined {
    return shares.find((s) => s.groupId === groupId);
  }

  async function handleShare(groupId: string, visibilityLevel: VisibilityLevel) {
    setPendingGroupId(groupId);
    setError(null);
    try {
      const share = await shareEventToGroup(apiFetch, eventId, { groupId, visibilityLevel });
      setShares((prev) => [...prev, share]);
    } catch {
      setError('Failed to share event.');
    } finally {
      setPendingGroupId(null);
    }
  }

  async function handleUpdateVisibility(
    shareId: string,
    groupId: string,
    visibilityLevel: VisibilityLevel,
  ) {
    setPendingGroupId(groupId);
    setError(null);
    try {
      const updated = await updateEventShare(apiFetch, eventId, shareId, { visibilityLevel });
      setShares((prev) => prev.map((s) => (s.id === shareId ? updated : s)));
    } catch {
      setError('Failed to update visibility.');
    } finally {
      setPendingGroupId(null);
    }
  }

  async function handleRevoke(shareId: string) {
    setError(null);
    try {
      await revokeEventShare(apiFetch, eventId, shareId);
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch {
      setError('Failed to revoke share.');
    }
  }

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-label="Share event" aria-modal="true">
      <div className={styles.dialog}>
        <div className={styles.header}>
          <h2 className={styles.title}>Share event</h2>
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close share dialog"
          >
            ✕
          </button>
        </div>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        {isLoading ? (
          <p className={styles.loading}>Loading groups…</p>
        ) : groups.length === 0 ? (
          <p className={styles.empty}>You are not a member of any groups.</p>
        ) : (
          <ul className={styles.groupList} role="list">
            {groups.map((group) => {
              const existingShare = getShareForGroup(group.id);
              const isPending = pendingGroupId === group.id;

              return (
                <li key={group.id} className={styles.groupItem}>
                  <div className={styles.groupInfo}>
                    <span className={styles.groupName}>{group.name}</span>
                    {existingShare && (
                      <span className={styles.sharedBadge}>
                        Shared ({existingShare.visibilityLevel})
                      </span>
                    )}
                  </div>
                  <div className={styles.actions}>
                    {existingShare ? (
                      <>
                        <select
                          className={styles.visibilitySelect}
                          value={existingShare.visibilityLevel}
                          disabled={isPending}
                          onChange={(e) =>
                            void handleUpdateVisibility(
                              existingShare.id,
                              group.id,
                              e.target.value as VisibilityLevel,
                            )
                          }
                          aria-label={`Visibility level for ${group.name}`}
                        >
                          {VISIBILITY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={isPending}
                          onClick={() => void handleRevoke(existingShare.id)}
                        >
                          Revoke
                        </Button>
                      </>
                    ) : (
                      <>
                        <select
                          className={styles.visibilitySelect}
                          defaultValue="title"
                          disabled={isPending}
                          aria-label={`Visibility level for ${group.name}`}
                          data-group-id={group.id}
                        >
                          {VISIBILITY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={isPending}
                          onClick={() => {
                            const select = document.querySelector(
                              `select[data-group-id="${group.id}"]`,
                            ) as HTMLSelectElement | null;
                            const level = (select?.value ?? 'title') as VisibilityLevel;
                            void handleShare(group.id, level);
                          }}
                        >
                          Share
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className={styles.footer}>
          <Button variant="secondary" size="md" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
