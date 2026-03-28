import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { logger } from '../logger/logger.js';

/** Maximum length the `display_name` column accepts (varchar(100) NOT NULL). */
const MAX_DISPLAY_NAME_LENGTH = 100;

/** Fallback when the JWT displayName is missing or blank after trimming. */
const DEFAULT_DISPLAY_NAME = 'User';

/**
 * Port required by the ensure-profile middleware.
 *
 * Deliberately narrow: a single "insert if missing" operation so the database
 * can enforce existence without a per-request read.
 */
export interface EnsureProfilePort {
  /**
   * Inserts a minimal `user_profiles` row when one does not already exist.
   * If a row with the given `userId` already exists this is a no-op
   * (INSERT … ON CONFLICT DO NOTHING semantics).
   *
   * Returns `true` when a new row was actually inserted.
   */
  ensureExists(data: {
    userId: string;
    displayName: string;
    avatarUrl: string | null;
  }): Promise<boolean>;
}

/**
 * Normalizes a raw JWT display name so it is safe for the `display_name`
 * column (varchar(100) NOT NULL): trims whitespace, truncates to 100 chars,
 * and falls back to a safe default when the result would be empty.
 */
export function normalizeDisplayName(raw: string): string {
  const trimmed = raw.trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
  return trimmed.length > 0 ? trimmed : DEFAULT_DISPLAY_NAME;
}

/**
 * Express middleware that guarantees a `user_profiles` row exists for the
 * authenticated caller before any downstream handler runs.
 *
 * When `req.identity` is set (i.e. after the auth middleware) the middleware
 * issues a single INSERT … ON CONFLICT DO NOTHING statement so the database
 * enforces existence without a preceding SELECT on every request.
 *
 * The displayName is normalised (trimmed, truncated to 100 chars, safe
 * fallback) before insertion to match the DB schema constraints.
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
      const created = await profilePort.ensureExists({
        userId: identity.userId,
        displayName: normalizeDisplayName(identity.displayName),
        avatarUrl: null,
      });
      if (created) {
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
