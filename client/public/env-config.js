// Runtime environment configuration.
// In production Docker containers this file is overwritten by
// /docker-entrypoint.d/40-env-config.sh before nginx starts, injecting the
// real Azure credentials from container environment variables.
// During local development (Vite dev server) this placeholder file is served
// with empty strings so the app falls back to VITE_* variables from .env files.
window.__ENV__ = {
  VITE_AZURE_CLIENT_ID: '',
  VITE_AZURE_TENANT_ID: '',
};
