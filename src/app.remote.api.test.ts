import { describe, it, expect } from 'vitest';

/**
 * Remote API tests — run against the deployed API using real HTTP requests.
 *
 * These tests require REMOTE_API_BASE_URL to be set to the base URL of the
 * deployed API revision (e.g., the revision-specific URL in the CD blue/green
 * pipeline).  They are skipped in local and CI environments where the variable
 * is absent so they never interfere with unit, integration, or standard API
 * test runs.
 *
 * The tests intentionally cover only unauthenticated public endpoints so that
 * no secrets or tokens are required for the test runner itself.  Authenticated
 * scenarios are covered by the Playwright E2E gate that runs in the same CD
 * phase.
 */

const BASE_URL = process.env['REMOTE_API_BASE_URL']?.replace(/\/+$/, '');
const hasRemoteUrl = !!BASE_URL;

describe.skipIf(!hasRemoteUrl)('Remote API — GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status?: string };
    expect(body).toMatchObject({ status: 'ok' });
  });
});

describe.skipIf(!hasRemoteUrl)('Remote API — GET /api/v1/info', () => {
  it('returns 200 with application name and version', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/info`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ name: 'nova-circle' });
  });

  it('response body does not contain stack traces or internal error strings', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/info`);
    expect(res.status).toBe(200);
    const text = await res.text();
    // Validates that the success response is clean — not checking error paths.
    // Error-path information-disclosure is covered by the unknown-routes suite.
    expect(text).not.toContain('Error');
    expect(text).not.toContain('stack');
  });
});

describe.skipIf(!hasRemoteUrl)('Remote API — unknown routes', () => {
  // All /api/v1/** routes are protected by the authentication middleware.
  // Unauthenticated requests to unknown paths receive 401 (Unauthorized)
  // before the 404 handler runs — this is correct and more secure than 404
  // because it does not reveal route structure to unauthenticated callers.
  it('returns 401 for an unauthenticated request to an unknown path', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/does-not-exist-remote-probe`);
    expect(res.status).toBe(401);
  });

  it('safe error body does not expose internals', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/does-not-exist-remote-probe`);
    // 401 is expected — unauthenticated probing of any /api/v1/ path is rejected
    // by the auth middleware before routing occurs.
    expect([401, 404]).toContain(res.status);
    const text = await res.text();
    expect(text).not.toContain('stack');
    expect(text).not.toContain('node_modules');
    // Absolute paths and common framework-internal markers that should never surface.
    expect(text).not.toMatch(/\/home\/|\/var\/|\/usr\//);
    expect(text).not.toContain('Error:');
  });
});
