/**
 * GroupsListPage — Page Object Model for the /groups route.
 *
 * Provides typed locator accessors and action methods for the Groups list page.
 * No assertions are made here; use the locators in your tests.
 */

import { type Page, type Locator } from '@playwright/test';

export class GroupsListPage {
  readonly page: Page;

  /**
   * All group card buttons in the list.
   * The UI renders each group as `<button aria-label="Open group {name}">`.
   */
  readonly groupCards: Locator;

  /** The "+ New Group" button that reveals the create-group form. */
  readonly newGroupButton: Locator;

  /**
   * The group name input in the create-group form.
   * Matches `<input id="group-name">` (label text is "Name").
   */
  readonly newGroupNameInput: Locator;

  /** The "Create group" submit button inside the create-group form. */
  readonly newGroupSubmitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.groupCards = page.getByRole('button', { name: /^open group /i });
    this.newGroupButton = page.getByRole('button', { name: /\+ new group/i });
    this.newGroupNameInput = page.locator('#group-name');
    this.newGroupSubmitButton = page.getByRole('button', { name: /create group/i });
  }

  /** Navigates to the /groups page. */
  async goto(): Promise<void> {
    await this.page.goto('/groups');
  }

  /**
   * Returns the group card button for the group with the given name.
   * Matches the aria-label `"Open group {name}"`.
   *
   * @param name - The exact group name.
   */
  groupCardByName(name: string): Locator {
    return this.page.getByRole('button', { name: `Open group ${name}` });
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
