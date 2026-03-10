import { describe, it, expect, vi } from 'vitest';
import { AddMemberUseCase } from './add-member.usecase.js';
import { RemoveMemberUseCase } from './remove-member.usecase.js';
import { ListMembersUseCase } from './list-members.usecase.js';
import type { GroupMemberRepositoryPort } from '../domain/group-member.repository.port.js';
import type { GroupMember } from '../domain/group-member.js';
import { FakeIdentity } from '../../../shared/test-helpers/fake-identity.js';

function makeMember(overrides?: Partial<GroupMember>): GroupMember {
  return {
    id: 'member-id',
    groupId: 'group-1',
    userId: 'user-1',
    role: 'member',
    joinedAt: new Date(),
    ...overrides,
  };
}

function makeRepo(overrides?: Partial<GroupMemberRepositoryPort>): GroupMemberRepositoryPort {
  return {
    findByGroupAndUser: vi.fn().mockResolvedValue(null),
    listByGroup: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue(makeMember()),
    remove: vi.fn().mockResolvedValue(undefined),
    isMember: vi.fn().mockResolvedValue(false),
    getRole: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

const owner = FakeIdentity.user('owner');
const admin = FakeIdentity.user('admin');
const memberUser = FakeIdentity.user('member');
const outsider = FakeIdentity.user('outsider');

describe('AddMemberUseCase', () => {
  it('allows owner to add member', async () => {
    const repo = makeRepo({ getRole: vi.fn().mockResolvedValue('owner') });
    const useCase = new AddMemberUseCase(repo);
    await useCase.execute(owner, 'group-1', 'new-user-id');
    expect(repo.add).toHaveBeenCalled();
  });

  it('allows admin to add member', async () => {
    const repo = makeRepo({ getRole: vi.fn().mockResolvedValue('admin') });
    const useCase = new AddMemberUseCase(repo);
    await useCase.execute(admin, 'group-1', 'new-user-id');
    expect(repo.add).toHaveBeenCalled();
  });

  it('rejects regular member from adding', async () => {
    const repo = makeRepo({ getRole: vi.fn().mockResolvedValue('member') });
    const useCase = new AddMemberUseCase(repo);
    await expect(useCase.execute(memberUser, 'group-1', 'new-user-id')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('rejects outsider from adding', async () => {
    const repo = makeRepo({ getRole: vi.fn().mockResolvedValue(null) });
    const useCase = new AddMemberUseCase(repo);
    await expect(useCase.execute(outsider, 'group-1', 'new-user-id')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('rejects adding duplicate member', async () => {
    const repo = makeRepo({
      getRole: vi.fn().mockResolvedValue('owner'),
      findByGroupAndUser: vi.fn().mockResolvedValue(makeMember()),
    });
    const useCase = new AddMemberUseCase(repo);
    await expect(useCase.execute(owner, 'group-1', 'user-1')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
});

describe('RemoveMemberUseCase', () => {
  it('allows owner to remove member', async () => {
    const repo = makeRepo({
      findByGroupAndUser: vi.fn().mockResolvedValue(makeMember({ role: 'member' })),
      getRole: vi.fn().mockResolvedValue('owner'),
    });
    const useCase = new RemoveMemberUseCase(repo);
    await useCase.execute(owner, 'group-1', 'user-1');
    expect(repo.remove).toHaveBeenCalled();
  });

  it('allows member to remove self', async () => {
    const self = FakeIdentity.user('self');
    const repo = makeRepo({
      findByGroupAndUser: vi
        .fn()
        .mockResolvedValue(makeMember({ userId: self.userId, role: 'member' })),
    });
    const useCase = new RemoveMemberUseCase(repo);
    await useCase.execute(self, 'group-1', self.userId);
    expect(repo.remove).toHaveBeenCalled();
  });

  it('prevents removing the owner', async () => {
    const repo = makeRepo({
      findByGroupAndUser: vi.fn().mockResolvedValue(makeMember({ role: 'owner' })),
      getRole: vi.fn().mockResolvedValue('owner'),
    });
    const useCase = new RemoveMemberUseCase(repo);
    await expect(useCase.execute(owner, 'group-1', 'user-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('rejects regular member removing another member', async () => {
    const repo = makeRepo({
      findByGroupAndUser: vi.fn().mockResolvedValue(makeMember({ role: 'member' })),
      getRole: vi.fn().mockResolvedValue('member'),
    });
    const useCase = new RemoveMemberUseCase(repo);
    await expect(useCase.execute(memberUser, 'group-1', 'other-user-id')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('returns NOT_FOUND when target is not a member (caller is authorized)', async () => {
    const repo = makeRepo({
      findByGroupAndUser: vi.fn().mockResolvedValue(null),
      getRole: vi.fn().mockResolvedValue('owner'),
    });
    const useCase = new RemoveMemberUseCase(repo);
    await expect(useCase.execute(owner, 'group-1', 'ghost-id')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('returns NOT_FOUND for non-member caller to prevent membership probing', async () => {
    const repo = makeRepo({ getRole: vi.fn().mockResolvedValue(null) });
    const useCase = new RemoveMemberUseCase(repo);
    await expect(useCase.execute(outsider, 'group-1', 'user-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('ListMembersUseCase', () => {
  it('returns members for a member', async () => {
    const members = [makeMember()];
    const repo = makeRepo({
      isMember: vi.fn().mockResolvedValue(true),
      listByGroup: vi.fn().mockResolvedValue(members),
    });
    const useCase = new ListMembersUseCase(repo);
    const result = await useCase.execute(memberUser, 'group-1');
    expect(result).toEqual(members);
  });

  it('throws NOT_FOUND for non-member (no existence disclosure)', async () => {
    const repo = makeRepo({ isMember: vi.fn().mockResolvedValue(false) });
    const useCase = new ListMembersUseCase(repo);
    await expect(useCase.execute(outsider, 'group-1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
