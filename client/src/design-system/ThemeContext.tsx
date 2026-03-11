/**
 * ThemeContext — React context for theme mode and palette selection.
 *
 * Provides:
 *   mode          – the currently selected Mode ('light' | 'dark' | 'system')
 *   resolvedMode  – the effective mode after resolving 'system'
 *   paletteId     – the currently selected PaletteId
 *   setMode()     – update the mode; persists to localStorage
 *   setPaletteId() – update the palette; persists to localStorage
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { type Mode, resolveMode, buildTokenValues, applyTokensToRoot } from './themes';
import { type PaletteId, getPaletteById } from './palettes';

const STORAGE_KEY_MODE = 'nc-theme-mode';
const STORAGE_KEY_PALETTE = 'nc-palette-id';

interface ThemeContextValue {
  mode: Mode;
  resolvedMode: 'light' | 'dark';
  paletteId: PaletteId;
  setMode: (mode: Mode) => void;
  setPaletteId: (id: PaletteId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredMode(): Mode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_MODE);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // localStorage unavailable (e.g. private browsing)
  }
  return 'system';
}

function readStoredPaletteId(): PaletteId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_PALETTE);
    if (stored === 'default' || stored === 'ocean' || stored === 'forest' || stored === 'sunset') {
      return stored;
    }
  } catch {
    // localStorage unavailable
  }
  return 'default';
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [mode, setModeState] = useState<Mode>(readStoredMode);
  const [paletteId, setPaletteIdState] = useState<PaletteId>(readStoredPaletteId);

  const resolvedMode = useMemo(() => resolveMode(mode), [mode]);

  // Apply tokens whenever mode or palette changes
  useEffect(() => {
    const palette = getPaletteById(paletteId);
    const tokenValues = buildTokenValues(palette, resolvedMode);
    applyTokensToRoot(tokenValues, resolvedMode, paletteId);
  }, [resolvedMode, paletteId]);

  // Listen for OS colour-scheme changes when mode === 'system'
  useEffect(() => {
    if (mode !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const palette = getPaletteById(paletteId);
      const newResolved = mql.matches ? 'dark' : 'light';
      const tokenValues = buildTokenValues(palette, newResolved);
      applyTokensToRoot(tokenValues, newResolved, paletteId);
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [mode, paletteId]);

  const setMode = useCallback((newMode: Mode) => {
    setModeState(newMode);
    try {
      localStorage.setItem(STORAGE_KEY_MODE, newMode);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const setPaletteId = useCallback((id: PaletteId) => {
    setPaletteIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY_PALETTE, id);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const value = useMemo(
    () => ({ mode, resolvedMode, paletteId, setMode, setPaletteId }),
    [mode, resolvedMode, paletteId, setMode, setPaletteId],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Hook to access theme context. Must be used within ThemeProvider. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
