/**
 * LoginPage — Page Object Model for the /login route.
 *
 * Provides typed locator accessors and action methods for the Login page.
 * No assertions are made here; use the locators in your tests.
 */

import { type Page, type Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;

  /** The main sign-in button that triggers the MSAL auth flow. */
  readonly signInButton: Locator;

  /** The brand / application name heading shown on the login page. */
  readonly brandHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.signInButton = page.getByRole('button', { name: /sign in/i });
    this.brandHeading = page.getByRole('heading', { name: /nova.?circle/i });
  }

  /** Navigates to the /login page. */
  async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  /** Clicks the sign-in button. */
  async clickSignIn(): Promise<void> {
    await this.signInButton.click();
  }
}
