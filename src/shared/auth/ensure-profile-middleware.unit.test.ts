import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  createEnsureProfileMiddleware,
  normalizeDisplayName,
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
    ensureExists: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
}

// ── normalizeDisplayName ────────────────────────────────────────────────────

describe('normalizeDisplayName', () => {
  it('returns a normal name unchanged', () => {
    expect(normalizeDisplayName('Alice')).toBe('Alice');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeDisplayName('  Bob  ')).toBe('Bob');
  });

  it('truncates to 100 characters', () => {
    const long = 'x'.repeat(150);
    const result = normalizeDisplayName(long);
    expect(result).toHaveLength(100);
    expect(result).toBe('x'.repeat(100));
  });

  it('falls back to "User" when input is empty', () => {
    expect(normalizeDisplayName('')).toBe('User');
  });

  it('falls back to "User" when input is only whitespace', () => {
    expect(normalizeDisplayName('   ')).toBe('User');
  });

  it('trims before truncating (does not count leading spaces)', () => {
    const padded = '  ' + 'a'.repeat(101);
    const result = normalizeDisplayName(padded);
    expect(result).toHaveLength(100);
    expect(result).toBe('a'.repeat(100));
  });
});

// ── createEnsureProfileMiddleware ───────────────────────────────────────────

describe('createEnsureProfileMiddleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls next without checking profile when req.identity is not set', async () => {
    const port = makeProfilePort();
    const app = buildTestApp(port); // no identity injected
    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    expect(port.ensureExists).not.toHaveBeenCalled();
  });

  it('calls ensureExists with normalised displayName for an authenticated request', async () => {
    const identity: IdentityContext = { userId: 'user-1', displayName: '  Alice  ' };
    const port = makeProfilePort();
    const app = buildTestApp(port, identity);
    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    expect(port.ensureExists).toHaveBeenCalledWith({
      userId: 'user-1',
      displayName: 'Alice',
      avatarUrl: null,
    });
  });

  it('truncates displayName longer than 100 chars before calling ensureExists', async () => {
    const identity: IdentityContext = { userId: 'user-2', displayName: 'B'.repeat(150) };
    const port = makeProfilePort();
    const app = buildTestApp(port, identity);
    await request(app).get('/test');

    expect(port.ensureExists).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'B'.repeat(100) }),
    );
  });

  it('uses "User" fallback when displayName is whitespace-only', async () => {
    const identity: IdentityContext = { userId: 'user-3', displayName: '   ' };
    const port = makeProfilePort();
    const app = buildTestApp(port, identity);
    await request(app).get('/test');

    expect(port.ensureExists).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'User' }),
    );
  });

  it('does not log when profile already existed (ensureExists returns false)', async () => {
    const identity: IdentityContext = { userId: 'user-4', displayName: 'Dave' };
    const port = makeProfilePort({
      ensureExists: vi.fn().mockResolvedValue(false),
    });
    const app = buildTestApp(port, identity);
    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    expect(port.ensureExists).toHaveBeenCalled();
  });

  it('calls next even when ensureExists throws (logs but does not block)', async () => {
    const identity: IdentityContext = { userId: 'user-5', displayName: 'Eve' };
    const port = makeProfilePort({
      ensureExists: vi.fn().mockRejectedValue(new Error('DB down')),
    });
    const app = buildTestApp(port, identity);
    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    expect(port.ensureExists).toHaveBeenCalled();
  });

  it('passes avatarUrl as null for auto-provisioned profiles', async () => {
    const identity: IdentityContext = { userId: 'user-6', displayName: 'Frank' };
    const port = makeProfilePort();
    const app = buildTestApp(port, identity);
    await request(app).get('/test');

    expect(port.ensureExists).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: null }));
  });
});
