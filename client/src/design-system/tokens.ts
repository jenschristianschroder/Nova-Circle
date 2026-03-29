/**
 * Semantic design tokens for Nova-Circle.
 *
 * Tokens are named by role, not by raw colour value. Components must only
 * reference tokens from this file – never hardcode colour values.
 *
 * Every token maps to a CSS custom property on the <html> element.
 * The mapping is applied at runtime by ThemeProvider based on the active
 * theme (light / dark) and colour palette.
 */

/** All semantic token names used in the application. */
export const TOKEN_NAMES = {
  // ─── Surface ────────────────────────────────────────────────────────────
  /** Page / sheet background */
  surfaceBackground: '--nc-surface-background',
  /** Card / panel raised from the background */
  surfaceCard: '--nc-surface-card',
  /** Subtle alternative background (e.g. alternating rows) */
  surfaceSubtle: '--nc-surface-subtle',
  /** Overlay / modal backdrop */
  surfaceOverlay: '--nc-surface-overlay',

  // ─── Content ────────────────────────────────────────────────────────────
  /** Primary body text */
  contentPrimary: '--nc-content-primary',
  /** Secondary / supporting text */
  contentSecondary: '--nc-content-secondary',
  /** Disabled / placeholder text */
  contentDisabled: '--nc-content-disabled',
  /** Text that appears on an accent-coloured background */
  contentOnAccent: '--nc-content-on-accent',
  /** Text that appears on a danger-coloured background */
  contentOnDanger: '--nc-content-on-danger',

  // ─── Border ─────────────────────────────────────────────────────────────
  /** Default divider / border */
  borderDefault: '--nc-border-default',
  /** Stronger border for inputs and interactive controls */
  borderInteractive: '--nc-border-interactive',
  /** Focus ring colour */
  borderFocus: '--nc-border-focus',

  // ─── Accent (primary interactive colour) ────────────────────────────────
  /** Fill for primary interactive elements (buttons, links) */
  accentDefault: '--nc-accent-default',
  /** Hovered state of the accent fill */
  accentHover: '--nc-accent-hover',
  /** Pressed / active state of the accent fill */
  accentActive: '--nc-accent-active',
  /** Subtle accent tint (backgrounds, badges) */
  accentSubtle: '--nc-accent-subtle',

  // ─── Danger ─────────────────────────────────────────────────────────────
  /** Fill for destructive interactive elements */
  dangerDefault: '--nc-danger-default',
  /** Hovered state of the danger fill */
  dangerHover: '--nc-danger-hover',
  /** Subtle danger tint (error backgrounds) */
  dangerSubtle: '--nc-danger-subtle',

  // ─── Success ────────────────────────────────────────────────────────────
  /** Fill for success states */
  successDefault: '--nc-success-default',
  /** Subtle success tint */
  successSubtle: '--nc-success-subtle',

  // ─── Typography scale ────────────────────────────────────────────────────
  /** Font family for body text */
  fontFamilyBody: '--nc-font-family-body',
  /** Font family for headings */
  fontFamilyHeading: '--nc-font-family-heading',
  /** Monospace font family */
  fontFamilyMono: '--nc-font-family-mono',

  // ─── Font size scale ─────────────────────────────────────────────────────
  /** Extra-small: 0.75rem (12px) */
  fontSizeXs: '--nc-font-size-xs',
  /** Small: 0.875rem (14px) */
  fontSizeSm: '--nc-font-size-sm',
  /** Medium: 1rem (16px) */
  fontSizeMd: '--nc-font-size-md',
  /** Large: 1.25rem (20px) */
  fontSizeLg: '--nc-font-size-lg',
  /** Extra-large: 1.563rem (25px) */
  fontSizeXl: '--nc-font-size-xl',
  /** 2× extra-large: 2rem (32px) */
  fontSize2xl: '--nc-font-size-2xl',

  // ─── Spacing scale ───────────────────────────────────────────────────────
  /** Extra-small: 4px */
  spaceXs: '--nc-space-xs',
  /** Small: 8px */
  spaceSm: '--nc-space-sm',
  /** Medium: 16px */
  spaceMd: '--nc-space-md',
  /** Large: 24px */
  spaceLg: '--nc-space-lg',
  /** Extra-large: 32px */
  spaceXl: '--nc-space-xl',
  /** 2× extra-large: 48px */
  space2xl: '--nc-space-2xl',
  /** 3× extra-large: 64px */
  space3xl: '--nc-space-3xl',

  // ─── Border radius ───────────────────────────────────────────────────────
  /** Small radius (inputs, badges) */
  radiusSm: '--nc-radius-sm',
  /** Medium radius (cards, buttons) */
  radiusMd: '--nc-radius-md',
  /** Large radius (modals, sheets) */
  radiusLg: '--nc-radius-lg',
  /** Full / pill radius */
  radiusFull: '--nc-radius-full',

  // ─── Shadow ──────────────────────────────────────────────────────────────
  /** Subtle shadow for cards */
  shadowSm: '--nc-shadow-sm',
  /** Medium shadow for dropdowns / modals */
  shadowMd: '--nc-shadow-md',

  // ─── Group calendar colours ─────────────────────────────────────────────
  /** Personal event colour */
  groupColorPersonal: '--nc-group-color-personal',
  /** Group slot 0 colour */
  groupColor0: '--nc-group-color-0',
  /** Group slot 1 colour */
  groupColor1: '--nc-group-color-1',
  /** Group slot 2 colour */
  groupColor2: '--nc-group-color-2',
  /** Group slot 3 colour */
  groupColor3: '--nc-group-color-3',
  /** Group slot 4 colour */
  groupColor4: '--nc-group-color-4',
  /** Group slot 5 colour */
  groupColor5: '--nc-group-color-5',
  /** Group slot 6 colour */
  groupColor6: '--nc-group-color-6',
  /** Group slot 7 colour */
  groupColor7: '--nc-group-color-7',
} as const;

export type TokenName = keyof typeof TOKEN_NAMES;
export type CSSVariableName = (typeof TOKEN_NAMES)[TokenName];

/** A resolved set of token values for a given theme + palette combination. */
export type TokenValues = Record<CSSVariableName, string>;
