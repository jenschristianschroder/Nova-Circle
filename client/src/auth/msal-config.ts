/**
 * MSAL configuration for Azure Entra ID authentication.
 *
 * Reads client ID and tenant ID from Vite environment variables so they
 * can differ per deployment without rebuilding. Both variables must be
 * provided in production; in local/test environments they may be omitted
 * (the app will detect the missing config and fall back gracefully).
 */

import {
  type Configuration,
  type SilentRequest,
  LogLevel,
  BrowserCacheLocation,
} from '@azure/msal-browser';

const clientId = (window.__ENV__?.VITE_AZURE_CLIENT_ID ||
  import.meta.env.VITE_AZURE_CLIENT_ID) as string | undefined;
const tenantId = (window.__ENV__?.VITE_AZURE_TENANT_ID ||
  import.meta.env.VITE_AZURE_TENANT_ID) as string | undefined;

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
