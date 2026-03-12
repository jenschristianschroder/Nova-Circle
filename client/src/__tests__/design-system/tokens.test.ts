/**
 * Tests for the design token system.
 *
 * Verifies:
 * - Every token name maps to a unique CSS variable name
 * - buildTokenValues() produces values for every token in every palette + mode
 * - All palette/mode combinations have no undefined or empty token values
 * - The token value map keys match the TOKEN_NAMES values exactly
 */

import { describe, it, expect } from 'vitest';
import { TOKEN_NAMES, type CSSVariableName } from '../../design-system/tokens';
import { buildTokenValues } from '../../design-system/themes';
import { ALL_PALETTES } from '../../design-system/palettes';

describe('TOKEN_NAMES', () => {
  it('has no duplicate CSS variable names', () => {
    const values = Object.values(TOKEN_NAMES);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('all CSS variable names start with --nc-', () => {
    for (const cssVar of Object.values(TOKEN_NAMES)) {
      expect(cssVar).toMatch(/^--nc-/);
    }
  });
});

describe('buildTokenValues', () => {
  const modes = ['light', 'dark'] as const;

  for (const palette of ALL_PALETTES) {
    for (const mode of modes) {
      describe(`palette=${palette.id} mode=${mode}`, () => {
        const tokenValues = buildTokenValues(palette, mode);

        it('produces a value for every token name', () => {
          for (const cssVar of Object.values(TOKEN_NAMES) as CSSVariableName[]) {
            expect(tokenValues).toHaveProperty(cssVar);
          }
        });

        it('produces no empty or undefined values', () => {
          for (const [key, value] of Object.entries(tokenValues)) {
            expect(value, `Token ${key} should not be empty`).toBeTruthy();
            expect(typeof value, `Token ${key} should be a string`).toBe('string');
          }
        });

        it('has the same number of entries as TOKEN_NAMES', () => {
          const tokenCount = Object.keys(TOKEN_NAMES).length;
          expect(Object.keys(tokenValues).length).toBe(tokenCount);
        });
      });
    }
  }
});
