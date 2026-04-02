/**
 * Sign-up page — shown to authenticated users who have not yet registered.
 *
 * Clean single-column form, mobile-first with large touch-friendly inputs.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiClient, ApiError } from '../../api/client';
import { signUp } from '../../api/profile';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../../components/Button';
import { Card, Input, Label } from '../../components/ui';

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
    <div className="flex min-h-dvh flex-col bg-nc-surface-background text-nc-content-primary">
      {/* Header */}
      <header role="banner" className="border-b border-nc-border-default bg-nc-surface-card">
        <div className="mx-auto flex max-w-5xl items-center px-nc-md py-nc-sm md:px-nc-lg">
          <div className="flex items-center gap-nc-sm">
            <span className="text-2xl text-nc-accent-default" aria-hidden="true">
              ◎
            </span>
            <span className="text-nc-lg font-semibold tracking-tight">Nova-Circle</span>
          </div>
        </div>
      </header>

      {/* Main */}
      <main id="main-content" className="mx-auto w-full max-w-md flex-1 px-nc-md py-nc-2xl">
        <Card>
          <h1 className="text-nc-2xl font-bold">Complete your profile</h1>
          <p className="mt-nc-xs text-nc-content-secondary">
            Choose a display name to get started with Nova-Circle.
          </p>

          <form onSubmit={(e) => void handleSubmit(e)} noValidate className="mt-nc-lg">
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
                autoFocus
                placeholder="Your name"
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

            {error && (
              <p className="text-nc-sm text-nc-danger-default" role="alert">
                {error}
              </p>
            )}

            <div className="mt-nc-lg flex justify-end gap-nc-md">
              <Button type="button" variant="secondary" onClick={() => void logout()}>
                Sign out
              </Button>
              <Button type="submit" variant="primary" disabled={isSaving || !displayName.trim()}>
                {isSaving ? 'Creating…' : 'Create account'}
              </Button>
            </div>
          </form>
        </Card>
      </main>
    </div>
  );
}
