/**
 * ProtectedRoute — wraps authenticated routes.
 *
 * While MSAL is resolving the initial auth state, renders a loading indicator.
 * Once resolved, redirects unauthenticated users to /login and renders
 * children for authenticated users.
 */

import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import styles from './ProtectedRoute.module.css';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className={styles.loadingPage} aria-live="polite" aria-busy="true">
        <span className={styles.loadingText}>Loading…</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
