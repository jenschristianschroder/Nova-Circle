/**
 * Groups list page — shows all groups the authenticated user belongs to
 * and allows creating a new group.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiClient, ApiError } from '../../api/client';
import { listMyGroups, createGroup, type Group } from '../../api/groups';
import { Button } from '../../components/Button';
import styles from './GroupsList.module.css';

export function GroupsList() {
  const { apiFetch } = useApiClient();
  const navigate = useNavigate();

  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listMyGroups(apiFetch);
      setGroups(data);
    } catch (err: unknown) {
      // Surface specific diagnostics so infrastructure issues are easier to
      // identify.  The generic message is kept as a fallback.
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError('Failed to load groups: authentication error. Please sign in again.');
        } else if (err.status === 403) {
          setError('Failed to load groups: access denied.');
        } else {
          setError(`Failed to load groups (${err.status}). Please try again.`);
        }
      } else {
        setError('Failed to load groups. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  async function handleCreateGroup(event: React.FormEvent) {
    event.preventDefault();
    if (!newGroupName.trim()) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      const group = await createGroup(apiFetch, {
        name: newGroupName.trim(),
        description: newGroupDescription.trim() || undefined,
      });
      setGroups((prev) => [group, ...prev]);
      setNewGroupName('');
      setNewGroupDescription('');
      setShowCreateForm(false);
    } catch {
      setCreateError('Failed to create group. Please try again.');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main id="main-content" className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>My Groups</h1>
        <Button variant="primary" size="md" onClick={() => setShowCreateForm((v) => !v)}>
          {showCreateForm ? 'Cancel' : '+ New Group'}
        </Button>
      </div>

      {showCreateForm && (
        <section className={styles.createForm} aria-labelledby="create-group-heading">
          <h2 id="create-group-heading" className={styles.subheading}>
            Create a new group
          </h2>
          <form onSubmit={(e) => void handleCreateGroup(e)} noValidate>
            <div className={styles.field}>
              <label htmlFor="group-name" className={styles.label}>
                Name <span aria-hidden="true">*</span>
              </label>
              <input
                id="group-name"
                type="text"
                className={styles.input}
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g. Family BBQ crew"
                required
                aria-required="true"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="group-description" className={styles.label}>
                Description
              </label>
              <input
                id="group-description"
                type="text"
                className={styles.input}
                value={newGroupDescription}
                onChange={(e) => setNewGroupDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
            {createError && (
              <p className={styles.errorText} role="alert">
                {createError}
              </p>
            )}
            <div className={styles.formActions}>
              <Button type="submit" variant="primary" disabled={isCreating || !newGroupName.trim()}>
                {isCreating ? 'Creating…' : 'Create group'}
              </Button>
            </div>
          </form>
        </section>
      )}

      {isLoading && (
        <p className={styles.statusText} aria-live="polite">
          Loading groups…
        </p>
      )}

      {error && !isLoading && (
        <p className={styles.errorText} role="alert">
          {error}
        </p>
      )}

      {!isLoading && !error && groups.length === 0 && (
        <p className={styles.emptyText}>
          You are not a member of any groups yet. Create one to get started.
        </p>
      )}

      {!isLoading && groups.length > 0 && (
        <ul className={styles.list} role="list" aria-label="Your groups">
          {groups.map((group) => (
            <li key={group.id}>
              <button
                type="button"
                className={styles.groupCard}
                onClick={() => navigate(`/groups/${group.id}`)}
                aria-label={`Open group ${group.name}`}
              >
                <div className={styles.groupCardContent}>
                  <span className={styles.groupIcon} aria-hidden="true">
                    👥
                  </span>
                  <div className={styles.groupInfo}>
                    <span className={styles.groupName}>{group.name}</span>
                    {group.description && (
                      <span className={styles.groupDescription}>{group.description}</span>
                    )}
                  </div>
                </div>
                <span className={styles.groupChevron} aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
