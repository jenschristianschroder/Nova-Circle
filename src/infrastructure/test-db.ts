import knex from 'knex';
import type { Knex } from 'knex';

/**
 * Creates a Knex client connected to the test database.
 * Reads TEST_DATABASE_URL from the environment.
 *
 * Use this in integration tests that need a real database connection.
 * Always call `destroy()` in an afterAll to release the connection pool.
 */
export function createTestDb(): Knex {
  const url = process.env['TEST_DATABASE_URL'];

  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. ' +
        'Provide a test-scoped PostgreSQL connection string to run integration tests.',
    );
  }

  return knex({
    client: 'pg',
    connection: url,
    migrations: {
      directory: new URL('../../db/migrations', import.meta.url).pathname,
      extension: 'ts',
      loadExtensions: ['.ts'],
    },
    pool: { min: 1, max: 5 },
  });
}
