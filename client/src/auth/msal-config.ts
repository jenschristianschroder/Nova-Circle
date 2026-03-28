/**
 * MSAL configuration for Azure Entra ID authentication.
 *
 * In production containers, client ID and tenant ID are injected at runtime
 * via `window.__ENV__` (written by `/docker-entrypoint.d/40-env-config.sh`
 * before nginx starts). In local development they fall back to Vite's
 * `import.meta.env` (VITE_AZURE_CLIENT_ID / VITE_AZURE_TENANT_ID from an
 * `.env` file). Both variables must be provided in production; when absent
 * the app renders a configuration error instead of a broken MSAL instance.
 */

import {
  type Configuration,
  type SilentRequest,
  LogLevel,
  BrowserCacheLocation,
} from '@azure/msal-browser';

const clientId = (window.__ENV__?.VITE_AZURE_CLIENT_ID || import.meta.env.VITE_AZURE_CLIENT_ID) as
  | string
  | undefined;
const tenantId = (window.__ENV__?.VITE_AZURE_TENANT_ID || import.meta.env.VITE_AZURE_TENANT_ID) as
  | string
  | undefined;

/**
 * Optional sign-up authority for Azure AD B2C / Entra External ID.
 * When set, the "Create account" flow redirects to this authority
 * (e.g. a B2C sign-up user flow). When absent, sign-up uses the
 * same authority as sign-in.
 */
const rawSignUpAuthority = (window.__ENV__?.VITE_AZURE_SIGNUP_AUTHORITY ||
  import.meta.env.VITE_AZURE_SIGNUP_AUTHORITY) as string | undefined;

/** Azure authority hostnames that are safe to use as sign-up redirect targets. */
const ALLOWED_AUTHORITY_PATTERNS = [
  /^[a-z0-9-]+\.b2clogin\.com$/i,
  /^login\.microsoftonline\.com$/i,
  /^[a-z0-9-]+\.ciamlogin\.com$/i,
];

/**
 * Validates that a sign-up authority URL is a safe HTTPS URL pointing
 * to a known Azure authority hostname. Returns the trimmed URL string
 * on success, or undefined (with a console warning) on failure.
 */
function validateSignUpAuthority(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    console.warn('[Auth] VITE_AZURE_SIGNUP_AUTHORITY is not a valid URL, ignoring:', trimmed);
    return undefined;
  }

  if (parsed.protocol !== 'https:') {
    console.warn('[Auth] VITE_AZURE_SIGNUP_AUTHORITY must use https:, ignoring:', trimmed);
    return undefined;
  }

  const hostnameAllowed = ALLOWED_AUTHORITY_PATTERNS.some((pattern) =>
    pattern.test(parsed.hostname),
  );
  if (!hostnameAllowed) {
    console.warn(
      '[Auth] VITE_AZURE_SIGNUP_AUTHORITY hostname is not a recognised Azure authority, ignoring:',
      parsed.hostname,
    );
    return undefined;
  }

  return trimmed;
}

/** True when Azure credentials are present in the environment. */
export const msalConfigured = Boolean(clientId && tenantId);

export const msalConfig: Configuration = {
  auth: {
    clientId: clientId ?? 'missing-client-id',
    authority: tenantId ? `https://login.microsoftonline.com/${tenantId}` : '',
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: BrowserCacheLocation.LocalStorage,
  },
  system: {
    loggerOptions: {
      logLevel: import.meta.env.DEV ? LogLevel.Warning : LogLevel.Error,
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (level === LogLevel.Error) console.error('[MSAL]', message);
        else if (level === LogLevel.Warning) console.warn('[MSAL]', message);
      },
    },
  },
};

/** The OAuth scopes needed to call the Nova-Circle backend. */
export const apiScopes: string[] = clientId ? [`api://${clientId}/user_impersonation`] : [];

/** Silent token-request template; populated at runtime with the signed-in account. */
export const silentRequest: Omit<SilentRequest, 'account'> = {
  scopes: apiScopes,
};

/** Authority to use for the sign-up redirect (B2C user flow or default). */
export const signUpAuthorityUrl: string | undefined = validateSignUpAuthority(rawSignUpAuthority);
