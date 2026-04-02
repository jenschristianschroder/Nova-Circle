import express from 'express';
import type { Request, Response } from 'express';
import type { EventCreationPort } from '../domain/event-creation.port.js';
import type { EventRepositoryPort } from '../domain/event.repository.port.js';
import type { UpdateEventData } from '../domain/event.js';
import type { AuditLogPort } from '../../audit-security/index.js';
import type { EventShareRepositoryPort } from '../../event-sharing/domain/event-share.repository.port.js';
import { CreatePersonalEventUseCase } from '../application/create-personal-event.usecase.js';
import { ListMyEventsUseCase } from '../application/list-my-events.usecase.js';
import { GetPersonalEventUseCase } from '../application/get-personal-event.usecase.js';
import { UpdatePersonalEventUseCase } from '../application/update-personal-event.usecase.js';
import { DeletePersonalEventUseCase } from '../application/delete-personal-event.usecase.js';
import { TransferEventOwnershipUseCase } from '../application/transfer-event-ownership.usecase.js';
import { isValidUuid } from '../../../shared/validation/uuid.js';
import { logger } from '../../../shared/logger/logger.js';

function isNotFoundError(err: unknown): boolean {
  return err instanceof Error && (err as Error & { code?: string }).code === 'NOT_FOUND';
}

function isValidationError(err: unknown): boolean {
  return err instanceof Error && (err as Error & { code?: string }).code === 'VALIDATION_ERROR';
}

function isConflictError(err: unknown): boolean {
  return err instanceof Error && (err as Error & { code?: string }).code === 'CONFLICT';
}

