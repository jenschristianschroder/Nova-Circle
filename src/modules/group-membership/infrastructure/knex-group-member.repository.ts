import type { Knex } from 'knex';
import type { GroupMemberRepositoryPort } from '../domain/group-member.repository.port.js';
import type { GroupMember, AddMemberData, GroupMemberRole } from '../domain/group-member.js';

interface GroupMemberRow {
  id: string;
  group_id: string;
  user_id: string;
  role: GroupMemberRole;
  joined_at: Date;
}

function toGroupMember(row: GroupMemberRow): GroupMember {
  return {
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    role: row.role,
    joinedAt: new Date(row.joined_at),
  };
}

export class KnexGroupMemberRepository implements GroupMemberRepositoryPort {
  constructor(private readonly db: Knex) {}

  async findByGroupAndUser(groupId: string, userId: string): Promise<GroupMember | null> {
    const row = await this.db<GroupMemberRow>('group_members')
      .where({ group_id: groupId, user_id: userId })
      .first();
    return row ? toGroupMember(row) : null;
  }

  async listByGroup(groupId: string): Promise<GroupMember[]> {
    const rows = await this.db<GroupMemberRow>('group_members').where({ group_id: groupId });
    return rows.map(toGroupMember);
  }

  async add(data: AddMemberData): Promise<GroupMember> {
    const rows = await this.db<GroupMemberRow>('group_members')
      .insert({
        group_id: data.groupId,
        user_id: data.userId,
        role: data.role ?? 'member',
        joined_at: new Date(),
      })
      .returning('*');

    const row = rows[0];
    if (!row) throw new Error('Insert returned no row');
    return toGroupMember(row);
  }

  async remove(groupId: string, userId: string): Promise<void> {
    await this.db('group_members').where({ group_id: groupId, user_id: userId }).delete();
  }

  async isMember(groupId: string, userId: string): Promise<boolean> {
    const row = await this.db<GroupMemberRow>('group_members')
      .where({ group_id: groupId, user_id: userId })
      .first();
    return row !== undefined;
  }

  async getRole(groupId: string, userId: string): Promise<GroupMemberRole | null> {
    const row = await this.db<GroupMemberRow>('group_members')
      .where({ group_id: groupId, user_id: userId })
      .first();
    return row ? row.role : null;
  }
}
