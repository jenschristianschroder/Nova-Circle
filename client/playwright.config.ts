import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Nova-Circle E2E tests.
 *
 * Base URL is read from the PLAYWRIGHT_BASE_URL environment variable so the
 * same config works against a locally served Vite dev server, a Docker
 * container, or the real deployed application.
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',

  /** Global timeout per test (ms). */
  timeout: 30_000,

  /** Timeout for each expect() assertion (ms). */
  expect: {
    timeout: 10_000,
  },

  /** Run tests in parallel within files, but not across workers by default. */
  fullyParallel: true,

  /** Fail the build on CI if test.only is accidentally left in source. */
  forbidOnly: !!process.env['CI'],

  /** Retry failed tests once on CI. */
  retries: process.env['CI'] ? 1 : 0,

  /** Limit parallel workers on CI to avoid resource contention. */
  workers: process.env['CI'] ? 2 : undefined,

  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/e2e.xml' }],
    ['list'],
  ],

  use: {
    /** Base URL for all page.goto() calls that use relative paths. */
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:5173',

    /** Collect traces on first retry so failures can be investigated. */
    trace: 'on-first-retry',

    /** Capture screenshot on failure. */
    screenshot: 'only-on-failure',

    /** Capture video on first retry. */
    video: 'on-first-retry',
  },

  projects: [
    /** Global setup runs once before all test projects. */
    {
      name: 'setup',
      testMatch: /global-setup\.ts/,
    },

    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        /** Load saved auth state produced by global-setup.ts. */
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    /** Optional: enable firefox / webkit in local runs or extended CI. */
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'], storageState: 'e2e/.auth/user.json' },
    //   dependencies: ['setup'],
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'], storageState: 'e2e/.auth/user.json' },
    //   dependencies: ['setup'],
    // },
  ],
});