export function createPersonalEventRouter(
  eventCreator: EventCreationPort,
  eventRepo: EventRepositoryPort,
  shareRepo: EventShareRepositoryPort,
  auditLog: AuditLogPort,
): express.Router {
  const router = express.Router();

  const createPersonalEvent = new CreatePersonalEventUseCase(eventCreator);
  const listMyEvents = new ListMyEventsUseCase(eventRepo);
  const getPersonalEvent = new GetPersonalEventUseCase(eventRepo);
  const updatePersonalEvent = new UpdatePersonalEventUseCase(eventRepo);
  const deletePersonalEvent = new DeletePersonalEventUseCase(eventRepo, shareRepo);
  const transferOwnership = new TransferEventOwnershipUseCase(eventRepo);

  // POST /api/v1/events
  router.post('/', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const { title, description, startAt, endAt } = req.body as {
      title?: unknown;
      description?: unknown;
      startAt?: unknown;
      endAt?: unknown;
    };

    if (typeof title !== 'string') {
      res.status(400).json({ error: 'title is required', code: 'VALIDATION_ERROR' });
      return;
    }

    if (typeof startAt !== 'string' || isNaN(Date.parse(startAt))) {
      res
        .status(400)
        .json({ error: 'startAt must be a valid ISO date string', code: 'VALIDATION_ERROR' });
      return;
    }

    if (typeof endAt === 'string' && endAt.length > 0 && isNaN(Date.parse(endAt))) {
      res
        .status(400)
        .json({ error: 'endAt must be a valid ISO date string', code: 'VALIDATION_ERROR' });
      return;
    }

    const parsedEndAt: Date | null =
      typeof endAt === 'string' && endAt.length > 0 ? new Date(endAt) : null;

    try {
      const event = await createPersonalEvent.execute(identity, {
        title,
        description: typeof description === 'string' ? description : null,
        startAt: new Date(startAt),
        endAt: parsedEndAt,
      });
      try {
        await auditLog.record({
          actorId: identity.userId,
          action: 'event.created',
          resourceType: 'event',
          resourceId: event.id,
          groupId: null,
        });
      } catch (auditErr) {
        logger.error('Audit log failed for event.created', auditErr);
      }
      res.status(201).json(event);
    } catch (err: unknown) {
      if (isValidationError(err)) {
        res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // GET /api/v1/events
  router.get('/', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const fromStr = req.query['from'] as string | undefined;
    const toStr = req.query['to'] as string | undefined;

    const from = fromStr && !isNaN(Date.parse(fromStr)) ? new Date(fromStr) : undefined;
    const to = toStr && !isNaN(Date.parse(toStr)) ? new Date(toStr) : undefined;

    try {
      const dateRange = {
        ...(from !== undefined ? { from } : {}),
        ...(to !== undefined ? { to } : {}),
      };
      const events = await listMyEvents.execute(identity, dateRange);
      res.json(events);
    } catch {
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // GET /api/v1/events/:eventId
  router.get('/:eventId', async (req: Request, res: Response) => {
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
      const event = await getPersonalEvent.execute(identity, eventId);
      res.json(event);
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // PATCH /api/v1/events/:eventId
  router.patch('/:eventId', async (req: Request, res: Response) => {
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

    const { title, description, startAt, endAt } = req.body as {
      title?: unknown;
      description?: unknown;
      startAt?: unknown;
      endAt?: unknown;
    };

    if (title !== undefined && typeof title !== 'string') {
      res.status(400).json({ error: 'title must be a string', code: 'VALIDATION_ERROR' });
      return;
    }

    if (description !== undefined && description !== null && typeof description !== 'string') {
      res.status(400).json({
        error: 'description must be a string or null when provided',
        code: 'VALIDATION_ERROR',
      });
      return;
    }

    if (startAt !== undefined && (typeof startAt !== 'string' || isNaN(Date.parse(startAt)))) {
      res
        .status(400)
        .json({ error: 'startAt must be a valid ISO date string', code: 'VALIDATION_ERROR' });
      return;
    }

    if (endAt !== undefined && endAt !== null) {
      if (typeof endAt !== 'string' || isNaN(Date.parse(endAt))) {
        res.status(400).json({
          error: 'endAt must be a valid ISO date string or null',
          code: 'VALIDATION_ERROR',
        });
        return;
      }
    }

    try {
      const patch: UpdateEventData = {
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(startAt !== undefined ? { startAt: new Date(startAt) } : {}),
        ...(endAt !== undefined ? { endAt: endAt !== null ? new Date(endAt) : null } : {}),
      };

      const event = await updatePersonalEvent.execute(identity, eventId, patch);
      res.json(event);
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      if (isValidationError(err)) {
        res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
        return;
      }
      if (isConflictError(err)) {
        res.status(409).json({ error: (err as Error).message, code: 'CONFLICT' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // DELETE /api/v1/events/:eventId
  router.delete('/:eventId', async (req: Request, res: Response) => {
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
      await deletePersonalEvent.execute(identity, eventId);
      try {
        await auditLog.record({
          actorId: identity.userId,
          action: 'event.deleted',
          resourceType: 'event',
          resourceId: eventId,
          groupId: null,
        });
      } catch (auditErr) {
        logger.error('Audit log failed for event.deleted', auditErr);
      }
      res.status(204).send();
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // POST /api/v1/events/:eventId/transfer-ownership
  router.post('/:eventId/transfer-ownership', async (req: Request, res: Response) => {
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

    const { newOwnerId } = req.body as { newOwnerId?: unknown };
    if (typeof newOwnerId !== 'string' || !isValidUuid(newOwnerId)) {
      res.status(400).json({ error: 'newOwnerId must be a valid UUID', code: 'VALIDATION_ERROR' });
      return;
    }

    try {
      const result = await transferOwnership.execute(identity, eventId, newOwnerId);
      try {
        await auditLog.record({
          actorId: identity.userId,
          action: 'event.ownership_transferred',
          resourceType: 'event',
          resourceId: eventId,
          metadata: { previousOwnerId: result.previousOwnerId, newOwnerId },
        });
      } catch (auditErr) {
        logger.error('Audit log failed for event.ownership_transferred', auditErr);
      }
      res.json(result.event);
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      if (isValidationError(err)) {
        res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
        return;
      }
      if (isConflictError(err)) {
        res.status(409).json({ error: (err as Error).message, code: 'CONFLICT' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  return router;
}
