/**
 * Snapshot tests for themed components.
 *
 * Renders ThemeSwitcher and Button in both light and dark modes and captures
 * DOM snapshots. Any visual change (class names, attributes, structure) will
 * cause these snapshots to fail, prompting a deliberate review.
 *
 * This satisfies the "visual regression / snapshot tests for both themes"
 * acceptance criterion for M7.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// ─── Button snapshots ─────────────────────────────────────────────────────────

describe('Button snapshot', () => {
  it('primary variant in light mode', () => {
    const { container } = renderWithMode(
      <Button variant="primary" size="md">
        Save
      </Button>,
      'light',
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('primary variant in dark mode', () => {
    const { container } = renderWithMode(
      <Button variant="primary" size="md">
        Save
      </Button>,
      'dark',
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('secondary variant in light mode', () => {
    const { container } = renderWithMode(
      <Button variant="secondary" size="md">
        Cancel
      </Button>,
      'light',
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('secondary variant in dark mode', () => {
    const { container } = renderWithMode(
      <Button variant="secondary" size="md">
        Cancel
      </Button>,
      'dark',
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('danger variant in light mode', () => {
    const { container } = renderWithMode(
      <Button variant="danger" size="md">
        Delete
      </Button>,
      'light',
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('danger variant in dark mode', () => {
    const { container } = renderWithMode(
      <Button variant="danger" size="md">
        Delete
      </Button>,
      'dark',
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('disabled state in light mode', () => {
    const { container } = renderWithMode(
      <Button variant="primary" disabled>
        Disabled
      </Button>,
      'light',
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('disabled state in dark mode', () => {
    const { container } = renderWithMode(
      <Button variant="primary" disabled>
        Disabled
      </Button>,
      'dark',
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
