/**
 * Tests for useCalendarFilter hook.
 *
 * Verifies localStorage persistence, toggling, select all / deselect all,
 * default behavior for new groups, and cleanup of stale group entries.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCalendarFilter, STORAGE_KEY_FILTER } from '../../hooks/useCalendarFilter';

beforeEach(() => {
  localStorage.clear();
});

describe('useCalendarFilter', () => {
  const groupIds = ['g1', 'g2', 'g3'];

  it('defaults: all groups and personal events are shown', () => {
    const { result } = renderHook(() => useCalendarFilter(groupIds));
    expect(result.current.showPersonal).toBe(true);
    expect(result.current.visibleGroupIds.size).toBe(3);
    expect(result.current.isGroupVisible('g1')).toBe(true);
    expect(result.current.isGroupVisible('g2')).toBe(true);
    expect(result.current.isGroupVisible('g3')).toBe(true);
  });

  it('toggles personal events off and persists', () => {
    const { result } = renderHook(() => useCalendarFilter(groupIds));
    act(() => result.current.togglePersonal());
    expect(result.current.showPersonal).toBe(false);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_FILTER)!);
    expect(stored.personal).toBe(false);
  });

  it('toggles personal events back on', () => {
    const { result } = renderHook(() => useCalendarFilter(groupIds));
    act(() => result.current.togglePersonal());
    act(() => result.current.togglePersonal());
    expect(result.current.showPersonal).toBe(true);
  });

  it('toggles a group off', () => {
    const { result } = renderHook(() => useCalendarFilter(groupIds));
    act(() => result.current.toggleGroup('g2'));
    expect(result.current.isGroupVisible('g2')).toBe(false);
    expect(result.current.visibleGroupIds.has('g2')).toBe(false);
    expect(result.current.isGroupVisible('g1')).toBe(true);
    expect(result.current.isGroupVisible('g3')).toBe(true);
  });

  it('toggles a group back on', () => {
    const { result } = renderHook(() => useCalendarFilter(groupIds));
    act(() => result.current.toggleGroup('g2'));
    act(() => result.current.toggleGroup('g2'));
    expect(result.current.isGroupVisible('g2')).toBe(true);
  });

  it('persists group toggle to localStorage', () => {
    const { result } = renderHook(() => useCalendarFilter(groupIds));
    act(() => result.current.toggleGroup('g1'));

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_FILTER)!);
    expect(stored.groups.g1).toBe(false);
  });

  it('restores filter state from localStorage', () => {
    localStorage.setItem(
      STORAGE_KEY_FILTER,
      JSON.stringify({ personal: false, groups: { g1: false, g2: true } }),
    );
    const { result } = renderHook(() => useCalendarFilter(groupIds));
    expect(result.current.showPersonal).toBe(false);
    expect(result.current.isGroupVisible('g1')).toBe(false);
    expect(result.current.isGroupVisible('g2')).toBe(true);
    // g3 not in stored state → defaults to visible
    expect(result.current.isGroupVisible('g3')).toBe(true);
  });

  it('selectAll enables all groups and personal', () => {
    const { result } = renderHook(() => useCalendarFilter(groupIds));
    act(() => result.current.toggleGroup('g1'));
    act(() => result.current.togglePersonal());
    act(() => result.current.selectAll());

    expect(result.current.showPersonal).toBe(true);
    expect(result.current.visibleGroupIds.size).toBe(3);
  });

  it('deselectAll disables all groups and personal', () => {
    const { result } = renderHook(() => useCalendarFilter(groupIds));
    act(() => result.current.deselectAll());

    expect(result.current.showPersonal).toBe(false);
    expect(result.current.visibleGroupIds.size).toBe(0);
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem(STORAGE_KEY_FILTER, 'not-valid-json');
    const { result } = renderHook(() => useCalendarFilter(groupIds));
    expect(result.current.showPersonal).toBe(true);
    expect(result.current.visibleGroupIds.size).toBe(3);
  });

  it('new groups default to visible even with stored state', () => {
    localStorage.setItem(
      STORAGE_KEY_FILTER,
      JSON.stringify({ personal: true, groups: { g1: true } }),
    );
    // g2 and g3 are new groups not in stored state
    const { result } = renderHook(() => useCalendarFilter(groupIds));
    expect(result.current.isGroupVisible('g2')).toBe(true);
    expect(result.current.isGroupVisible('g3')).toBe(true);
  });

  it('stale groups are cleaned up from stored state on toggle', () => {
    localStorage.setItem(
      STORAGE_KEY_FILTER,
      JSON.stringify({ personal: true, groups: { g1: true, stale_group: false } }),
    );
    const { result } = renderHook(() => useCalendarFilter(groupIds));
    // Toggle g1 to trigger cleanup
    act(() => result.current.toggleGroup('g1'));

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_FILTER)!);
    expect(stored.groups).not.toHaveProperty('stale_group');
  });

  it('ignores non-boolean group values in stored state', () => {
    localStorage.setItem(
      STORAGE_KEY_FILTER,
      JSON.stringify({ personal: true, groups: { g1: 'false', g2: 0, g3: null } }),
    );
    const { result } = renderHook(() => useCalendarFilter(groupIds));
    // Non-boolean values are stripped — all groups default to visible
    expect(result.current.isGroupVisible('g1')).toBe(true);
    expect(result.current.isGroupVisible('g2')).toBe(true);
    expect(result.current.isGroupVisible('g3')).toBe(true);
  });

  it('ignores array-shaped groups in stored state', () => {
    localStorage.setItem(
      STORAGE_KEY_FILTER,
      JSON.stringify({ personal: false, groups: ['g1', 'g2'] }),
    );
    const { result } = renderHook(() => useCalendarFilter(groupIds));
    expect(result.current.showPersonal).toBe(false);
    // Array is ignored — all groups default to visible
    expect(result.current.visibleGroupIds.size).toBe(3);
  });
});
