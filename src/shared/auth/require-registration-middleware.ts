import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { logger } from '../logger/logger.js';

/**
 * Port required by the require-registration middleware.
 *
 * Deliberately narrow: a single existence check so the middleware can
 * determine whether the authenticated user has completed sign-up.
 */
export interface CheckRegistrationPort {
  /**
   * Returns `true` when a `user_profiles` row exists for the given userId.
   */
  exists(userId: string): Promise<boolean>;
}

/**
 * Express middleware that gates access to protected API routes behind
 * explicit user registration.
 *
 * After the auth middleware sets `req.identity`, this middleware checks
 * whether the authenticated user has a `user_profiles` row.  If no row
 * exists — i.e. the user has not signed up — the request is rejected
 * with 403 and a machine-readable `REGISTRATION_REQUIRED` code.
 *
 * Certain paths are exempt from the registration check so that
 * authenticated-but-unregistered users can still:
 *  - probe their own profile (GET /profile/me → 404 signals "not registered")
 *  - complete sign-up        (POST /signup)
 */
export function createRequireRegistrationMiddleware(
  port: CheckRegistrationPort,
  exemptMatchers: { method: string; pathPrefix: string }[] = [],
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const identity = req.identity;
    if (!identity) {
      // No identity — let downstream auth guards handle the 401.
      next();
      return;
    }

    // Check exempt paths before hitting the database.
    for (const exempt of exemptMatchers) {
      if (req.method === exempt.method && req.path.startsWith(exempt.pathPrefix)) {
        next();
        return;
      }
    }

    try {
      const registered = await port.exists(identity.userId);
      if (!registered) {
        res.status(403).json({
          error: 'Registration required',
          code: 'REGISTRATION_REQUIRED',
        });
        return;
      }
    } catch (err: unknown) {
      // A transient DB failure should not silently let unregistered users
      // through.  Return 503 and log the error.
      logger.error('Failed to check user registration', err, { userId: identity.userId });
      res.status(503).json({
        error: 'Service temporarily unavailable',
        code: 'SERVICE_UNAVAILABLE',
      });
      return;
    }

    next();
  };
}
