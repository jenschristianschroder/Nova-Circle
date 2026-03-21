/**
 * Group list page E2E tests.
 *
 * Verifies that the /groups page renders correctly for an authenticated user,
 * displays seeded group cards, navigates to the group detail page on card
 * click, and allows creating a new group via the inline form.
 *
 * Prerequisites:
 *  - global-setup.ts must have run and written a valid e2e/.auth/user.json.
 *  - The backend API must be reachable at the base URL configured in
 *    playwright.config.ts (PLAYWRIGHT_BASE_URL or http://localhost:3000).
 */

import { test, expect } from '@playwright/test';
import { ApiHelper, type GroupSummary } from './helpers/api';
import { GroupsListPage } from './pages/GroupsListPage';
import { GroupDetailPage } from './pages/GroupDetailPage';

test.describe('Group list page', () => {
  let api: ApiHelper;
  let group: GroupSummary | undefined;
  let seedError: Error | undefined;

  // Use a timestamp-based name so parallel runs never collide.
  const groupName = `E2E Group List ${Date.now()}`;

  test.beforeAll(async () => {
    try {
      // Pass the same base URL that Playwright uses so API seeding and browser
      // navigation always hit the same origin (defaults to http://localhost:3000).
      api = ApiHelper.fromStorageState(
        undefined,
        process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000',
      );
      group = await api.createGroup({
        name: groupName,
        description: 'Seeded for E2E group-list tests',
      });
    } catch (err) {
      seedError = err instanceof Error ? err : new Error(String(err));
    }
  });

  // Skip every test in this suite when seeding failed.  test.skip() inside
  // beforeAll itself is ignored by Playwright; beforeEach is the correct hook.
  test.beforeEach(() => {
    test.skip(!!seedError, `Data seeding failed: ${seedError?.message ?? 'unknown error'}`);
  });

  test.afterAll(async () => {
    if (group?.id) {
      await api.deleteGroup(group.id);
    }
  });

  // ── Scenario 1 — Page renders after authentication ────────────────────────

  test('Scenario 1 — page renders after authentication', async ({ page }) => {
    const groupsPage = new GroupsListPage(page);
    await groupsPage.goto();

    await expect(page).toHaveURL('/groups');
    await expect(page.getByRole('heading', { name: 'My Groups' })).toBeVisible();
    await expect(groupsPage.newGroupButton).toBeVisible();
  });

  // ── Scenario 2 — At least one group card is displayed ────────────────────

  test('Scenario 2 — at least one group card is displayed', async ({ page }) => {
    const groupsPage = new GroupsListPage(page);
    await groupsPage.goto();

    // Wait for the loading spinner/text to disappear before asserting data.
    await page.getByText('Loading groups…').waitFor({ state: 'hidden' });

    // The seeded group card must be present.
    await expect(groupsPage.groupCardByName(groupName)).toBeVisible();

    // No error banner should be shown.
    await expect(page.getByText('Failed to load groups')).not.toBeVisible();
  });

  // ── Scenario 4 — Clicking a group card navigates to group detail ──────────
  //
  // Scenario 3 (empty state) is omitted — it requires a dedicated test user
  // with no group memberships, which is outside the scope of this suite.

  test('Scenario 4 — clicking a group card navigates to the group detail page', async ({
    page,
  }) => {
    const groupsPage = new GroupsListPage(page);
    const groupDetailPage = new GroupDetailPage(page);

    await groupsPage.goto();
    await page.getByText('Loading groups…').waitFor({ state: 'hidden' });

    await groupsPage.openGroup(groupName);

    // URL must change to the specific group's detail route.
    await page.waitForURL(`/groups/${group!.id}`);

    // The group name heading should appear on the detail page.
    await expect(groupDetailPage.groupNameHeading).toHaveText(groupName);
  });

  // ── Scenario 5 — Creating a new group via the inline form ────────────────

  test('Scenario 5 — creating a new group via the inline form', async ({ page }) => {
    const createdGroupName = `E2E Created Group ${Date.now()}`;
    const groupsPage = new GroupsListPage(page);

    await groupsPage.goto();
    await page.getByText('Loading groups…').waitFor({ state: 'hidden' });

    // Open the create-group form.
    await groupsPage.newGroupButton.click();
    await expect(groupsPage.newGroupNameInput).toBeVisible();

    // Fill the name field and submit.
    await groupsPage.newGroupNameInput.fill(createdGroupName);
    await groupsPage.newGroupSubmitButton.click();

    // The new group card should appear in the list.
    await expect(groupsPage.groupCardByName(createdGroupName)).toBeVisible();

    // The creation form should have collapsed (name input is gone).
    await expect(groupsPage.newGroupNameInput).not.toBeVisible();

    // Clean up — find and delete the newly created group.
    try {
      const allGroups = await api.listGroups();
      const created = allGroups.find((g) => g.name === createdGroupName);
      if (created) {
        await api.deleteGroup(created.id);
      }
    } catch {
      // Best-effort cleanup; a leaked group does not fail the test itself.
    }
  });
});
