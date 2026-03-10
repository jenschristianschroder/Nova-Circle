/** Minimal port for checking caller membership and role within a group. */
export interface MembershipCheckerPort {
  isMember(groupId: string, userId: string): Promise<boolean>;
  getRole(groupId: string, userId: string): Promise<'owner' | 'admin' | 'member' | null>;
}
