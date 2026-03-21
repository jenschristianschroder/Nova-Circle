/**
 * GroupDetailPage — Page Object Model for the /groups/:groupId route.
 *
 * Provides typed locator accessors and action methods for the Group detail page.
 * No assertions are made here; use the locators in your tests.
 */

import { type Page, type Locator } from '@playwright/test';

export class GroupDetailPage {
  readonly page: Page;

  /** The heading that displays the group name. */
  readonly groupNameHeading: Locator;

  /** All event list items/cards shown for this group. */
  readonly eventListItems: Locator;

  /** The "New event" / "Create event" button or link. */
  readonly newEventButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.groupNameHeading = page.getByRole('heading').first();
    this.eventListItems = page.locator('[data-testid="event-card"]');
    this.newEventButton = page.getByRole('link', { name: /new event|create event/i });
  }

  /**
   * Navigates directly to the group detail page for the given group ID.
   *
   * @param groupId - The group's UUID.
   */
  async goto(groupId: string): Promise<void> {
    await this.page.goto(`/groups/${groupId}`);
  }

  /**
   * Returns the event card element that contains the given event title text.
   *
   * @param title - The exact or partial event title to search for.
   */
  eventCardByTitle(title: string): Locator {
    return this.page.locator('[data-testid="event-card"]', { hasText: title });
  }

  /**
   * Clicks the event card for the event with the given title, navigating
   * to the EventDetail page.
   *
   * @param title - The title of the event to open.
   */
  async openEvent(title: string): Promise<void> {
    await this.eventCardByTitle(title).click();
  }

  /**
   * Clicks the "New event" button / link, navigating to the EventCreate page.
   */
  async clickNewEvent(): Promise<void> {
    await this.newEventButton.click();
  }
}
