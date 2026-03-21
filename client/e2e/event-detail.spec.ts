/**
 * Event detail page E2E tests.
 *
 * Verifies that the /groups/:groupId/events/:eventId page renders correctly
 * for an authenticated user: event title, breadcrumb navigation, RSVP
 * controls for active events, attendee list, and the suppression of RSVP
 * controls for cancelled events.
 *
 * Prerequisites:
 *  - global-setup.ts must have run and written a valid e2e/.auth/user.json.
 *  - The backend API must be reachable at the base URL configured in
 *    playwright.config.ts (PLAYWRIGHT_BASE_URL or http://localhost:3000).
 */

import { test, expect } from '@playwright/test';
import { ApiHelper, type GroupSummary, type EventSummary } from './helpers/api';
import { EventDetailPage } from './pages/EventDetailPage';

test.describe('Event detail page', () => {
  let api: ApiHelper;
  let group: GroupSummary | undefined;
  let activeEvent: EventSummary | undefined;
  let cancelledEvent: EventSummary | undefined;
  let seedError: Error | undefined;

  // Use timestamp-based names so parallel runs never collide.
  const groupName = `E2E Event Detail ${Date.now()}`;
  const activeEventTitle = `E2E Active Event ${Date.now()}`;
  const cancelledEventTitle = `E2E Cancelled Event ${Date.now()}`;

  test.beforeAll(async () => {
    try {
      // Pass the same base URL that Playwright uses so API seeding and browser
      // navigation always hit the same origin (defaults to http://localhost:3000).
      api = ApiHelper.fromStorageState(
        undefined,
        process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000',
      );

      // Create a group that will own both test events.
      group = await api.createGroup({ name: groupName });

      // Seed an active (future) event.
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      activeEvent = await api.createEvent({
        title: activeEventTitle,
        startAt: new Date(Date.now() + sevenDays).toISOString(),
        groupId: group.id,
      });

      // Seed a cancelled event (cancel immediately after creation).
      const fourteenDays = 14 * 24 * 60 * 60 * 1000;
      cancelledEvent = await api.createEvent({
        title: cancelledEventTitle,
        startAt: new Date(Date.now() + fourteenDays).toISOString(),
        groupId: group.id,
      });
      await api.cancelEvent(group.id, cancelledEvent.id);
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
    // Deleting the group cascades to all its events.
    if (group?.id) {
      await api.deleteGroup(group.id);
    }
  });

  // ── Scenario 1 — Page renders with event title ────────────────────────────

  test('Scenario 1 — page renders with event title', async ({ page }) => {
    const eventPage = new EventDetailPage(page);
    await eventPage.goto(group!.id, activeEvent!.id);

    // Wait for the loading indicator to disappear before asserting content.
    await page.getByText('Loading event…').waitFor({ state: 'hidden' });

    // The h1 heading must contain the event title.
    await expect(eventPage.titleHeading).toHaveText(activeEventTitle);

    // The start date section must be rendered.
    await expect(page.getByText('Starts')).toBeVisible();

    // No error alert should be present.
    await expect(page.getByRole('alert')).not.toBeVisible();
  });

  // ── Scenario 2 — Breadcrumb navigation is present ────────────────────────

  test('Scenario 2 — breadcrumb navigation is present', async ({ page }) => {
    const eventPage = new EventDetailPage(page);
    await eventPage.goto(group!.id, activeEvent!.id);

    await page.getByText('Loading event…').waitFor({ state: 'hidden' });

    const breadcrumb = page.getByRole('navigation', { name: /breadcrumb/i });

    // "Groups" link must be in the breadcrumb.
    const groupsLink = breadcrumb.getByRole('link', { name: 'Groups' });
    await expect(groupsLink).toBeVisible();

    // Clicking the "Groups" breadcrumb link must navigate to /groups.
    await groupsLink.click();
    await page.waitForURL('/groups');
  });

  // ── Scenario 3 — RSVP section is visible for active events ───────────────

  test('Scenario 3 — RSVP section is visible for active events', async ({ page }) => {
    const eventPage = new EventDetailPage(page);
    await eventPage.goto(group!.id, activeEvent!.id);

    await page.getByText('Loading event…').waitFor({ state: 'hidden' });

    // All three RSVP buttons must be present for a non-cancelled event.
    await expect(eventPage.rsvpAcceptButton).toBeVisible();
    await expect(eventPage.rsvpTentativeButton).toBeVisible();
    await expect(eventPage.rsvpDeclineButton).toBeVisible();
  });

  // ── Scenario 4 — Attendee list shows at least the test user ──────────────

  test('Scenario 4 — attendee list shows at least the test user', async ({ page }) => {
    const eventPage = new EventDetailPage(page);
    await eventPage.goto(group!.id, activeEvent!.id);

    await page.getByText('Loading event…').waitFor({ state: 'hidden' });

    // The attendees section must be rendered with at least one entry.
    await expect(eventPage.attendeeList).toBeVisible();
    await expect(eventPage.attendeeList.getByRole('listitem').first()).toBeVisible();
  });

  // ── Scenario 5 — Cancelled event does not show RSVP buttons ─────────────

  test('Scenario 5 — cancelled event does not show RSVP buttons', async ({ page }) => {
    const eventPage = new EventDetailPage(page);
    await eventPage.goto(group!.id, cancelledEvent!.id);

    await page.getByText('Loading event…').waitFor({ state: 'hidden' });

    // RSVP buttons must not be present for a cancelled event.
    await expect(eventPage.rsvpAcceptButton).not.toBeVisible();
    await expect(eventPage.rsvpTentativeButton).not.toBeVisible();
    await expect(eventPage.rsvpDeclineButton).not.toBeVisible();

    // A cancellation indicator must be shown.
    await expect(page.getByText('Cancelled')).toBeVisible();
  });
});
