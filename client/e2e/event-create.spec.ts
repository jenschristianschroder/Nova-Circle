/**
 * Event creation page E2E tests.
 *
 * Exercises both creation modes on /groups/:groupId/events/new:
 *   • Structured form  — Scenarios 1–4 (always run)
 *   • Text capture     — Scenarios 5–6 (guarded by RUN_CAPTURE_E2E env var)
 *   • Capture UI       — Scenario 7 (always run, no AI call)
 *
 * Prerequisites:
 *  - global-setup.ts must have run and written a valid e2e/.auth/user.json.
 *  - The backend API must be reachable at the base URL configured in
 *    playwright.config.ts (PLAYWRIGHT_BASE_URL or http://localhost:3000).
 *  - For Scenarios 5 and 6: the AI/NLP service must be reachable and
 *    RUN_CAPTURE_E2E=true must be set in the environment.
 */

import { test, expect } from '@playwright/test';
import { ApiHelper, type GroupSummary } from './helpers/api';
import { EventCreatePage } from './pages/EventCreatePage';
import { EventDetailPage } from './pages/EventDetailPage';
import { GroupDetailPage } from './pages/GroupDetailPage';

test.describe('Event creation page', () => {
  let api: ApiHelper;
  let group: GroupSummary | undefined;
  let seedError: Error | undefined;

  // Timestamp-based names so parallel runs never collide.
  const groupName = `[E2E] Event Create ${Date.now()}`;

  test.beforeAll(async () => {
    try {
      api = ApiHelper.fromStorageState(
        undefined,
        process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000',
      );
      group = await api.createGroup({ name: groupName });
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
    // Deleting the group cascades to all events created during the suite.
    if (group?.id) {
      try {
        await api.deleteGroup(group.id);
      } catch {
        // Best-effort cleanup — a leaked group must not mask a test failure.
      }
    }
  });

  // ── Scenario 1 — Form is reachable from the group detail page ────────────

  test('Scenario 1 — form is reachable from the group detail page', async ({ page }) => {
    const groupDetailPage = new GroupDetailPage(page);
    await groupDetailPage.goto(group!.id);

    // Wait for the group detail page to render before clicking.
    await expect(groupDetailPage.groupNameHeading).toBeVisible();
    await groupDetailPage.clickNewEvent();

    // URL must change to the event create route.
    await page.waitForURL(`/groups/${group!.id}/events/new`);

    // The "Create event" heading must be visible.
    await expect(page.getByRole('heading', { name: /create event/i })).toBeVisible();

    // Both mode tabs must be rendered.
    const eventCreatePage = new EventCreatePage(page);
    await expect(eventCreatePage.formTab).toBeVisible();
    await expect(eventCreatePage.captureTab).toBeVisible();
  });

  // ── Scenario 2 — Successful event creation via structured form ────────────

  test('Scenario 2 — successful event creation via structured form', async ({ page }) => {
    const eventTitle = `[E2E] Test Event ${Date.now()}`;
    // Use a datetime-local string (YYYY-MM-DDTHH:mm) seven days from now.
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const startAt = future.toISOString().slice(0, 16);

    const eventCreatePage = new EventCreatePage(page);
    await eventCreatePage.goto(group!.id);

    await eventCreatePage.fillAndSubmitForm(eventTitle, startAt);

    // After a successful submit, the browser must navigate to the event detail page.
    // The regex excludes /events/new to ensure the wait only resolves after the
    // actual event ID is present in the URL.
    await page.waitForURL(/\/groups\/[^/]+\/events\/(?!new)[^/]+/);

    // Wait for the event detail page to finish loading before asserting content.
    await page.getByText('Loading event…').waitFor({ state: 'hidden' });

    const eventDetailPage = new EventDetailPage(page);
    await expect(eventDetailPage.titleHeading).toHaveText(eventTitle);

    // The start date section must be rendered.
    await expect(page.getByText('Starts')).toBeVisible();
  });

  // ── Scenario 3 — Submit is disabled when required fields are missing ──────

  test('Scenario 3 — submit is disabled until both title and start date are filled', async ({
    page,
  }) => {
    const eventCreatePage = new EventCreatePage(page);
    await eventCreatePage.goto(group!.id);

    // Initially disabled: no title and no start date.
    await expect(eventCreatePage.submitButton).toBeDisabled();

    // Fill title only — button must remain disabled (start date still missing).
    await eventCreatePage.titleInput.fill('Only a title');
    await expect(eventCreatePage.submitButton).toBeDisabled();

    // Fill start date — button must become enabled.
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const startAt = future.toISOString().slice(0, 16);
    await eventCreatePage.startAtInput.fill(startAt);
    await expect(eventCreatePage.submitButton).toBeEnabled();
  });

  // ── Scenario 4 — Cancel navigates back to the group detail page ───────────

  test('Scenario 4 — cancel navigates back to the group detail page', async ({ page }) => {
    const groupDetailPage = new GroupDetailPage(page);

    // Navigate via the group detail page so the browser history contains it.
    await groupDetailPage.goto(group!.id);
    await expect(groupDetailPage.groupNameHeading).toBeVisible();
    await groupDetailPage.clickNewEvent();
    await page.waitForURL(`/groups/${group!.id}/events/new`);

    // Click "Cancel" — navigate(-1) must return to the group detail page.
    await page.getByRole('button', { name: /cancel/i }).click();
    await page.waitForURL(`/groups/${group!.id}`);
  });

  // ── Scenario 5 — Successful event creation via text capture ──────────────
  // Requires: RUN_CAPTURE_E2E=true and the AI/NLP service reachable from CI.

  test('Scenario 5 — successful event creation via text capture', async ({ page }) => {
    test.skip(
      process.env['RUN_CAPTURE_E2E'] !== 'true',
      'Capture scenarios require RUN_CAPTURE_E2E=true and an available AI service.',
    );

    const eventCreatePage = new EventCreatePage(page);
    await eventCreatePage.goto(group!.id);

    // Build a natural-language capture string using a date 10 days from now so
    // the prompt never references a past date, keeping the test valid long-term.
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const captureText = `Team lunch on ${monthNames[future.getMonth()]} ${future.getDate()} ${future.getFullYear()} at noon`;

    await eventCreatePage.captureFromText(captureText);

    // A successful capture must navigate to the created event's detail page.
    // The regex excludes /events/new to ensure the wait only resolves once the
    // actual event ID is present in the URL.
    await page.waitForURL(/\/groups\/[^/]+\/events\/(?!new)[^/]+/);

    // The event title heading must be visible once the page has loaded.
    await page.getByText('Loading event…').waitFor({ state: 'hidden' });
    const eventDetailPage = new EventDetailPage(page);
    await expect(eventDetailPage.titleHeading).toBeVisible();
  });

  // ── Scenario 6 — Incomplete text capture produces draft issue messages ────
  // Requires: RUN_CAPTURE_E2E=true and the AI/NLP service reachable from CI.

  test('Scenario 6 — incomplete text capture shows issue messages without navigating', async ({
    page,
  }) => {
    test.skip(
      process.env['RUN_CAPTURE_E2E'] !== 'true',
      'Capture scenarios require RUN_CAPTURE_E2E=true and an available AI service.',
    );

    const eventCreatePage = new EventCreatePage(page);
    await eventCreatePage.goto(group!.id);

    // Submit text that is intentionally missing date/time information.
    await eventCreatePage.captureTab.click();
    await eventCreatePage.captureTextarea.fill('Team lunch');
    await eventCreatePage.captureSubmitButton.click();

    // The page must not navigate away from the create form.
    await expect(page).toHaveURL(`/groups/${group!.id}/events/new`);

    // The issues container must appear with the specific heading and at least
    // one rendered issue list item. Filtering by heading text distinguishes
    // this from the generic capture error alert that also uses role="alert".
    const issueAlert = page
      .getByRole('alert')
      .filter({ hasText: 'Could not extract all event details' });
    await expect(issueAlert).toBeVisible();

    // At least one issue message must be rendered inside the alert.
    await expect(issueAlert.getByRole('listitem').first()).toBeVisible();

    // The capture textarea must remain editable so the user can refine input.
    await expect(eventCreatePage.captureTextarea).toBeEditable();
  });

  // ── Scenario 7 — Text capture textarea has descriptive placeholder text ───

  test('Scenario 7 — text capture textarea has descriptive placeholder text', async ({ page }) => {
    const eventCreatePage = new EventCreatePage(page);
    await eventCreatePage.goto(group!.id);

    // Fill in structured form fields to verify they do not carry over to capture mode.
    await eventCreatePage.titleInput.fill('Structured title that must not carry over');
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await eventCreatePage.startAtInput.fill(future.toISOString().slice(0, 16));

    // Switch to capture mode.
    await eventCreatePage.captureTab.click();

    // The capture textarea must be visible.
    await expect(eventCreatePage.captureTextarea).toBeVisible();

    // The placeholder must be a non-empty natural-language hint.
    const placeholder = await eventCreatePage.captureTextarea.getAttribute('placeholder');
    expect(placeholder?.length).toBeGreaterThan(0);

    // The textarea must start empty — structured form values must not carry over.
    await expect(eventCreatePage.captureTextarea).toHaveValue('');
  });
});
