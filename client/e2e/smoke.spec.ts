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

/** Maximum time to wait for the groups API fetch to resolve after page load.
 *  The budget is generous to accommodate slow cold-start scenarios in Azure
 *  Container Apps where the first request after a scale-out can be delayed. */
const GROUPS_LOAD_TIMEOUT_MS = 15_000;

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
  test('authenticated user sees the groups list page with no API error', async ({ page }) => {
    const groupsPage = new GroupsListPage(page);
    await groupsPage.goto();

    // The page should not redirect back to /login.
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

    // The page should be reachable (no error boundary visible).
    await expect(page.locator('body')).toBeVisible();

    // Wait for the groups fetch to resolve (loading indicator disappears).
    // A generous budget covers slow cold-start scenarios in Azure Container Apps.
    await expect(page.getByText('Loading groups…')).not.toBeVisible({ timeout: GROUPS_LOAD_TIMEOUT_MS });

    // The API must have succeeded — the error banner must not be shown.
    // This assertion catches backend failures such as a broken database
    // connection that would otherwise only surface as skipped group-list tests.
    await expect(page.getByText('Failed to load groups')).not.toBeVisible();
  });
});
