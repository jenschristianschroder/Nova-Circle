/**
 * useCalendarFilter — manages calendar group filter state with
 * localStorage persistence.
 *
 * Filter state tracks which groups and whether personal events are
 * visible in the calendar. Defaults: all groups and personal events shown.
 *
 * Storage key: `nc-calendar-filter`
 * Format: JSON `{ personal: boolean, groups: Record<groupId, boolean> }`
 */

import { useState, useCallback, useMemo } from 'react';

export const STORAGE_KEY_FILTER = 'nc-calendar-filter';

export interface CalendarFilterState {
  /** Whether personal events are visible. */
  personal: boolean;
  /** Map of groupId → visible. Missing keys default to `true`. */
  groups: Record<string, boolean>;
}

interface UseCalendarFilterResult {
  /** Whether personal events are shown. */
  showPersonal: boolean;
  /** Set of visible group IDs (only groups present in `allGroupIds`). */
  visibleGroupIds: Set<string>;
  /** Toggle personal events on/off. */
  togglePersonal: () => void;
  /** Toggle a single group on/off. */
  toggleGroup: (groupId: string) => void;
  /** Select all groups + personal. */
  selectAll: () => void;
  /** Deselect all groups + personal. */
  deselectAll: () => void;
  /** Whether a specific group is visible. */
  isGroupVisible: (groupId: string) => boolean;
}

function loadFilterState(): CalendarFilterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FILTER);
    if (!raw) return { personal: true, groups: {} };
    const parsed = JSON.parse(raw) as Partial<CalendarFilterState>;
    return {
      personal: typeof parsed.personal === 'boolean' ? parsed.personal : true,
      groups: parsed.groups && typeof parsed.groups === 'object' ? parsed.groups : {},
    };
  } catch {
    return { personal: true, groups: {} };
  }
}

function persistFilterState(state: CalendarFilterState): void {
  localStorage.setItem(STORAGE_KEY_FILTER, JSON.stringify(state));
}

/**
 * Hook that manages which groups and personal events are visible in
 * the calendar. Automatically persists to localStorage and cleans up
 * stale group entries.
 *
 * @param allGroupIds — current group IDs the user belongs to.
 */
export function useCalendarFilter(allGroupIds: string[]): UseCalendarFilterResult {
  const [state, setState] = useState<CalendarFilterState>(loadFilterState);

  const persist = useCallback((next: CalendarFilterState) => {
    setState(next);
    persistFilterState(next);
  }, []);

  const showPersonal = state.personal;

  const visibleGroupIds = useMemo(() => {
    const set = new Set<string>();
    for (const gid of allGroupIds) {
      // Default: visible when key is missing
      if (state.groups[gid] !== false) {
        set.add(gid);
      }
    }
    return set;
  }, [allGroupIds, state.groups]);

  const isGroupVisible = useCallback(
    (groupId: string) => state.groups[groupId] !== false,
    [state.groups],
  );

  const togglePersonal = useCallback(() => {
    persist({ ...state, personal: !state.personal });
  }, [state, persist]);

  const toggleGroup = useCallback(
    (groupId: string) => {
      const current = state.groups[groupId] !== false;
      // Clean up stale entries: only keep groups in allGroupIds
      const groups: Record<string, boolean> = {};
      for (const gid of allGroupIds) {
        groups[gid] = gid === groupId ? !current : state.groups[gid] !== false;
      }
      persist({ ...state, groups });
    },
    [state, persist, allGroupIds],
  );

  const selectAll = useCallback(() => {
    const groups: Record<string, boolean> = {};
    for (const gid of allGroupIds) {
      groups[gid] = true;
    }
    persist({ personal: true, groups });
  }, [persist, allGroupIds]);

  const deselectAll = useCallback(() => {
    const groups: Record<string, boolean> = {};
    for (const gid of allGroupIds) {
      groups[gid] = false;
    }
    persist({ personal: false, groups });
  }, [persist, allGroupIds]);

  return {
    showPersonal,
    visibleGroupIds,
    togglePersonal,
    toggleGroup,
    selectAll,
    deselectAll,
    isGroupVisible,
  };
}
