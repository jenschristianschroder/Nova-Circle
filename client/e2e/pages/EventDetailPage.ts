/**
 * EventDetailPage — Page Object Model for the /groups/:groupId/events/:eventId route.
 *
 * Provides typed locator accessors and action methods for the Event detail page.
 * No assertions are made here; use the locators in your tests.
 */

import { type Page, type Locator } from '@playwright/test';

export class EventDetailPage {
  readonly page: Page;

  /** The heading that displays the event title. */
  readonly titleHeading: Locator;

  /** The "Accept" / "Going" RSVP button. */
  readonly rsvpAcceptButton: Locator;

  /** The "Decline" / "Not going" RSVP button. */
  readonly rsvpDeclineButton: Locator;

  /** The "Tentative" / "Maybe" RSVP button. */
  readonly rsvpTentativeButton: Locator;

  /** The attendee list container. */
  readonly attendeeList: Locator;

  constructor(page: Page) {
    this.page = page;
    this.titleHeading = page.getByRole('heading').first();
    this.rsvpAcceptButton = page.getByRole('button', { name: /accept|going/i });
    this.rsvpDeclineButton = page.getByRole('button', { name: /decline|not going/i });
    this.rsvpTentativeButton = page.getByRole('button', { name: /tentative|maybe/i });
    this.attendeeList = page.locator('[data-testid="attendee-list"]');
  }

  /**
   * Navigates directly to the event detail page for the given IDs.
   *
   * @param groupId - The group's UUID.
   * @param eventId - The event's UUID.
   */
  async goto(groupId: string, eventId: string): Promise<void> {
    await this.page.goto(`/groups/${groupId}/events/${eventId}`);
  }

  /**
   * Clicks the "Accept" RSVP button.
   */
  async rsvpAccept(): Promise<void> {
    await this.rsvpAcceptButton.click();
  }

  /**
   * Clicks the "Decline" RSVP button.
   */
  async rsvpDecline(): Promise<void> {
    await this.rsvpDeclineButton.click();
  }

  /**
   * Clicks the "Tentative" RSVP button.
   */
  async rsvpTentative(): Promise<void> {
    await this.rsvpTentativeButton.click();
  }
}
