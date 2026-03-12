/**
 * Automated accessibility audit tests using axe-core.
 *
 * Verifies that all components and the full application have no critical or
 * serious accessibility violations when audited with axe-core, satisfying the
 * WCAG 2.1 AA requirement for an automated accessibility audit tool integrated
 * into CI.
 *
 * The `color-contrast` axe rule is disabled for these unit tests because jsdom
 * does not compute CSS custom properties (design tokens), which would produce
 * false positives. Contrast compliance is instead verified statically in
 * contrast.test.ts using the WCAG luminance formula against the resolved token
 * values for every palette × mode combination.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import * as axe from 'axe-core';
import { Button } from '../../components/Button';
import { SkipLink } from '../../components/SkipLink';
import { VisuallyHidden } from '../../components/VisuallyHidden';
import { ThemeSwitcher } from '../../components/ThemeSwitcher';
import { ThemeProvider } from '../../design-system/ThemeContext';
import { App } from '../../App';

// ─── matchMedia mock (required by ThemeProvider / ThemeSwitcher) ──────────────

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
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: mockMatchMedia(false),
  });
});

afterEach(() => {
  // ThemeProvider writes CSS custom properties and data-* attributes onto
  // document.documentElement via applyTokensToRoot and does not clean up on
  // unmount. Remove them here so each test starts with a clean document.
  const root = document.documentElement;
  Array.from(root.style).forEach((prop) => {
    if (prop.startsWith('--nc-')) {
      root.style.removeProperty(prop);
    }
  });
  root.removeAttribute('data-theme');
  root.removeAttribute('data-palette');
  root.style.colorScheme = '';
});

// ─── axe helpers ─────────────────────────────────────────────────────────────

/** axe configuration used across all tests in this file. */
const AXE_CONFIG: axe.RunOptions = {
  rules: {
    // Disabled: jsdom does not compute CSS custom properties (design tokens),
    // so axe cannot resolve colours – this would produce false positives.
    // Contrast compliance is covered statically in contrast.test.ts.
    'color-contrast': { enabled: false },
  },
};

/**
 * Run axe on `container` and return only critical / serious violations.
 * Minor / moderate violations are not enforced at this level; they are
 * expected to be caught during manual / screen-reader testing.
 */
async function auditForViolations(container: HTMLElement): Promise<axe.Result[]> {
  const results = await axe.run(container, AXE_CONFIG);
  return results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
}

/** Format axe violations into a human-readable string for test failure output. */
function formatViolations(violations: axe.Result[]): string {
  return violations.map((v) => `[${v.impact?.toUpperCase()}] ${v.id}: ${v.description}`).join('\n');
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Accessibility audit (axe-core)', () => {
  describe('Button', () => {
    it('primary variant has no critical/serious violations', async () => {
      const { container } = render(<Button variant="primary">Create event</Button>);
      const violations = await auditForViolations(container);
      expect(violations, formatViolations(violations)).toHaveLength(0);
    });

    it('secondary variant has no critical/serious violations', async () => {
      const { container } = render(<Button variant="secondary">Learn more</Button>);
      const violations = await auditForViolations(container);
      expect(violations, formatViolations(violations)).toHaveLength(0);
    });

    it('danger variant has no critical/serious violations', async () => {
      const { container } = render(<Button variant="danger">Delete group</Button>);
      const violations = await auditForViolations(container);
      expect(violations, formatViolations(violations)).toHaveLength(0);
    });

    it('disabled state has no critical/serious violations', async () => {
      const { container } = render(<Button disabled>Disabled action</Button>);
      const violations = await auditForViolations(container);
      expect(violations, formatViolations(violations)).toHaveLength(0);
    });

    it('with explicit aria-label has no critical/serious violations', async () => {
      const { container } = render(
        <Button aria-label="Delete event BBQ Saturday" variant="danger">
          🗑
        </Button>,
      );
      const violations = await auditForViolations(container);
      expect(violations, formatViolations(violations)).toHaveLength(0);
    });
  });

  describe('SkipLink', () => {
    it('has no critical/serious violations', async () => {
      // Render alongside a matching main element so axe can validate the link target.
      const { container } = render(
        <>
          <SkipLink />
          <main id="main-content">Main content</main>
        </>,
      );
      const violations = await auditForViolations(container);
      expect(violations, formatViolations(violations)).toHaveLength(0);
    });
  });

  describe('VisuallyHidden', () => {
    it('has no critical/serious violations', async () => {
      const { container } = render(<VisuallyHidden>Icon label text</VisuallyHidden>);
      const violations = await auditForViolations(container);
      expect(violations, formatViolations(violations)).toHaveLength(0);
    });
  });

  describe('ThemeSwitcher', () => {
    it('has no critical/serious violations', async () => {
      const { container } = render(
        <ThemeProvider>
          <ThemeSwitcher />
        </ThemeProvider>,
      );
      const violations = await auditForViolations(container);
      expect(violations, formatViolations(violations)).toHaveLength(0);
    });
  });

  describe('App (full application)', () => {
    it('has no critical/serious violations', async () => {
      const { container } = render(<App />);
      const violations = await auditForViolations(container);
      expect(violations, formatViolations(violations)).toHaveLength(0);
    });
  });
});
