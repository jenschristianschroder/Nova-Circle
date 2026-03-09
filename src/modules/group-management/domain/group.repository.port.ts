import type { Group, CreateGroupData, UpdateGroupData } from './group.js';

export interface GroupRepositoryPort {
  findById(id: string): Promise<Group | null>;
  create(data: CreateGroupData): Promise<Group>;
  update(id: string, data: UpdateGroupData): Promise<Group | null>;
  delete(id: string): Promise<void>;
}
