import type { GroupMember, AddMemberData, GroupMemberRole } from './group-member.js';

export interface GroupMemberRepositoryPort {
  findByGroupAndUser(groupId: string, userId: string): Promise<GroupMember | null>;
  listByGroup(groupId: string): Promise<GroupMember[]>;
  listByUser(userId: string): Promise<GroupMember[]>;
  add(data: AddMemberData): Promise<GroupMember>;
  remove(groupId: string, userId: string): Promise<void>;
  isMember(groupId: string, userId: string): Promise<boolean>;
  getRole(groupId: string, userId: string): Promise<GroupMemberRole | null>;
}
