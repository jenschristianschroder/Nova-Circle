import express from 'express';
import multer from 'multer';
import type { Request, Response } from 'express';
import type { EventDraftRepositoryPort } from '../domain/event-draft.repository.port.js';
import type { EventCreationPort } from '../../event-management/domain/event-creation.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { IEventFieldExtractor } from '../application/event-field-extractor.port.js';
import type { ISpeechToTextAdapter } from '../application/speech-to-text.port.js';
import type { IImageExtractionAdapter } from '../application/image-extraction.port.js';
import type { IBlobStorageAdapter } from '../application/blob-storage.port.js';
import { CapturePipelineService } from '../application/capture-pipeline.service.js';
import { CaptureTextUseCase } from '../application/capture-text.usecase.js';
import { CaptureVoiceUseCase } from '../application/capture-voice.usecase.js';
import { CaptureImageUseCase } from '../application/capture-image.usecase.js';
import { GetDraftUseCase } from '../application/get-draft.usecase.js';
import { ListDraftsUseCase } from '../application/list-drafts.usecase.js';
import { UpdateDraftUseCase } from '../application/update-draft.usecase.js';
import { PromoteDraftUseCase } from '../application/promote-draft.usecase.js';
import { AbandonDraftUseCase } from '../application/abandon-draft.usecase.js';
import { isValidUuid } from '../../../shared/validation/uuid.js';

/** Allowed image MIME types for event capture. */
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
]);

/** Maximum allowed upload size for image captures (10 MB). */
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

function isNotFoundError(err: unknown): boolean {
  return err instanceof Error && (err as Error & { code?: string }).code === 'NOT_FOUND';
}

function isValidationError(err: unknown): boolean {
  return err instanceof Error && (err as Error & { code?: string }).code === 'VALIDATION_ERROR';
}

function isConflictError(err: unknown): boolean {
  return err instanceof Error && (err as Error & { code?: string }).code === 'CONFLICT';
}

/**
 * Returns the trimmed groupId if it is a valid UUID, null if absent or blank.
 * Throws VALIDATION_ERROR when a non-empty, non-UUID value is provided so callers
 * receive a 400 rather than a PostgreSQL cast error (500).
 */
function resolveOptionalGroupId(groupId: unknown): string | null {
  if (typeof groupId !== 'string') {
    return null;
  }
  const trimmed = groupId.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (!isValidUuid(trimmed)) {
    throw Object.assign(new Error('groupId must be a valid UUID'), { code: 'VALIDATION_ERROR' });
  }
  return trimmed;
}

