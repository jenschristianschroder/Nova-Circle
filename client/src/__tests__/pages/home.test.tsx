/**
 * Visual-regression snapshot tests for the Home page.
 *
 * Captures DOM snapshots of the full Home page (and its constituent sections)
 * for both light and dark modes so that any unintentional structural or
 * class-name change is caught during CI. These snapshots satisfy the
 * "visual regression tests for key screens" acceptance criterion for M7.
 *
 * Note: jsdom does not paint pixels, so these are DOM snapshots rather than
 * pixel-level screenshots. They verify the rendered HTML structure including
 * CSS-module class names, ARIA attributes, and element hierarchy.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { App } from '../../App';
import { ThemeProvider } from '../../design-system/ThemeContext';
import { Home } from '../../pages/Home';

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

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-palette');
  document.documentElement.style.cssText = '';
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderHomeWithMode(mode: 'light' | 'dark') {
  localStorage.setItem('nc-theme-mode', mode);
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: mockMatchMedia(mode === 'dark'),
  });
  return render(
    <ThemeProvider>
      <Home />
    </ThemeProvider>,
  );
}

// ─── Full-page snapshots ───────────────────────────────────────────────────────
// DOM snapshots of the entire Home page for light and dark modes.
// Any structural change (element addition/removal, class rename, ARIA
// attribute change) will cause these snapshots to fail, prompting a
// deliberate review and snapshot update.

describe('Home page snapshot', () => {
  it('renders correctly in light mode', () => {
    const { container } = renderHomeWithMode('light');
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders correctly in dark mode', () => {
    const { container } = renderHomeWithMode('dark');
    expect(container.firstChild).toMatchSnapshot();
  });
});

// ─── App (full tree) snapshots ────────────────────────────────────────────────
// Snapshot the full App tree (ThemeProvider + SkipLink + Home) to catch
// any wiring-level regressions.

describe('App snapshot', () => {
  it('renders correctly in light mode', () => {
    localStorage.setItem('nc-theme-mode', 'light');
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: mockMatchMedia(false),
    });
    const { container } = render(<App />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders correctly in dark mode', () => {
    localStorage.setItem('nc-theme-mode', 'dark');
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: mockMatchMedia(true),
    });
    const { container } = render(<App />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

// ─── Structural assertions ────────────────────────────────────────────────────
// Verify the key structural landmarks are always present regardless of mode.

describe('Home page structure', () => {
  it('renders a banner landmark (header)', () => {
    const { getByRole } = renderHomeWithMode('light');
    expect(getByRole('banner')).toBeTruthy();
  });

  it('renders a main content landmark', () => {
    const { getByRole } = renderHomeWithMode('light');
    expect(getByRole('main')).toBeTruthy();
  });

  it('renders a contentinfo landmark (footer)', () => {
    const { getByRole } = renderHomeWithMode('light');
    expect(getByRole('contentinfo')).toBeTruthy();
  });

  it('hero heading is visible', () => {
    const { getByRole } = renderHomeWithMode('light');
    expect(getByRole('heading', { name: /your private group calendar/i })).toBeTruthy();
  });

  it('appearance section heading is visible', () => {
    const { getByRole } = renderHomeWithMode('light');
    expect(getByRole('heading', { name: /appearance/i })).toBeTruthy();
  });

  it('component showcase section heading is visible', () => {
    const { getByRole } = renderHomeWithMode('light');
    expect(getByRole('heading', { name: /component showcase/i })).toBeTruthy();
  });

  it('Get started primary button is present', () => {
    const { getByRole } = renderHomeWithMode('light');
    expect(getByRole('button', { name: /get started/i })).toBeTruthy();
  });

  it('colour token swatches are present', () => {
    const { getAllByRole } = renderHomeWithMode('light');
    const swatches = getAllByRole('listitem');
    expect(swatches.length).toBeGreaterThanOrEqual(8);
  });
});
