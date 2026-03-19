/**
 * Global type augmentation for runtime environment configuration.
 *
 * `window.__ENV__` is populated by `/docker-entrypoint.d/40-env-config.sh`
 * before nginx starts in production containers. In local development the
 * `public/env-config.js` placeholder provides an empty object and the app
 * falls back to Vite's `import.meta.env` instead.
 */

interface Window {
  __ENV__?: {
    VITE_AZURE_CLIENT_ID?: string;
    VITE_AZURE_TENANT_ID?: string;
  };
}
