import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  createRequireRegistrationMiddleware,
  type CheckRegistrationPort,
} from './require-registration-middleware.js';
import type { IdentityContext } from './identity-context.js';

/**
 * Builds a minimal Express app that:
 * 1. optionally injects req.identity via a preceding middleware
 * 2. runs the require-registration middleware
 * 3. echoes a 200 response so we can assert the middleware's behavior
 *
 * The app is mounted at / so req.path reflects the full path.
 */
function buildTestApp(
  port: CheckRegistrationPort,
  identity?: IdentityContext,
  exemptMatchers?: { method: string; pathPrefix: string }[],
): express.Application {
  const app = express();
  if (identity) {
    app.use((_req, _res, next) => {
      _req.identity = identity;
      next();
    });
  }
  app.use(createRequireRegistrationMiddleware(port, exemptMatchers));
  app.get('/profile/me', (_req, res) => {
    res.json({ ok: true, path: 'profile-me' });
  });
  app.post('/signup', (_req, res) => {
    res.json({ ok: true, path: 'signup' });
  });
  app.get('/groups', (_req, res) => {
    res.json({ ok: true, path: 'groups' });
  });
  return app;
}

function makePort(overrides?: Partial<CheckRegistrationPort>): CheckRegistrationPort {
  return {
    exists: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

// ── createRequireRegistrationMiddleware ────────────────────────────────────

describe('createRequireRegistrationMiddleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls next without checking registration when req.identity is not set', async () => {
    const port = makePort();
    const app = buildTestApp(port); // no identity
    const res = await request(app).get('/groups');

    expect(res.status).toBe(200);
    expect(port.exists).not.toHaveBeenCalled();
  });

  it('allows registered users to access protected endpoints', async () => {
    const identity: IdentityContext = { userId: 'user-1', displayName: 'Alice' };
    const port = makePort({ exists: vi.fn().mockResolvedValue(true) });
    const app = buildTestApp(port, identity);
    const res = await request(app).get('/groups');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ path: 'groups' });
    expect(port.exists).toHaveBeenCalledWith('user-1');
  });

  it('returns 403 REGISTRATION_REQUIRED for unregistered users on protected endpoints', async () => {
    const identity: IdentityContext = { userId: 'user-2', displayName: 'Bob' };
    const port = makePort({ exists: vi.fn().mockResolvedValue(false) });
    const app = buildTestApp(port, identity);
    const res = await request(app).get('/groups');

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      error: 'Registration required',
      code: 'REGISTRATION_REQUIRED',
    });
  });

  it('exempts GET /profile/me for unregistered users', async () => {
    const identity: IdentityContext = { userId: 'user-3', displayName: 'Carol' };
    const port = makePort({ exists: vi.fn().mockResolvedValue(false) });
    const app = buildTestApp(port, identity, [
      { method: 'GET', pathPrefix: '/profile/me' },
    ]);
    const res = await request(app).get('/profile/me');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ path: 'profile-me' });
    expect(port.exists).not.toHaveBeenCalled();
  });

  it('exempts POST /signup for unregistered users', async () => {
    const identity: IdentityContext = { userId: 'user-4', displayName: 'Dave' };
    const port = makePort({ exists: vi.fn().mockResolvedValue(false) });
    const app = buildTestApp(port, identity, [
      { method: 'POST', pathPrefix: '/signup' },
    ]);
    const res = await request(app).post('/signup');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ path: 'signup' });
    expect(port.exists).not.toHaveBeenCalled();
  });

  it('does not exempt non-matching methods on exempt paths', async () => {
    const identity: IdentityContext = { userId: 'user-5', displayName: 'Eve' };
    const port = makePort({ exists: vi.fn().mockResolvedValue(false) });
    const app = buildTestApp(port, identity, [
      { method: 'POST', pathPrefix: '/signup' },
    ]);
    // GET /signup is not exempt — only POST /signup is
    const res = await request(app).get('/signup');

    // Express will return 404 for unmatched GET /signup, but middleware should
    // still block with 403 before reaching the 404 handler.
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'REGISTRATION_REQUIRED' });
  });

  it('returns 503 when the exists check throws', async () => {
    const identity: IdentityContext = { userId: 'user-6', displayName: 'Frank' };
    const port = makePort({
      exists: vi.fn().mockRejectedValue(new Error('DB down')),
    });
    const app = buildTestApp(port, identity);
    const res = await request(app).get('/groups');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('checks the correct userId from identity', async () => {
    const identity: IdentityContext = { userId: 'specific-user-id', displayName: 'Grace' };
    const port = makePort({ exists: vi.fn().mockResolvedValue(true) });
    const app = buildTestApp(port, identity);
    await request(app).get('/groups');

    expect(port.exists).toHaveBeenCalledWith('specific-user-id');
  });
});
