import express from 'express';
import type { Request, Response } from 'express';
import type { EventCreationPort } from '../domain/event-creation.port.js';
import type { EventRepositoryPort } from '../domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../domain/event-invitation.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import { CreateEventUseCase } from '../application/create-event.usecase.js';
import { GetEventUseCase } from '../application/get-event.usecase.js';
import { ListGroupEventsUseCase } from '../application/list-group-events.usecase.js';
import { CancelEventUseCase } from '../application/cancel-event.usecase.js';
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

function isConflictError(err: unknown): boolean {
  return err instanceof Error && (err as Error & { code?: string }).code === 'CONFLICT';
}

export function createEventRouter(
  eventCreator: EventCreationPort,
  eventRepo: EventRepositoryPort,
  invitationRepo: EventInvitationRepositoryPort,
  memberRepo: GroupMemberRepositoryPort,
): express.Router {
  const router = express.Router({ mergeParams: true });

  const createEvent = new CreateEventUseCase(eventCreator, memberRepo);
  const getEvent = new GetEventUseCase(eventRepo, invitationRepo);
  const listGroupEvents = new ListGroupEventsUseCase(eventRepo, memberRepo);
  const cancelEvent = new CancelEventUseCase(eventRepo, invitationRepo, memberRepo);

  // POST /api/v1/groups/:groupId/events
  router.post('/', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const groupId = req.params['groupId'] as string;
    if (!isValidUuid(groupId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    const { title, description, startAt, endAt, excludeUserIds } = req.body as {
      title?: unknown;
      description?: unknown;
      startAt?: unknown;
      endAt?: unknown;
      excludeUserIds?: unknown;
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

    const resolvedExclude = Array.isArray(excludeUserIds)
      ? (excludeUserIds as unknown[]).filter((v): v is string => typeof v === 'string')
      : null;

    if (resolvedExclude !== null) {
      const hasInvalidId = resolvedExclude.some((id) => !isValidUuid(id));
      if (hasInvalidId) {
        res.status(400).json({
          error: 'excludeUserIds must contain only valid UUIDs',
          code: 'VALIDATION_ERROR',
        });
        return;
      }
    }

    try {
      const event = await createEvent.execute(identity, {
        groupId,
        title,
        description: typeof description === 'string' ? description : null,
        startAt: new Date(startAt),
        endAt: parsedEndAt,
        ...(resolvedExclude !== null ? { excludeUserIds: resolvedExclude } : {}),
      });
      res.status(201).json(event);
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

  // GET /api/v1/groups/:groupId/events
  router.get('/', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const groupId = req.params['groupId'] as string;
    if (!isValidUuid(groupId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    try {
      const events = await listGroupEvents.execute(identity, groupId);
      res.json(events);
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // GET /api/v1/groups/:groupId/events/:eventId
  router.get('/:eventId', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const groupId = req.params['groupId'] as string;
    if (!isValidUuid(groupId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    const eventId = req.params['eventId'] as string;
    if (!isValidUuid(eventId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    try {
      const event = await getEvent.execute(identity, eventId);
      // Ensure the event belongs to the group in the URL.
      if (event.groupId !== groupId) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      res.json(event);
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // DELETE /api/v1/groups/:groupId/events/:eventId
  router.delete('/:eventId', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const groupId = req.params['groupId'] as string;
    if (!isValidUuid(groupId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    const eventId = req.params['eventId'] as string;
    if (!isValidUuid(eventId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    try {
      await cancelEvent.execute(identity, groupId, eventId);
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
      if (isConflictError(err)) {
        res.status(409).json({ error: 'Event is already cancelled', code: 'CONFLICT' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  return router;
}
