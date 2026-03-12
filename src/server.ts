import knex from 'knex';
import { createApp } from './app.js';
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

const db = databaseUrl
  ? knex({
      client: 'pg',
      connection: {
        connectionString: databaseUrl,
        // Enforce TLS for Azure PostgreSQL in production.
        ssl: isProduction ? { rejectUnauthorized: true } : false,
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
function gracefulShutdown(signal: string): void {
  logger.info('Shutdown initiated', { signal });

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

  // Force exit after 30 seconds to avoid hanging pods.
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
