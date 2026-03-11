import express from 'express';
import type { Request, Response } from 'express';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../../event-management/domain/event-invitation.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { EventChatRepositoryPort } from '../domain/event-chat.repository.port.js';
import { ListMessagesUseCase } from '../application/list-messages.usecase.js';
import { PostMessageUseCase } from '../application/post-message.usecase.js';
import { EditMessageUseCase } from '../application/edit-message.usecase.js';
import { DeleteMessageUseCase } from '../application/delete-message.usecase.js';
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

export function createEventChatRouter(
  eventRepo: EventRepositoryPort,
  invitationRepo: EventInvitationRepositoryPort,
  chatRepo: EventChatRepositoryPort,
  memberRepo: GroupMemberRepositoryPort,
): express.Router {
  const router = express.Router({ mergeParams: true });

  const listMessages = new ListMessagesUseCase(eventRepo, invitationRepo, chatRepo);
  const postMessage = new PostMessageUseCase(eventRepo, invitationRepo, chatRepo);
  const editMessage = new EditMessageUseCase(eventRepo, invitationRepo, chatRepo);
  const deleteMessage = new DeleteMessageUseCase(eventRepo, invitationRepo, chatRepo, memberRepo);

  // GET /api/v1/events/:eventId/chat
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

    const { limit, before, after } = req.query as {
      limit?: string;
      before?: string;
      after?: string;
    };

    const parsedLimit = limit !== undefined ? parseInt(limit, 10) : undefined;

    // Reject non-positive or non-numeric limits before hitting the use case.
    if (parsedLimit !== undefined && (isNaN(parsedLimit) || parsedLimit < 1)) {
      res.status(400).json({
        error: 'limit must be a positive integer',
        code: 'VALIDATION_ERROR',
      });
      return;
    }

    try {
      const messages = await listMessages.execute(identity, eventId, {
        ...(parsedLimit !== undefined ? { limit: parsedLimit } : {}),
        ...(before !== undefined ? { before } : {}),
        ...(after !== undefined ? { after } : {}),
      });
      // Mask content of soft-deleted messages – return a placeholder instead of the original text.
      const masked = messages.map((m) =>
        m.deletedAt !== null ? { ...m, content: '[deleted]' } : m,
      );
      res.json({ messages: masked });
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

  // POST /api/v1/events/:eventId/chat
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

    const { content } = req.body as { content?: unknown };
    if (typeof content !== 'string') {
      res.status(400).json({ error: 'content is required', code: 'VALIDATION_ERROR' });
      return;
    }

    try {
      const message = await postMessage.execute(identity, eventId, content);
      res.status(201).json(message);
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

  // PUT /api/v1/events/:eventId/chat/:messageId
  router.put('/:messageId', async (req: Request, res: Response) => {
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

    const messageId = req.params['messageId'] as string;
    if (!isValidUuid(messageId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    const { content } = req.body as { content?: unknown };
    if (typeof content !== 'string') {
      res.status(400).json({ error: 'content is required', code: 'VALIDATION_ERROR' });
      return;
    }

    try {
      const message = await editMessage.execute(identity, eventId, messageId, content);
      res.json(message);
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

  // DELETE /api/v1/events/:eventId/chat/:messageId
  router.delete('/:messageId', async (req: Request, res: Response) => {
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

    const messageId = req.params['messageId'] as string;
    if (!isValidUuid(messageId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    try {
      const message = await deleteMessage.execute(identity, eventId, messageId);
      // Mask content in the delete response – the message is now soft-deleted.
      res.json(message.deletedAt !== null ? { ...message, content: '[deleted]' } : message);
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
        res.status(409).json({ error: (err as Error).message, code: 'CONFLICT' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  return router;
}
