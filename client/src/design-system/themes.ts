/**
 * Theme resolver for Nova-Circle.
 *
 * Resolves the active palette + mode (light | dark) into a concrete set of
 * CSS custom property values that are applied to the <html> element by
 * ThemeProvider. Components read these values via CSS variables — they never
 * reference raw colour values directly.
 */

import { TOKEN_NAMES, type TokenValues } from './tokens';
import { type ColourPalette } from './palettes';

// ─── Contrast helpers ─────────────────────────────────────────────────────────

function channelLum(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return 0.2126 * channelLum(r) + 0.7152 * channelLum(g) + 0.0722 * channelLum(b);
}

/**
 * Return whichever of '#ffffff' or darkTextHex has the highest contrast
 * ratio against bgHex. Used to compute accessible text-on-colour values
 * without hardcoding a single text colour.
 */
function pickTextColor(bgHex: string, darkTextHex: string): string {
  const bgL = relativeLuminance(bgHex);
  const whiteL = 1.0;
  const darkL = relativeLuminance(darkTextHex);
  const cWhite = (Math.max(whiteL, bgL) + 0.05) / (Math.min(whiteL, bgL) + 0.05);
  const cDark = (Math.max(darkL, bgL) + 0.05) / (Math.min(darkL, bgL) + 0.05);
  return cWhite >= cDark ? '#ffffff' : darkTextHex;
}

export type Mode = 'light' | 'dark' | 'system';

/** Resolve 'system' into the OS preference. */
export function resolveMode(mode: Mode): 'light' | 'dark' {
  if (mode !== 'system') {
    return mode;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Build a TokenValues map for the given palette and resolved mode.
 * Every entry is a CSS custom property name → colour value pair.
 */
export function buildTokenValues(
  palette: ColourPalette,
  resolvedMode: 'light' | 'dark',
): TokenValues {
  const { accent, neutral, danger, success } = palette;

  const isLight = resolvedMode === 'light';

  return {
    // ─── Surface ──────────────────────────────────────────────────────────
    [TOKEN_NAMES.surfaceBackground]: isLight ? neutral[0] : neutral[7],
    [TOKEN_NAMES.surfaceCard]: isLight ? '#ffffff' : neutral[6],
    [TOKEN_NAMES.surfaceSubtle]: isLight ? neutral[1] : neutral[6],
    [TOKEN_NAMES.surfaceOverlay]: isLight ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.60)',

    // ─── Content ──────────────────────────────────────────────────────────
    [TOKEN_NAMES.contentPrimary]: isLight ? neutral[7] : neutral[0],
    [TOKEN_NAMES.contentSecondary]: isLight ? neutral[5] : neutral[3],
    [TOKEN_NAMES.contentDisabled]: isLight ? neutral[4] : neutral[5],
    // Use the darker neutral as the dark-text fallback so it has sufficient
    // contrast against any medium-bright accent or danger colour.
    [TOKEN_NAMES.contentOnAccent]: pickTextColor(isLight ? accent[3] : accent[2], neutral[8]),
    [TOKEN_NAMES.contentOnDanger]: pickTextColor(isLight ? danger[3] : danger[2], neutral[8]),

    // ─── Border ───────────────────────────────────────────────────────────
    [TOKEN_NAMES.borderDefault]: isLight ? neutral[2] : neutral[5],
    [TOKEN_NAMES.borderInteractive]: isLight ? neutral[4] : neutral[4],
    [TOKEN_NAMES.borderFocus]: isLight ? accent[3] : accent[2],

    // ─── Accent ───────────────────────────────────────────────────────────
    [TOKEN_NAMES.accentDefault]: isLight ? accent[3] : accent[2],
    [TOKEN_NAMES.accentHover]: isLight ? accent[4] : accent[1],
    [TOKEN_NAMES.accentActive]: isLight ? accent[4] : accent[0],
    [TOKEN_NAMES.accentSubtle]: isLight ? accent[0] : `${accent[3]}33`,

    // ─── Danger ───────────────────────────────────────────────────────────
    [TOKEN_NAMES.dangerDefault]: isLight ? danger[3] : danger[2],
    [TOKEN_NAMES.dangerHover]: isLight ? danger[4] : danger[1],
    [TOKEN_NAMES.dangerSubtle]: isLight ? danger[0] : `${danger[3]}33`,

    // ─── Success ──────────────────────────────────────────────────────────
    [TOKEN_NAMES.successDefault]: isLight ? success[3] : success[2],
    [TOKEN_NAMES.successSubtle]: isLight ? success[0] : `${success[3]}33`,

    // ─── Typography scale ─────────────────────────────────────────────────
    [TOKEN_NAMES.fontFamilyBody]:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    [TOKEN_NAMES.fontFamilyHeading]:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    [TOKEN_NAMES.fontFamilyMono]:
      "'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', Menlo, Consolas, monospace",

    // ─── Spacing scale ────────────────────────────────────────────────────
    [TOKEN_NAMES.spaceXs]: '0.25rem', //  4px
    [TOKEN_NAMES.spaceSm]: '0.5rem', //  8px
    [TOKEN_NAMES.spaceMd]: '1rem', // 16px
    [TOKEN_NAMES.spaceLg]: '1.5rem', // 24px
    [TOKEN_NAMES.spaceXl]: '2rem', // 32px
    [TOKEN_NAMES.space2xl]: '3rem', // 48px
    [TOKEN_NAMES.space3xl]: '4rem', // 64px

    // ─── Border radius ────────────────────────────────────────────────────
    [TOKEN_NAMES.radiusSm]: '0.25rem', //  4px
    [TOKEN_NAMES.radiusMd]: '0.5rem', //  8px
    [TOKEN_NAMES.radiusLg]: '0.75rem', // 12px
    [TOKEN_NAMES.radiusFull]: '9999px',

    // ─── Shadow ───────────────────────────────────────────────────────────
    [TOKEN_NAMES.shadowSm]: isLight
      ? '0 1px 3px 0 rgba(0,0,0,0.10), 0 1px 2px -1px rgba(0,0,0,0.10)'
      : '0 1px 3px 0 rgba(0,0,0,0.40), 0 1px 2px -1px rgba(0,0,0,0.40)',
    [TOKEN_NAMES.shadowMd]: isLight
      ? '0 4px 6px -1px rgba(0,0,0,0.10), 0 2px 4px -2px rgba(0,0,0,0.10)'
      : '0 4px 6px -1px rgba(0,0,0,0.40), 0 2px 4px -2px rgba(0,0,0,0.40)',
  };
}

/**
 * Apply a token value map as CSS custom properties on the document root.
 * Also sets data-theme and data-palette attributes for stylesheet overrides.
 */
export function applyTokensToRoot(
  tokenValues: TokenValues,
  resolvedMode: 'light' | 'dark',
  paletteId: string,
): void {
  const root = document.documentElement;
  for (const [property, value] of Object.entries(tokenValues)) {
    root.style.setProperty(property, value);
  }
  root.setAttribute('data-theme', resolvedMode);
  root.setAttribute('data-palette', paletteId);
  // Inform the browser about the colour scheme so native UI controls adapt
  root.style.colorScheme = resolvedMode;
}
