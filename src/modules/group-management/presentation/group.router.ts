import express from 'express';
import type { Request, Response } from 'express';
import type { GroupRepositoryPort } from '../domain/group.repository.port.js';
import type { MembershipCheckerPort } from '../domain/membership-checker.port.js';
import type { MemberAdderPort } from '../application/create-group.usecase.js';
import { CreateGroupUseCase } from '../application/create-group.usecase.js';
import { GetGroupUseCase } from '../application/get-group.usecase.js';
import { UpdateGroupUseCase } from '../application/update-group.usecase.js';
import { DeleteGroupUseCase } from '../application/delete-group.usecase.js';

function isForbiddenError(err: unknown): boolean {
  return err instanceof Error && (err as Error & { code?: string }).code === 'FORBIDDEN';
}

function isNotFoundError(err: unknown): boolean {
  return err instanceof Error && (err as Error & { code?: string }).code === 'NOT_FOUND';
}

export function createGroupRouter(
  groupRepo: GroupRepositoryPort,
  membership: MembershipCheckerPort & MemberAdderPort,
): express.Router {
  const router = express.Router();

  const createGroup = new CreateGroupUseCase(groupRepo, membership);
  const getGroup = new GetGroupUseCase(groupRepo, membership);
  const updateGroup = new UpdateGroupUseCase(groupRepo, membership);
  const deleteGroup = new DeleteGroupUseCase(groupRepo, membership);

  router.post('/', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const { name, description } = req.body as { name?: unknown; description?: unknown };
    if (typeof name !== 'string') {
      res.status(400).json({ error: 'name is required', code: 'VALIDATION_ERROR' });
      return;
    }

    try {
      const group = await createGroup.execute(identity, {
        name,
        description: typeof description === 'string' ? description : null,
      });
      res.status(201).json(group);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid input';
      res.status(400).json({ error: message, code: 'VALIDATION_ERROR' });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const group = await getGroup.execute(identity, req.params['id'] as string);
    if (!group) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    res.json(group);
  });

  router.put('/:id', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const { name, description } = req.body as { name?: unknown; description?: unknown };

    try {
      const updateData = {
        ...(typeof name === 'string' ? { name } : {}),
        ...(typeof description === 'string' ? { description } : {}),
      };
      const group = await updateGroup.execute(identity, req.params['id'] as string, updateData);
      res.json(group);
    } catch (err: unknown) {
      if (isForbiddenError(err)) {
        res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
        return;
      }
      if (isNotFoundError(err)) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      const message = err instanceof Error ? err.message : 'Invalid input';
      res.status(400).json({ error: message, code: 'VALIDATION_ERROR' });
    }
  });

  router.delete('/:id', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    try {
      await deleteGroup.execute(identity, req.params['id'] as string);
      res.status(204).send();
    } catch (err: unknown) {
      if (isForbiddenError(err)) {
        res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  return router;
}
