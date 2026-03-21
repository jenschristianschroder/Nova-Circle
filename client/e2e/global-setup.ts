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

  // Directory for debug screenshots — uploaded as a CI artifact on failure.
  const screenshotDir = path.join(__dirname, '..', 'test-results');
  fs.mkdirSync(screenshotDir, { recursive: true });

  try {
    console.log(`[global-setup] Starting test user sign-in against ${baseURL}`);

    // Navigate to the login page; ProtectedRoute will redirect here for
    // unauthenticated users.
    await page.goto(`${baseURL}/login`);

    // Click the "Sign in" button which triggers the MSAL loginRedirect() flow.
    const signInButton = page.getByRole('button', { name: /sign in/i });
    await signInButton.click();

    // Wait for the browser to land on the Microsoft-hosted login page.
    // MSAL's loginRedirect() performs a full-page navigation so we must wait
    // for the destination URL before interacting with its form elements.
    //
    // NOTE: The CSS selectors below use the stable `name` attributes that
    // Microsoft's standard login page has used for many years
    // (input[name="loginfmt"] for the username/email field,
    //  input[name="passwd"] for the password field).  These are more reliable
    //  than aria-label or role selectors which can vary across tenant
    //  configurations and UI refreshes.  If this step breaks, inspect the
    //  page source at login.microsoftonline.com to verify the field names.
    await page.waitForURL(/login\.microsoftonline\.com/, { timeout: 30_000 });
    console.log('[global-setup] Reached Azure AD login page');

    // Fill in the username / email and advance to the password step.
    await page.locator('input[name="loginfmt"]').fill(email);
    await page.locator('input[type="submit"]').click();

    // The password input appears on the same or a subsequent step; wait for
    // it to be visible before filling to avoid a race with Azure AD's JS.
    await page.waitForSelector('input[name="passwd"]', { timeout: 15_000 });
    await page.locator('input[name="passwd"]').fill(password);
    await page.locator('input[type="submit"]').click();
    console.log('[global-setup] Credentials submitted');

    // Microsoft may display a "Stay signed in?" prompt after a successful
    // password entry.  Dismiss it by clicking "No" so the redirect completes.
    const staySignedInPrompt = page.getByText(/stay signed in/i);
    const noButton = page.getByRole('button', { name: /^no$/i });
    if (await staySignedInPrompt.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await noButton.click();
    }

    // Wait until we are redirected back to the application (groups page).
    await page.waitForURL(`${baseURL}/groups`, { timeout: 60_000 });

    fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });
    await context.storageState({ path: AUTH_STATE_PATH });
    console.log(`[global-setup] Auth state saved to ${AUTH_STATE_PATH}`);
  } catch (err) {
    // Capture a screenshot at the point of failure so that CI artifacts give
    // a visual clue about what went wrong (e.g. wrong page, error message).
    try {
      const screenshotPath = path.join(screenshotDir, 'global-setup-failure.png');
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.error(`[global-setup] Failure screenshot saved to ${screenshotPath}`);
    } catch {
      // Ignore screenshot errors — the original error is more important.
    }
    throw err;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
