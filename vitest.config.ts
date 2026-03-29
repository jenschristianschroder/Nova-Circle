import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Register tsx at the root level so Knex can dynamically import .ts
    // migration files inside forked worker processes.  Vitest reads
    // poolOptions.forks from the root config, not from project-level
    // overrides, so this must live here.
    poolOptions: {
      forks: {
        execArgv: ['--import', 'tsx'],
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.unit.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['src/**/*.integration.test.ts'],
          environment: 'node',
          // Integration tests require a running database; sequential to avoid conflicts.
          pool: 'forks',
          poolOptions: {
            forks: {
              singleFork: true,
            },
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'api',
          include: ['src/**/*.api.test.ts'],
          environment: 'node',
          // API tests spin up an HTTP server; run sequentially to avoid port conflicts.
          pool: 'forks',
          poolOptions: {
            forks: {
              singleFork: true,
            },
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'remote-api',
          include: ['src/**/*.remote.api.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
