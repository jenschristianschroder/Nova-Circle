/**
 * Unit tests for client/src/auth/msal-config.ts
 *
 * Verifies that the module reads Azure credentials from window.__ENV__
 * (runtime injection via entrypoint.sh) and falls back to import.meta.env
 * (Vite build-time variables for local development). Tests use
 * vi.resetModules() + dynamic import() to evaluate the module fresh with
 * each window.__ENV__ configuration.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

// Preserve the original __ENV__ value so tests that mutate it can restore it.
const originalEnv = (window as Window).__ENV__;

afterEach(() => {
  (window as Window).__ENV__ = originalEnv;
  vi.resetModules();
});

describe('msal-config — runtime injection via window.__ENV__', () => {
  it('reads clientId and tenantId from window.__ENV__ when both are present', async () => {
    (window as Window).__ENV__ = {
      VITE_AZURE_CLIENT_ID: 'runtime-client-id',
      VITE_AZURE_TENANT_ID: 'runtime-tenant-id',
    };

    const { msalConfigured, msalConfig, apiScopes } = await import('@/auth/msal-config');

    expect(msalConfigured).toBe(true);
    expect(msalConfig.auth.clientId).toBe('runtime-client-id');
    expect(msalConfig.auth.authority).toContain('runtime-tenant-id');
    expect(apiScopes).toContain('api://runtime-client-id/user_impersonation');
  });

  it('sets msalConfigured to false when window.__ENV__ has empty strings', async () => {
    (window as Window).__ENV__ = {
      VITE_AZURE_CLIENT_ID: '',
      VITE_AZURE_TENANT_ID: '',
    };

    const { msalConfigured } = await import('@/auth/msal-config');

    expect(msalConfigured).toBe(false);
  });

  it('sets msalConfigured to false when only clientId is present', async () => {
    (window as Window).__ENV__ = {
      VITE_AZURE_CLIENT_ID: 'runtime-client-id',
      VITE_AZURE_TENANT_ID: '',
    };

    const { msalConfigured } = await import('@/auth/msal-config');

    expect(msalConfigured).toBe(false);
  });

  it('sets msalConfigured to false when only tenantId is present', async () => {
    (window as Window).__ENV__ = {
      VITE_AZURE_CLIENT_ID: '',
      VITE_AZURE_TENANT_ID: 'runtime-tenant-id',
    };

    const { msalConfigured } = await import('@/auth/msal-config');

    expect(msalConfigured).toBe(false);
  });

  it('sets msalConfigured to false when window.__ENV__ is undefined', async () => {
    (window as Window).__ENV__ = undefined;

    const { msalConfigured } = await import('@/auth/msal-config');

    // import.meta.env.VITE_AZURE_CLIENT_ID / VITE_AZURE_TENANT_ID are not
    // set in the test environment, so msalConfigured must be false.
    expect(msalConfigured).toBe(false);
  });

  it('uses fallback placeholder when credentials are absent', async () => {
    (window as Window).__ENV__ = {
      VITE_AZURE_CLIENT_ID: '',
      VITE_AZURE_TENANT_ID: '',
    };

    const { msalConfig, apiScopes } = await import('@/auth/msal-config');

    expect(msalConfig.auth.clientId).toBe('missing-client-id');
    expect(msalConfig.auth.authority).toBe('');
    expect(apiScopes).toHaveLength(0);
  });
});

describe('msal-config — signUpAuthorityUrl', () => {
  it('is undefined when VITE_AZURE_SIGNUP_AUTHORITY is not set', async () => {
    (window as Window).__ENV__ = {
      VITE_AZURE_CLIENT_ID: 'cid',
      VITE_AZURE_TENANT_ID: 'tid',
    };

    const { signUpAuthorityUrl } = await import('@/auth/msal-config');

    expect(signUpAuthorityUrl).toBeUndefined();
  });

  it('returns the configured sign-up authority when set', async () => {
    (window as Window).__ENV__ = {
      VITE_AZURE_CLIENT_ID: 'cid',
      VITE_AZURE_TENANT_ID: 'tid',
      VITE_AZURE_SIGNUP_AUTHORITY:
        'https://mytenant.b2clogin.com/mytenant.onmicrosoft.com/B2C_1_signup',
    };

    const { signUpAuthorityUrl } = await import('@/auth/msal-config');

    expect(signUpAuthorityUrl).toBe(
      'https://mytenant.b2clogin.com/mytenant.onmicrosoft.com/B2C_1_signup',
    );
  });

  it('is undefined when VITE_AZURE_SIGNUP_AUTHORITY is empty string', async () => {
    (window as Window).__ENV__ = {
      VITE_AZURE_CLIENT_ID: 'cid',
      VITE_AZURE_TENANT_ID: 'tid',
      VITE_AZURE_SIGNUP_AUTHORITY: '',
    };

    const { signUpAuthorityUrl } = await import('@/auth/msal-config');

    expect(signUpAuthorityUrl).toBeUndefined();
  });
});
