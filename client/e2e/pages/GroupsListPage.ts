/**
 * GroupsListPage — Page Object Model for the /groups route.
 *
 * Provides typed locator accessors and action methods for the Groups list page.
 * No assertions are made here; use the locators in your tests.
 */

import { type Page, type Locator } from '@playwright/test';

export class GroupsListPage {
  readonly page: Page;

  /** All group card elements in the list. */
  readonly groupCards: Locator;

  /** The "New group" / "Create group" button or link. */
  readonly newGroupButton: Locator;

  /** The input field for the new-group name (inline form). */
  readonly newGroupNameInput: Locator;

  /** The submit button for the new-group inline form. */
  readonly newGroupSubmitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.groupCards = page.locator('[data-testid="group-card"]');
    this.newGroupButton = page.getByRole('button', { name: /new group|create group/i });
    this.newGroupNameInput = page.getByLabel(/group name/i);
    this.newGroupSubmitButton = page.getByRole('button', { name: /create|save/i });
  }

  /** Navigates to the /groups page. */
  async goto(): Promise<void> {
    await this.page.goto('/groups');
  }

  /**
   * Returns the group card element that contains the given group name text.
   *
   * @param name - The exact or partial group name to search for.
   */
  groupCardByName(name: string): Locator {
    return this.page.locator('[data-testid="group-card"]', { hasText: name });
  }

  /**
   * Clicks the group card for the group with the given name, navigating
   * to the GroupDetail page.
   *
   * @param name - The name of the group to open.
   */
  async openGroup(name: string): Promise<void> {
    await this.groupCardByName(name).click();
  }
}
