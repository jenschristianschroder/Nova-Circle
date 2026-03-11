/**
 * Contrast ratio tests for WCAG 2.1 AA compliance.
 *
 * Verifies that all colour palette + mode combinations produce token values
 * that meet WCAG 2.1 AA contrast requirements:
 *   - ≥ 4.5:1 for normal text (contentPrimary on surfaceBackground/Card)
 *   - ≥ 4.5:1 for normal text (contentOnAccent on accentDefault)
 *   - ≥ 3:1   for large text / UI components (accentDefault on surfaceBackground)
 *
 * Contrast ratio calculation follows the WCAG 2.1 formula using relative
 * luminance (https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio).
 */

import { describe, it, expect } from 'vitest';
import { buildTokenValues } from '../../design-system/themes';
import { TOKEN_NAMES } from '../../design-system/tokens';
import { ALL_PALETTES } from '../../design-system/palettes';

/** Parse a hex colour string (#rrggbb or #rgb) into [r, g, b] 0–255 */
function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const [r, g, b] = clean.split('').map((c) => parseInt(c + c, 16));
    return [r, g, b];
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return [r, g, b];
  }
  throw new Error(`Cannot parse hex colour: ${hex}`);
}

/** Compute relative luminance for a linear sRGB channel value (0–255) */
function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Compute the WCAG relative luminance of a colour */
function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** Compute the WCAG contrast ratio between two colours */
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Only test hex colours – some token values are CSS functions (rgba, var())
 * that cannot be parsed statically.
 */
function isHex(value: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

describe('WCAG 2.1 AA contrast compliance', () => {
  const modes = ['light', 'dark'] as const;

  for (const palette of ALL_PALETTES) {
    for (const mode of modes) {
      describe(`palette=${palette.id} mode=${mode}`, () => {
        const tokens = buildTokenValues(palette, mode);

        const bg = tokens[TOKEN_NAMES.surfaceBackground];
        const card = tokens[TOKEN_NAMES.surfaceCard];
        const textPrimary = tokens[TOKEN_NAMES.contentPrimary];
        const textSecondary = tokens[TOKEN_NAMES.contentSecondary];
        const accent = tokens[TOKEN_NAMES.accentDefault];
        const onAccent = tokens[TOKEN_NAMES.contentOnAccent];
        const danger = tokens[TOKEN_NAMES.dangerDefault];
        const onDanger = tokens[TOKEN_NAMES.contentOnDanger];

        if (isHex(bg) && isHex(textPrimary)) {
          it('primary text on surface background ≥ 4.5:1', () => {
            expect(contrastRatio(textPrimary, bg)).toBeGreaterThanOrEqual(4.5);
          });
        }

        if (isHex(card) && isHex(textPrimary)) {
          it('primary text on surface card ≥ 4.5:1', () => {
            expect(contrastRatio(textPrimary, card)).toBeGreaterThanOrEqual(4.5);
          });
        }

        if (isHex(card) && isHex(textSecondary)) {
          it('secondary text on surface card ≥ 4.5:1', () => {
            expect(contrastRatio(textSecondary, card)).toBeGreaterThanOrEqual(4.5);
          });
        }

        if (isHex(accent) && isHex(onAccent)) {
          it('text on accent background ≥ 4.5:1', () => {
            expect(contrastRatio(onAccent, accent)).toBeGreaterThanOrEqual(4.5);
          });
        }

        if (isHex(danger) && isHex(onDanger)) {
          it('text on danger background ≥ 4.5:1', () => {
            expect(contrastRatio(onDanger, danger)).toBeGreaterThanOrEqual(4.5);
          });
        }

        if (isHex(bg) && isHex(accent)) {
          it('accent colour on surface background ≥ 3:1 (UI component)', () => {
            expect(contrastRatio(accent, bg)).toBeGreaterThanOrEqual(3.0);
          });
        }
      });
    }
  }
});
