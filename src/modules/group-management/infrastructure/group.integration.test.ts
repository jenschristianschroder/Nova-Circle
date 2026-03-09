import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Knex } from 'knex';
import { createTestDb } from '../../../infrastructure/test-db.js';
import { KnexGroupRepository } from './knex-group.repository.js';
import { KnexUserProfileRepository } from '../../identity-profile/infrastructure/knex-user-profile.repository.js';

const skipReason = !process.env['TEST_DATABASE_URL']
  ? 'TEST_DATABASE_URL is not set – skipping database integration tests'
  : undefined;

const TEST_OWNER_ID = '22222222-0000-4000-8000-000000000001';

describe('KnexGroupRepository', () => {
  let db: Knex;
  let repo: KnexGroupRepository;

  beforeAll(async () => {
    if (skipReason) return;
    db = createTestDb();
    await db.migrate.latest();
    repo = new KnexGroupRepository(db);

    // Ensure owner profile exists for FK constraint.
    const profileRepo = new KnexUserProfileRepository(db);
    await profileRepo.upsert({ userId: TEST_OWNER_ID, displayName: 'Test Owner' });
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  it.skipIf(skipReason !== undefined)('returns null for unknown id', async () => {
    const result = await repo.findById('00000000-0000-0000-0000-000000000000');
    expect(result).toBeNull();
  });

  it.skipIf(skipReason !== undefined)('creates a group', async () => {
    const group = await repo.create({ name: 'Test Group', ownerId: TEST_OWNER_ID });
    expect(group.id).toBeTruthy();
    expect(group.name).toBe('Test Group');
    expect(group.ownerId).toBe(TEST_OWNER_ID);
  });

  it.skipIf(skipReason !== undefined)('finds group by id', async () => {
    const created = await repo.create({ name: 'Find Me', ownerId: TEST_OWNER_ID });
    const found = await repo.findById(created.id);
    expect(found).not.toBeNull();
    expect(found?.name).toBe('Find Me');
  });

  it.skipIf(skipReason !== undefined)('updates group name', async () => {
    const created = await repo.create({ name: 'Original', ownerId: TEST_OWNER_ID });
    const updated = await repo.update(created.id, { name: 'Updated' });
    expect(updated?.name).toBe('Updated');
  });

  it.skipIf(skipReason !== undefined)('returns null when updating unknown id', async () => {
    const result = await repo.update('00000000-0000-0000-0000-000000000000', { name: 'Ghost' });
    expect(result).toBeNull();
  });

  it.skipIf(skipReason !== undefined)('deletes a group', async () => {
    const created = await repo.create({ name: 'To Delete', ownerId: TEST_OWNER_ID });
    await repo.delete(created.id);
    const found = await repo.findById(created.id);
    expect(found).toBeNull();
  });
});
