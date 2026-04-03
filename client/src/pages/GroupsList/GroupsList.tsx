/**
 * Groups list page — shows all groups the authenticated user belongs to
 * and allows creating a new group.
 *
 * Mobile-first card-based list with Lucide icons.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiClient, ApiError } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import { listMyGroups, createGroup, type Group } from '../../api/groups';
import { Button } from '../../components/Button';
import { Card, Input, Label, EmptyState } from '../../components/ui';
import { Users, ChevronRight, Plus } from 'lucide-react';

export function GroupsList() {
  const { apiFetch } = useApiClient();
  const { login } = useAuth();
  const navigate = useNavigate();

  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setIsAuthError(false);
    try {
      const data = await listMyGroups(apiFetch);
      setGroups(data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError('Failed to load groups: authentication error. Please sign in again.');
          setIsAuthError(true);
        } else if (err.status === 403) {
          setError('Failed to load groups: access denied.');
        } else if (err.code === 'PROXY_NOT_CONFIGURED') {
          setError('Failed to load groups: API proxy not configured. Contact support.');
        } else {
          setError(`Failed to load groups (${err.status}). Please try again.`);
        }
      } else if (err instanceof Error) {
        const msg = err.message || 'Unknown error';
        setError(`Failed to load groups: ${msg}`);
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
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setCreateError('Failed to create group: authentication error. Please sign in again.');
        } else if (err.status === 400) {
          setCreateError(`Failed to create group: ${err.message}`);
        } else {
          setCreateError(`Failed to create group (${err.status}). Please try again.`);
        }
      } else {
        setCreateError('Failed to create group. Please try again.');
      }
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main
      id="main-content"
      className="mx-auto flex max-w-2xl flex-col gap-nc-lg px-nc-md py-nc-xl md:py-nc-2xl"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-nc-md">
        <h1 className="text-nc-2xl font-bold">My Groups</h1>
        <Button
          variant="primary"
          size="md"
          {...(!showCreateForm && { 'aria-label': '+ New Group' })}
          onClick={() => setShowCreateForm((v) => !v)}
        >
          {showCreateForm ? (
            'Cancel'
          ) : (
            <>
              <Plus size={18} aria-hidden="true" />
              New Group
            </>
          )}
        </Button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <Card>
          <h2 id="create-group-heading" className="mb-nc-md text-nc-lg font-semibold">
            Create a new group
          </h2>
          <form onSubmit={(e) => void handleCreateGroup(e)} noValidate>
            <div className="mb-nc-md flex flex-col gap-nc-xs">
              <Label htmlFor="group-name">
                Name <span aria-hidden="true">*</span>
              </Label>
              <Input
                id="group-name"
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g. Family BBQ crew"
                required
                aria-required="true"
              />
            </div>
            <div className="mb-nc-md flex flex-col gap-nc-xs">
              <Label htmlFor="group-description">Description</Label>
              <Input
                id="group-description"
                type="text"
                value={newGroupDescription}
                onChange={(e) => setNewGroupDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
            {createError && (
              <p className="text-nc-sm text-nc-danger-default" role="alert">
                {createError}
              </p>
            )}
            <div className="mt-nc-md flex justify-end">
              <Button type="submit" variant="primary" disabled={isCreating || !newGroupName.trim()}>
                {isCreating ? 'Creating…' : 'Create group'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Loading */}
      {isLoading && (
        <p className="text-nc-sm text-nc-content-secondary" aria-live="polite">
          Loading groups…
        </p>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div>
          <p className="text-nc-sm text-nc-danger-default" role="alert">
            {error}
          </p>
          {isAuthError && (
            <div className="mt-nc-md flex justify-end">
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  login().catch((e) => {
                    console.warn('[Auth] Login redirect failed:', e);
                  });
                }}
              >
                Sign in again
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && groups.length === 0 && (
        <EmptyState
          icon={<Users size={40} />}
          title="No groups yet"
          description="You are not a member of any groups yet. Create one to get started."
        />
      )}

      {/* Group list */}
      {!isLoading && groups.length > 0 && (
        <ul className="flex flex-col gap-nc-sm" role="list" aria-label="Your groups">
          {groups.map((group) => (
            <li key={group.id}>
              <button
                type="button"
                className="flex w-full items-center gap-nc-md rounded-nc-md border border-nc-border-default bg-nc-surface-card p-nc-md text-left text-nc-content-primary transition-all duration-150 hover:border-nc-accent-default hover:shadow-nc-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nc-border-focus md:p-nc-lg"
                onClick={() => navigate(`/groups/${group.id}`)}
                aria-label={`Open group ${group.name}`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-nc-full bg-nc-accent-subtle">
                  <Users size={20} className="text-nc-accent-default" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{group.name}</span>
                  {group.description && (
                    <span className="block truncate text-nc-sm text-nc-content-secondary">
                      {group.description}
                    </span>
                  )}
                </div>
                <ChevronRight
                  size={20}
                  className="shrink-0 text-nc-content-secondary"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
