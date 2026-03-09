import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { TokenValidatorPort } from './token-validator.port.js';

/**
 * Creates Express middleware that resolves caller identity and attaches it to
 * `req.identity`.
 *
 * In test mode (NODE_ENV=test) it accepts synthetic identity via
 * `X-Test-User-Id` / `X-Test-Display-Name` headers, which avoids the need to
 * sign real JWTs in automated tests.
 *
 * In all other modes a `TokenValidatorPort` must be provided; the middleware
 * validates the Bearer token from the Authorization header.
 *
 * Throws during initialisation if a validator is not supplied outside test mode
 * to prevent silent misconfiguration in production.
 *
 * Returns 401 with a structured JSON body on any auth failure.
 */
export function createAuthMiddleware(validator?: TokenValidatorPort): RequestHandler {
  const isTestMode = process.env['NODE_ENV'] === 'test';
  if (!isTestMode && !validator) {
    throw new Error(
      'createAuthMiddleware: a TokenValidatorPort is required when NODE_ENV is not "test".',
    );
  }
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (isTestMode) {
      const userId = req.headers['x-test-user-id'];
      const displayName = req.headers['x-test-display-name'];
      if (
        typeof userId === 'string' &&
        userId.length > 0 &&
        typeof displayName === 'string' &&
        displayName.length > 0
      ) {
        req.identity = { userId, displayName };
        next();
        return;
      }
    }

    if (validator) {
      const authHeader = req.headers['authorization'];
      if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
        return;
      }
      try {
        const token = authHeader.slice(7);
        req.identity = await validator.validate(token);
        next();
        return;
      } catch {
        res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
        return;
      }
    }

    res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  };
}

/**
 * Express middleware that rejects requests without a resolved identity.
 * Mount *after* `createAuthMiddleware` on protected routes.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.identity) {
    res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    return;
  }
  next();
}
