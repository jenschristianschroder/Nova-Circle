import { describe, it, expect, vi } from 'vitest';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from './app.js';

/**
 * Example API test – verifies the health and info endpoints.
 *
 * API tests use supertest to make real HTTP requests against the Express app
 * without starting a network listener.
 */
describe('GET /health', () => {
  it('returns 200 with status ok when no database is configured', async () => {
    const app = createApp();
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns 200 when the database is reachable', async () => {
    const db = { raw: vi.fn().mockResolvedValue(undefined) } as Pick<Knex, 'raw'> as Knex;
    const app = createApp({ db });
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns 503 when the database is unreachable', async () => {
    const db = { raw: vi.fn().mockRejectedValue(new Error('connection refused')) } as Pick<Knex, 'raw'> as Knex;
    const app = createApp({ db });
    const response = await request(app).get('/health');
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ status: 'error' });
  });
});

describe('GET /api/v1/info', () => {
  const app = createApp();

  it('returns 200 with application name and version', async () => {
    const response = await request(app).get('/api/v1/info');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ name: 'nova-circle' });
  });

  it('does not leak stack traces or internal details', async () => {
    const response = await request(app).get('/api/v1/info');
    expect(JSON.stringify(response.body)).not.toContain('Error');
    expect(JSON.stringify(response.body)).not.toContain('stack');
  });
});

describe('Unknown routes', () => {
  const app = createApp();

  it('returns 404 for an unknown path', async () => {
    const response = await request(app).get('/api/v1/does-not-exist');
    expect(response.status).toBe(404);
  });
});
