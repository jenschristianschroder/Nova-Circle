/**
 * Custom hook that wraps MSAL to expose the current auth state
 * and a helper that returns a ready-to-use Bearer token.
 *
 * Usage:
 *   const { isAuthenticated, account, getAccessToken, login, logout } = useAuth();
 */

import { useCallback } from 'react';
import { useMsal } from '@azure/msal-react';
import { InteractionStatus, InteractionRequiredAuthError } from '@azure/msal-browser';
import { silentRequest } from './msal-config';

export interface AuthState {
  /** Whether the user is fully signed in (account present + no pending interaction). */
  isAuthenticated: boolean;
  /** Whether MSAL is still resolving the initial auth state. */
  isLoading: boolean;
  /** The signed-in account, or null when unauthenticated. */
  account: ReturnType<typeof useMsal>['accounts'][number] | null;
  /** Acquire a Bearer token silently, or trigger an interactive login if needed. */
  getAccessToken: () => Promise<string>;
  /** Redirect to the MSAL login page. */
  login: () => Promise<void>;
  /** Sign the user out and return to the origin. */
  logout: () => Promise<void>;
}

export function useAuth(): AuthState {
  const { instance, accounts, inProgress } = useMsal();

  const isLoading = inProgress !== InteractionStatus.None;
  const account = accounts[0] ?? null;
  const isAuthenticated = Boolean(account) && !isLoading;

  const getAccessToken = useCallback(async (): Promise<string> => {
    if (!account) throw new Error('No signed-in account');
    try {
      const result = await instance.acquireTokenSilent({ ...silentRequest, account });
      return result.accessToken;
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        try {
          const result = await instance.acquireTokenPopup({ ...silentRequest, account });
          return result.accessToken;
        } catch (popupErr) {
          // Popup failed (blocked, interaction_in_progress, etc.).
          // Fall back to redirect as a last resort. Once acquireTokenRedirect
          // is called, the browser will navigate away, so we return a
          // non-resolving promise to avoid surfacing a spurious error
          // to callers while the redirect flow is in progress.
          console.warn('[Auth] Token popup failed, falling back to redirect:', popupErr);
          await instance.acquireTokenRedirect({ ...silentRequest, account });
          return new Promise<string>(() => {
            // Intentionally left empty: execution should not continue
            // in this context because the browser is redirecting.
          });
        }
      }
      throw err;
    }
  }, [instance, account]);

  const login = useCallback(async (): Promise<void> => {
    await instance.loginRedirect({ scopes: silentRequest.scopes ?? [] });
  }, [instance]);

  const logout = useCallback(async (): Promise<void> => {
    await instance.logoutRedirect({ account: account ?? undefined });
  }, [instance, account]);

  return { isAuthenticated, isLoading, account, getAccessToken, login, logout };
}
