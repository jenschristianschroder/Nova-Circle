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

  /**
   * All event card buttons in the events list.
   * The UI renders each event as `<button aria-label="Open event {title}">`.
   */
  readonly eventListItems: Locator;

  /** The "+ New Event" button that navigates to the EventCreate page. */
  readonly newEventButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.groupNameHeading = page.getByRole('heading', { level: 1 });
    this.eventListItems = page.getByRole('button', { name: /^open event /i });
    this.newEventButton = page.getByRole('button', { name: /\+ new event/i });
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
   * Returns the event card button for the event with the given title.
   * Matches the aria-label `"Open event {title}"`.
   *
   * @param title - The exact event title.
   */
  eventCardByTitle(title: string): Locator {
    return this.page.getByRole('button', { name: `Open event ${title}` });
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
   * Clicks the "+ New Event" button, navigating to the EventCreate page.
   */
  async clickNewEvent(): Promise<void> {
    await this.newEventButton.click();
  }
}
