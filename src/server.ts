import knex from 'knex';
import { createApp } from './app.js';
import { EntraTokenValidator } from './shared/auth/entra-token-validator.js';
import type { TokenValidatorPort } from './shared/auth/token-validator.port.js';

const port = Number(process.env['PORT'] ?? 3000);
const databaseUrl = process.env['DATABASE_URL'];

const db = databaseUrl
  ? knex({ client: 'pg', connection: databaseUrl, pool: { min: 2, max: 10 } })
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

app.listen(port, () => {
  console.log(JSON.stringify({ level: 'info', message: 'Server started', port }));
});
