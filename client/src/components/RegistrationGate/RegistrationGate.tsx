/**
 * RegistrationGate — wraps authenticated routes to enforce registration.
 *
 * Checks whether the authenticated user has completed sign-up by calling
 * GET /api/v1/profile/me.  If the profile is not found (404), the user is
 * redirected to /signup.  While the check is in progress a loading indicator
 * is rendered.
 *
 * This component must be nested inside ProtectedRoute so that only
 * authenticated users reach it.
 */

import { useState, useEffect, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useApiClient, ApiError } from '../../api/client';
import { getMyProfile } from '../../api/profile';
import styles from './RegistrationGate.module.css';

interface RegistrationGateProps {
  children: ReactNode;
}

export function RegistrationGate({ children }: RegistrationGateProps) {
  const { apiFetch } = useApiClient();
  const [status, setStatus] = useState<'loading' | 'registered' | 'unregistered' | 'error'>(
    'loading',
  );

  useEffect(() => {
    let cancelled = false;

    async function checkRegistration() {
      try {
        await getMyProfile(apiFetch);
        if (!cancelled) setStatus('registered');
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setStatus('unregistered');
        } else {
          setStatus('error');
        }
      }
    }

    void checkRegistration();
    return () => {
      cancelled = true;
    };
  }, [apiFetch]);

  if (status === 'loading') {
    return (
      <div className={styles.loadingPage} aria-live="polite" aria-busy="true">
        <span className={styles.loadingText}>Loading…</span>
      </div>
    );
  }

  if (status === 'unregistered') {
    return <Navigate to="/signup" replace />;
  }

  if (status === 'error') {
    return (
      <div className={styles.loadingPage}>
        <p className={styles.errorText} role="alert">
          Something went wrong. Please refresh the page.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
