import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { logger } from '../logger/logger.js';

/**
 * Port required by the ensure-profile middleware.
 *
 * Deliberately narrow: only the two operations the middleware needs, so it
 * does not couple to the full UserProfileRepositoryPort.
 */
export interface EnsureProfilePort {
  findById(id: string): Promise<{ id: string } | null>;
  upsert(data: { userId: string; displayName: string; avatarUrl: string | null }): Promise<unknown>;
}

/**
 * Express middleware that guarantees a `user_profiles` row exists for the
 * authenticated caller before any downstream handler runs.
 *
 * When `req.identity` is set (i.e. after the auth middleware) the middleware
 * checks for an existing profile and creates a minimal one when missing.
 * The upsert uses the identity's `displayName` (from the JWT) and a null
 * avatar — the user can update their profile later via PUT /api/v1/profile/me.
 *
 * This prevents foreign-key violations on tables like `groups` and
 * `group_members` that reference `user_profiles.id`.
 */
export function createEnsureProfileMiddleware(profilePort: EnsureProfilePort): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const identity = req.identity;
    if (!identity) {
      // No identity yet — nothing to provision. Let downstream auth guards
      // handle the 401.
      next();
      return;
    }

    try {
      const existing = await profilePort.findById(identity.userId);
      if (!existing) {
        await profilePort.upsert({
          userId: identity.userId,
          displayName: identity.displayName,
          avatarUrl: null,
        });
        logger.info('Auto-provisioned user profile', { userId: identity.userId });
      }
    } catch (err: unknown) {
      // Log but do not block the request — a transient DB hiccup should not
      // turn every authenticated call into a 500.  The downstream handler
      // will fail with a clear FK error if the profile truly could not be
      // created.
      logger.error('Failed to ensure user profile', err, { userId: identity.userId });
    }

    next();
  };
}
