import express from 'express';
import type { Request, Response } from 'express';
import type { GroupMemberRepositoryPort } from '../domain/group-member.repository.port.js';
import { AddMemberUseCase } from '../application/add-member.usecase.js';
import { RemoveMemberUseCase } from '../application/remove-member.usecase.js';
import { ListMembersUseCase } from '../application/list-members.usecase.js';

function isForbiddenError(err: unknown): boolean {
  return err instanceof Error && (err as Error & { code?: string }).code === 'FORBIDDEN';
}

function isNotFoundError(err: unknown): boolean {
  return err instanceof Error && (err as Error & { code?: string }).code === 'NOT_FOUND';
}

function isConflictError(err: unknown): boolean {
  return err instanceof Error && (err as Error & { code?: string }).code === 'CONFLICT';
}

export function createMembershipRouter(memberRepo: GroupMemberRepositoryPort): express.Router {
  const router = express.Router({ mergeParams: true });

  const addMember = new AddMemberUseCase(memberRepo);
  const removeMember = new RemoveMemberUseCase(memberRepo);
  const listMembers = new ListMembersUseCase(memberRepo);

  router.get('/', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const groupId = req.params['id'] as string;
    try {
      const members = await listMembers.execute(identity, groupId);
      res.json(members);
    } catch (err: unknown) {
      if (isForbiddenError(err)) {
        res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const groupId = req.params['id'] as string;
    const { userId, role } = req.body as { userId?: unknown; role?: unknown };

    if (typeof userId !== 'string') {
      res.status(400).json({ error: 'userId is required', code: 'VALIDATION_ERROR' });
      return;
    }

    const resolvedRole: 'admin' | 'member' =
      role === 'admin' || role === 'member' ? role : 'member';

    try {
      const member = await addMember.execute(identity, groupId, userId, resolvedRole);
      res.status(201).json(member);
    } catch (err: unknown) {
      if (isForbiddenError(err)) {
        res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
        return;
      }
      if (isConflictError(err)) {
        res.status(409).json({ error: 'Already a member', code: 'CONFLICT' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  router.delete('/:userId', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const groupId = req.params['id'] as string;
    const targetUserId = req.params['userId'] as string;

    try {
      await removeMember.execute(identity, groupId, targetUserId);
      res.status(204).send();
    } catch (err: unknown) {
      if (isForbiddenError(err)) {
        res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
        return;
      }
      if (isNotFoundError(err)) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  return router;
}
