import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  createEnsureProfileMiddleware,
  type EnsureProfilePort,
} from './ensure-profile-middleware.js';
import type { IdentityContext } from './identity-context.js';

/**
 * Builds a minimal Express app that:
 * 1. optionally injects req.identity via a preceding middleware
 * 2. runs the ensure-profile middleware
 * 3. echoes a 200 response so we can assert the middleware called next()
 */
function buildTestApp(
  profilePort: EnsureProfilePort,
  identity?: IdentityContext,
): express.Application {
  const app = express();
  if (identity) {
    app.use((_req, _res, next) => {
      _req.identity = identity;
      next();
    });
  }
  app.use(createEnsureProfileMiddleware(profilePort));
  app.get('/test', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

function makeProfilePort(overrides?: Partial<EnsureProfilePort>): EnsureProfilePort {
  return {
    findById: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

describe('createEnsureProfileMiddleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls next without checking profile when req.identity is not set', async () => {
    const port = makeProfilePort();
    const app = buildTestApp(port); // no identity injected
    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    expect(port.findById).not.toHaveBeenCalled();
    expect(port.upsert).not.toHaveBeenCalled();
  });

  it('does not upsert when profile already exists', async () => {
    const identity: IdentityContext = { userId: 'user-1', displayName: 'Alice' };
    const port = makeProfilePort({
      findById: vi.fn().mockResolvedValue({ id: 'user-1' }),
    });
    const app = buildTestApp(port, identity);
    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    expect(port.findById).toHaveBeenCalledWith('user-1');
    expect(port.upsert).not.toHaveBeenCalled();
  });

  it('upserts a minimal profile when none exists', async () => {
    const identity: IdentityContext = { userId: 'user-2', displayName: 'Bob' };
    const port = makeProfilePort({
      findById: vi.fn().mockResolvedValue(null),
    });
    const app = buildTestApp(port, identity);
    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    expect(port.findById).toHaveBeenCalledWith('user-2');
    expect(port.upsert).toHaveBeenCalledWith({
      userId: 'user-2',
      displayName: 'Bob',
      avatarUrl: null,
    });
  });

  it('calls next even when findById throws (logs but does not block)', async () => {
    const identity: IdentityContext = { userId: 'user-3', displayName: 'Eve' };
    const port = makeProfilePort({
      findById: vi.fn().mockRejectedValue(new Error('DB down')),
    });
    const app = buildTestApp(port, identity);
    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    expect(port.upsert).not.toHaveBeenCalled();
  });

  it('calls next even when upsert throws (logs but does not block)', async () => {
    const identity: IdentityContext = { userId: 'user-4', displayName: 'Mallory' };
    const port = makeProfilePort({
      findById: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockRejectedValue(new Error('Upsert failed')),
    });
    const app = buildTestApp(port, identity);
    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    expect(port.upsert).toHaveBeenCalled();
  });

  it('passes identity displayName to upsert for a new profile', async () => {
    const identity: IdentityContext = { userId: 'user-5', displayName: 'Charlie Test' };
    const port = makeProfilePort();
    const app = buildTestApp(port, identity);
    await request(app).get('/test');

    expect(port.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'Charlie Test' }),
    );
  });
});
