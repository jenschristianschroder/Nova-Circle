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

  /**
   * The "Going" RSVP button.
   * Matches `<Button>Going</Button>` in the RSVP section.
   */
  readonly rsvpAcceptButton: Locator;

  /**
   * The "Not going" RSVP button.
   * Matches `<Button>Not going</Button>` in the RSVP section.
   */
  readonly rsvpDeclineButton: Locator;

  /**
   * The "Maybe" RSVP button.
   * Matches `<Button>Maybe</Button>` in the RSVP section.
   */
  readonly rsvpTentativeButton: Locator;

  /**
   * The attendees list element.
   * The `<section aria-labelledby="attendees-heading">` is a region landmark,
   * so we locate it by accessible name and then scope to the inner list.
   */
  readonly attendeeList: Locator;

  constructor(page: Page) {
    this.page = page;
    this.titleHeading = page.getByRole('heading', { level: 1 });
    this.rsvpAcceptButton = page.getByRole('button', { name: /^going$/i });
    this.rsvpDeclineButton = page.getByRole('button', { name: /not going/i });
    this.rsvpTentativeButton = page.getByRole('button', { name: /^maybe$/i });
    this.attendeeList = page.getByRole('region', { name: /attendees/i }).getByRole('list');
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

  /** Clicks the "Going" RSVP button. */
  async rsvpAccept(): Promise<void> {
    await this.rsvpAcceptButton.click();
  }

  /** Clicks the "Not going" RSVP button. */
  async rsvpDecline(): Promise<void> {
    await this.rsvpDeclineButton.click();
  }

  /** Clicks the "Maybe" RSVP button. */
  async rsvpTentative(): Promise<void> {
    await this.rsvpTentativeButton.click();
  }
}
