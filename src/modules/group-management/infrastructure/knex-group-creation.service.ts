import type { Knex } from 'knex';
import type { CreateGroupWithOwnerPort } from '../domain/group-creation.port.js';
import type { Group } from '../domain/group.js';

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Creates a group row and the owner's group_members row atomically inside a
 * single Knex transaction.  This prevents an orphaned group (no owner member)
 * if the second insert fails.
 */
export class KnexGroupCreationService implements CreateGroupWithOwnerPort {
  constructor(private readonly db: Knex) {}

  async createGroupWithOwner(data: {
    name: string;
    description: string | null;
    ownerId: string;
  }): Promise<Group> {
    return this.db.transaction(async (trx) => {
      const now = new Date();

      const groupRows = await trx<GroupRow>('groups')
        .insert({
          name: data.name,
          description: data.description,
          owner_id: data.ownerId,
          created_at: now,
          updated_at: now,
        })
        .returning('*');

      const groupRow = groupRows[0];
      if (!groupRow)
        throw new Error('Failed to retrieve inserted group: database returned no row after insert');

      await trx('group_members').insert({
        group_id: groupRow.id,
        user_id: data.ownerId,
        role: 'owner',
        joined_at: now,
      });

      return {
        id: groupRow.id,
        name: groupRow.name,
        description: groupRow.description,
        ownerId: groupRow.owner_id,
        createdAt: new Date(groupRow.created_at),
        updatedAt: new Date(groupRow.updated_at),
      };
    });
  }
}