export function createCaptureRouter(
  draftRepo: EventDraftRepositoryPort,
  eventCreator: EventCreationPort,
  memberRepo: GroupMemberRepositoryPort,
  extractor: IEventFieldExtractor,
  sttAdapter: ISpeechToTextAdapter,
  imageAdapter: IImageExtractionAdapter,
  blobStorage: IBlobStorageAdapter,
): express.Router {
  const router = express.Router();

  // Multer: store uploaded image in memory so we can forward the buffer to the blob adapter.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
        cb(null, true);
      } else {
        cb(Object.assign(new Error('Unsupported image type'), { code: 'VALIDATION_ERROR' }));
      }
    },
  });

  const pipeline = new CapturePipelineService(extractor, draftRepo, eventCreator, memberRepo);

  const captureText = new CaptureTextUseCase(pipeline);
  const captureVoice = new CaptureVoiceUseCase(sttAdapter, pipeline);
  const captureImage = new CaptureImageUseCase(imageAdapter, pipeline);
  const getDraft = new GetDraftUseCase(draftRepo);
  const listDrafts = new ListDraftsUseCase(draftRepo);
  const updateDraft = new UpdateDraftUseCase(draftRepo, pipeline);
  const promoteDraft = new PromoteDraftUseCase(draftRepo, eventCreator, memberRepo);
  const abandonDraft = new AbandonDraftUseCase(draftRepo);

  // POST /api/v1/capture/text
  router.post('/text', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const { text, groupId } = req.body as { text?: unknown; groupId?: unknown };
    if (typeof text !== 'string') {
      res.status(400).json({ error: 'text is required', code: 'VALIDATION_ERROR' });
      return;
    }

    try {
      const resolvedGroupId = resolveOptionalGroupId(groupId);
      const result = await captureText.execute(identity, { text, groupId: resolvedGroupId });
      if (result.type === 'event') {
        res.status(201).json({ type: 'event', eventId: result.eventId });
      } else {
        res.status(202).json({ type: 'draft', draft: result.draft });
      }
    } catch (err: unknown) {
      if (isValidationError(err)) {
        res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // POST /api/v1/capture/voice
  router.post('/voice', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const { audioBlobUri, groupId } = req.body as { audioBlobUri?: unknown; groupId?: unknown };
    if (typeof audioBlobUri !== 'string') {
      res.status(400).json({ error: 'audioBlobUri is required', code: 'VALIDATION_ERROR' });
      return;
    }

    try {
      const resolvedGroupId = resolveOptionalGroupId(groupId);
      const result = await captureVoice.execute(identity, {
        audioBlobUri,
        groupId: resolvedGroupId,
      });
      if (result.type === 'event') {
        res.status(201).json({ type: 'event', eventId: result.eventId });
      } else {
        res.status(202).json({ type: 'draft', draft: result.draft });
      }
    } catch (err: unknown) {
      if (isValidationError(err)) {
        res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // POST /api/v1/capture/image
  // Accepts a multipart form upload with an `image` file field and an optional `groupId` field.
  // The image is securely stored via the blob storage adapter before extraction begins.
  router.post('/image', upload.single('image'), async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'image file is required', code: 'VALIDATION_ERROR' });
      return;
    }

    try {
      const resolvedGroupId = resolveOptionalGroupId(
        (req.body as Record<string, unknown>)['groupId'],
      );

      // Step 1: Store the image securely via the blob storage adapter.
      const imageBlobUri = await blobStorage.store(
        file.buffer,
        file.mimetype,
        file.originalname,
      );

      // Steps 2–6 are handled by the use case and the shared pipeline.
      const result = await captureImage.execute(identity, {
        imageBlobUri,
        groupId: resolvedGroupId,
      });

      if (result.type === 'event') {
        res.status(201).json({ type: 'event', eventId: result.eventId });
      } else {
        res.status(202).json({ type: 'draft', draft: result.draft });
      }
    } catch (err: unknown) {
      if (isValidationError(err)) {
        res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // GET /api/v1/capture/drafts
  router.get('/drafts', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    try {
      const drafts = await listDrafts.execute(identity);
      res.json({ drafts });
    } catch {
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // GET /api/v1/capture/drafts/:draftId
  router.get('/drafts/:draftId', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const draftId = req.params['draftId'] as string;
    if (!isValidUuid(draftId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    try {
      const draft = await getDraft.execute(identity, draftId);
      res.json(draft);
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // PUT /api/v1/capture/drafts/:draftId
  router.put('/drafts/:draftId', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const draftId = req.params['draftId'] as string;
    if (!isValidUuid(draftId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    const { groupId, title, description, startAt, endAt } = req.body as {
      groupId?: unknown;
      title?: unknown;
      description?: unknown;
      startAt?: unknown;
      endAt?: unknown;
    };

    try {
      const draft = await updateDraft.execute(identity, {
        draftId,
        ...(groupId !== undefined ? { groupId: resolveOptionalGroupId(groupId) } : {}),
        ...(title !== undefined ? { title: typeof title === 'string' ? title : null } : {}),
        ...(description !== undefined
          ? { description: typeof description === 'string' ? description : null }
          : {}),
        ...(startAt !== undefined ? { startAt: typeof startAt === 'string' ? startAt : null } : {}),
        ...(endAt !== undefined ? { endAt: typeof endAt === 'string' ? endAt : null } : {}),
      });
      res.json(draft);
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      if (isConflictError(err)) {
        res.status(409).json({ error: (err as Error).message, code: 'CONFLICT' });
        return;
      }
      if (isValidationError(err)) {
        res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // POST /api/v1/capture/drafts/:draftId/promote
  router.post('/drafts/:draftId/promote', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const draftId = req.params['draftId'] as string;
    if (!isValidUuid(draftId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    try {
      const result = await promoteDraft.execute(identity, draftId);
      res.status(201).json({ eventId: result.eventId });
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      if (isConflictError(err)) {
        res.status(409).json({ error: (err as Error).message, code: 'CONFLICT' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // DELETE /api/v1/capture/drafts/:draftId
  router.delete('/drafts/:draftId', async (req: Request, res: Response) => {
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const draftId = req.params['draftId'] as string;
    if (!isValidUuid(draftId)) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    try {
      const draft = await abandonDraft.execute(identity, draftId);
      res.json(draft);
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
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
