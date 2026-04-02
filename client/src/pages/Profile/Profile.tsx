/**
 * User profile page — view and edit the signed-in user's display name,
 * avatar URL, and appearance preferences (theme mode & colour palette).
 */

import { useState, useEffect, useCallback } from 'react';
import { useApiClient } from '../../api/client';
import { getMyProfile, updateMyProfile, type UserProfile } from '../../api/profile';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../../components/Button';
import { ThemeSwitcher } from '../../components/ThemeSwitcher';
import styles from './Profile.module.css';

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
      <main id="main-content" className={styles.page}>
        <p className={styles.statusText} aria-live="polite">
          Loading profile…
        </p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main id="main-content" className={styles.page}>
        <p className={styles.errorText} role="alert">
          {loadError}
        </p>
      </main>
    );
  }

  return (
    <main id="main-content" className={styles.page}>
      <h1 className={styles.heading}>Profile</h1>

      <section className={styles.card} aria-labelledby="profile-heading">
        <h2 id="profile-heading" className={styles.subheading}>
          Your details
        </h2>

        {saveSuccess && (
          <p className={styles.successText} role="status">
            Profile updated successfully.
          </p>
        )}

        {!isEditing ? (
          <div className={styles.profileView}>
            <div className={styles.avatar} aria-hidden="true">
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" className={styles.avatarImage} />
              ) : (
                <span className={styles.avatarPlaceholder}>👤</span>
              )}
            </div>
            <div className={styles.profileInfo}>
              <p className={styles.profileName}>{profile?.displayName}</p>
              {profile?.avatarUrl && <p className={styles.profileAvatarUrl}>{profile.avatarUrl}</p>}
            </div>
            <Button variant="secondary" size="md" onClick={() => setIsEditing(true)}>
              Edit
            </Button>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSave(e)} noValidate>
            <div className={styles.field}>
              <label htmlFor="display-name" className={styles.label}>
                Display name <span aria-hidden="true">*</span>
              </label>
              <input
                id="display-name"
                type="text"
                className={styles.input}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                aria-required="true"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="avatar-url" className={styles.label}>
                Avatar URL
              </label>
              <input
                id="avatar-url"
                type="url"
                className={styles.input}
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/avatar.png"
              />
            </div>

            {saveError && (
              <p className={styles.errorText} role="alert">
                {saveError}
              </p>
            )}

            <div className={styles.formActions}>
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
      </section>

      <section className={styles.card} aria-labelledby="appearance-heading">
        <h2 id="appearance-heading" className={styles.subheading}>
          Appearance
        </h2>
        <ThemeSwitcher />
      </section>

      <section className={styles.card} aria-labelledby="account-heading">
        <h2 id="account-heading" className={styles.subheading}>
          Account
        </h2>
        <Button variant="danger" size="md" onClick={() => void logout()}>
          Sign out
        </Button>
      </section>
    </main>
  );
}
