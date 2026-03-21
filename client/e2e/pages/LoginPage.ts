/**
 * LoginPage — Page Object Model for the /login route.
 *
 * Provides typed locator accessors, action methods, and assertion helpers
 * for the Login page.
 */

import { type Page, type Locator, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;

  /** The main sign-in button that triggers the MSAL auth flow. */
  readonly signInButton: Locator;

  /**
   * The brand name shown in the page header banner.
   * Scoped to `role="banner"` so it does not match the footer or features
   * section text that also contains "Nova-Circle".
   */
  readonly brandHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.signInButton = page.getByRole('button', { name: /sign in/i });
    this.brandHeading = page.getByRole('banner').getByText('Nova-Circle', { exact: true });
  }

  /** Navigates to the /login page. */
  async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  /** Clicks the sign-in button. */
  async clickSignIn(): Promise<void> {
    await this.signInButton.click();
  }

  /**
   * Asserts that the key Login page elements (sign-in button and brand
   * heading) are visible.  Useful after a redirect lands on /login.
   */
  async expectVisible(): Promise<void> {
    await expect(this.signInButton).toBeVisible();
    await expect(this.brandHeading).toBeVisible();
  }

  /**
   * Returns a RegExp that matches the /login path, tolerating a trailing
   * slash (e.g. `/login/`).
   */
  url(): RegExp {
    return /\/login/;
  }
}
