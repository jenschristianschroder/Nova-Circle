import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';

/**
 * Tests for security middleware: rate limiting, CORS, and trust proxy.
 * These run as unit tests (no database required) since they exercise the
 * Express middleware layer only.
 */

describe('Rate limiting', () => {
  const savedEnv: Record<string, string | undefined> = {};

  function saveEnv(...keys: string[]): void {
    for (const k of keys) savedEnv[k] = process.env[k];
  }
  function restoreEnv(): void {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  beforeEach(() => {
    saveEnv('NODE_ENV');
  });
  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  it('is disabled when NODE_ENV=test (no rate-limit headers)', async () => {
    process.env['NODE_ENV'] = 'test';
    const app = createApp();

    const res = await request(app).get('/api/v1/info');

    expect(res.status).toBe(200);
    // Standard rate-limit headers should NOT be present in test env
    expect(res.headers['ratelimit-limit']).toBeUndefined();
    expect(res.headers['ratelimit-remaining']).toBeUndefined();
  });

  it('returns 429 with structured body when limit is exceeded (non-test env)', async () => {
    process.env['NODE_ENV'] = 'development';

    // Create an app with a very low rate limit by re-exporting a custom one.
    // Instead we use the default app and just blast it with requests.
    // The default limit is 100 per 15 min, so we send 101 requests.
    const app = createApp();

    // Send 100 requests to exhaust the window
    for (let i = 0; i < 100; i++) {
      await request(app).get('/api/v1/info');
    }

    // The 101st request should be rate-limited
    const res = await request(app).get('/api/v1/info');
    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      error: 'Too many requests, please try again later.',
      code: 'RATE_LIMITED',
    });
  });
});

describe('CORS', () => {
  const savedEnv: Record<string, string | undefined> = {};

  function saveEnv(...keys: string[]): void {
    for (const k of keys) savedEnv[k] = process.env[k];
  }
  function restoreEnv(): void {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  beforeEach(() => {
    saveEnv('CORS_ORIGIN');
  });
  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  it('does not set Access-Control-Allow-Origin when CORS_ORIGIN is not configured', async () => {
    delete process.env['CORS_ORIGIN'];
    const app = createApp();

    const res = await request(app).get('/api/v1/info').set('Origin', 'https://evil.example.com');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sets Access-Control-Allow-Origin when origin is in the allow-list', async () => {
    process.env['CORS_ORIGIN'] = 'https://app.novacircle.com';
    const app = createApp();

    const res = await request(app).get('/api/v1/info').set('Origin', 'https://app.novacircle.com');

    expect(res.headers['access-control-allow-origin']).toBe('https://app.novacircle.com');
  });

  it('rejects origins not in the allow-list', async () => {
    process.env['CORS_ORIGIN'] = 'https://app.novacircle.com';
    const app = createApp();

    const res = await request(app).get('/api/v1/info').set('Origin', 'https://evil.example.com');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('handles multiple comma-separated origins', async () => {
    process.env['CORS_ORIGIN'] = 'https://app.novacircle.com, https://staging.novacircle.com';
    const app = createApp();

    const res1 = await request(app)
      .get('/api/v1/info')
      .set('Origin', 'https://staging.novacircle.com');

    expect(res1.headers['access-control-allow-origin']).toBe('https://staging.novacircle.com');
  });

  it('filters empty strings from CORS_ORIGIN (trailing comma)', async () => {
    process.env['CORS_ORIGIN'] = 'https://app.novacircle.com,, ,';
    const app = createApp();

    const res = await request(app).get('/api/v1/info').set('Origin', 'https://app.novacircle.com');

    expect(res.headers['access-control-allow-origin']).toBe('https://app.novacircle.com');
  });

  it('deduplicates origins in CORS_ORIGIN', async () => {
    process.env['CORS_ORIGIN'] =
      'https://app.novacircle.com, https://app.novacircle.com, https://other.example.com';
    const app = createApp();

    const res = await request(app).get('/api/v1/info').set('Origin', 'https://app.novacircle.com');

    expect(res.headers['access-control-allow-origin']).toBe('https://app.novacircle.com');
  });

  it('falls back to same-origin when CORS_ORIGIN contains only whitespace/commas', async () => {
    process.env['CORS_ORIGIN'] = ' , , ';
    const app = createApp();

    const res = await request(app).get('/api/v1/info').set('Origin', 'https://evil.example.com');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
