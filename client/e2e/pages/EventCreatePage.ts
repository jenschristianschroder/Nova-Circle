/**
 * EventCreatePage — Page Object Model for the /groups/:groupId/events/new route.
 *
 * Provides typed locator accessors and action methods for the Event create page.
 * No assertions are made here; use the locators in your tests.
 */

import { type Page, type Locator } from '@playwright/test';

export class EventCreatePage {
  readonly page: Page;

  // ── Structured form fields ─────────────────────────────────────────────────

  /**
   * The event title input in the structured form.
   * Matches `<input id="event-title">` (label: "Title").
   */
  readonly titleInput: Locator;

  /**
   * The event start date & time input.
   * Matches `<input id="event-start">` (label: "Start date & time").
   */
  readonly startAtInput: Locator;

  /**
   * The event end date & time input (optional).
   * Matches `<input id="event-end">` (label: "End date & time").
   */
  readonly endAtInput: Locator;

  /**
   * The event description textarea in the structured form.
   * Matches `<textarea id="event-description">` (label: "Description").
   */
  readonly descriptionTextarea: Locator;

  /**
   * The "Create event" submit button for the structured form.
   */
  readonly submitButton: Locator;

  // ── Text capture mode ──────────────────────────────────────────────────────

  /**
   * The natural-language event description textarea.
   * Matches `<textarea id="capture-text">` (label: "Event description").
   */
  readonly captureTextarea: Locator;

  /**
   * The "Create from text" submit button for the capture form.
   */
  readonly captureSubmitButton: Locator;

  /**
   * The "Describe in text" tab that switches to text-capture mode.
   */
  readonly captureTab: Locator;

  /**
   * The "Structured form" tab that switches back to the form mode.
   */
  readonly formTab: Locator;

  constructor(page: Page) {
    this.page = page;

    // Structured form — target by stable element IDs
    this.titleInput = page.locator('#event-title');
    this.startAtInput = page.locator('#event-start');
    this.endAtInput = page.locator('#event-end');
    this.descriptionTextarea = page.locator('#event-description');
    this.submitButton = page.getByRole('button', { name: /create event/i });

    // Text capture — target by stable element IDs and exact button text
    this.captureTextarea = page.locator('#capture-text');
    this.captureSubmitButton = page.getByRole('button', { name: /create from text/i });
    this.captureTab = page.getByRole('tab', { name: /describe in text/i });
    this.formTab = page.getByRole('tab', { name: /structured form/i });
  }

  /**
   * Navigates directly to the event create page for the given group.
   *
   * @param groupId - The group's UUID.
   */
  async goto(groupId: string): Promise<void> {
    await this.page.goto(`/groups/${groupId}/events/new`);
  }

  /**
   * Fills in the structured event form and submits it.
   *
   * @param title   - Event title.
   * @param startAt - datetime-local string (YYYY-MM-DDTHH:mm) for the start.
   * @param endAt   - Optional datetime-local string for the end.
   */
  async fillAndSubmitForm(title: string, startAt: string, endAt?: string): Promise<void> {
    await this.titleInput.fill(title);
    await this.startAtInput.fill(startAt);
    if (endAt) {
      await this.endAtInput.fill(endAt);
    }
    await this.submitButton.click();
  }

  /**
   * Switches to the "Describe in text" tab, types natural-language text into
   * the capture textarea, and submits it.
   *
   * @param text - The natural language event description.
   */
  async captureFromText(text: string): Promise<void> {
    await this.captureTab.click();
    await this.captureTextarea.fill(text);
    await this.captureSubmitButton.click();
  }
}
