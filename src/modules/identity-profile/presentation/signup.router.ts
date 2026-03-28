import express from 'express';
import type { Request, Response } from 'express';
import type { UserProfileRepositoryPort } from '../domain/user-profile.repository.port.js';
import { SignUpUseCase, AlreadyRegisteredError } from '../application/sign-up.usecase.js';

export function createSignupRouter(repo: UserProfileRepositoryPort): express.Router {
  const router = express.Router();
  const signUp = new SignUpUseCase(repo);

  router.post('/', async (req: Request, res: Response) => {
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
      const profile = await signUp.execute(identity, {
        displayName,
        avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : null,
      });
      res.status(201).json(profile);
    } catch (err: unknown) {
      if (err instanceof AlreadyRegisteredError) {
        res.status(409).json({ error: 'User is already registered', code: 'ALREADY_REGISTERED' });
        return;
      }
      const message = err instanceof Error ? err.message : 'Invalid input';
      res.status(400).json({ error: message, code: 'VALIDATION_ERROR' });
    }
  });

  return router;
}
