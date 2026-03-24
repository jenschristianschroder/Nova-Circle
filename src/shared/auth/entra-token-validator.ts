import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { IdentityContext } from './identity-context.js';
import type { TokenValidatorPort } from './token-validator.port.js';

/**
 * Validates JWTs issued by Microsoft Entra ID using the public JWKS endpoint.
 * Reads AZURE_TENANT_ID and AZURE_CLIENT_ID from the environment at
 * construction time so configuration errors surface early.
 */
export class EntraTokenValidator implements TokenValidatorPort {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuers: string[];
  private readonly audience: string[];

  constructor() {
    const tenantId = process.env['AZURE_TENANT_ID'];
    const clientId = process.env['AZURE_CLIENT_ID'];

    if (!tenantId) throw new Error('AZURE_TENANT_ID environment variable is required');
    if (!clientId) throw new Error('AZURE_CLIENT_ID environment variable is required');

    // Accept both v1 and v2 issuers.  Azure AD issues v1 tokens (iss =
    // "https://sts.windows.net/{tenantId}/") when the app registration's
    // accessTokenAcceptedVersion is null or 1, and v2 tokens (iss =
    // "https://login.microsoftonline.com/{tenantId}/v2.0") when it is 2.
    // Both bootstrap.sh and the CD workflow attempt to set
    // requestedAccessTokenVersion=2, but the update may silently fail;
    // accepting both formats keeps auth resilient.
    this.issuers = [
      `https://login.microsoftonline.com/${tenantId}/v2.0`,
      `https://sts.windows.net/${tenantId}/`,
    ];

    // Accept both the default Application ID URI form (`api://<clientId>`) and the bare
    // clientId GUID so tokens using either of these standard formats are validated.
    // bootstrap.sh sets the Application ID URI to `api://<clientId>`, so Azure AD v2
    // access tokens arrive with `aud: "api://<clientId>"` rather than the bare GUID.
    this.audience = [`api://${clientId}`, clientId];

    const jwksUri = new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`);
    this.jwks = createRemoteJWKSet(jwksUri);
  }

  async validate(token: string): Promise<IdentityContext> {
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.issuers,
      audience: this.audience,
    });

    // 'oid' is preferred over 'sub' for Azure tokens because it is stable across
    // token refreshes and multi-tenant scenarios, whereas 'sub' is audience-scoped.
    const userId = payload['oid'] ?? payload['sub'];
    const displayName =
      payload['name'] ?? payload['preferred_username'] ?? payload['upn'] ?? 'unknown';

    if (typeof userId !== 'string' || userId.length === 0) {
      throw new Error('Token payload missing required oid/sub claim');
    }

    const resolvedDisplayName = typeof displayName === 'string' ? displayName : 'unknown';

    return {
      userId,
      displayName: resolvedDisplayName,
    };
  }
}
