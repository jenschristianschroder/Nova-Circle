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

import { chromium, type FullConfig, type Request } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_STATE_PATH = path.join(__dirname, '.auth', 'user.json');
const BEARER_TOKEN_PATH = path.join(__dirname, '.auth', 'bearer_token.txt');

/**
 * Injects the Bearer token as an unencrypted MSAL v5 cache entry in the
 * browser's localStorage.
 *
 * MSAL v5 (msal-browser ^5) encrypts its localStorage token cache using a
 * symmetric key stored in a session cookie ("msal.cache.encryption").  When
 * Playwright restores a storageState in a new browser context the cookie may
 * not be available, causing MSAL to generate a fresh key and discard all
 * previously cached tokens — then fall back to an iframe-based silent auth
 * that takes up to 10 seconds (DEFAULT_IFRAME_TIMEOUT_MS).
 *
 * MSAL v5's importExistingCache() gracefully handles non-encrypted (plain
 * JSON) entries: it re-encrypts them with the current key and returns the
 * value.  By writing plain entries we give MSAL a readable token regardless
 * of whether the original encryption cookie was restored.
 *
 * The TOKEN_KEYS index (msal.2.token.keys.<clientId>) is also overwritten in
 * plain JSON so that importExistingCache() can discover the injected entry
 * without needing to decrypt an existing encrypted index.
 */
async function injectMsalCacheEntry(
  page: import('@playwright/test').Page,
  bearerToken: string,
): Promise<void> {
  await page.evaluate((token: string) => {
    try {
      const parts = token.split('.');
      if (parts.length < 2) return;

      // Decode the JWT payload (base64url → JSON).
      const base64UrlPayload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const paddingLength = (4 - (base64UrlPayload.length % 4)) % 4;
      const payloadJson = atob(base64UrlPayload + '='.repeat(paddingLength));
      const payload = JSON.parse(payloadJson) as Record<string, unknown>;

      const oid = payload['oid'] as string | undefined;
      const tid = payload['tid'] as string | undefined;
      const aud = payload['aud'] as string | undefined;
      const exp = payload['exp'] as number | undefined;
      const iat = payload['iat'] as number | undefined;

      if (!oid || !tid || !aud || !exp) return;

      const homeAccountId = `${oid}.${tid}`;
      const environment = 'login.microsoftonline.com';
      const realm = tid;
      // Audience is "api://<clientId>"; extract clientId for the cache key.
      const clientId = aud.startsWith('api://') ? aud.slice(6) : aud;
      const target = `api://${clientId}/user_impersonation`;

      // MSAL v5 cache key format (all lowercase, pipe-separated):
      // "msal.2|<homeAccountId>|<environment>|accesstoken|<clientId>|<realm>|<target>|"
      const accessTokenKey = [
        'msal.2',
        homeAccountId,
        environment,
        'accesstoken',
        clientId,
        realm,
        target,
        '',
      ]
        .join('|')
        .toLowerCase();

      const now = Math.floor(Date.now() / 1000);
      const cacheEntry = {
        homeAccountId,
        credentialType: 'AccessToken',
        secret: token,
        environment,
        clientId,
        target,
        realm,
        tokenType: 'Bearer',
        cachedAt: String(iat ?? now),
        expiresOn: String(exp),
        extendedExpiresOn: String(exp + 3600),
      };

      // Write the access token entry as plain JSON.
      localStorage.setItem(accessTokenKey, JSON.stringify(cacheEntry));

      // Read the existing TOKEN_KEYS index if it is plain JSON; otherwise
      // start from an empty index.  An encrypted index ({id, nonce, data})
      // cannot be read here so we reset it — the other encrypted entries will
      // simply fail to decrypt in importExistingCache() and be discarded.
      const tokenKeysKey = `msal.2.token.keys.${clientId}`;
      let tokenKeys: { idToken: string[]; accessToken: string[]; refreshToken: string[] } = {
        idToken: [],
        accessToken: [],
        refreshToken: [],
      };
      const existingStr = localStorage.getItem(tokenKeysKey);
      if (existingStr) {
        try {
          const parsed = JSON.parse(existingStr) as typeof tokenKeys;
          // Only use it when it is a plain token-keys object, not an encrypted blob.
          if (
            !Object.prototype.hasOwnProperty.call(parsed, 'id') &&
            !Object.prototype.hasOwnProperty.call(parsed, 'nonce')
          ) {
            tokenKeys = parsed;
          }
        } catch {
          // Parsing failed — keep the empty token keys.
        }
      }

      if (!tokenKeys.accessToken.includes(accessTokenKey)) {
        tokenKeys.accessToken = [...tokenKeys.accessToken, accessTokenKey];
      }

      // Overwrite the TOKEN_KEYS index with plain JSON.
      localStorage.setItem(tokenKeysKey, JSON.stringify(tokenKeys));
    } catch {
      // Never crash global-setup due to cache injection errors.
    }
  }, bearerToken);
}

