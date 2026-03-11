import express from 'express';
import type { Request, Response } from 'express';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../../event-management/domain/event-invitation.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { EventChecklistRepositoryPort } from '../domain/event-checklist.repository.port.js';
import { GetChecklistUseCase } from '../application/get-checklist.usecase.js';
import { AddChecklistItemUseCase } from '../application/add-checklist-item.usecase.js';
import { UpdateChecklistItemUseCase } from '../application/update-checklist-item.usecase.js';
import { CompleteChecklistItemUseCase } from '../application/complete-checklist-item.usecase.js';
import { DeleteChecklistItemUseCase } from '../application/delete-checklist-item.usecase.js';
import { ReorderChecklistUseCase } from '../application/reorder-checklist.usecase.js';
import { isValidUuid } from '../../../shared/validation/uuid.js';

function isNotFoundError(err: unknown): boolean {
  return err instanceof Error && (err as Error & { code?: string }).code === 'NOT_FOUND';
}

function isForbiddenError(err: unknown): boolean {
  return err instanceof Error && (err as Error & { code?: string }).code === 'FORBIDDEN';
}

function isValidationError(err: unknown): boolean {
  return err instanceof Error && (err as Error & { code?: string }).code === 'VALIDATION_ERROR';
}

export function createEventChecklistRouter(
  eventRepo: EventRepositoryPort,
  invitationRepo: EventInvitationRepositoryPort,
  checklistRepo: EventChecklistRepositoryPort,
  memberRepo: GroupMemberRepositoryPort,
): express.Router {
  const router = express.Router({ mergeParams: true });

  const getChecklist = new GetChecklistUseCase(eventRepo, invitationRepo, checklistRepo);
  const addItem = new AddChecklistItemUseCase(eventRepo, invitationRepo, checklistRepo);
  const updateItem = new UpdateChecklistItemUseCase(
    eventRepo,
    invitationRepo,
    checklistRepo,
    memberRepo,
  );
  const completeItem = new CompleteChecklistItemUseCase(eventRepo, invitationRepo, checklistRepo);
  const deleteItem = new DeleteChecklistItemUseCase(
    eventRepo,
    invitationRepo,
    checklistRepo,
    memberRepo,
  );
  const reorder = new ReorderChecklistUseCase(eventRepo, invitationRepo, checklistRepo);

  // GET /api/v1/events/:eventId/checklist
  router.get('/', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const eventId = req.params['eventId'] as string;
    if (!isValidUuid(eventId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    try {
      const result = await getChecklist.execute(identity, eventId);
      res.json(result);
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // POST /api/v1/events/:eventId/checklist/items
  router.post('/items', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const eventId = req.params['eventId'] as string;
    if (!isValidUuid(eventId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    const { text, displayOrder } = req.body as { text?: unknown; displayOrder?: unknown };

    if (typeof text !== 'string') {
      res.status(400).json({ error: 'text is required', code: 'VALIDATION_ERROR' });
      return;
    }

    const parsedOrder =
      typeof displayOrder === 'number' ? displayOrder : undefined;

    try {
      const item = await addItem.execute(identity, eventId, text, parsedOrder);
      res.status(201).json(item);
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      if (isValidationError(err)) {
        res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // PUT /api/v1/events/:eventId/checklist/items/:itemId
  router.put('/items/:itemId', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const eventId = req.params['eventId'] as string;
    if (!isValidUuid(eventId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    const itemId = req.params['itemId'] as string;
    if (!isValidUuid(itemId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    const body = req.body as {
      text?: unknown;
      assignedToUserId?: unknown;
      dueAt?: unknown;
    };

    try {
      const item = await updateItem.execute(identity, eventId, itemId, {
        ...(body.text !== undefined ? { text: body.text as string } : {}),
        ...(body.assignedToUserId !== undefined
          ? { assignedToUserId: body.assignedToUserId as string | null }
          : {}),
        ...(body.dueAt !== undefined
          ? {
              dueAt:
                typeof body.dueAt === 'string' && body.dueAt.length > 0
                  ? new Date(body.dueAt)
                  : null,
            }
          : {}),
      });
      res.json(item);
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      if (isForbiddenError(err)) {
        res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
        return;
      }
      if (isValidationError(err)) {
        res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // POST /api/v1/events/:eventId/checklist/items/:itemId/complete
  router.post('/items/:itemId/complete', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const eventId = req.params['eventId'] as string;
    if (!isValidUuid(eventId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    const itemId = req.params['itemId'] as string;
    if (!isValidUuid(itemId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    try {
      const item = await completeItem.execute(identity, eventId, itemId, true);
      res.json(item);
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // DELETE /api/v1/events/:eventId/checklist/items/:itemId/complete
  router.delete('/items/:itemId/complete', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const eventId = req.params['eventId'] as string;
    if (!isValidUuid(eventId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    const itemId = req.params['itemId'] as string;
    if (!isValidUuid(itemId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    try {
      const item = await completeItem.execute(identity, eventId, itemId, false);
      res.json(item);
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // DELETE /api/v1/events/:eventId/checklist/items/:itemId
  router.delete('/items/:itemId', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const eventId = req.params['eventId'] as string;
    if (!isValidUuid(eventId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    const itemId = req.params['itemId'] as string;
    if (!isValidUuid(itemId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    try {
      await deleteItem.execute(identity, eventId, itemId);
      res.status(204).send();
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      if (isForbiddenError(err)) {
        res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // PUT /api/v1/events/:eventId/checklist/order
  router.put('/order', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const eventId = req.params['eventId'] as string;
    if (!isValidUuid(eventId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    const { itemIds } = req.body as { itemIds?: unknown };

    if (!Array.isArray(itemIds)) {
      res.status(400).json({ error: 'itemIds must be an array', code: 'VALIDATION_ERROR' });
      return;
    }

    const hasInvalid = (itemIds as unknown[]).some((id) => typeof id !== 'string' || !isValidUuid(id));
    if (hasInvalid) {
      res
        .status(400)
        .json({ error: 'itemIds must contain valid UUIDs', code: 'VALIDATION_ERROR' });
      return;
    }

    try {
      await reorder.execute(identity, eventId, itemIds as string[]);
      res.status(204).send();
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      if (isValidationError(err)) {
        res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  return router;
}
