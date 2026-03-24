/**
 * Authenticated API client hook.
 *
 * Returns an `apiFetch` function that mirrors the browser `fetch` API but
 * automatically:
 *  - prepends the Bearer token from MSAL to every request
 *  - sets Content-Type: application/json on requests with a body
 *  - throws an ApiError with a machine-readable `code` on non-2xx responses
 *
 * Usage:
 *   const { apiFetch } = useApiClient();
 *   const groups = await apiFetch<Group[]>('/api/v1/groups');
 */

import { useCallback } from 'react';
import { useAuth } from '../auth/useAuth';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody {
  error?: string;
  code?: string;
}

export function useApiClient() {
  const { getAccessToken } = useAuth();

  const apiFetch = useCallback(
    async <T>(path: string, init?: RequestInit): Promise<T> => {
      const token = await getAccessToken();

      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${token}`);
      if (init?.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      const response = await fetch(path, { ...init, headers });

      if (!response.ok) {
        let code = 'UNKNOWN_ERROR';
        let message = response.statusText;
        try {
          const body = (await response.json()) as ErrorBody;
          if (body.code) code = body.code;
          if (body.error) message = body.error;
        } catch {
          // Non-JSON error body — keep defaults.
        }
        throw new ApiError(response.status, code, message);
      }

      if (response.status === 204) return undefined as T;

      // Guard against the nginx SPA fallback returning index.html when the
      // /api reverse-proxy is not configured (API_BASE_URL missing).  The
      // response is 200 but the body is HTML, not JSON.
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('text/html')) {
        throw new ApiError(
          502,
          'PROXY_NOT_CONFIGURED',
          'The API proxy is not configured — the server returned HTML instead of JSON. Check API_BASE_URL.',
        );
      }

      return (await response.json()) as T;
    },
    [getAccessToken],
  );

  return { apiFetch };
}
