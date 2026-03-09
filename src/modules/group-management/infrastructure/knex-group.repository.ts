import type { Knex } from 'knex';
import type { GroupRepositoryPort } from '../domain/group.repository.port.js';
import type { Group, CreateGroupData, UpdateGroupData } from '../domain/group.js';

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: Date;
  updated_at: Date;
}

function toGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerId: row.owner_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class KnexGroupRepository implements GroupRepositoryPort {
  constructor(private readonly db: Knex) {}

  async findById(id: string): Promise<Group | null> {
    const row = await this.db<GroupRow>('groups').where({ id }).first();
    return row ? toGroup(row) : null;
  }

  async create(data: CreateGroupData): Promise<Group> {
    const now = new Date();
    const rows = await this.db<GroupRow>('groups')
      .insert({
        name: data.name,
        description: data.description ?? null,
        owner_id: data.ownerId,
        created_at: now,
        updated_at: now,
      })
      .returning('*');

    const row = rows[0];
    if (!row) throw new Error('Insert returned no row');
    return toGroup(row);
  }

  async update(id: string, data: UpdateGroupData): Promise<Group | null> {
    const changes: Partial<Omit<GroupRow, 'id' | 'created_at'>> = {
      updated_at: new Date(),
    };
    if (data.name !== undefined) changes.name = data.name;
    if (data.description !== undefined) changes.description = data.description;

    const rows = await this.db<GroupRow>('groups').where({ id }).update(changes).returning('*');
    const row = rows[0];
    return row ? toGroup(row) : null;
  }

  async delete(id: string): Promise<void> {
    await this.db('groups').where({ id }).delete();
  }
}
