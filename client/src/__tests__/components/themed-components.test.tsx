/**
 * Snapshot tests for themed components.
 *
 * ThemeSwitcher — DOM snapshots differ between modes (checked radio changes),
 * so we capture one snapshot per mode.
 *
 * Button — the DOM structure is mode-invariant (CSS-module class names do not
 * change with the active theme). We therefore snapshot each variant once, and
 * separately assert that ThemeProvider correctly writes the mode-specific
 * `data-theme` attribute and CSS custom-property values onto
 * `document.documentElement`.
 *
 * This satisfies the "visual regression / snapshot tests for both themes"
 * acceptance criterion for M7.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeProvider } from '../../design-system/ThemeContext';
import { ThemeSwitcher } from '../../components/ThemeSwitcher';
import { Button } from '../../components/Button';

// ─── matchMedia mock ──────────────────────────────────────────────────────────

function mockMatchMedia(prefersDark: boolean) {
  return vi.fn().mockImplementation((query: string) => ({
    matches: prefersDark,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  localStorage.clear();
});

/** Remove attributes and inline styles written to documentElement by ThemeProvider. */
function resetDocumentElement() {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-palette');
  document.documentElement.style.cssText = '';
}

afterEach(() => {
  resetDocumentElement();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderWithMode(ui: React.ReactElement, mode: 'light' | 'dark') {
  // Force a specific resolved mode via localStorage so ThemeProvider picks it up.
  localStorage.setItem('nc-theme-mode', mode);
  // matchMedia is consulted only when mode==='system', but mock it regardless.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: mockMatchMedia(mode === 'dark'),
  });
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

// ─── ThemeSwitcher snapshots ──────────────────────────────────────────────────
// The ThemeSwitcher DOM is genuinely mode-dependent: the checked radio input
// and its active-state CSS class change with the selected mode.

describe('ThemeSwitcher snapshot', () => {
  it('renders correctly in light mode', () => {
    const { container } = renderWithMode(<ThemeSwitcher />, 'light');
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders correctly in dark mode', () => {
    const { container } = renderWithMode(<ThemeSwitcher />, 'dark');
    expect(container.firstChild).toMatchSnapshot();
  });
});

// ─── Button DOM snapshots (mode-invariant) ────────────────────────────────────
// Button class names and element structure do not change with the active theme.
// Each variant is snapshotted once.

describe('Button DOM snapshot', () => {
  it('primary variant', () => {
    const { container } = renderWithMode(
      <Button variant="primary" size="md">
        Save
      </Button>,
      'light',
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('secondary variant', () => {
    const { container } = renderWithMode(
      <Button variant="secondary" size="md">
        Cancel
      </Button>,
      'light',
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('danger variant', () => {
    const { container } = renderWithMode(
      <Button variant="danger" size="md">
        Delete
      </Button>,
      'light',
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('disabled state', () => {
    const { container } = renderWithMode(
      <Button variant="primary" disabled>
        Disabled
      </Button>,
      'light',
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

// ─── Theme application assertions ─────────────────────────────────────────────
// These tests verify that ThemeProvider correctly writes mode-specific values
// onto document.documentElement. The CSS custom-property values differ between
// light and dark, giving genuine theme-specific coverage.

describe('ThemeProvider applies mode-specific tokens to documentElement', () => {
  it('sets data-theme="light" and light-mode CSS variables in light mode', () => {
    renderWithMode(<Button>Test</Button>, 'light');

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    // Light surface background is the lightest neutral (neutral[0] = #f8f8fc).
    expect(document.documentElement.style.getPropertyValue('--nc-surface-background')).toBe(
      '#f8f8fc',
    );
    // Light primary text is the darkest neutral (neutral[7] = #1a1a2e).
    expect(document.documentElement.style.getPropertyValue('--nc-content-primary')).toBe('#1a1a2e');
  });

  it('sets data-theme="dark" and dark-mode CSS variables in dark mode', () => {
    renderWithMode(<Button>Test</Button>, 'dark');

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    // Dark surface background is neutral[7] = #1a1a2e.
    expect(document.documentElement.style.getPropertyValue('--nc-surface-background')).toBe(
      '#1a1a2e',
    );
    // Dark primary text is the lightest neutral (neutral[0] = #f8f8fc).
    expect(document.documentElement.style.getPropertyValue('--nc-content-primary')).toBe('#f8f8fc');
  });

  it('light and dark modes produce different values for colour tokens', () => {
    renderWithMode(<Button>Test</Button>, 'light');
    const lightBg = document.documentElement.style.getPropertyValue('--nc-surface-background');
    const lightText = document.documentElement.style.getPropertyValue('--nc-content-primary');
    const lightAccent = document.documentElement.style.getPropertyValue('--nc-accent-default');

    // Clean up before re-rendering
    resetDocumentElement();

    renderWithMode(<Button>Test</Button>, 'dark');
    const darkBg = document.documentElement.style.getPropertyValue('--nc-surface-background');
    const darkText = document.documentElement.style.getPropertyValue('--nc-content-primary');
    const darkAccent = document.documentElement.style.getPropertyValue('--nc-accent-default');

    expect(lightBg).not.toBe(darkBg);
    expect(lightText).not.toBe(darkText);
    expect(lightAccent).not.toBe(darkAccent);
  });
});
