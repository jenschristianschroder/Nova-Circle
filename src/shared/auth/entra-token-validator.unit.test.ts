import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for EntraTokenValidator.
 *
 * The validator uses `jose` to verify JWTs against a remote JWKS endpoint.
 * We mock `jose` to avoid network calls and control the payload returned.
 */

// Mock `jose` before importing the validator so the module picks up the mock.
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn().mockReturnValue('mocked-jwks'),
  jwtVerify: vi.fn(),
}));

import { jwtVerify } from 'jose';
import { EntraTokenValidator } from './entra-token-validator.js';

const mockedJwtVerify = vi.mocked(jwtVerify);

describe('EntraTokenValidator', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env['AZURE_TENANT_ID'] = 'test-tenant-id';
    process.env['AZURE_CLIENT_ID'] = 'test-client-id';
    mockedJwtVerify.mockClear();
  });

  afterEach(() => {
    const originalTenantId = originalEnv['AZURE_TENANT_ID'];
    const originalClientId = originalEnv['AZURE_CLIENT_ID'];

    if (originalTenantId === undefined) {
      delete process.env['AZURE_TENANT_ID'];
    } else {
      process.env['AZURE_TENANT_ID'] = originalTenantId;
    }

    if (originalClientId === undefined) {
      delete process.env['AZURE_CLIENT_ID'];
    } else {
      process.env['AZURE_CLIENT_ID'] = originalClientId;
    }
  });

  describe('constructor', () => {
    it('throws when AZURE_TENANT_ID is missing', () => {
      delete process.env['AZURE_TENANT_ID'];
      expect(() => new EntraTokenValidator()).toThrow(
        'AZURE_TENANT_ID environment variable is required',
      );
    });

    it('throws when AZURE_CLIENT_ID is missing', () => {
      delete process.env['AZURE_CLIENT_ID'];
      expect(() => new EntraTokenValidator()).toThrow(
        'AZURE_CLIENT_ID environment variable is required',
      );
    });

    it('does not throw when both environment variables are set', () => {
      expect(() => new EntraTokenValidator()).not.toThrow();
    });
  });

  describe('validate', () => {
    it('returns identity with userId from oid claim', async () => {
      mockedJwtVerify.mockResolvedValueOnce({
        payload: { oid: 'azure-object-id', name: 'Alice' },
        protectedHeader: { alg: 'RS256' },
      } as Awaited<ReturnType<typeof jwtVerify>>);

      const validator = new EntraTokenValidator();
      const identity = await validator.validate('some.jwt.token');

      expect(identity.userId).toBe('azure-object-id');
      expect(identity.displayName).toBe('Alice');
    });

    it('falls back to sub when oid is absent', async () => {
      mockedJwtVerify.mockResolvedValueOnce({
        payload: { sub: 'subject-id', name: 'Bob' },
        protectedHeader: { alg: 'RS256' },
      } as Awaited<ReturnType<typeof jwtVerify>>);

      const validator = new EntraTokenValidator();
      const identity = await validator.validate('some.jwt.token');

      expect(identity.userId).toBe('subject-id');
    });

    it('prefers oid over sub when both are present', async () => {
      mockedJwtVerify.mockResolvedValueOnce({
        payload: { oid: 'oid-value', sub: 'sub-value', name: 'Carol' },
        protectedHeader: { alg: 'RS256' },
      } as Awaited<ReturnType<typeof jwtVerify>>);

      const validator = new EntraTokenValidator();
      const identity = await validator.validate('some.jwt.token');

      expect(identity.userId).toBe('oid-value');
    });

    it('uses preferred_username when name is absent', async () => {
      mockedJwtVerify.mockResolvedValueOnce({
        payload: { oid: 'oid-value', preferred_username: 'carol@example.com' },
        protectedHeader: { alg: 'RS256' },
      } as Awaited<ReturnType<typeof jwtVerify>>);

      const validator = new EntraTokenValidator();
      const identity = await validator.validate('some.jwt.token');

      expect(identity.displayName).toBe('carol@example.com');
    });

    it('uses upn when name and preferred_username are absent', async () => {
      mockedJwtVerify.mockResolvedValueOnce({
        payload: { oid: 'oid-value', upn: 'carol@corp.example.com' },
        protectedHeader: { alg: 'RS256' },
      } as Awaited<ReturnType<typeof jwtVerify>>);

      const validator = new EntraTokenValidator();
      const identity = await validator.validate('some.jwt.token');

      expect(identity.displayName).toBe('carol@corp.example.com');
    });

    it('falls back to "unknown" when no display name claim is present', async () => {
      mockedJwtVerify.mockResolvedValueOnce({
        payload: { oid: 'oid-value' },
        protectedHeader: { alg: 'RS256' },
      } as Awaited<ReturnType<typeof jwtVerify>>);

      const validator = new EntraTokenValidator();
      const identity = await validator.validate('some.jwt.token');

      expect(identity.displayName).toBe('unknown');
    });

    it('throws when neither oid nor sub is present in the token payload', async () => {
      mockedJwtVerify.mockResolvedValueOnce({
        payload: { name: 'No ID User' },
        protectedHeader: { alg: 'RS256' },
      } as Awaited<ReturnType<typeof jwtVerify>>);

      const validator = new EntraTokenValidator();
      await expect(validator.validate('some.jwt.token')).rejects.toThrow(
        'Token payload missing required oid/sub claim',
      );
    });

    it('throws when oid is an empty string', async () => {
      mockedJwtVerify.mockResolvedValueOnce({
        payload: { oid: '', name: 'Empty OID' },
        protectedHeader: { alg: 'RS256' },
      } as Awaited<ReturnType<typeof jwtVerify>>);

      const validator = new EntraTokenValidator();
      await expect(validator.validate('some.jwt.token')).rejects.toThrow(
        'Token payload missing required oid/sub claim',
      );
    });

    it('propagates errors thrown by jwtVerify (e.g. expired token)', async () => {
      mockedJwtVerify.mockRejectedValueOnce(new Error('JWTExpired'));

      const validator = new EntraTokenValidator();
      await expect(validator.validate('expired.jwt.token')).rejects.toThrow('JWTExpired');
    });

    it('calls jwtVerify with both v1 and v2 issuers and audience', async () => {
      mockedJwtVerify.mockResolvedValueOnce({
        payload: { oid: 'oid-value', name: 'Dave' },
        protectedHeader: { alg: 'RS256' },
      } as Awaited<ReturnType<typeof jwtVerify>>);

      const validator = new EntraTokenValidator();
      await validator.validate('my.token');

      expect(mockedJwtVerify).toHaveBeenCalledTimes(1);
      // Azure AD v2 access tokens have aud = "api://<clientId>" (the Application ID URI).
      // The validator accepts both formats for compatibility.
      // Both v1 and v2 issuers are accepted because the app registration's
      // accessTokenAcceptedVersion may be null/1 (v1 tokens) or 2 (v2 tokens).
      expect(mockedJwtVerify).toHaveBeenCalledWith(
        'my.token',
        'mocked-jwks',
        expect.objectContaining({
          issuer: [
            'https://login.microsoftonline.com/test-tenant-id/v2.0',
            'https://sts.windows.net/test-tenant-id/',
          ],
          audience: ['api://test-client-id', 'test-client-id'],
        }),
      );
    });
  });
});
