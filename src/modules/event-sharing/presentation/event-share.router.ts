import express from 'express';
import type { Request, Response } from 'express';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { EventShareRepositoryPort } from '../domain/event-share.repository.port.js';
import type { AuditLogPort } from '../../audit-security/domain/audit-log.port.js';
import type { VisibilityLevel } from '../domain/event-share.js';
import { ShareEventToGroupUseCase } from '../application/share-event-to-group.usecase.js';
import { UpdateEventShareUseCase } from '../application/update-event-share.usecase.js';
import { RevokeEventShareUseCase } from '../application/revoke-event-share.usecase.js';
import { ListEventSharesUseCase } from '../application/list-event-shares.usecase.js';
import { isValidUuid } from '../../../shared/validation/uuid.js';
import { logger } from '../../../shared/logger/logger.js';

const VALID_VISIBILITY_LEVELS: ReadonlySet<string> = new Set(['busy', 'title', 'details']);

function isNotFoundError(err: unknown): boolean {
  return err instanceof Error && (err as Error & { code?: string }).code === 'NOT_FOUND';
}

function isForbiddenError(err: unknown): boolean {
  return err instanceof Error && (err as Error & { code?: string }).code === 'FORBIDDEN';
}

function isConflictError(err: unknown): boolean {
  return err instanceof Error && (err as Error & { code?: string }).code === 'CONFLICT';
}

export function createEventShareRouter(
  eventRepo: EventRepositoryPort,
  memberRepo: GroupMemberRepositoryPort,
  shareRepo: EventShareRepositoryPort,
  auditLog: AuditLogPort,
): express.Router {
  const router = express.Router({ mergeParams: true });

  const shareEvent = new ShareEventToGroupUseCase(eventRepo, memberRepo, shareRepo);
  const updateShare = new UpdateEventShareUseCase(eventRepo, shareRepo);
  const revokeShare = new RevokeEventShareUseCase(eventRepo, shareRepo);
  const listShares = new ListEventSharesUseCase(eventRepo, shareRepo);

  // POST /api/v1/events/:eventId/shares
  router.post('/', async (req: Request, res: Response) => {
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

    const body = req.body as Record<string, unknown>;
    const groupId = body['groupId'];
    const visibilityLevel = body['visibilityLevel'];

    if (typeof groupId !== 'string' || !isValidUuid(groupId)) {
      res.status(400).json({ error: 'groupId must be a valid UUID', code: 'VALIDATION_ERROR' });
      return;
    }

    if (typeof visibilityLevel !== 'string' || !VALID_VISIBILITY_LEVELS.has(visibilityLevel)) {
      res.status(400).json({
        error: 'visibilityLevel must be one of: busy, title, details',
        code: 'VALIDATION_ERROR',
      });
      return;
    }

    try {
      const share = await shareEvent.execute(
        identity,
        eventId,
        groupId,
        visibilityLevel as VisibilityLevel,
      );

      auditLog
        .record({
          actorId: identity.userId,
          action: 'event_share.created',
          resourceType: 'event_share',
          resourceId: share.id,
          groupId,
          metadata: { eventId, visibilityLevel },
        })
        .catch((err) => logger.error('Failed to record audit log', err));

      res.status(201).json(share);
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      if (isForbiddenError(err)) {
        res.status(403).json({ error: (err as Error).message, code: 'FORBIDDEN' });
        return;
      }
      if (isConflictError(err)) {
        res.status(409).json({ error: (err as Error).message, code: 'CONFLICT' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // GET /api/v1/events/:eventId/shares
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
      const shares = await listShares.execute(identity, eventId);
      res.json({ shares });
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      if (isForbiddenError(err)) {
        res.status(403).json({ error: (err as Error).message, code: 'FORBIDDEN' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // PATCH /api/v1/events/:eventId/shares/:shareId
  router.patch('/:shareId', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const eventId = req.params['eventId'] as string;
    const shareId = req.params['shareId'] as string;
    if (!isValidUuid(eventId) || !isValidUuid(shareId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const visibilityLevel = body['visibilityLevel'];

    if (typeof visibilityLevel !== 'string' || !VALID_VISIBILITY_LEVELS.has(visibilityLevel)) {
      res.status(400).json({
        error: 'visibilityLevel must be one of: busy, title, details',
        code: 'VALIDATION_ERROR',
      });
      return;
    }

    try {
      const share = await updateShare.execute(
        identity,
        eventId,
        shareId,
        visibilityLevel as VisibilityLevel,
      );

      auditLog
        .record({
          actorId: identity.userId,
          action: 'event_share.updated',
          resourceType: 'event_share',
          resourceId: share.id,
          groupId: share.groupId,
          metadata: { eventId, visibilityLevel },
        })
        .catch((err) => logger.error('Failed to record audit log', err));

      res.json(share);
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      if (isForbiddenError(err)) {
        res.status(403).json({ error: (err as Error).message, code: 'FORBIDDEN' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // DELETE /api/v1/events/:eventId/shares/:shareId
  router.delete('/:shareId', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const eventId = req.params['eventId'] as string;
    const shareId = req.params['shareId'] as string;
    if (!isValidUuid(eventId) || !isValidUuid(shareId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    try {
      // Fetch share before deletion for audit logging
      const share = await shareRepo.findById(shareId);

      await revokeShare.execute(identity, eventId, shareId);

      auditLog
        .record({
          actorId: identity.userId,
          action: 'event_share.revoked',
          resourceType: 'event_share',
          resourceId: shareId,
          groupId: share?.groupId ?? null,
          metadata: { eventId },
        })
        .catch((err) => logger.error('Failed to record audit log', err));

      res.status(204).send();
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      if (isForbiddenError(err)) {
        res.status(403).json({ error: (err as Error).message, code: 'FORBIDDEN' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  return router;
}
