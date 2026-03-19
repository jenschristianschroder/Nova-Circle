/**
 * Vitest test setup for the client.
 * Imports jest-dom matchers and sets up jsdom environment.
 */
import '@testing-library/jest-dom';

// ── Global matchMedia mock ────────────────────────────────────────────────────
// jsdom does not implement window.matchMedia. Provide a no-op implementation
// so that ThemeProvider and other components that call matchMedia do not throw.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
