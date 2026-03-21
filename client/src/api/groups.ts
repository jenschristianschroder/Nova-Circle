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
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMember {
  userId: string;
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

export async function updateGroup(
  apiFetch: ApiFetch,
  groupId: string,
  data: { name?: string; description?: string | null },
): Promise<Group> {
  return apiFetch<Group>(`/api/v1/groups/${groupId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteGroup(apiFetch: ApiFetch, groupId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/groups/${groupId}`, { method: 'DELETE' });
}
