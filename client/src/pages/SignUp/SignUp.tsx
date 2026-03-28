/**
 * Sign-up page — shown to authenticated users who have not yet registered.
 *
 * Collects the required displayName (and optional avatarUrl), calls
 * POST /api/v1/signup, then redirects to the main application.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiClient, ApiError } from '../../api/client';
import { signUp } from '../../api/profile';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../../components/Button';
import styles from './SignUp.module.css';

export function SignUp() {
  const { apiFetch } = useApiClient();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) return;

    setIsSaving(true);
    setError(null);
    try {
      await signUp(apiFetch, {
        displayName: displayName.trim(),
        avatarUrl: avatarUrl.trim() || null,
      });
      navigate('/groups', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ALREADY_REGISTERED') {
        navigate('/groups', { replace: true });
        return;
      }
      setError('Failed to create your account. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header} role="banner">
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <span className={styles.brandIcon} aria-hidden="true">
              ◎
            </span>
            <span className={styles.brandName}>Nova-Circle</span>
          </div>
        </div>
      </header>

      <main id="main-content" className={styles.main}>
        <section className={styles.card} aria-labelledby="signup-heading">
          <h1 id="signup-heading" className={styles.heading}>
            Complete your profile
          </h1>
          <p className={styles.subtitle}>Choose a display name to get started with Nova-Circle.</p>

          <form onSubmit={(e) => void handleSubmit(e)} noValidate>
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
                autoFocus
                placeholder="Your name"
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

            {error && (
              <p className={styles.errorText} role="alert">
                {error}
              </p>
            )}

            <div className={styles.formActions}>
              <Button type="button" variant="secondary" onClick={() => void logout()}>
                Sign out
              </Button>
              <Button type="submit" variant="primary" disabled={isSaving || !displayName.trim()}>
                {isSaving ? 'Creating…' : 'Create account'}
              </Button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
