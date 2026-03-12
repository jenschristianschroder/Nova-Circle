/**
 * Snapshot tests for design token values across themes.
 *
 * Verifies that the token values produced by buildTokenValues() for every
 * palette + mode combination remain stable over time. Any intentional change
 * to palette colours or token mapping will cause these snapshots to fail,
 * requiring a deliberate update to the snapshot file.
 *
 * This satisfies the "visual regression / snapshot tests for both themes"
 * acceptance criterion for M7.
 */

import { describe, it, expect } from 'vitest';
import { buildTokenValues } from '../../design-system/themes';
import { ALL_PALETTES } from '../../design-system/palettes';

describe('Token value snapshots – light mode', () => {
  for (const palette of ALL_PALETTES) {
    it(`palette=${palette.id} light – token values match snapshot`, () => {
      const tokens = buildTokenValues(palette, 'light');
      expect(tokens).toMatchSnapshot();
    });
  }
});

describe('Token value snapshots – dark mode', () => {
  for (const palette of ALL_PALETTES) {
    it(`palette=${palette.id} dark – token values match snapshot`, () => {
      const tokens = buildTokenValues(palette, 'dark');
      expect(tokens).toMatchSnapshot();
    });
  }
});
