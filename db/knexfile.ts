import type { Knex } from 'knex';

/**
 * Returns the database URL from environment variables.
 * Uses TEST_DATABASE_URL when NODE_ENV is 'test'.
 * Throws if the required variable is not set.
 */
function resolveDatabaseUrl(): string {
  const isTest = process.env['NODE_ENV'] === 'test';
  const url = isTest ? process.env['TEST_DATABASE_URL'] : process.env['DATABASE_URL'];

  if (!url) {
    const varName = isTest ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
    throw new Error(
      `Environment variable ${varName} is not set. ` +
        `Copy .env.example to .env and fill in the database URL.`,
    );
  }

  return url;
}

const isProduction = process.env['NODE_ENV'] === 'production';

const config: Knex.Config = {
  client: 'pg',
  connection: {
    connectionString: resolveDatabaseUrl(),
    // Enforce TLS for Azure PostgreSQL in production (mirrors src/server.ts).
    ssl: isProduction ? { rejectUnauthorized: true } : false,
  },
  migrations: {
    directory: './migrations',
    extension: 'ts',
    loadExtensions: ['.ts'],
    stub: 'migration.stub',
  },
  // min: 0 avoids creating idle connections at startup during CLI migration runs.
  pool: {
    min: 0,
    max: 10,
  },
};

export default config;
