/**
 * User profile page — view and edit the signed-in user's display name
 * and avatar URL. Includes theme preferences and sign-out.
 *
 * Mobile-first minimalist layout.
 */

import { useState, useEffect, useCallback } from 'react';
import { useApiClient } from '../../api/client';
import { getMyProfile, updateMyProfile, type UserProfile } from '../../api/profile';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../../components/Button';
import { ThemeSwitcher } from '../../components/ThemeSwitcher';
import { Card, Input, Label, Avatar } from '../../components/ui';

export function Profile() {
  const { apiFetch } = useApiClient();
  const { logout } = useAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await getMyProfile(apiFetch);
      setProfile(data);
      setDisplayName(data.displayName);
      setAvatarUrl(data.avatarUrl ?? '');
    } catch {
      setLoadError('Failed to load your profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const updated = await updateMyProfile(apiFetch, {
        displayName: displayName.trim(),
        avatarUrl: avatarUrl.trim() || null,
      });
      setProfile(updated);
      setIsEditing(false);
      setSaveSuccess(true);
    } catch {
      setSaveError('Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <main id="main-content" className="mx-auto max-w-2xl px-nc-md py-nc-2xl">
        <p className="text-nc-sm text-nc-content-secondary" aria-live="polite">
          Loading profile…
        </p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main id="main-content" className="mx-auto max-w-2xl px-nc-md py-nc-2xl">
        <p className="text-nc-sm text-nc-danger-default" role="alert">
          {loadError}
        </p>
      </main>
    );
  }

  return (
    <main
      id="main-content"
      className="mx-auto flex max-w-2xl flex-col gap-nc-lg px-nc-md py-nc-xl md:py-nc-2xl"
    >
      <h1 className="text-nc-2xl font-bold">Profile</h1>

      {/* Profile details */}
      <Card>
        <h2 id="profile-heading" className="mb-nc-md text-nc-lg font-semibold">
          Your details
        </h2>

        {saveSuccess && (
          <p
            className="mb-nc-md rounded-nc-sm bg-nc-success-subtle p-nc-sm text-nc-sm text-nc-success-default"
            role="status"
          >
            Profile updated successfully.
          </p>
        )}

        {!isEditing ? (
          <div className="flex flex-wrap items-center gap-nc-lg">
            <Avatar src={profile?.avatarUrl} fallback="👤" size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-nc-lg font-semibold">{profile?.displayName}</p>
              {profile?.avatarUrl && (
                <p className="mt-nc-xs truncate font-mono text-nc-xs text-nc-content-secondary">
                  {profile.avatarUrl}
                </p>
              )}
            </div>
            <Button variant="secondary" size="md" onClick={() => setIsEditing(true)}>
              Edit
            </Button>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSave(e)} noValidate>
            <div className="mb-nc-md flex flex-col gap-nc-xs">
              <Label htmlFor="display-name">
                Display name <span aria-hidden="true">*</span>
              </Label>
              <Input
                id="display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                aria-required="true"
              />
            </div>

            <div className="mb-nc-md flex flex-col gap-nc-xs">
              <Label htmlFor="avatar-url">Avatar URL</Label>
              <Input
                id="avatar-url"
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/avatar.png"
              />
            </div>

            {saveError && (
              <p className="text-nc-sm text-nc-danger-default" role="alert">
                {saveError}
              </p>
            )}

            <div className="mt-nc-md flex justify-end gap-nc-md">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setIsEditing(false);
                  setSaveError(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSaving || !displayName.trim()}>
                {isSaving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        )}
      </Card>

      {/* Appearance */}
      <Card>
        <h2 className="mb-nc-md text-nc-lg font-semibold">Appearance</h2>
        <ThemeSwitcher />
      </Card>

      {/* Account actions */}
      <Card>
        <h2 id="account-heading" className="mb-nc-md text-nc-lg font-semibold">
          Account
        </h2>
        <Button variant="danger" size="md" onClick={() => void logout()}>
          Sign out
        </Button>
      </Card>
    </main>
  );
}
