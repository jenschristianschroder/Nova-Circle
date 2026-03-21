/**
 * Playwright global setup — runs once before all test projects.
 *
 * Produces a browser storage state (cookies + localStorage) that represents a
 * signed-in user.  Subsequent test projects load this state via
 * `use.storageState` in playwright.config.ts so that individual tests do not
 * need to sign in themselves.
 *
 * Strategy (in order of preference):
 *  1. If PLAYWRIGHT_AUTH_STATE_FILE points to an existing file, copy it into
 *     e2e/.auth/user.json and skip the interactive sign-in entirely.  This is
 *     the fastest path and is used when a pre-authenticated session is
 *     injected by the CI environment.
 *  2. Otherwise perform a headless username/password sign-in using
 *     PLAYWRIGHT_TEST_USER_EMAIL and PLAYWRIGHT_TEST_USER_PASSWORD (stored as
 *     GitHub Actions secrets).  This path exercises the real MSAL flow
 *     against Azure AD and saves the resulting storage state.
 *
 * The saved state file is excluded from git via .gitignore (e2e/.auth/).
 */

import { chromium, type FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_STATE_PATH = path.join(__dirname, '.auth', 'user.json');

async function globalSetup(_config: FullConfig): Promise<void> {
  // ── Path 1: pre-authenticated state injected by CI ─────────────────────────
  const injectedStatePath = process.env['PLAYWRIGHT_AUTH_STATE_FILE'];
  if (injectedStatePath && fs.existsSync(injectedStatePath)) {
    fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });
    fs.copyFileSync(injectedStatePath, AUTH_STATE_PATH);
    console.log(`[global-setup] Using injected auth state from ${injectedStatePath}`);
    return;
  }

  // ── Path 2: headless username/password sign-in ──────────────────────────────
  const email = process.env['PLAYWRIGHT_TEST_USER_EMAIL'];
  const password = process.env['PLAYWRIGHT_TEST_USER_PASSWORD'];

  if (!email || !password) {
    if (process.env['CI']) {
      // In CI, missing credentials means the job was mis-configured.  Fail fast
      // with a clear message rather than silently producing invalid auth state.
      throw new Error(
        '[global-setup] Running in CI but PLAYWRIGHT_TEST_USER_EMAIL / ' +
          'PLAYWRIGHT_TEST_USER_PASSWORD are not set. ' +
          'Configure these as GitHub Actions secrets and ensure vars.RUN_E2E == "true".',
      );
    }

    // In local development, write an empty storage state so the 'setup'
    // project still passes.  Authenticated tests will fail individually with
    // a clear "not signed in" error, which is preferable to aborting the
    // entire setup and hiding which tests actually need auth.
    console.warn(
      '[global-setup] Neither PLAYWRIGHT_AUTH_STATE_FILE nor ' +
        'PLAYWRIGHT_TEST_USER_EMAIL / PLAYWRIGHT_TEST_USER_PASSWORD are set. ' +
        'Writing empty auth state – authenticated tests will fail.',
    );
    fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });
    fs.writeFileSync(AUTH_STATE_PATH, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  // Normalize the base URL: strip any trailing slash so that URL
  // concatenation (e.g. `${baseURL}/groups`) never produces a double-slash.
  const rawBaseURL =
    process.env['PLAYWRIGHT_BASE_URL'] ?? _config.use?.baseURL ?? 'http://localhost:3000';
  const baseURL = rawBaseURL.replace(/\/+$/, '');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log(`[global-setup] Starting test user sign-in against ${baseURL}`);

    // Navigate to the login page; ProtectedRoute will redirect here for
    // unauthenticated users.
    await page.goto(`${baseURL}/login`);

    // Click the "Sign in" button which triggers the MSAL redirect flow.
    // Azure AD / External ID then renders its own hosted login UI.
    //
    // NOTE: The selectors below target Microsoft's hosted login page and may
    // require updates if Microsoft changes the UI.  If this step fails, check
    // whether the Azure AD login page layout has changed and update the
    // locators accordingly.
    const signInButton = page.getByRole('button', { name: /sign in/i });
    await signInButton.click();

    // Fill in credentials on the Azure AD login page.
    await page.getByLabel(/email|username/i).fill(email);
    await page.getByRole('button', { name: /next|continue/i }).click();
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();

    // Microsoft may display a "Stay signed in?" prompt after a successful
    // password entry.  Dismiss it by clicking "No" so the redirect completes.
    const staySignedInPrompt = page.getByText(/stay signed in/i);
    const noButton = page.getByRole('button', { name: /^no$/i });
    if (await staySignedInPrompt.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await noButton.click();
    }

    // Wait until we are redirected back to the application (groups page).
    // The timeout covers MFA prompts or slow Azure AD responses.
    await page.waitForURL(`${baseURL}/groups`, { timeout: 60_000 });

    fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });
    await context.storageState({ path: AUTH_STATE_PATH });
    console.log(`[global-setup] Auth state saved to ${AUTH_STATE_PATH}`);
  } finally {
    await browser.close();
  }
}

export default globalSetup;
