import express from 'express';
import type { Request, Response } from 'express';
import type { UserProfileRepositoryPort } from '../domain/user-profile.repository.port.js';
import { GetMyProfileUseCase } from '../application/get-my-profile.usecase.js';
import { UpsertMyProfileUseCase } from '../application/upsert-my-profile.usecase.js';

export function createProfileRouter(repo: UserProfileRepositoryPort): express.Router {
  const router = express.Router();
  const getProfile = new GetMyProfileUseCase(repo);
  const upsertProfile = new UpsertMyProfileUseCase(repo);

  router.get('/me', async (req: Request, res: Response) => {
    // Defensive check: createAuthMiddleware always sets req.identity before this
    // handler runs, but we guard here to satisfy TypeScript and provide a safe
    // fallback if the middleware is ever misconfigured.
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const profile = await getProfile.execute(identity);
    if (!profile) {
      res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
      return;
    }

    res.json(profile);
  });

  router.put('/me', async (req: Request, res: Response) => {
    // Defensive check: see GET /me handler above.
    const identity = req.identity;
    if (!identity) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const { displayName, avatarUrl } = req.body as {
      displayName?: unknown;
      avatarUrl?: unknown;
    };

    if (typeof displayName !== 'string') {
      res.status(400).json({ error: 'displayName is required', code: 'VALIDATION_ERROR' });
      return;
    }

    try {
      const profile = await upsertProfile.execute(identity, {
        displayName,
        avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : null,
      });
      res.json(profile);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid input';
      res.status(400).json({ error: message, code: 'VALIDATION_ERROR' });
    }
  });

  return router;
}
