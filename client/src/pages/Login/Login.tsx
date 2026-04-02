/**
 * Login page — shown to unauthenticated users.
 *
 * Modern minimalist mobile-first design.
 * Full-screen centered card with ample whitespace.
 */

import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { CalendarDays, Shield, MessageSquare } from 'lucide-react';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../../components/Button';

export function Login() {
  const { login, signUp, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div
        className="flex min-h-dvh items-center justify-center bg-nc-surface-background"
        aria-live="polite"
        aria-busy="true"
      >
        <span className="text-nc-lg text-nc-content-secondary">Loading…</span>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/groups" replace />;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-nc-surface-background text-nc-content-primary">
      {/* Header */}
      <header role="banner" className="border-b border-nc-border-default bg-nc-surface-card">
        <div className="mx-auto flex max-w-5xl items-center px-nc-md py-nc-sm md:px-nc-lg">
          <div className="flex items-center gap-nc-sm">
            <span className="text-2xl text-nc-accent-default" aria-hidden="true">◎</span>
            <span className="text-nc-lg font-semibold tracking-tight">Nova-Circle</span>
          </div>
        </div>
      </header>

      {/* Main */}
      <main id="main-content" className="flex flex-1 flex-col">
        {/* Hero */}
        <section
          aria-labelledby="hero-heading"
          className="flex flex-1 flex-col items-center justify-center gap-nc-lg px-nc-md py-nc-2xl text-center"
        >
          <h1
            id="hero-heading"
            className="max-w-[28ch] text-[clamp(2rem,5vw,3.5rem)] font-bold leading-[1.15] tracking-tight"
          >
            Your private group calendar
          </h1>
          <p className="max-w-[44ch] text-lg leading-relaxed text-nc-content-secondary">
            Organise events with friends and family. Privacy-first, no tracking.
          </p>
          <div className="flex flex-wrap justify-center gap-nc-md">
            <Button variant="primary" size="lg" onClick={() => void signUp()}>
              Create account
            </Button>
            <Button variant="secondary" size="lg" onClick={() => void login()}>
              Sign in
            </Button>
          </div>
        </section>

        {/* Features */}
        <section
          aria-labelledby="features-heading"
          className="mx-auto w-full max-w-xl px-nc-md pb-nc-3xl"
        >
          <h2 id="features-heading" className="mb-nc-lg text-center text-nc-xl font-semibold">
            What Nova-Circle offers
          </h2>
          <ul role="list" className="flex flex-col gap-nc-md">
            <FeatureItem
              icon={<CalendarDays size={24} className="text-nc-accent-default" />}
              title="Event scheduling"
              description="Create events with a text description, voice note, or photo."
            />
            <FeatureItem
              icon={<Shield size={24} className="text-nc-accent-default" />}
              title="Explicit invitations"
              description="Only people you explicitly invite can see your event details."
            />
            <FeatureItem
              icon={<MessageSquare size={24} className="text-nc-accent-default" />}
              title="Event chat & checklists"
              description="Coordinate directly within each event — no separate apps needed."
            />
          </ul>
        </section>
      </main>

      {/* Footer */}
      <footer role="contentinfo" className="border-t border-nc-border-default bg-nc-surface-card py-nc-lg text-center">
        <p className="text-nc-sm text-nc-content-secondary">
          Nova-Circle — privacy-first. No tracking. No ads.
        </p>
      </footer>
    </div>
  );
}

function FeatureItem({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <li className="flex gap-nc-md rounded-nc-md border border-nc-border-default bg-nc-surface-card p-nc-lg">
      <div className="shrink-0 pt-0.5" aria-hidden="true">
        {icon}
      </div>
      <div>
        <strong className="text-nc-md">{title}</strong>
        <p className="mt-nc-xs text-nc-sm text-nc-content-secondary">{description}</p>
      </div>
    </li>
  );
}
