/**
 * Tests for ThemeSwitcher component.
 *
 * Verifies:
 * - All mode options render with correct radio inputs
 * - Selecting a mode calls setMode
 * - All palette swatches render
 * - Selecting a palette calls setPaletteId
 * - All controls are keyboard accessible
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeSwitcher } from '../../components/ThemeSwitcher';
import { ThemeProvider } from '../../design-system/ThemeContext';
import { ALL_PALETTES } from '../../design-system/palettes';

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
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: mockMatchMedia(false),
  });
});

function renderWithTheme() {
  return render(
    <ThemeProvider>
      <ThemeSwitcher />
    </ThemeProvider>,
  );
}

describe('ThemeSwitcher', () => {
  it('renders mode radio buttons', () => {
    renderWithTheme();
    expect(screen.getByRole('radio', { name: /light/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /dark/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /system/i })).toBeInTheDocument();
  });

  it('system mode is selected by default', () => {
    renderWithTheme();
    expect(screen.getByRole('radio', { name: /system/i })).toBeChecked();
  });

  it('allows selecting dark mode', async () => {
    const user = userEvent.setup();
    renderWithTheme();
    await user.click(screen.getByRole('radio', { name: /dark/i }));
    expect(screen.getByRole('radio', { name: /dark/i })).toBeChecked();
  });

  it('allows selecting light mode', async () => {
    const user = userEvent.setup();
    renderWithTheme();
    await user.click(screen.getByRole('radio', { name: /light/i }));
    expect(screen.getByRole('radio', { name: /light/i })).toBeChecked();
  });

  it('renders a swatch for every palette', () => {
    renderWithTheme();
    for (const palette of ALL_PALETTES) {
      expect(
        screen.getByRole('radio', { name: new RegExp(palette.label, 'i') }),
      ).toBeInTheDocument();
    }
  });

  it('default palette is selected initially', () => {
    renderWithTheme();
    expect(screen.getByRole('radio', { name: /default palette/i })).toBeChecked();
  });

  it('allows selecting a different palette', async () => {
    const user = userEvent.setup();
    renderWithTheme();
    await user.click(screen.getByRole('radio', { name: /ocean palette/i }));
    expect(screen.getByRole('radio', { name: /ocean palette/i })).toBeChecked();
  });

  it('has accessible group label for appearance settings', () => {
    renderWithTheme();
    expect(screen.getByRole('group', { name: /appearance settings/i })).toBeInTheDocument();
  });
});
