/**
 * Tests for palette definitions.
 *
 * Verifies:
 * - ALL_PALETTES has at least 3 palettes (acceptance criterion)
 * - Each palette has valid colour scales with correct length
 * - getPaletteById() returns the correct palette or the default
 */

import { describe, it, expect } from 'vitest';
import { ALL_PALETTES, getPaletteById, DEFAULT_PALETTE } from '../../design-system/palettes';

describe('ALL_PALETTES', () => {
  it('has at least 3 curated palettes (acceptance criterion)', () => {
    expect(ALL_PALETTES.length).toBeGreaterThanOrEqual(3);
  });

  it('all palette ids are unique', () => {
    const ids = ALL_PALETTES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const palette of ALL_PALETTES) {
    describe(`palette ${palette.id}`, () => {
      it('has a label and description', () => {
        expect(palette.label.length).toBeGreaterThan(0);
        expect(palette.description.length).toBeGreaterThan(0);
      });

      it('accent scale has exactly 5 colours', () => {
        expect(palette.accent).toHaveLength(5);
      });

      it('neutral scale has exactly 9 colours', () => {
        expect(palette.neutral).toHaveLength(9);
      });

      it('danger scale has exactly 5 colours', () => {
        expect(palette.danger).toHaveLength(5);
      });

      it('success scale has exactly 5 colours', () => {
        expect(palette.success).toHaveLength(5);
      });

      it('all colour values are non-empty strings', () => {
        const allColours = [
          ...palette.accent,
          ...palette.neutral,
          ...palette.danger,
          ...palette.success,
        ];
        for (const colour of allColours) {
          expect(typeof colour).toBe('string');
          expect(colour.length).toBeGreaterThan(0);
        }
      });
    });
  }
});

describe('getPaletteById', () => {
  it('returns the correct palette for a known id', () => {
    for (const palette of ALL_PALETTES) {
      expect(getPaletteById(palette.id)).toBe(palette);
    }
  });

  it('returns the default palette for an unknown id', () => {
    // @ts-expect-error – intentionally invalid id for test
    expect(getPaletteById('nonexistent')).toBe(DEFAULT_PALETTE);
  });
});
