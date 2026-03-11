import express from 'express';
import type { Request, Response } from 'express';
import type { EventCreationPort } from '../domain/event-creation.port.js';
import type { EventRepositoryPort } from '../domain/event.repository.port.js';
import type { UpdateEventData } from '../domain/event.js';
import type { EventInvitationRepositoryPort } from '../domain/event-invitation.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { AuditLogPort } from '../../audit-security/index.js';
import { CreateEventUseCase } from '../application/create-event.usecase.js';
import { GetEventUseCase } from '../application/get-event.usecase.js';
import { ListGroupEventsUseCase } from '../application/list-group-events.usecase.js';
import { CancelEventUseCase } from '../application/cancel-event.usecase.js';
import { UpdateEventUseCase } from '../application/update-event.usecase.js';
import { ListEventInviteesUseCase } from '../application/list-event-invitees.usecase.js';
import { AddEventInviteeUseCase } from '../application/add-event-invitee.usecase.js';
import { RemoveEventInviteeUseCase } from '../application/remove-event-invitee.usecase.js';
import { isValidUuid } from '../../../shared/validation/uuid.js';
import { logger } from '../../../shared/logger/logger.js';

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
  auditLog: AuditLogPort,
): express.Router {
  const router = express.Router({ mergeParams: true });

  const createEvent = new CreateEventUseCase(eventCreator, memberRepo);
  const getEvent = new GetEventUseCase(eventRepo, invitationRepo);
  const listGroupEvents = new ListGroupEventsUseCase(eventRepo, memberRepo);
  const cancelEvent = new CancelEventUseCase(eventRepo, invitationRepo, memberRepo);
  const updateEvent = new UpdateEventUseCase(eventRepo, invitationRepo, memberRepo);
  const listInvitees = new ListEventInviteesUseCase(eventRepo, invitationRepo);
  const addInvitee = new AddEventInviteeUseCase(eventRepo, invitationRepo, memberRepo, auditLog);
  const removeInvitee = new RemoveEventInviteeUseCase(
    eventRepo,
    invitationRepo,
    memberRepo,
    auditLog,
  );

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
      try {
        await auditLog.record({
          actorId: identity.userId,
          action: 'event.created',
          resourceType: 'event',
          resourceId: event.id,
          groupId,
        });
      } catch (auditErr) {
        logger.error('Audit log failed for event.created', auditErr);
      }
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

  // PATCH /api/v1/groups/:groupId/events/:eventId
  router.patch('/:eventId', async (req: Request, res: Response) => {
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

      const event = await updateEvent.execute(identity, groupId, eventId, patch);
      res.json(event);
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
      if (isConflictError(err)) {
        res.status(409).json({ error: (err as Error).message, code: 'CONFLICT' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // POST /api/v1/groups/:groupId/events/:eventId/cancel
  router.post('/:eventId/cancel', async (req: Request, res: Response) => {
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
      try {
        await auditLog.record({
          actorId: identity.userId,
          action: 'event.cancelled',
          resourceType: 'event',
          resourceId: eventId,
          groupId,
        });
      } catch (auditErr) {
        logger.error('Audit log failed for event.cancelled', auditErr);
      }
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
      try {
        await auditLog.record({
          actorId: identity.userId,
          action: 'event.cancelled',
          resourceType: 'event',
          resourceId: eventId,
          groupId,
        });
      } catch (auditErr) {
        logger.error('Audit log failed for event.cancelled', auditErr);
      }
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

  // GET /api/v1/groups/:groupId/events/:eventId/invitations
  router.get('/:eventId/invitations', async (req: Request, res: Response) => {
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
      const invitations = await listInvitees.execute(identity, groupId, eventId);
      res.json(invitations);
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // POST /api/v1/groups/:groupId/events/:eventId/invitations
  router.post('/:eventId/invitations', async (req: Request, res: Response) => {
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

    const { userId } = req.body as { userId?: unknown };
    if (typeof userId !== 'string' || !isValidUuid(userId)) {
      res.status(400).json({ error: 'userId must be a valid UUID', code: 'VALIDATION_ERROR' });
      return;
    }

    try {
      const invitation = await addInvitee.execute(identity, groupId, eventId, userId);
      res.status(201).json(invitation);
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
      if (isConflictError(err)) {
        res.status(409).json({ error: (err as Error).message, code: 'CONFLICT' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // DELETE /api/v1/groups/:groupId/events/:eventId/invitations/:userId
  router.delete('/:eventId/invitations/:userId', async (req: Request, res: Response) => {
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

    const targetUserId = req.params['userId'] as string;
    if (!isValidUuid(targetUserId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    try {
      await removeInvitee.execute(identity, groupId, eventId, targetUserId);
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
      if (isValidationError(err)) {
        res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  return router;
}
