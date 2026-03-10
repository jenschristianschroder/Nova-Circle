import { describe, it, expect, vi } from 'vitest';
import { UpsertMyProfileUseCase } from '../application/upsert-my-profile.usecase.js';
import type { UserProfileRepositoryPort } from './user-profile.repository.port.js';
import type { UserProfile } from './user-profile.js';
import { FakeIdentity } from '../../../shared/test-helpers/fake-identity.js';

function makeProfile(overrides?: Partial<UserProfile>): UserProfile {
  return {
    id: 'user-1',
    displayName: 'Test User',
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRepo(profile: UserProfile): UserProfileRepositoryPort {
  return {
    findById: vi.fn().mockResolvedValue(profile),
    upsert: vi.fn().mockResolvedValue(profile),
    update: vi.fn().mockResolvedValue(profile),
  };
}

describe('UpsertMyProfileUseCase validation', () => {
  const identity = FakeIdentity.user('alice');

  it('accepts a valid displayName', async () => {
    const repo = makeRepo(makeProfile({ displayName: 'Alice' }));
    const useCase = new UpsertMyProfileUseCase(repo);
    const result = await useCase.execute(identity, { displayName: 'Alice' });
    expect(result.displayName).toBe('Alice');
  });

  it('trims whitespace from displayName', async () => {
    const repo = makeRepo(makeProfile({ displayName: 'Alice' }));
    const useCase = new UpsertMyProfileUseCase(repo);
    await useCase.execute(identity, { displayName: '  Alice  ' });
    expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'Alice' }));
  });

  it('rejects empty displayName', async () => {
    const useCase = new UpsertMyProfileUseCase(makeRepo(makeProfile()));
    await expect(useCase.execute(identity, { displayName: '' })).rejects.toThrow(
      'displayName must not be empty',
    );
  });

  it('rejects whitespace-only displayName', async () => {
    const useCase = new UpsertMyProfileUseCase(makeRepo(makeProfile()));
    await expect(useCase.execute(identity, { displayName: '   ' })).rejects.toThrow(
      'displayName must not be empty',
    );
  });

  it('accepts displayName of exactly 100 characters', async () => {
    const name = 'a'.repeat(100);
    const repo = makeRepo(makeProfile({ displayName: name }));
    const useCase = new UpsertMyProfileUseCase(repo);
    await useCase.execute(identity, { displayName: name });
    expect(repo.upsert).toHaveBeenCalled();
  });

  it('rejects displayName longer than 100 characters', async () => {
    const useCase = new UpsertMyProfileUseCase(makeRepo(makeProfile()));
    await expect(useCase.execute(identity, { displayName: 'a'.repeat(101) })).rejects.toThrow(
      'displayName must not exceed 100 characters',
    );
  });

  it('uses the caller userId as profile id', async () => {
    const repo = makeRepo(makeProfile());
    const useCase = new UpsertMyProfileUseCase(repo);
    await useCase.execute(identity, { displayName: 'Alice' });
    expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({ userId: identity.userId }));
  });
});
