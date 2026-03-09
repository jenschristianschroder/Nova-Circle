import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Knex } from 'knex';
import { createTestDb } from '../../../infrastructure/test-db.js';
import { KnexUserProfileRepository } from './knex-user-profile.repository.js';

const skipReason = !process.env['TEST_DATABASE_URL']
  ? 'TEST_DATABASE_URL is not set – skipping database integration tests'
  : undefined;

describe('KnexUserProfileRepository', () => {
  let db: Knex;
  let repo: KnexUserProfileRepository;

  beforeAll(async () => {
    if (skipReason) return;
    db = createTestDb();
    await db.migrate.latest();
    repo = new KnexUserProfileRepository(db);
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  it.skipIf(skipReason !== undefined)('returns null for unknown id', async () => {
    const result = await repo.findById('00000000-0000-0000-0000-000000000000');
    expect(result).toBeNull();
  });

  it.skipIf(skipReason !== undefined)('creates a profile via upsert', async () => {
    const userId = '11111111-0000-4000-8000-000000000001';
    const profile = await repo.upsert({ userId, displayName: 'Alice', avatarUrl: null });

    expect(profile.id).toBe(userId);
    expect(profile.displayName).toBe('Alice');
    expect(profile.avatarUrl).toBeNull();
    expect(profile.createdAt).toBeInstanceOf(Date);
  });

  it.skipIf(skipReason !== undefined)('overwrites profile on second upsert', async () => {
    const userId = '11111111-0000-4000-8000-000000000002';
    await repo.upsert({ userId, displayName: 'Bob', avatarUrl: null });
    const updated = await repo.upsert({
      userId,
      displayName: 'Robert',
      avatarUrl: 'https://example.com/avatar.png',
    });

    expect(updated.displayName).toBe('Robert');
    expect(updated.avatarUrl).toBe('https://example.com/avatar.png');
  });

  it.skipIf(skipReason !== undefined)('finds profile by id', async () => {
    const userId = '11111111-0000-4000-8000-000000000003';
    await repo.upsert({ userId, displayName: 'Carol', avatarUrl: null });

    const found = await repo.findById(userId);
    expect(found).not.toBeNull();
    expect(found?.displayName).toBe('Carol');
  });

  it.skipIf(skipReason !== undefined)('updates display name', async () => {
    const userId = '11111111-0000-4000-8000-000000000004';
    await repo.upsert({ userId, displayName: 'Dave', avatarUrl: null });

    const updated = await repo.update(userId, { displayName: 'David' });
    expect(updated?.displayName).toBe('David');
  });

  it.skipIf(skipReason !== undefined)('returns null when updating unknown id', async () => {
    const result = await repo.update('00000000-0000-0000-0000-000000000099', {
      displayName: 'Ghost',
    });
    expect(result).toBeNull();
  });
});
