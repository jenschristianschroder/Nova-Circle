import type { Group } from './group.js';

/**
 * Port for atomically creating a group and seeding its owner membership in a
 * single transaction.  Keeps the CreateGroupUseCase free from transaction
 * management concerns while ensuring the system cannot persist a group that
 * has no owner member.
 */
export interface CreateGroupWithOwnerPort {
  createGroupWithOwner(data: {
    name: string;
    description: string | null;
    ownerId: string;
  }): Promise<Group>;
}
