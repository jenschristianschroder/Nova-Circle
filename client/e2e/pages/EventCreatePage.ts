/**
 * EventCreatePage — Page Object Model for the /groups/:groupId/events/new route.
 *
 * Provides typed locator accessors and action methods for the Event create page.
 * No assertions are made here; use the locators in your tests.
 */

import { type Page, type Locator } from '@playwright/test';

export class EventCreatePage {
  readonly page: Page;

  // ── Structured form fields ───────────────────────────────────────────────

  /** The event title input in the structured form. */
  readonly titleInput: Locator;

  /** The event start date/time input. */
  readonly startAtInput: Locator;

  /** The event end date/time input (optional). */
  readonly endAtInput: Locator;

  /** The event description textarea. */
  readonly descriptionTextarea: Locator;

  /** The submit button for the structured form. */
  readonly submitButton: Locator;

  // ── Text capture mode ────────────────────────────────────────────────────

  /** The natural-language capture textarea. */
  readonly captureTextarea: Locator;

  /** The submit button for the text-capture mode. */
  readonly captureSubmitButton: Locator;

  /** The toggle / tab that switches to text-capture mode. */
  readonly captureTab: Locator;

  /** The toggle / tab that switches to structured form mode. */
  readonly formTab: Locator;

  constructor(page: Page) {
    this.page = page;

    // Structured form
    this.titleInput = page.getByLabel(/title/i);
    this.startAtInput = page.getByLabel(/start/i);
    this.endAtInput = page.getByLabel(/end/i);
    this.descriptionTextarea = page.getByLabel(/description/i);
    this.submitButton = page.getByRole('button', { name: /create event|save/i });

    // Text capture
    this.captureTextarea = page.getByLabel(/describe your event|natural language|capture/i);
    this.captureSubmitButton = page.getByRole('button', { name: /capture|extract/i });
    this.captureTab = page.getByRole('tab', { name: /text|natural language|capture/i });
    this.formTab = page.getByRole('tab', { name: /form|structured/i });
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
   * @param startAt - ISO-8601 date-time string for the start.
   * @param endAt   - Optional ISO-8601 date-time string for the end.
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
   * Types natural-language text into the capture textarea and submits it.
   *
   * @param text - The natural language event description.
   */
  async captureFromText(text: string): Promise<void> {
    await this.captureTextarea.fill(text);
    await this.captureSubmitButton.click();
  }
}
