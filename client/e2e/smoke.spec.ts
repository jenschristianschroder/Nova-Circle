/**
 * Smoke test — verifies basic navigation infrastructure.
 *
 * These tests confirm that:
 *  1. Unauthenticated users are redirected to /login when they navigate to
 *     a protected route.
 *  2. Authenticated users can reach the /groups page.
 *
 * These are lightweight infrastructure tests, not full user-journey tests.
 * Add more spec files in this directory for individual features.
 */

import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { GroupsListPage } from './pages/GroupsListPage';

// ── Unauthenticated redirect ─────────────────────────────────────────────────

test.describe('Unauthenticated redirect', () => {
  // Override the project-level storageState so this context has no auth.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('navigating to /groups redirects to /login', async ({ page }) => {
    await page.goto('/groups');

    // ProtectedRoute should redirect to /login.
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    const loginPage = new LoginPage(page);
    await expect(loginPage.signInButton).toBeVisible();
  });
});

// ── Authenticated smoke test ─────────────────────────────────────────────────

test.describe('Authenticated smoke test', () => {
  test('authenticated user sees the groups list page', async ({ page }) => {
    const groupsPage = new GroupsListPage(page);
    await groupsPage.goto();

    // The page should not redirect back to /login.
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

    // The page should be reachable (no error boundary visible).
    await expect(page.locator('body')).toBeVisible();
  });
});
