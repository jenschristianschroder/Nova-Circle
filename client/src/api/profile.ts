/**
 * User-profile-related API calls.
 *
 * All functions receive an `apiFetch` from useApiClient() so they can be
 * easily tested with a mock.
 */

export interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

type ApiFetch = <T>(path: string, init?: RequestInit) => Promise<T>;

export async function getMyProfile(apiFetch: ApiFetch): Promise<UserProfile> {
  return apiFetch<UserProfile>('/api/v1/profile/me');
}

export async function updateMyProfile(
  apiFetch: ApiFetch,
  data: { displayName: string; avatarUrl?: string | null },
): Promise<UserProfile> {
  return apiFetch<UserProfile>('/api/v1/profile/me', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
