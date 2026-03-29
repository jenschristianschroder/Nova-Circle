/**
 * Tests for group-colors utility.
 */

import { describe, it, expect } from 'vitest';
import {
  GROUP_COLOR_SLOT_COUNT,
  groupColorVar,
  PERSONAL_COLOR_VAR,
  buildGroupColorMap,
} from '../../utils/group-colors';

describe('group-colors', () => {
  it('has 8 colour slots', () => {
    expect(GROUP_COLOR_SLOT_COUNT).toBe(8);
  });

  it('personal color var matches token', () => {
    expect(PERSONAL_COLOR_VAR).toBe('--nc-group-color-personal');
  });

  describe('groupColorVar', () => {
    it('returns the correct CSS variable for slot 0', () => {
      expect(groupColorVar(0)).toBe('--nc-group-color-0');
    });

    it('returns the correct CSS variable for slot 7', () => {
      expect(groupColorVar(7)).toBe('--nc-group-color-7');
    });

    it('cycles when slot exceeds count', () => {
      expect(groupColorVar(8)).toBe('--nc-group-color-0');
      expect(groupColorVar(9)).toBe('--nc-group-color-1');
      expect(groupColorVar(15)).toBe('--nc-group-color-7');
      expect(groupColorVar(16)).toBe('--nc-group-color-0');
    });
  });

  describe('buildGroupColorMap', () => {
    it('assigns sequential slots to groups', () => {
      const map = buildGroupColorMap(['a', 'b', 'c']);
      expect(map.get('a')).toBe(0);
      expect(map.get('b')).toBe(1);
      expect(map.get('c')).toBe(2);
    });

    it('returns an empty map for empty input', () => {
      const map = buildGroupColorMap([]);
      expect(map.size).toBe(0);
    });

    it('cycles colors when groups exceed palette size', () => {
      const ids = Array.from({ length: 10 }, (_, i) => `g${i}`);
      const map = buildGroupColorMap(ids);
      expect(map.get('g0')).toBe(0);
      expect(map.get('g7')).toBe(7);
      expect(map.get('g8')).toBe(0);
      expect(map.get('g9')).toBe(1);
    });

    it('is deterministic for the same input', () => {
      const ids = ['x', 'y', 'z'];
      const map1 = buildGroupColorMap(ids);
      const map2 = buildGroupColorMap(ids);
      expect(map1.get('x')).toBe(map2.get('x'));
      expect(map1.get('y')).toBe(map2.get('y'));
      expect(map1.get('z')).toBe(map2.get('z'));
    });
  });
});
