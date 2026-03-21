# Nova-Circle — Playwright E2E Tests

This document describes the Playwright end-to-end (E2E) test suite, its structure, how to run it locally, and how it is configured in GitHub Actions CI.

---

## Overview

The E2E test suite lives under `client/e2e/` and uses [Playwright](https://playwright.dev/) with Chromium to exercise the full stack — real browser, real API, and real Azure AD authentication.

### Position in the test pyramid

```
           ┌──────────────────┐
           │   E2E (Playwright)│  ← full stack, Chromium, Azure AD
           ├──────────────────┤
           │   API tests      │  ← HTTP layer, real DB, mocked identity
           ├──────────────────┤
           │ Integration tests│  ← repository layer, real DB
           ├──────────────────┤
           │   Unit tests     │  ← domain logic, pure, fast
           └──────────────────┘
```

E2E tests are intentionally few and focused on verifying that the main navigation and authentication paths work in a deployed environment.  They complement — and do not replace — the backend unit, integration, and API tests documented in [testing.md](testing.md).

> **Note:** The project-wide [`.github/copilot-instructions.md`](../../.github/copilot-instructions.md) requires all external dependencies (including authentication) to be mocked in CI.  E2E tests are an intentional exception: they test the complete stack, including real Azure AD authentication.  This exception exists because mocking Azure AD at the browser level would make the tests meaningless as infrastructure verification.

### Spec files

| File | Purpose |
|---|---|
| `client/e2e/smoke.spec.ts` | Verifies that unauthenticated users are redirected to `/login` and that authenticated users reach `/groups` |

---

## Project structure

```
client/
├── playwright.config.ts          # Playwright configuration
└── e2e/
    ├── global-setup.ts           # Runs once before all tests; produces e2e/.auth/user.json
    ├── smoke.spec.ts             # Main spec file
    ├── .auth/                    # Git-ignored; contains runtime auth state
    │   └── user.json             # Written by global-setup.ts — never commit this file
    ├── pages/
    │   ├── LoginPage.ts          # Page Object Model for /login
    │   ├── GroupsListPage.ts     # Page Object Model for /groups
    │   ├── GroupDetailPage.ts    # Page Object Model for /groups/:groupId
    │   ├── EventDetailPage.ts    # Page Object Model for /groups/:groupId/events/:eventId
    │   └── EventCreatePage.ts    # Page Object Model for event creation (structured + text capture)
    └── helpers/
        ├── auth.ts               # authenticatedContext / unauthenticatedContext factories
        └── api.ts                # ApiHelper — typed REST wrapper for seeding and tearing down data
```

---

## Authentication strategy

The `global-setup.ts` script runs **once** before all test projects.  It writes a browser storage state (cookies + localStorage) to `e2e/.auth/user.json`.  All Chromium test projects then load this state via `use.storageState` so that individual tests do not need to sign in.

There are three paths, evaluated in order:

### Path 1 — Injected state file (optional fast path)

If `PLAYWRIGHT_AUTH_STATE_FILE` is set and points to an existing file, that file is copied to `e2e/.auth/user.json` and no browser sign-in is performed.  This path is intended for future CI optimizations where a pre-authenticated session is injected into the job.

### Path 2 — Headless MSAL sign-in (local dev / CI)

If credentials are provided via `PLAYWRIGHT_TEST_USER_EMAIL` and `PLAYWRIGHT_TEST_USER_PASSWORD`, global setup launches a headless Chromium browser, navigates to `/login`, and performs a real Azure AD MSAL login:

1. Navigate to `${PLAYWRIGHT_BASE_URL}/login`.
2. Click the "Sign in" button to trigger the MSAL redirect.
3. Fill the Azure AD username field (`email|username`).
4. Click "Next / Continue".
5. Fill the password field.
6. Click "Sign in".
7. Wait up to 30 seconds for a redirect back to `${PLAYWRIGHT_BASE_URL}/groups` (this timeout accounts for slow Azure AD responses but does **not** handle interactive MFA prompts).
8. Save the resulting storage state to `e2e/.auth/user.json`.

> **Important:** The locators in step 3–6 target Microsoft's hosted Azure AD login UI.  If Microsoft changes that UI, the selectors will need updating.
>
> **MFA requirement:** The test user used for Path 2 must be able to complete sign-in without additional interactive challenges (for example, MFA approvals, captchas, or forced password changes).  If your tenant enforces MFA, use Path 1 with an injected `PLAYWRIGHT_AUTH_STATE_FILE` captured from a manually authenticated session instead of relying on the headless sign-in flow.

### Path 3 — Fallback (local dev without credentials)

If neither `PLAYWRIGHT_AUTH_STATE_FILE` nor the email/password variables are set, global setup writes an empty storage state (`{ cookies: [], origins: [] }`) so that the setup phase itself passes.  Individual authenticated tests will then fail with a clear "not signed in" error, making it obvious which tests require credentials.

In CI, missing credentials cause an immediate error (`throw new Error(…)`) rather than writing an empty state, because a CI run with misconfigured credentials should fail fast with an actionable message.

### Auth state file

`e2e/.auth/user.json` is listed in `.gitignore` and **must never be committed**.  It contains live session cookies and MSAL tokens for a real Azure AD user.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PLAYWRIGHT_BASE_URL` | Yes | `http://localhost:3000` | Base URL of the running client app.  All `page.goto()` calls with relative paths resolve against this URL. |
| `PLAYWRIGHT_TEST_USER_EMAIL` | Yes (for Path 2) | — | Azure AD test user e-mail address used in the headless MSAL sign-in flow. |
| `PLAYWRIGHT_TEST_USER_PASSWORD` | Yes (for Path 2) | — | Azure AD test user password.  Store as a GitHub Actions secret; never log or commit. |
| `PLAYWRIGHT_AUTH_STATE_FILE` | No | — | Path to a pre-authenticated Playwright storage state file.  When set and the file exists, global setup copies it to `e2e/.auth/user.json` and skips the headless sign-in entirely. |
| `CI` | No | — | Set automatically by GitHub Actions.  When truthy, Playwright uses 1 retry, 2 workers, and fails the run if `test.only` is left in source. |

---

## Playwright configuration reference

Key settings in `client/playwright.config.ts`:

| Setting | Value |
|---|---|
| `testDir` | `./e2e` |
| `globalSetup` | `./e2e/global-setup.ts` |
| `timeout` | 30 000 ms per test |
| `expect.timeout` | 10 000 ms per assertion |
| `retries` | 1 on CI, 0 locally |
| `workers` | 2 on CI, Playwright default locally (typically one per CPU core) |
| `fullyParallel` | `true` — tests run in parallel within files |
| `forbidOnly` | `true` on CI — build fails if `test.only` is left in source |

### Browsers

Only Chromium is enabled.  Firefox and Safari projects are present but commented out in `playwright.config.ts`.  If cross-browser coverage is needed in future, raise a separate issue rather than uncommenting them without ensuring all required environment variables and CI capacity are available.

### Artifacts on failure

| Artifact | When collected | Retention (CI) |
|---|---|---|
| Screenshots (`.png`) | On failure | 7 days |
| Video (`.webm`) | On first retry | 14 days (embedded in HTML report) |
| Traces (`.zip`) | On first retry | 7 days |
| HTML report | Always | 14 days |
| JUnit XML | Always | 14 days |

---

## Running tests locally

### Prerequisites

- The backend API server is running.
- The client Vite dev server is running on port 3000: `npm run dev` from `client/`.
- The required environment variables are set (see table above).

### Steps

```bash
# 1. Install Playwright browsers (run once, or after upgrading Playwright)
cd client
npx playwright install --with-deps chromium

# 2. Set environment variables (example — do not put real passwords in shell history)
export PLAYWRIGHT_BASE_URL=http://localhost:3000
export PLAYWRIGHT_TEST_USER_EMAIL=testuser@example.com
export PLAYWRIGHT_TEST_USER_PASSWORD=<redacted>
#    Prefer loading secrets from a local .env file (ignored by Git), a secret manager,
#    or by prefixing the command for a single run, for example:
#    PLAYWRIGHT_TEST_USER_PASSWORD=<redacted> npm run test:e2e

# 3. Run all E2E tests (headless)
npm run test:e2e

# 4. Run with the interactive Playwright UI (useful for debugging)
npm run test:e2e:ui

# 5. Open the HTML report after a run
npm run test:e2e:report
```

The NPM scripts are defined in `client/package.json`:

| Script | Command |
|---|---|
| `test:e2e` | `playwright test` |
| `test:e2e:ui` | `playwright test --ui` |
| `test:e2e:report` | `playwright show-report` |

---

## CI configuration

### The `e2e` job in `.github/workflows/ci.yml`

The `e2e` job runs Playwright tests in GitHub Actions.

**Condition:** The job only runs when `vars.RUN_E2E == 'true'`.  This prevents the job from failing on PRs in environments that have no deployment target or Azure AD test credentials configured.

**Dependency:** The job runs after the `client` job succeeds (`needs: client`).

**Secrets and variables required:**

| Name | Kind | Description |
|---|---|---|
| `RUN_E2E` | Repository variable | Must be `'true'` for the job to run at all |
| `PLAYWRIGHT_BASE_URL` | Repository variable | URL of the deployed client app |
| `PLAYWRIGHT_TEST_USER_EMAIL` | Repository secret | Azure AD test user e-mail |
| `PLAYWRIGHT_TEST_USER_PASSWORD` | Repository secret | Azure AD test user password |

**Artifacts produced:**

| Artifact name | Contents | Retention |
|---|---|---|
| `playwright-report` | Interactive HTML report and videos for first-retry failures | 14 days |
| `test-results-e2e` | JUnit XML (`test-results/e2e.xml`) | 14 days |
| `playwright-screenshots` | Screenshots on failure | 7 days |
| `playwright-traces` | Trace archives (`.zip`) on failure | 7 days |

All artifacts are uploaded with `if-no-files-found: ignore` so a passing run does not fail the upload step.

> **CI target:** The `e2e` job runs against the **deployed application** pointed to by `PLAYWRIGHT_BASE_URL`.  It does not spin up a local dev server.  Make sure the URL is reachable from GitHub Actions runners.

### GitHub Actions setup checklist

Use this checklist when enabling E2E tests in CI for a new environment:

- [ ] Set repository variable `RUN_E2E` to `true` (Settings → Variables → Actions → New repository variable)
- [ ] Set repository variable `PLAYWRIGHT_BASE_URL` to the deployed client URL (e.g. `https://app.example.com`)
- [ ] Add repository secret `PLAYWRIGHT_TEST_USER_EMAIL` (Settings → Secrets → Actions)
- [ ] Add repository secret `PLAYWRIGHT_TEST_USER_PASSWORD`
- [ ] Ensure the Azure AD test user account exists in the tenant and can authenticate without MFA interruption, or configure the 30-second MFA window to be sufficient

---

## Page Object Model conventions

All page objects live in `client/e2e/pages/`.  Each is a plain TypeScript class following these conventions:

- **Typed `Locator` properties** for all key UI elements, using stable selectors (`getByRole`, `getByLabel`, element IDs).
- **Action methods** that encapsulate multi-step interactions (e.g. `goto()`, `openGroup()`, `fillAndSubmitForm()`).
- **No assertions** inside page objects — keep all `expect(…)` calls in test spec files.

### Existing page objects

| Class | File | Route |
|---|---|---|
| `LoginPage` | `pages/LoginPage.ts` | `/login` |
| `GroupsListPage` | `pages/GroupsListPage.ts` | `/groups` |
| `GroupDetailPage` | `pages/GroupDetailPage.ts` | `/groups/:groupId` |
| `EventDetailPage` | `pages/EventDetailPage.ts` | `/groups/:groupId/events/:eventId` |
| `EventCreatePage` | `pages/EventCreatePage.ts` | Event creation form (structured and text-capture modes) |

### Example: adding a new page object

```typescript
// client/e2e/pages/MyNewPage.ts
import { type Page, type Locator } from '@playwright/test';

export class MyNewPage {
  readonly heading: Locator;
  readonly submitButton: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'My Page' });
    this.submitButton = page.getByRole('button', { name: 'Submit' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/my-new-page');
  }
}
```

---

## ApiHelper — test data setup and teardown

`client/e2e/helpers/api.ts` provides a thin typed wrapper around the Nova-Circle backend REST API.  Use it in `beforeEach` / `afterEach` hooks to create and clean up test data deterministically, without relying on the UI.

### Instantiation

```typescript
import { ApiHelper } from './helpers/api';

// In a test file:
let api: ApiHelper;

test.beforeEach(async () => {
  // Reads the auth state from e2e/.auth/user.json and extracts the MSAL bearer token.
  api = ApiHelper.fromStorageState();
});
```

`ApiHelper.fromStorageState()` accepts two optional parameters:

| Parameter | Default | Description |
|---|---|---|
| `storageStatePath` | `e2e/.auth/user.json` | Path to the Playwright storage state file |
| `baseUrl` | `PLAYWRIGHT_BASE_URL` or `http://localhost:5173` | Origin that serves the `/api` path (typically the app/client origin), not necessarily the backend server's direct host/port |

### Available methods

| Method | HTTP call | Description |
|---|---|---|
| `listGroups()` | `GET /api/v1/groups` | Lists all groups the test user belongs to |
| `createGroup(payload)` | `POST /api/v1/groups` | Creates a group and returns its summary |
| `deleteGroup(groupId)` | `DELETE /api/v1/groups/:groupId` | Deletes a group by ID (owner only) |
| `listEvents(groupId)` | `GET /api/v1/groups/:groupId/events` | Lists events in a group |
| `createEvent(payload)` | `POST /api/v1/groups/:groupId/events` | Creates an event and returns its summary |
| `cancelEvent(groupId, eventId)` | `DELETE /api/v1/groups/:groupId/events/:eventId` | Soft-cancels an event |

### Example: create and clean up test data

```typescript
import { test, expect } from '@playwright/test';
import { ApiHelper } from './helpers/api';
import type { GroupSummary } from './helpers/api';

let api: ApiHelper;
let group: GroupSummary;

test.beforeEach(async () => {
  api = ApiHelper.fromStorageState();
  group = await api.createGroup({ name: `Test group ${Date.now()}` });
});

test.afterEach(async () => {
  await api.deleteGroup(group.id);
});

test('group appears in the groups list', async ({ page }) => {
  // … navigate and assert …
});
```

### MSAL token extraction

`ApiHelper.fromStorageState()` searches all origins in the Playwright storage state for a localStorage entry whose key contains `accesstoken` (case-insensitive) and whose value is a JSON object with a `secret` property.  This matches the MSAL (`@azure/msal-browser`) storage format for access tokens.

If the MSAL library changes its cache format — for example after a major version upgrade — the token extraction logic in `helpers/api.ts` will need updating.

---

## Auth context factories

`client/e2e/helpers/auth.ts` exports two factory functions for creating browser contexts in tests that need to explicitly control authentication state:

| Function | Description |
|---|---|
| `authenticatedContext(browser)` | Returns a browser context loaded with the saved auth state from `e2e/.auth/user.json` |
| `unauthenticatedContext(browser)` | Returns a fresh browser context with empty cookies and localStorage |

These are useful when a single spec file needs to test both authenticated and unauthenticated flows without relying on the project-level `storageState` setting.

---

## Related documents

- [testing.md](testing.md) — Overall test strategy: unit, integration, API, and authorization tests
- [ci-cd.md](ci-cd.md) — CI/CD pipeline, quality gates, and merge blockers
- [access-control.md](access-control.md) — Authorization model and test matrix
