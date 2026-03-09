import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Knex } from 'knex';
import { createTestDb } from '../../../infrastructure/test-db.js';
import { KnexGroupMemberRepository } from './knex-group-member.repository.js';
import { KnexUserProfileRepository } from '../../identity-profile/infrastructure/knex-user-profile.repository.js';
import { KnexGroupRepository } from '../../group-management/infrastructure/knex-group.repository.js';

const skipReason = !process.env['TEST_DATABASE_URL']
  ? 'TEST_DATABASE_URL is not set – skipping database integration tests'
  : undefined;

const USER_A_ID = '33333333-0000-4000-8000-000000000001';
const USER_B_ID = '33333333-0000-4000-8000-000000000002';

describe('KnexGroupMemberRepository', () => {
  let db: Knex;
  let repo: KnexGroupMemberRepository;
  let groupId: string;

  beforeAll(async () => {
    if (skipReason) return;
    db = createTestDb();
    await db.migrate.latest();
    repo = new KnexGroupMemberRepository(db);

    const profileRepo = new KnexUserProfileRepository(db);
    await profileRepo.upsert({ userId: USER_A_ID, displayName: 'User A' });
    await profileRepo.upsert({ userId: USER_B_ID, displayName: 'User B' });

    const groupRepo = new KnexGroupRepository(db);
    const group = await groupRepo.create({ name: 'Test Group', ownerId: USER_A_ID });
    groupId = group.id;

    // Seed USER_A_ID as a regular member so tests can verify role-based behaviour.
    // The addOwner method is exercised indirectly via the API and integration tests.
    await repo.add({ groupId, userId: USER_A_ID, role: 'member' });
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  it.skipIf(skipReason !== undefined)('returns null for non-member', async () => {
    const result = await repo.findByGroupAndUser(groupId, '00000000-0000-0000-0000-000000000000');
    expect(result).toBeNull();
  });

  it.skipIf(skipReason !== undefined)('finds member by group and user', async () => {
    const result = await repo.findByGroupAndUser(groupId, USER_A_ID);
    expect(result).not.toBeNull();
    expect(result?.userId).toBe(USER_A_ID);
  });

  it.skipIf(skipReason !== undefined)('isMember returns true for existing member', async () => {
    const result = await repo.isMember(groupId, USER_A_ID);
    expect(result).toBe(true);
  });

  it.skipIf(skipReason !== undefined)('isMember returns false for non-member', async () => {
    const result = await repo.isMember(groupId, '00000000-0000-0000-0000-000000000000');
    expect(result).toBe(false);
  });

  it.skipIf(skipReason !== undefined)('getRole returns correct role', async () => {
    const result = await repo.getRole(groupId, USER_A_ID);
    expect(result).toBe('member');
  });

  it.skipIf(skipReason !== undefined)('getRole returns null for non-member', async () => {
    const result = await repo.getRole(groupId, '00000000-0000-0000-0000-000000000000');
    expect(result).toBeNull();
  });

  it.skipIf(skipReason !== undefined)('adds and lists members', async () => {
    await repo.add({ groupId, userId: USER_B_ID, role: 'admin' });
    const members = await repo.listByGroup(groupId);
    const userIds = members.map((m) => m.userId);
    expect(userIds).toContain(USER_A_ID);
    expect(userIds).toContain(USER_B_ID);
  });

  it.skipIf(skipReason !== undefined)('removes a member', async () => {
    await repo.remove(groupId, USER_B_ID);
    const result = await repo.findByGroupAndUser(groupId, USER_B_ID);
    expect(result).toBeNull();
  });
});
