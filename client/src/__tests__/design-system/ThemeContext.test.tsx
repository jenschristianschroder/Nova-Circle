/**
 * Tests for ThemeContext – mode and palette persistence, OS system preference
 * resolution, and provider behaviour.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../../design-system/ThemeContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal consumer component for testing useTheme hook */
function ThemeConsumer() {
  const { mode, resolvedMode, paletteId } = useTheme();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="resolved-mode">{resolvedMode}</span>
      <span data-testid="palette-id">{paletteId}</span>
    </div>
  );
}

function ThemeController() {
  const { setMode, setPaletteId } = useTheme();
  return (
    <>
      <button onClick={() => setMode('dark')}>Set dark</button>
      <button onClick={() => setMode('light')}>Set light</button>
      <button onClick={() => setMode('system')}>Set system</button>
      <button onClick={() => setPaletteId('ocean')}>Set ocean</button>
    </>
  );
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockMatchMedia = (matches: boolean) => {
  return vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
};

beforeEach(() => {
  localStorage.clear();
  // Default: OS prefers light
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: mockMatchMedia(false),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ThemeProvider', () => {
  it('renders children', () => {
    render(
      <ThemeProvider>
        <span>Hello</span>
      </ThemeProvider>,
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('defaults to system mode when no preference stored', () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('mode').textContent).toBe('system');
  });

  it('defaults to default palette when no preference stored', () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('palette-id').textContent).toBe('default');
  });

  it('reads stored mode from localStorage', () => {
    localStorage.setItem('nc-theme-mode', 'dark');
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('mode').textContent).toBe('dark');
  });

  it('reads stored palette from localStorage', () => {
    localStorage.setItem('nc-palette-id', 'ocean');
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('palette-id').textContent).toBe('ocean');
  });

  it('resolves system mode to light when OS prefers light', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: mockMatchMedia(false), // false = light
    });
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('resolved-mode').textContent).toBe('light');
  });

  it('resolves system mode to dark when OS prefers dark', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: mockMatchMedia(true), // true = dark
    });
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('resolved-mode').textContent).toBe('dark');
  });
});

describe('setMode', () => {
  it('updates the mode', () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
        <ThemeController />
      </ThemeProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Set dark'));
    });
    expect(screen.getByTestId('mode').textContent).toBe('dark');
    expect(screen.getByTestId('resolved-mode').textContent).toBe('dark');
  });

  it('persists the mode to localStorage', () => {
    render(
      <ThemeProvider>
        <ThemeController />
      </ThemeProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Set dark'));
    });
    expect(localStorage.getItem('nc-theme-mode')).toBe('dark');
  });
});

describe('setPaletteId', () => {
  it('updates the palette', () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
        <ThemeController />
      </ThemeProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Set ocean'));
    });
    expect(screen.getByTestId('palette-id').textContent).toBe('ocean');
  });

  it('persists the palette to localStorage', () => {
    render(
      <ThemeProvider>
        <ThemeController />
      </ThemeProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Set ocean'));
    });
    expect(localStorage.getItem('nc-palette-id')).toBe('ocean');
  });
});

describe('useTheme', () => {
  it('throws when used outside ThemeProvider', () => {
    const originalError = console.error;
    console.error = vi.fn(); // suppress React error boundary output
    expect(() => {
      render(<ThemeConsumer />);
    }).toThrow('useTheme must be used within a ThemeProvider');
    console.error = originalError;
  });
});
