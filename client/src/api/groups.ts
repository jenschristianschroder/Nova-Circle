/**
 * Group-related API calls.
 *
 * All functions receive an `apiFetch` from useApiClient() so they can be
 * easily tested with a mock.
 */

export interface Group {
  id: string;
  name: string;
  description: string | null;
  createdByUserId: string;
  createdAt: string;
}

export interface GroupMember {
  userId: string;
  displayName: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
}

type ApiFetch = <T>(path: string, init?: RequestInit) => Promise<T>;

export async function listMyGroups(apiFetch: ApiFetch): Promise<Group[]> {
  return apiFetch<Group[]>('/api/v1/groups');
}

export async function getGroup(apiFetch: ApiFetch, groupId: string): Promise<Group> {
  return apiFetch<Group>(`/api/v1/groups/${groupId}`);
}

export async function createGroup(
  apiFetch: ApiFetch,
  data: { name: string; description?: string },
): Promise<Group> {
  return apiFetch<Group>('/api/v1/groups', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listGroupMembers(
  apiFetch: ApiFetch,
  groupId: string,
): Promise<GroupMember[]> {
  return apiFetch<GroupMember[]>(`/api/v1/groups/${groupId}/members`);
}