async function globalSetup(_config: FullConfig): Promise<void> {
  // ── Path 1: pre-authenticated state injected by CI ─────────────────────────
  const injectedStatePath = process.env['PLAYWRIGHT_AUTH_STATE_FILE'];
  if (injectedStatePath && fs.existsSync(injectedStatePath)) {
    fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });
    fs.copyFileSync(injectedStatePath, AUTH_STATE_PATH);
    console.log(`[global-setup] Using injected auth state from ${injectedStatePath}`);

    // Even when using a pre-authenticated state, navigate to /groups to capture
    // the Bearer token from the first API request.  This writes bearer_token.txt
    // so ApiHelper.fromStorageState() works, and injects a plain MSAL cache
    // entry so the smoke test's acquireTokenSilent() uses the fast path rather
    // than the 10-second iframe silent-auth fallback.
    const rawBaseURL =
      process.env['PLAYWRIGHT_BASE_URL'] ?? _config.use?.baseURL ?? 'http://localhost:3000';
    const baseURL = rawBaseURL.replace(/\/+$/, '');

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ storageState: AUTH_STATE_PATH });
      const page = await context.newPage();

      let capturedBearerToken = '';
      page.on('request', (req: Request) => {
        const authHeader = req.headers()['authorization'];
        if (
          !capturedBearerToken &&
          typeof authHeader === 'string' &&
          authHeader.startsWith('Bearer ') &&
          req.url().includes('/api/v1/')
        ) {
          capturedBearerToken = authHeader.slice(7);
        }
      });

      await page.goto(`${baseURL}/groups`);
      // Wait for the groups API call to settle.
      try {
        await page.getByText('Loading groups…').waitFor({ state: 'hidden', timeout: 30_000 });
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'TimeoutError') throw err;
      }

      if (capturedBearerToken) {
        await injectMsalCacheEntry(page, capturedBearerToken);
        await context.storageState({ path: AUTH_STATE_PATH });
        fs.writeFileSync(BEARER_TOKEN_PATH, capturedBearerToken, 'utf-8');
        console.log(`[global-setup] Bearer token saved to ${BEARER_TOKEN_PATH}`);
      } else {
        console.warn(
          '[global-setup] No Bearer token captured from injected-state path. ' +
            'ApiHelper-based tests may be skipped.',
        );
      }
    } finally {
      await browser.close();
    }
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

  // Capture the Bearer token from the first authenticated API request.
  // MSAL v5 encrypts its localStorage cache with a session-cookie-based key
  // that may not survive Playwright's storageState round-trip.  Capturing
  // the raw Bearer token lets us:
  //  1. Save it to bearer_token.txt so ApiHelper.fromStorageState() can use it
  //     even when the MSAL encrypted cache is unreadable.
  //  2. Inject it back into localStorage as an unencrypted MSAL cache entry so
  //     the smoke test's acquireTokenSilent() can find it immediately (fast path)
  //     even if the encryption key cookie is not restored by Playwright.
  // JavaScript's event loop is single-threaded: the request handler cannot
  // interleave with itself, so the !capturedBearerToken guard is sufficient
  // to capture only the first token without a separate lock.
  let capturedBearerToken = '';
  page.on('request', (req: Request) => {
    const authHeader = req.headers()['authorization'];
    if (
      !capturedBearerToken &&
      typeof authHeader === 'string' &&
      authHeader.startsWith('Bearer ') &&
      req.url().includes('/api/v1/')
    ) {
      capturedBearerToken = authHeader.slice(7);

      // ── TEMPORARY DEBUG LOGGING (remove after root cause is found) ────────
      // Decode (NOT verify) the JWT payload to log claims visible in CI logs.
      // These are public OAuth identifiers — not secrets.
      try {
        const parts = capturedBearerToken.split('.');
        if (parts.length >= 2) {
          const base64Url = parts[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonStr = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
          const payload = JSON.parse(jsonStr) as Record<string, unknown>;
          console.log('[global-setup][auth-debug] Captured Bearer token claims:', {
            aud: payload['aud'],
            iss: payload['iss'],
            scp: payload['scp'],
            roles: payload['roles'],
            azp: payload['azp'],
            appid: payload['appid'],
            tid: payload['tid'],
            ver: payload['ver'],
            exp: payload['exp'],
            nbf: payload['nbf'],
          });
        }
      } catch {
        console.log('[global-setup][auth-debug] Could not decode Bearer token JWT payload');
      }
      // ── END TEMPORARY DEBUG LOGGING ───────────────────────────────────────
    }
  });

  // Capture API response status to surface infrastructure issues.
  // Common failures: 401 (token invalid), 500 (DB unreachable), HTML response
  // (nginx proxy not configured — API_BASE_URL missing on frontend).
  page.on('response', async (resp) => {
    if (resp.url().includes('/api/v1/')) {
      const ct = resp.headers()['content-type'] ?? '';
      if (resp.status() >= 400 || !ct.includes('application/json')) {
        // ── TEMPORARY DEBUG LOGGING (remove after root cause is found) ──────
        let responseBody = '';
        try {
          responseBody = await resp.text();
        } catch {
          responseBody = '<unable to read body>';
        }
        console.log(
          `[global-setup] API response: ${resp.status()} ${resp.url()} ` +
            `(content-type: ${ct || 'missing'}) body: ${responseBody}`,
        );
        // ── END TEMPORARY DEBUG LOGGING ─────────────────────────────────────
      }
    }
  });

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
    // waitFor() polls until the heading is visible or the timeout expires.
    // Expected non-error cases (prompt absent → TimeoutError, or the page
    // navigated away before we could check → navigation/detach error) are
    // logged and suppressed.  Any other error is rethrown so genuine failures
    // (e.g. the "No" button selector changing) surface immediately.
    try {
      await page
        .getByRole('heading', { name: /stay signed in/i })
        .waitFor({ state: 'visible', timeout: 10_000 });
      console.log('[global-setup] "Stay signed in?" prompt detected, clicking No…');
      await page.getByRole('button', { name: /^no$/i }).click();
    } catch (err: unknown) {
      // Only suppress expected cases:
      //  - timeout while waiting for the prompt heading, meaning it never appeared
      //  - navigation / detached-frame / closed-page errors during redirect
      if (err instanceof Error) {
        const isTimeoutError = err.name === 'TimeoutError';
        const isNavigationOrDetachError =
          /Target page, context or browser has been closed/i.test(err.message) ||
          /Navigation interrupted/i.test(err.message) ||
          /Execution context was destroyed/i.test(err.message);

        if (isTimeoutError || isNavigationOrDetachError) {
          console.log(
            '[global-setup] "Stay signed in?" prompt not shown or dismissed during redirect; continuing…',
          );
        } else {
          console.error(
            '[global-setup] Unexpected error while handling "Stay signed in?" prompt:',
            err,
          );
          throw err;
        }
      } else {
        // Non-Error throwables are unexpected; rethrow to avoid masking issues.
        throw err;
      }
    }

    // Wait until we are redirected back to the application (groups page).
    await page.waitForURL(`${baseURL}/groups`, { timeout: 60_000 });

    // Wait for the groups API call to settle (loading indicator disappears).
    // This gives MSAL time to acquire and cache the access token in localStorage
    // before we snapshot the storage state — without this wait the snapshot may
    // be taken before acquireTokenSilent completes and ApiHelper.fromStorageState()
    // will throw "No MSAL access token found".
    //
    // Only suppress "strict mode violation" / element-not-found errors — these
    // mean the spinner was never rendered (fast response or already done) and are
    // safe to ignore.  Real timeout errors (page stuck loading) are re-thrown so
    // CI surfaces the failure rather than saving a storageState without a token.
    try {
      await page.getByText('Loading groups…').waitFor({ state: 'hidden', timeout: 30_000 });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw err;
      }
      // Element was never present — spinner didn't render before we checked.
    }

    // Fail fast if the API call itself failed.  Saving a broken auth state
    // produces confusing downstream failures in the smoke test; a clear error
    // here surfaces the actual root cause (authentication or database issue).
    const apiErrorVisible = await page.getByText('Failed to load groups').isVisible();
    if (apiErrorVisible) {
      throw new Error(
        '[global-setup] The groups API call failed after sign-in ("Failed to load groups" ' +
          'is visible). Check:\n' +
          '  • Nginx proxy: is API_BASE_URL set on the frontend container? (empty = /api proxy not configured)\n' +
          '  • Azure AD: is the user_impersonation scope exposed on the API app registration?\n' +
          '  • Azure AD: has admin consent been granted for the scope?\n' +
          '  • API container: is DATABASE_URL set and is the database reachable?\n' +
          '  • CORS: is CORS_ORIGIN set on the API container to the frontend URL?\n' +
          'Run bootstrap.sh to fix Azure AD and infrastructure configuration.',
      );
    }

    fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });
    await context.storageState({ path: AUTH_STATE_PATH });
    console.log(`[global-setup] Auth state saved to ${AUTH_STATE_PATH}`);

    // If we captured a Bearer token, inject it as an unencrypted MSAL v5 cache
    // entry so the smoke test's acquireTokenSilent() can use it immediately.
    // MSAL v5 stores tokens encrypted with a session-cookie key; when Playwright
    // restores the storage state that key may not be available, causing a 10-second
    // iframe-based silent-auth timeout.  Injecting a plain (unencrypted) entry
    // that MSAL v5 will re-encrypt on first read avoids this cold path.
    if (capturedBearerToken) {
      await injectMsalCacheEntry(page, capturedBearerToken);
      // Re-save auth state so the injected entries are included.
      await context.storageState({ path: AUTH_STATE_PATH });
      console.log('[global-setup] Re-saved auth state with injected MSAL cache entries.');

      // Also persist the raw token so ApiHelper.fromStorageState() can read it
      // independently of MSAL's (potentially encrypted) localStorage format.
      fs.writeFileSync(BEARER_TOKEN_PATH, capturedBearerToken, 'utf-8');
      console.log(`[global-setup] Bearer token saved to ${BEARER_TOKEN_PATH}`);
    } else {
      console.warn(
        '[global-setup] No Bearer token was captured from API requests. ' +
          'ApiHelper-based tests may be skipped if the MSAL localStorage cache is unreadable.',
      );
    }
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
