export type GroupMemberRole = 'owner' | 'admin' | 'member';

export interface GroupMember {
  readonly id: string;
  readonly groupId: string;
  readonly userId: string;
  readonly role: GroupMemberRole;
  readonly joinedAt: Date;
}

export interface AddMemberData {
  readonly groupId: string;
  readonly userId: string;
  readonly role?: 'admin' | 'member';
}
