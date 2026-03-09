import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';

/**
 * Example API test – verifies the health and info endpoints.
 *
 * API tests use supertest to make real HTTP requests against the Express app
 * without starting a network listener.
 */
describe('GET /health', () => {
  const app = createApp();

  it('returns 200 with status ok', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
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
