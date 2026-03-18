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
        const result = await instance.acquireTokenPopup({ ...silentRequest, account });
        return result.accessToken;
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
