import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { TokenValidatorPort } from './token-validator.port.js';
import { logger } from '../logger/logger.js';

/**
 * Decode a JWT payload without verifying the signature.
 * Used ONLY for diagnostic logging when token validation fails.
 * Returns a partial record of safe-to-log claims, or undefined on parse error.
 */
function decodeTokenClaimsForDiagnostics(token: string): Record<string, unknown> | undefined {
  try {
    const parts = token.split('.');
    if (parts.length < 2 || !parts[1]) return undefined;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf-8');
    const payload: Record<string, unknown> = JSON.parse(json) as Record<string, unknown>;
    // Return only non-sensitive claims useful for debugging audience / issuer mismatches.
    return {
      aud: payload['aud'],
      iss: payload['iss'],
      scp: payload['scp'],
      roles: payload['roles'],
      azp: payload['azp'],
      appid: payload['appid'],
      exp: payload['exp'],
      nbf: payload['nbf'],
      iat: payload['iat'],
      tid: payload['tid'],
      ver: payload['ver'],
    };
  } catch {
    return undefined;
  }
}

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
  // In production, a real validator is mandatory to prevent accidental misconfiguration.
  // Development environments may omit it and rely on test-header auth or local JWT setup.
  if (process.env['NODE_ENV'] === 'production' && !validator) {
    throw new Error(
      'createAuthMiddleware: a TokenValidatorPort is required in NODE_ENV=production.',
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
      } catch (err: unknown) {
        const tokenClaims = decodeTokenClaimsForDiagnostics(authHeader.slice(7));
        logger.warn('Token validation failed', {
          error: err instanceof Error ? err.message : String(err),
          tokenClaims,
          path: req.path,
        });
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
