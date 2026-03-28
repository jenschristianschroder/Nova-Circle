/**
 * Shared test helpers for mocking MSAL authentication and the API client.
 *
 * Usage:
 *   vi.mock('../../auth/useAuth', () => ({ useAuth: mockUseAuth() }));
 *   vi.mock('../../api/client', () => ({ useApiClient: mockUseApiClient(apiFetch) }));
 */

import { vi } from 'vitest';

/** Creates a mock implementation of useAuth with the given overrides. */
export function mockUseAuth(overrides?: {
  isAuthenticated?: boolean;
  isLoading?: boolean;
  displayName?: string;
}) {
  const defaults = {
    isAuthenticated: overrides?.isAuthenticated ?? true,
    isLoading: overrides?.isLoading ?? false,
    account: { name: overrides?.displayName ?? 'Test User' },
    getAccessToken: vi.fn().mockResolvedValue('mock-token'),
    login: vi.fn().mockResolvedValue(undefined),
    signUp: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
  };
  return () => defaults;
}

/** Creates a mock apiFetch function that returns the provided data. */
export function mockApiFetch<T>(data: T) {
  return vi.fn().mockResolvedValue(data);
}

/** Creates a mock useApiClient hook wrapping the provided apiFetch. */
export function mockUseApiClient(apiFetch: ReturnType<typeof vi.fn>) {
  return () => ({ apiFetch });
}
