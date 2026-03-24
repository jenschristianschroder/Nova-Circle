import knex from 'knex';
import { createApp } from './app.js';
import { resolveDbSsl } from './infrastructure/database-ssl.js';
import { EntraTokenValidator } from './shared/auth/entra-token-validator.js';
import type { TokenValidatorPort } from './shared/auth/token-validator.port.js';
import { logger, setTelemetryClient } from './shared/logger/logger.js';

// ── Application Insights ──────────────────────────────────────────────────────
// Initialise the SDK *before* createApp() so all requests and dependencies are
// captured from the first incoming connection.  The SDK is disabled (no-op)
// when the connection string env var is absent, which keeps tests clean.
const appInsightsConnectionString = process.env['APPLICATIONINSIGHTS_CONNECTION_STRING'];
if (appInsightsConnectionString) {
  // Dynamic import keeps tests fast — the heavy SDK is never loaded when the
  // env var is absent.
  const appInsights = await import('applicationinsights');
  appInsights
    .setup(appInsightsConnectionString)
    .setAutoCollectRequests(true)
    .setAutoCollectDependencies(true)
    .setAutoCollectExceptions(true)
    .setAutoCollectPerformance(false, false)
    .setSendLiveMetrics(false)
    .start();
  setTelemetryClient(appInsights.defaultClient);
}

const port = Number(process.env['PORT'] ?? 3000);
const databaseUrl = process.env['DATABASE_URL'];

const isProduction = process.env['NODE_ENV'] === 'production';

// Fail fast in production when DATABASE_URL is missing so the container never
// becomes "ready" in a misconfigured state (health checks would otherwise pass).
if (isProduction && !databaseUrl) {
  logger.error('DATABASE_URL is required in production');
  process.exit(1);
}

// Determine the SSL configuration for the database connection.
// See src/infrastructure/database-ssl.ts for the full rationale.
const db = databaseUrl
  ? knex({
      client: 'pg',
      connection: {
        connectionString: databaseUrl,
        ssl: resolveDbSsl(databaseUrl, isProduction),
      },
      pool: { min: 2, max: 10 },
    })
  : undefined;

// Instantiate the Entra token validator when the required env vars are present.
// In local development without Entra config the server starts without JWT
// validation (test-header auth still works for dev / integration testing).
let tokenValidator: TokenValidatorPort | undefined;
if (process.env['AZURE_TENANT_ID'] && process.env['AZURE_CLIENT_ID']) {
  tokenValidator = new EntraTokenValidator();
  // ── TEMPORARY DEBUG LOGGING (remove after root cause is found) ──────────
  const tenantId = process.env['AZURE_TENANT_ID'];
  const clientId = process.env['AZURE_CLIENT_ID'];
  logger.info('[auth-debug] EntraTokenValidator initialized', {
    expectedIssuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    expectedAudience: [`api://${clientId}`, clientId],
    tenantId,
    clientId,
  });
  // ── END TEMPORARY DEBUG LOGGING ─────────────────────────────────────────
} else {
  // ── TEMPORARY DEBUG LOGGING (remove after root cause is found) ──────────
  logger.warn('[auth-debug] EntraTokenValidator NOT initialized — missing env vars', {
    AZURE_TENANT_ID: process.env['AZURE_TENANT_ID'] ? 'set' : 'MISSING',
    AZURE_CLIENT_ID: process.env['AZURE_CLIENT_ID'] ? 'set' : 'MISSING',
    NODE_ENV: process.env['NODE_ENV'],
  });
  // ── END TEMPORARY DEBUG LOGGING ─────────────────────────────────────────
}

const app = createApp({
  ...(db ? { db } : {}),
  ...(tokenValidator ? { tokenValidator } : {}),
});

const server = app.listen(port, () => {
  logger.info('Server started', { port });
});

// ── Graceful shutdown ──────────────────────────────────────────────────────
// Ensures in-flight requests complete and database connections are released
// before the process exits (important for container orchestration).
const SHUTDOWN_TIMEOUT_MS = 30_000;
let shuttingDown = false;

function gracefulShutdown(signal: string): void {
  // Idempotent: ignore repeated signals while already shutting down.
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info('Shutdown initiated', { signal });

  // Stop accepting new connections and close idle keep-alive sockets so the
  // server can drain quickly (Node >= 18.2).
  server.close(() => {
    const cleanup = db ? db.destroy() : Promise.resolve();
    cleanup
      .then(() => {
        if (db) logger.info('Database pool closed');
        logger.info('Shutdown complete');
        process.exit(0);
      })
      .catch((err: unknown) => {
        logger.error('Error during shutdown', err);
        process.exit(1);
      });
  });
  server.closeIdleConnections();

  // Force exit after timeout to avoid hanging pods.
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
