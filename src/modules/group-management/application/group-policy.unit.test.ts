import { describe, it, expect, vi } from 'vitest';
import { CreateGroupUseCase } from './create-group.usecase.js';
import { GetGroupUseCase } from './get-group.usecase.js';
import { UpdateGroupUseCase } from './update-group.usecase.js';
import { DeleteGroupUseCase } from './delete-group.usecase.js';
import type { GroupRepositoryPort } from '../domain/group.repository.port.js';
import type { MembershipCheckerPort } from '../domain/membership-checker.port.js';
import type { CreateGroupWithOwnerPort } from '../domain/group-creation.port.js';
import type { Group } from '../domain/group.js';
import { FakeIdentity } from '../../../shared/test-helpers/fake-identity.js';

function makeGroup(overrides?: Partial<Group>): Group {
  return {
    id: 'group-1',
    name: 'Test Group',
    description: null,
    ownerId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeGroupRepo(overrides?: Partial<GroupRepositoryPort>): GroupRepositoryPort {
  return {
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(makeGroup()),
    update: vi.fn().mockResolvedValue(makeGroup()),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeMembership(role: 'owner' | 'admin' | 'member' | null): MembershipCheckerPort {
  return {
    isMember: vi.fn().mockResolvedValue(role !== null),
    getRole: vi.fn().mockResolvedValue(role),
  };
}

function makeGroupCreator(group?: Group): CreateGroupWithOwnerPort {
  return {
    createGroupWithOwner: vi.fn().mockResolvedValue(group ?? makeGroup()),
  };
}

describe('CreateGroupUseCase', () => {
  const identity = FakeIdentity.user('alice');

  it('creates a group with valid name', async () => {
    const creator = makeGroupCreator();
    const useCase = new CreateGroupUseCase(creator);
    await useCase.execute(identity, { name: 'Book Club' });
    expect(creator.createGroupWithOwner).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Book Club', ownerId: identity.userId }),
    );
  });

  it('trims whitespace from name before creating', async () => {
    const creator = makeGroupCreator();
    const useCase = new CreateGroupUseCase(creator);
    await useCase.execute(identity, { name: '  Book Club  ' });
    expect(creator.createGroupWithOwner).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Book Club' }),
    );
  });

  it('rejects empty name', async () => {
    const useCase = new CreateGroupUseCase(makeGroupCreator());
    await expect(useCase.execute(identity, { name: '  ' })).rejects.toThrow();
  });

  it('rejects name longer than 100 characters', async () => {
    const useCase = new CreateGroupUseCase(makeGroupCreator());
    await expect(useCase.execute(identity, { name: 'a'.repeat(101) })).rejects.toThrow();
  });
});

describe('GetGroupUseCase', () => {
  const identity = FakeIdentity.user('alice');

  it('returns null when group does not exist', async () => {
    const useCase = new GetGroupUseCase(makeGroupRepo(), makeMembership('member'));
    const result = await useCase.execute(identity, 'unknown-id');
    expect(result).toBeNull();
  });

  it('returns null when caller is not a member', async () => {
    const repo = makeGroupRepo({ findById: vi.fn().mockResolvedValue(makeGroup()) });
    const useCase = new GetGroupUseCase(repo, makeMembership(null));
    const result = await useCase.execute(identity, 'group-1');
    expect(result).toBeNull();
  });

  it('returns group when caller is a member', async () => {
    const group = makeGroup();
    const repo = makeGroupRepo({ findById: vi.fn().mockResolvedValue(group) });
    const useCase = new GetGroupUseCase(repo, makeMembership('member'));
    const result = await useCase.execute(identity, 'group-1');
    expect(result).toEqual(group);
  });
});

describe('UpdateGroupUseCase', () => {
  const identity = FakeIdentity.user('alice');

  it('allows owner to update', async () => {
    const repo = makeGroupRepo();
    const useCase = new UpdateGroupUseCase(repo, makeMembership('owner'));
    await useCase.execute(identity, 'group-1', { name: 'New Name' });
    expect(repo.update).toHaveBeenCalled();
  });

  it('allows admin to update', async () => {
    const repo = makeGroupRepo();
    const useCase = new UpdateGroupUseCase(repo, makeMembership('admin'));
    await useCase.execute(identity, 'group-1', { name: 'New Name' });
    expect(repo.update).toHaveBeenCalled();
  });

  it('rejects member from updating', async () => {
    const useCase = new UpdateGroupUseCase(makeGroupRepo(), makeMembership('member'));
    await expect(useCase.execute(identity, 'group-1', { name: 'New Name' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('rejects non-member from updating', async () => {
    const useCase = new UpdateGroupUseCase(makeGroupRepo(), makeMembership(null));
    await expect(useCase.execute(identity, 'group-1', { name: 'New Name' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('DeleteGroupUseCase', () => {
  const identity = FakeIdentity.user('alice');

  it('allows owner to delete', async () => {
    const repo = makeGroupRepo();
    const useCase = new DeleteGroupUseCase(repo, makeMembership('owner'));
    await useCase.execute(identity, 'group-1');
    expect(repo.delete).toHaveBeenCalledWith('group-1');
  });

  it('rejects admin from deleting', async () => {
    const useCase = new DeleteGroupUseCase(makeGroupRepo(), makeMembership('admin'));
    await expect(useCase.execute(identity, 'group-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects member from deleting', async () => {
    const useCase = new DeleteGroupUseCase(makeGroupRepo(), makeMembership('member'));
    await expect(useCase.execute(identity, 'group-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws HAS_ACTIVE_SHARES when FK violation occurs (active shares reference the group)', async () => {
    const fkError = Object.assign(new Error('FK violation'), { code: '23503' });
    const repo = makeGroupRepo({ delete: vi.fn().mockRejectedValue(fkError) });
    const useCase = new DeleteGroupUseCase(repo, makeMembership('owner'));
    await expect(useCase.execute(identity, 'group-1')).rejects.toMatchObject({
      code: 'HAS_ACTIVE_SHARES',
    });
  });

  it('re-throws non-FK errors from groupRepo.delete()', async () => {
    const genericError = new Error('Connection lost');
    const repo = makeGroupRepo({ delete: vi.fn().mockRejectedValue(genericError) });
    const useCase = new DeleteGroupUseCase(repo, makeMembership('owner'));
    await expect(useCase.execute(identity, 'group-1')).rejects.toThrow('Connection lost');
  });
});
