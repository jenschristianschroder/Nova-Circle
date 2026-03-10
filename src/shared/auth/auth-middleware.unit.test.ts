import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAuthMiddleware, requireAuth } from './auth-middleware.js';
import type { TokenValidatorPort } from './token-validator.port.js';
import type { IdentityContext } from './identity-context.js';

/** Builds a minimal Express app that uses the given middleware and echoes req.identity. */
function buildTestApp(middleware: ReturnType<typeof createAuthMiddleware>): express.Application {
  const app = express();
  app.use(middleware);
  app.get('/protected', (req, res) => {
    res.json(req.identity ?? null);
  });
  return app;
}

/** Builds a validator that always resolves to the given identity. */
function makeValidator(identity: IdentityContext): TokenValidatorPort {
  return { validate: vi.fn().mockResolvedValue(identity) };
}

/** Builds a validator that always rejects with an error. */
function makeRejectingValidator(): TokenValidatorPort {
  return { validate: vi.fn().mockRejectedValue(new Error('invalid token')) };
}

describe('createAuthMiddleware – test mode (NODE_ENV=test)', () => {
  const originalNodeEnv = process.env['NODE_ENV'];

  beforeEach(() => {
    process.env['NODE_ENV'] = 'test';
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env['NODE_ENV'];
    } else {
      process.env['NODE_ENV'] = originalNodeEnv;
    }
  });

  it('accepts X-Test-User-Id and X-Test-Display-Name and injects identity', async () => {
    const app = buildTestApp(createAuthMiddleware());
    const res = await request(app)
      .get('/protected')
      .set('X-Test-User-Id', 'user-abc')
      .set('X-Test-Display-Name', 'Alice');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: 'user-abc', displayName: 'Alice' });
  });

  it('returns 401 when X-Test-User-Id header is absent', async () => {
    const app = buildTestApp(createAuthMiddleware());
    const res = await request(app).get('/protected').set('X-Test-Display-Name', 'Alice');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('returns 401 when X-Test-Display-Name header is absent', async () => {
    const app = buildTestApp(createAuthMiddleware());
    const res = await request(app).get('/protected').set('X-Test-User-Id', 'user-abc');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('returns 401 when X-Test-User-Id is an empty string', async () => {
    const app = buildTestApp(createAuthMiddleware());
    const res = await request(app)
      .get('/protected')
      .set('X-Test-User-Id', '')
      .set('X-Test-Display-Name', 'Alice');

    expect(res.status).toBe(401);
  });

  it('returns 401 when X-Test-Display-Name is an empty string', async () => {
    const app = buildTestApp(createAuthMiddleware());
    const res = await request(app)
      .get('/protected')
      .set('X-Test-User-Id', 'user-abc')
      .set('X-Test-Display-Name', '');

    expect(res.status).toBe(401);
  });

  it('returns 401 when no auth credentials are provided at all', async () => {
    const app = buildTestApp(createAuthMiddleware());
    const res = await request(app).get('/protected');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  });

  it('test headers take priority over Bearer token when both are present', async () => {
    const identity: IdentityContext = { userId: 'jwt-user', displayName: 'JWT User' };
    const validator = makeValidator(identity);
    const app = buildTestApp(createAuthMiddleware(validator));

    // Both test headers and an Authorization header are supplied in the same request.
    // Test headers must win so the validator is never invoked.
    const res = await request(app)
      .get('/protected')
      .set('X-Test-User-Id', 'test-user')
      .set('X-Test-Display-Name', 'Test User')
      .set('Authorization', 'Bearer some.jwt.token');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ userId: 'test-user', displayName: 'Test User' });
    // The JWT validator should not have been called when test headers are present
    expect(validator.validate).not.toHaveBeenCalled();
  });
});

describe('createAuthMiddleware – with TokenValidatorPort', () => {
  it('validates a Bearer token and injects the resolved identity', async () => {
    const identity: IdentityContext = { userId: 'jwt-user-1', displayName: 'JWT User 1' };
    const validator = makeValidator(identity);
    const app = buildTestApp(createAuthMiddleware(validator));

    const res = await request(app).get('/protected').set('Authorization', 'Bearer valid.jwt.token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(identity);
    expect(validator.validate).toHaveBeenCalledWith('valid.jwt.token');
  });

  it('returns 401 when the validator rejects the token', async () => {
    const validator = makeRejectingValidator();
    const app = buildTestApp(createAuthMiddleware(validator));

    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer invalid.jwt.token');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('returns 401 when Authorization header is missing', async () => {
    const identity: IdentityContext = { userId: 'u', displayName: 'U' };
    const validator = makeValidator(identity);
    const app = buildTestApp(createAuthMiddleware(validator));

    // No test headers, no Authorization header
    const res = await request(app).get('/protected');

    expect(res.status).toBe(401);
  });

  it('returns 401 when Authorization header does not start with "Bearer "', async () => {
    const identity: IdentityContext = { userId: 'u', displayName: 'U' };
    const validator = makeValidator(identity);
    const app = buildTestApp(createAuthMiddleware(validator));

    const res = await request(app).get('/protected').set('Authorization', 'Basic dXNlcjpwYXNz');

    expect(res.status).toBe(401);
    expect(validator.validate).not.toHaveBeenCalled();
  });

  it('passes the token value after "Bearer " to the validator', async () => {
    const identity: IdentityContext = { userId: 'u', displayName: 'U' };
    const validator = makeValidator(identity);
    const app = buildTestApp(createAuthMiddleware(validator));

    await request(app).get('/protected').set('Authorization', 'Bearer my-specific-token');

    expect(validator.validate).toHaveBeenCalledWith('my-specific-token');
  });
});

describe('createAuthMiddleware – production guard', () => {
  it('throws during initialisation when NODE_ENV=production and no validator is supplied', () => {
    const original = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      expect(() => createAuthMiddleware()).toThrow(
        'createAuthMiddleware: a TokenValidatorPort is required in NODE_ENV=production.',
      );
    } finally {
      if (original === undefined) {
        delete process.env['NODE_ENV'];
      } else {
        process.env['NODE_ENV'] = original;
      }
    }
  });

  it('does not throw when NODE_ENV=production and a validator is supplied', () => {
    const original = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      const validator = makeValidator({ userId: 'u', displayName: 'U' });
      expect(() => createAuthMiddleware(validator)).not.toThrow();
    } finally {
      if (original === undefined) {
        delete process.env['NODE_ENV'];
      } else {
        process.env['NODE_ENV'] = original;
      }
    }
  });
});

describe('requireAuth middleware', () => {
  it('calls next when req.identity is set', async () => {
    const app = express();
    app.use((_req, _res, next) => {
      // Manually inject identity to simulate a prior auth middleware
      (_req as express.Request & { identity?: IdentityContext }).identity = {
        userId: 'u-1',
        displayName: 'User One',
      };
      next();
    });
    app.use(requireAuth);
    app.get('/protected', (req, res) => {
      res.json(req.identity ?? null);
    });

    const res = await request(app).get('/protected');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ userId: 'u-1' });
  });

  it('returns 401 when req.identity is not set', async () => {
    const app = express();
    app.use(requireAuth);
    app.get('/protected', (_req, res) => {
      res.json({ ok: true });
    });

    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
