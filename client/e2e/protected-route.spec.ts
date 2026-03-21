/**
 * Protected-route redirect specs.
 *
 * Verifies that every authenticated route in the application redirects
 * unauthenticated users to /login, and that /login itself is accessible
 * without auth (no redirect loop).
 *
 * All tests run with an empty browser context (no MSAL state) and therefore
 * do not require any Azure AD test-user credentials.  They can run on every
 * PR in CI without PLAYWRIGHT_TEST_USER_EMAIL / PASSWORD secrets.
 */

import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

// Apply an empty storage state to every test in this file so that no MSAL
// session is present, regardless of the project-level storageState setting.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('ProtectedRoute — unauthenticated redirects', () => {
  test('Scenario 1 — /groups redirects to /login', async ({ page }) => {
    await page.goto('/groups');

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    const loginPage = new LoginPage(page);
    await loginPage.expectVisible();
  });

  test('Scenario 2 — /groups/:groupId redirects to /login', async ({ page }) => {
    await page.goto('/groups/some-group-id');

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    const loginPage = new LoginPage(page);
    await loginPage.expectVisible();
  });

  test('Scenario 3 — /groups/:groupId/events/:eventId redirects to /login', async ({ page }) => {
    await page.goto('/groups/some-group-id/events/some-event-id');

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    const loginPage = new LoginPage(page);
    await loginPage.expectVisible();
  });

  test('Scenario 4 — /groups/:groupId/events/new redirects to /login', async ({ page }) => {
    await page.goto('/groups/some-group-id/events/new');

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    const loginPage = new LoginPage(page);
    await loginPage.expectVisible();
  });

  test('Scenario 5 — /profile redirects to /login', async ({ page }) => {
    await page.goto('/profile');

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    const loginPage = new LoginPage(page);
    await loginPage.expectVisible();
  });

  test('Scenario 6 — /login is accessible without auth (no redirect loop)', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // URL must remain on /login — no redirect to another route.
    await expect(page).toHaveURL(loginPage.url(), { timeout: 10_000 });

    // Key Login page elements must be visible.
    await loginPage.expectVisible();
  });
});
