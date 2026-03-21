/**
 * Authentication helpers for Playwright E2E tests.
 *
 * Provides two context factories:
 *  - authenticatedContext()   — loads the storage state produced by
 *                               global-setup.ts so the user is already
 *                               signed in.
 *  - unauthenticatedContext() — creates a brand-new browser context with
 *                               no cookies or storage so the user is
 *                               treated as anonymous (used for redirect
 *                               and login-page tests).
 */

import { type Browser, type BrowserContext } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Path to the storage state file written by global-setup.ts. */
const AUTH_STATE_PATH = path.join(__dirname, '..', '.auth', 'user.json');

/**
 * Creates a browser context pre-loaded with the saved authentication state.
 *
 * @param browser - The Playwright Browser instance from the test fixture.
 * @returns       A BrowserContext whose cookies and localStorage mirror a
 *                signed-in session.
 */
export async function authenticatedContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ storageState: AUTH_STATE_PATH });
}

/**
 * Creates a fresh browser context with no authentication state.
 *
 * Use this for tests that verify unauthenticated behaviour (e.g. that
 * navigating to a protected route redirects to /login).
 *
 * @param browser - The Playwright Browser instance from the test fixture.
 * @returns       A BrowserContext with empty cookies and localStorage.
 */
export async function unauthenticatedContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ storageState: { cookies: [], origins: [] } });
}
