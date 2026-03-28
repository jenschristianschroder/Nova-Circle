import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignUpUseCase, AlreadyRegisteredError } from './sign-up.usecase.js';
import type { UserProfileRepositoryPort } from '../domain/user-profile.repository.port.js';
import type { CreateUserProfileData } from '../domain/user-profile.js';

function makeRepo(overrides?: Partial<UserProfileRepositoryPort>): UserProfileRepositoryPort {
  return {
    findById: vi.fn().mockResolvedValue(null),
    exists: vi.fn().mockResolvedValue(false),
    create: vi.fn().mockImplementation((data: CreateUserProfileData) =>
      Promise.resolve({
        id: data.userId,
        displayName: data.displayName,
        avatarUrl: data.avatarUrl,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      }),
    ),
    upsert: vi.fn(),
    update: vi.fn(),
    ...overrides,
  };
}

const identity = { userId: 'user-1', displayName: 'Alice' };

describe('SignUpUseCase', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a new profile for an unregistered user', async () => {
    const repo = makeRepo();
    const uc = new SignUpUseCase(repo);

    const result = await uc.execute(identity, { displayName: 'Alice' });

    expect(repo.create).toHaveBeenCalledWith({
      userId: 'user-1',
      displayName: 'Alice',
      avatarUrl: null,
    });
    expect(result).toMatchObject({ id: 'user-1', displayName: 'Alice' });
  });

  it('trims displayName before creating', async () => {
    const repo = makeRepo();
    const uc = new SignUpUseCase(repo);

    await uc.execute(identity, { displayName: '  Bob  ' });

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'Bob' }));
  });

  it('passes avatarUrl when provided', async () => {
    const repo = makeRepo();
    const uc = new SignUpUseCase(repo);

    await uc.execute(identity, {
      displayName: 'Carol',
      avatarUrl: 'https://example.com/avatar.png',
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ avatarUrl: 'https://example.com/avatar.png' }),
    );
  });

  it('defaults avatarUrl to null when not provided', async () => {
    const repo = makeRepo();
    const uc = new SignUpUseCase(repo);

    await uc.execute(identity, { displayName: 'Dave' });

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: null }));
  });

  it('throws when displayName is empty', async () => {
    const repo = makeRepo();
    const uc = new SignUpUseCase(repo);

    await expect(uc.execute(identity, { displayName: '' })).rejects.toThrow(
      'displayName must not be empty',
    );
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('throws when displayName is whitespace-only', async () => {
    const repo = makeRepo();
    const uc = new SignUpUseCase(repo);

    await expect(uc.execute(identity, { displayName: '   ' })).rejects.toThrow(
      'displayName must not be empty',
    );
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('throws when displayName exceeds 100 characters', async () => {
    const repo = makeRepo();
    const uc = new SignUpUseCase(repo);

    await expect(uc.execute(identity, { displayName: 'a'.repeat(101) })).rejects.toThrow(
      'displayName must not exceed 100 characters',
    );
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('throws AlreadyRegisteredError when create hits a unique constraint violation', async () => {
    const uniqueViolation = Object.assign(new Error('duplicate key value'), { code: '23505' });
    const repo = makeRepo({ create: vi.fn().mockRejectedValue(uniqueViolation) });
    const uc = new SignUpUseCase(repo);

    await expect(uc.execute(identity, { displayName: 'Alice' })).rejects.toThrow(
      AlreadyRegisteredError,
    );
  });

  it('re-throws non-unique-violation errors from create', async () => {
    const dbError = new Error('connection refused');
    const repo = makeRepo({ create: vi.fn().mockRejectedValue(dbError) });
    const uc = new SignUpUseCase(repo);

    await expect(uc.execute(identity, { displayName: 'Alice' })).rejects.toThrow(
      'connection refused',
    );
  });
});
