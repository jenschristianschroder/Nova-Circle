import express from 'express';
import type { Request, Response } from 'express';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../../event-management/domain/event-invitation.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { EventLocationRepositoryPort } from '../domain/event-location.repository.port.js';
import { GetEventLocationUseCase } from '../application/get-event-location.usecase.js';
import { SetEventLocationUseCase } from '../application/set-event-location.usecase.js';
import { DeleteEventLocationUseCase } from '../application/delete-event-location.usecase.js';
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

export function createEventLocationRouter(
  eventRepo: EventRepositoryPort,
  invitationRepo: EventInvitationRepositoryPort,
  locationRepo: EventLocationRepositoryPort,
  memberRepo: GroupMemberRepositoryPort,
): express.Router {
  const router = express.Router({ mergeParams: true });

  const getLocation = new GetEventLocationUseCase(eventRepo, invitationRepo, locationRepo);
  const setLocation = new SetEventLocationUseCase(
    eventRepo,
    invitationRepo,
    locationRepo,
    memberRepo,
  );
  const deleteLocation = new DeleteEventLocationUseCase(
    eventRepo,
    invitationRepo,
    locationRepo,
    memberRepo,
  );

  // GET /api/v1/events/:eventId/location
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
      const location = await getLocation.execute(identity, eventId);
      res.json({ location });
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // PUT /api/v1/events/:eventId/location
  router.put('/', async (req: Request, res: Response) => {
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

    try {
      const location = await setLocation.execute(identity, eventId, {
        locationType: body['locationType'] as 'physical' | 'virtual' | 'hybrid',
        ...(body['displayText'] !== undefined
          ? { displayText: body['displayText'] as string | null }
          : {}),
        ...(body['streetAddress'] !== undefined
          ? { streetAddress: body['streetAddress'] as string | null }
          : {}),
        ...(body['addressLine2'] !== undefined
          ? { addressLine2: body['addressLine2'] as string | null }
          : {}),
        ...(body['city'] !== undefined ? { city: body['city'] as string | null } : {}),
        ...(body['region'] !== undefined ? { region: body['region'] as string | null } : {}),
        ...(body['postalCode'] !== undefined
          ? { postalCode: body['postalCode'] as string | null }
          : {}),
        ...(body['countryCode'] !== undefined
          ? { countryCode: body['countryCode'] as string | null }
          : {}),
        ...(body['latitude'] !== undefined ? { latitude: body['latitude'] as number | null } : {}),
        ...(body['longitude'] !== undefined
          ? { longitude: body['longitude'] as number | null }
          : {}),
        ...(body['virtualMeetingUrl'] !== undefined
          ? { virtualMeetingUrl: body['virtualMeetingUrl'] as string | null }
          : {}),
        ...(body['virtualPlatform'] !== undefined
          ? { virtualPlatform: body['virtualPlatform'] as string | null }
          : {}),
        ...(body['notes'] !== undefined ? { notes: body['notes'] as string | null } : {}),
      });
      res.json({ location });
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

  // DELETE /api/v1/events/:eventId/location
  router.delete('/', async (req: Request, res: Response) => {
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
      await deleteLocation.execute(identity, eventId);
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

  return router;
}
